import { API } from '../api.js';

import {
  showLoading, hideLoading, showError, showToast,
  openModal, closeModal, showConfirmationModal, showDocumentModal
} from '../ui.js';

let allCommittees = [];
let committeeEventListenersInitialized = false;
let tempSubCommittees = [];
let expandedAccordions = new Set();

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
  const subNow  = current?.SubCommitteeData?.length ?? 0;
  const daysLeft = getDaysRemaining(current?.TermEndDate);

  /* ── days-remaining badge ── */
  let daysChip = '<span class="text-slate-400 text-lg font-bold">—</span>';
  if (daysLeft !== null) {
    if (daysLeft < 0)
      daysChip = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>หมดวาระแล้ว</span>`;
    else if (daysLeft <= 90)
      daysChip = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>เหลือ ${daysLeft} วัน</span>`;
    else
      daysChip = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>เหลือ ${daysLeft} วัน</span>`;
  }

  container.innerHTML = `
  <div class="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">

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
      ${isAdmin ? `
      <button id="btn-add-committee"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex-shrink-0 hover:shadow-lg active:scale-95"
        style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 12px rgba(5,150,105,0.25)">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        เพิ่มคณะกรรมการ
      </button>` : ''}
    </div>

    <!-- ── STATS BAR ── -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#ecfdf5">
          <svg class="w-5 h-5" style="color:#059669" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04
                 A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622
                 0-1.042-.133-2.052-.382-3.016z"/>
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

    <!-- ── PAST COMMITTEES ACCORDION ── -->
    ${past.length > 0 ? `
    <div>
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <div class="flex items-center gap-3 min-w-0">
          <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">ประวัติย้อนหลัง</h3>
          <span class="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full">${past.length} รายการ</span>
        </div>
        <span class="hidden sm:block flex-1 h-px bg-slate-200"></span>
        <input id="past-search" type="text" placeholder="ค้นหาชื่อคณะกรรมการ..."
               class="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full sm:w-56
                      focus:outline-none focus:border-emerald-400 transition-colors">
      </div>
      <div id="past-committee-container" class="space-y-2">
        ${past.map((c, i) => createAccordionItem(c, i, isAdmin)).join('')}
      </div>
      <p id="past-empty-msg" class="hidden text-center text-sm text-slate-400 py-6">ไม่พบรายการที่ค้นหา</p>
    </div>` : ''}

  </div>`;

  /* bind accordion toggles — restore + track expanded state */
  container.querySelectorAll('.accordion-toggle').forEach(btn => {
    const bodyId = btn.dataset.target;
    const body   = document.getElementById(bodyId);
    const icon   = btn.querySelector('.acc-icon');
    if (expandedAccordions.has(bodyId)) {
      body.classList.remove('hidden');
      icon.style.transform = 'rotate(180deg)';
    }
    btn.addEventListener('click', () => {
      const closing = !body.classList.contains('hidden');
      body.classList.toggle('hidden', closing);
      icon.style.transform = closing ? '' : 'rotate(180deg)';
      if (closing) expandedAccordions.delete(bodyId);
      else expandedAccordions.add(bodyId);
    });
  });

  /* past committee search */
  const searchInput = document.getElementById('past-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const items = document.querySelectorAll('#past-committee-container > div');
      let visible = 0;
      items.forEach(el => {
        const title = el.querySelector('p.font-semibold')?.textContent?.toLowerCase() ?? '';
        const show  = !q || title.includes(q);
        el.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      const emptyMsg = document.getElementById('past-empty-msg');
      if (emptyMsg) emptyMsg.classList.toggle('hidden', visible > 0);
    });
  }
}

/* ═══════════════════════════════════════════════
   CURRENT COMMITTEE — HERO CARD
═══════════════════════════════════════════════ */
function createCurrentHeroCard(committee, isAdmin) {
  const fmt = (d) => {
    if (!d) return 'N/A';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const subList  = committee.SubCommitteeData ?? [];
  const daysLeft = getDaysRemaining(committee.TermEndDate);
  const withDoc  = subList.filter(s => s.activeLink).length;

  const dayColor = daysLeft === null ? '#a7f3d0' : daysLeft < 0 ? '#fca5a5' : daysLeft <= 90 ? '#fcd34d' : '#6ee7b7';
  const dayLabel = daysLeft === null ? '—' : daysLeft < 0 ? 'หมดแล้ว' : String(daysLeft);

  return `
  <div class="bg-white rounded-2xl overflow-hidden border border-emerald-100"
       style="box-shadow:0 4px 30px rgba(5,150,105,0.1)">

    <!-- gradient banner -->
    <div class="relative p-6 pb-5 overflow-hidden"
         style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
      <!-- dot overlay -->
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
          <h2 class="text-xl md:text-2xl font-bold text-white leading-snug truncate" title="${committee.CommitteeTitle}">${committee.CommitteeTitle}</h2>
          <p class="flex items-center gap-1.5 mt-2 text-sm" style="color:rgba(167,243,208,0.9)">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            ${fmt(committee.TermStartDate)} — ${fmt(committee.TermEndDate)}
          </p>
        </div>
        ${isAdmin ? `
        <div class="flex gap-1 flex-shrink-0">
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
          </button>
        </div>` : ''}
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
    </div>

    <!-- body -->
    <div class="p-6">
      ${committee.MainOrgChartLink ? `
      <div class="mb-6">
        <a href="${committee.MainOrgChartLink}"
           data-action="view-doc" data-title="ผังองค์กรหลัก"
           class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
                  transition-all hover:shadow-lg active:scale-95"
           style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 12px rgba(5,150,105,0.25)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2
                 a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14
                 a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          ดูผังองค์กรหลัก (Main Chart)
        </a>
      </div>` : ''}

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
          : `<div class="text-center py-10 text-slate-400 text-sm bg-slate-50
                         rounded-xl border border-dashed border-slate-200">
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
  const c = avatarColor(i);
  const init = getDeptInitials(sc.department);
  return `
  <div class="group bg-white rounded-xl p-4 border border-slate-100
              hover:border-emerald-200 hover:shadow-md transition-all duration-200 flex items-start gap-3">
    <div class="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
         style="background:${c.bg};color:${c.fg}">${init}</div>
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-slate-700 text-sm leading-snug truncate" title="${sc.department}">${sc.department}</p>
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
             <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
             <span class="text-xs text-slate-400">มีเอกสารแนบ</span>
           </div>`
        : `<span class="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-400">
             <span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>
             ยังไม่มีเอกสาร
           </span>`
      }
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════
   PAST COMMITTEE — ACCORDION ITEM
═══════════════════════════════════════════════ */
function createAccordionItem(committee, index, isAdmin) {
  const fmtShort = (d) => {
    if (!d) return 'N/A';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('th-TH', { year: 'numeric', month: 'short' });
  };

  const buddYear = committee.TermStartDate
    ? new Date(committee.TermStartDate).getFullYear() + 543
    : '—';
  const subList  = committee.SubCommitteeData ?? [];
  const bodyId   = `acc-body-${index}`;

  return `
  <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">

    <button class="accordion-toggle w-full px-5 py-4 flex items-center justify-between
                   text-left hover:bg-slate-50 transition-colors" data-target="${bodyId}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
              style="background:#f1f5f9;color:#64748b">${buddYear}</span>
        <div class="min-w-0">
          <p class="font-semibold text-slate-700 text-sm truncate">${committee.CommitteeTitle}</p>
          <p class="text-xs text-slate-400 mt-0.5">
            ${fmtShort(committee.TermStartDate)} — ${fmtShort(committee.TermEndDate)}
            · <span class="font-medium">${subList.length}</span> คณะทำงานย่อย
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1 flex-shrink-0 ml-3">
        ${isAdmin ? `
        <button data-id="${committee.id}"
          class="btn-edit-committee p-1.5 text-slate-300 hover:text-emerald-600
                 hover:bg-emerald-50 rounded-lg transition-colors"
          onclick="event.stopPropagation()" title="แก้ไข">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </button>
        <button data-id="${committee.id}"
          class="btn-delete-committee p-1.5 text-slate-300 hover:text-red-600
                 hover:bg-red-50 rounded-lg transition-colors"
          onclick="event.stopPropagation()" title="ลบ">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6
                 m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>` : ''}
        <svg class="acc-icon w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
    </button>

    <div id="${bodyId}" class="hidden border-t border-slate-100">
      <div class="p-5">
        ${committee.MainOrgChartLink ? `
        <div class="mb-4">
          <a href="${committee.MainOrgChartLink}" data-action="view-doc" data-title="ผังองค์กรหลัก"
             class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white
                    transition-all hover:shadow-md active:scale-95"
             style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 8px rgba(5,150,105,0.25)">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9
                   a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5
                   a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            ผังองค์กรหลัก
          </a>
        </div>` : ''}

        ${subList.length > 0
          ? `<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
               ${subList.map((sc, i) => subCard(sc, i)).join('')}
             </div>`
          : `<p class="text-sm text-slate-400 text-center py-4">ไม่มีคณะทำงานย่อย</p>`
        }
      </div>
    </div>
  </div>`;
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
                class="px-3 py-1.5 rounded-lg transition-all bg-white text-slate-700 shadow-sm">
          ลิงก์ URL
        </button>
        <button type="button" id="org-tab-file"
                class="px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-slate-600">
          อัปโหลดไฟล์
        </button>
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

      <!-- inline add row -->
      <div class="flex gap-2 mb-3">
        <input type="text" id="new-sub-name" class="form-input flex-1 rounded-xl text-sm"
               placeholder="ชื่อหน่วยงาน / แผนก...">
        <button type="button" id="btn-add-sub"
                class="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style="background:#059669">
          + เพิ่ม
        </button>
      </div>

      <div id="sub-committee-list" class="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1"></div>
    </div>

    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
      <button type="button" onclick="closeModal()"
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

  /* URL / file tab toggle */
  const tabUrl  = document.getElementById('org-tab-url');
  const tabFile = document.getElementById('org-tab-file');
  const panelUrl  = document.getElementById('org-panel-url');
  const panelFile = document.getElementById('org-panel-file');
  const activeTab   = 'bg-white text-slate-700 shadow-sm';
  const inactiveTab = 'text-slate-400 hover:text-slate-600';
  tabUrl.addEventListener('click', () => {
    tabUrl.className  = `px-3 py-1.5 rounded-lg transition-all ${activeTab}`;
    tabFile.className = `px-3 py-1.5 rounded-lg transition-all ${inactiveTab}`;
    panelUrl.classList.remove('hidden');
    panelFile.classList.add('hidden');
  });
  tabFile.addEventListener('click', () => {
    tabFile.className = `px-3 py-1.5 rounded-lg transition-all ${activeTab}`;
    tabUrl.className  = `px-3 py-1.5 rounded-lg transition-all ${inactiveTab}`;
    panelFile.classList.remove('hidden');
    panelUrl.classList.add('hidden');
    document.getElementById('org-link-input').value = '';
  });

  /* inline add */
  const addBtn   = document.getElementById('btn-add-sub');
  const nameInput = document.getElementById('new-sub-name');

  addBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    tempSubCommittees.push({ department: name, activeLink: '' });
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

      const file = formData.get('MainOrgChartFile');
      if (file && file.size > 0) {
        const up = new FormData();
        up.append('document', file);
        const upRes = await API.post('/upload/document', up, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (!upRes?.url) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
        formData.set('MainOrgChartLink', upRes.url);
      }
      formData.delete('MainOrgChartFile');

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
      <div class="text-center text-sm text-slate-400 py-5 bg-slate-50 rounded-xl
                  border border-dashed border-slate-200">
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
    <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm" data-sub-idx="${i}">
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
      <span class="text-sm font-medium text-slate-700 flex-shrink-0 max-w-[7rem] truncate"
            title="${sub.department}">${sub.department}</span>
      <input type="text" placeholder="ลิงก์เอกสาร (URL)"
             class="sub-link-input flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50
                    focus:outline-none focus:border-emerald-400 transition-colors min-w-0"
             data-idx="${i}" value="${sub.activeLink || ''}">
      <button type="button" data-action="sub-remove" data-idx="${i}"
              class="flex-shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50
                     rounded-lg transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>`;
  }).join('');

  /* event delegation for reorder / remove / link update */
  listEl.onclick = (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const idx = parseInt(e.target.closest('[data-action]').dataset.idx, 10);
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
    if (e.target.classList.contains('sub-link-input')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      tempSubCommittees[idx].activeLink = e.target.value.trim();
    }
  };
}

/* ═══════════════════════════════════════════════
   EVENT LISTENERS (delegated, once)
═══════════════════════════════════════════════ */
function setupCommitteeEventListeners() {
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#committee-page')) return;

    if (e.target.closest('#btn-add-committee')) { openCommitteeForm(); return; }

    const editBtn = e.target.closest('.btn-edit-committee');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const c  = allCommittees.find(x => normalizeId(getCommitteeId(x)) === normalizeId(id));
      if (c) openCommitteeForm(c);
      return;
    }

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

    const docBtn = e.target.closest('[data-action="view-doc"]');
    if (docBtn) {
      e.preventDefault();
      showDocumentModal(docBtn.href, docBtn.dataset.title || 'เอกสาร');
    }
  });
}
