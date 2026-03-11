import { API } from '../api.js';
import { hideLoading, showLoading, showError, showToast, openModal, closeModal, showConfirmationModal, showDocumentModal } from '../ui.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let chartInstances = {};
let allKpiDataForYear = [];
let currentAnnouncementId = null;
let kpiEventListenersAttached = false;
let _availableYears = [];
let _selectedYear = null;

// ─── helpers ────────────────────────────────────────────────────────────────
function getIsAdmin() {
    const u = localStorage.getItem('currentUser');
    if (!u) return false;
    const cu = JSON.parse(u);
    return !!(
        (cu.role  && cu.role.toLowerCase()  === 'admin') ||
        (cu.Role  && cu.Role.toLowerCase()  === 'admin') ||
        cu.id === 'admin'
    );
}

function calcKpiStatus(kpi) {
    let sumActual = 0, hasData = false;
    MONTHS.forEach(m => {
        const v = kpi[m];
        if (v !== null && v !== undefined && v !== '') { sumActual += parseFloat(v); hasData = true; }
    });
    if (!hasData) return 'nodata';
    return sumActual <= parseFloat(kpi.Target) ? 'ok' : 'over';
}

function getLatestMonthValue(kpi) {
    for (let i = MONTHS.length - 1; i >= 0; i--) {
        const v = kpi[MONTHS[i]];
        if (v !== null && v !== undefined && v !== '') return { month: MONTHS[i], value: parseFloat(v) };
    }
    return null;
}

function calcYtdSum(kpi) {
    let s = 0;
    MONTHS.forEach(m => { const v = kpi[m]; if (v !== null && v !== undefined && v !== '') s += parseFloat(v); });
    return s;
}

// ─── Main Loader ─────────────────────────────────────────────────────────────
export async function loadKpiPage(year = null) {
    const container = document.getElementById('kpi-page');
    if (!kpiEventListenersAttached) { setupKpiEventListeners(); kpiEventListenersAttached = true; }

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <span class="text-sm">กำลังโหลดข้อมูล KPI...</span>
        </div>`;

    try {
        const annData = await API.get('/pagedata/kpi-announcements');
        const { current, past } = annData;
        const allAnn = [current, ...(past || [])].filter(Boolean);

        const yearSet = new Set();
        allAnn.forEach(a => { if (a.EffectiveDate) yearSet.add(new Date(a.EffectiveDate).getFullYear()); });
        yearSet.add(new Date().getFullYear());
        _availableYears = Array.from(yearSet).sort((a, b) => b - a);

        _selectedYear = year ? parseInt(year) : (current ? new Date(current.EffectiveDate).getFullYear() : new Date().getFullYear());
        allKpiDataForYear = await API.get(`/kpidata/${_selectedYear}`);

        const annForYear = allAnn.find(a => new Date(a.EffectiveDate).getFullYear() == _selectedYear) || current;
        if (annForYear && new Date(annForYear.EffectiveDate).getFullYear() == _selectedYear) {
            currentAnnouncementId = String(annForYear.id ?? annForYear.AnnouncementID ?? '');
        } else {
            currentAnnouncementId = null;
        }

        const displayAnn = currentAnnouncementId ? annForYear : { AnnouncementTitle: `KPI Overview ${_selectedYear}`, id: null };
        renderKpiDashboard(container, displayAnn, allKpiDataForYear, getIsAdmin());

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="m-6 p-5 bg-red-50 text-red-600 rounded-xl text-center text-sm">${err.message}</div>`;
    }
}

// ─── Dashboard Renderer ───────────────────────────────────────────────────────
function renderKpiDashboard(container, announcement, kpiData, isAdmin) {
    Object.values(chartInstances).forEach(c => c.destroy());
    chartInstances = {};

    const total = kpiData.length;
    let onTrack = 0, offTrack = 0, noData = 0;
    kpiData.forEach(k => {
        const s = calcKpiStatus(k);
        if (s === 'ok') onTrack++;
        else if (s === 'over') offTrack++;
        else noData++;
    });
    const compliancePct = total > 0 ? Math.round((onTrack / (total - noData || 1)) * 100) : 0;
    const prevYearIdx = _availableYears.indexOf(_selectedYear);
    const prevYear = _availableYears[prevYearIdx + 1] ?? null;
    const nextYear = _availableYears[prevYearIdx - 1] ?? null;

    container.innerHTML = `
    <div class="animate-fade-in">

      <!-- ═══ HERO HEADER ═══ -->
      <div class="relative overflow-hidden rounded-2xl mb-6" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
        <div class="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><defs><pattern id="kpi-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#kpi-dots)"/></svg>
        </div>
        <div class="absolute -right-12 -top-12 w-56 h-56 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

        <div class="relative z-10 p-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <!-- Left: title -->
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                  ตัวชี้วัดความปลอดภัย
                </span>
              </div>
              <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">${announcement.AnnouncementTitle}</h1>
              ${announcement.DocumentLink ? `
              <a href="${announcement.DocumentLink}" data-action="view-doc" data-title="${announcement.AnnouncementTitle}"
                 class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 text-white border border-white/25 hover:bg-white/25 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                เอกสารประกาศอย่างเป็นทางการ
              </a>` : ''}
            </div>

            <!-- Right: year nav + admin actions -->
            <div class="flex flex-col items-end gap-3 flex-shrink-0">
              <!-- Year navigation -->
              <div class="flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-xl p-1 border border-white/20">
                <button id="btn-prev-year" ${!prevYear ? 'disabled' : ''} data-year="${prevYear}"
                  class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="px-4 text-center min-w-[80px]">
                  <div class="text-white font-bold text-lg leading-none">${_selectedYear}</div>
                  <div class="text-white/60 text-[10px] mt-0.5">ปีงบประมาณ</div>
                </div>
                <button id="btn-next-year" ${!nextYear ? 'disabled' : ''} data-year="${nextYear}"
                  class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>

              ${isAdmin ? `
              <!-- Admin actions -->
              <div class="flex items-center gap-2 flex-wrap justify-end">
                <div class="flex items-center gap-1 bg-white/15 rounded-xl p-1 border border-white/20">
                  <button id="btn-export-excel" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 text-xs font-semibold transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Export
                  </button>
                  <div class="w-px h-4 bg-white/20"></div>
                  <button id="btn-import-excel" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 text-xs font-semibold transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/></svg>
                    Import
                  </button>
                </div>
                <input type="file" id="kpi-file-import" class="hidden" accept=".xlsx,.xls" />
                <button id="btn-manage-anns" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  จัดการประกาศ
                </button>
                <button id="btn-add-kpi" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  เพิ่ม KPI
                </button>
              </div>` : ''}
            </div>
          </div>

          <!-- Stats strip -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold text-white">${total}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">ตัวชี้วัดทั้งหมด</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:#6ee7b7">${onTrack}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">ผ่านเกณฑ์</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:${offTrack > 0 ? '#fca5a5' : '#6ee7b7'}">${offTrack}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">เกินเกณฑ์</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:${compliancePct >= 80 ? '#6ee7b7' : compliancePct >= 50 ? '#fcd34d' : '#fca5a5'}">${compliancePct}%</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">อัตราผ่านเกณฑ์</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ COMPLIANCE BAR ═══ -->
      ${total > 0 ? `
      <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 flex items-center gap-4">
        <div class="flex-shrink-0 text-center w-16">
          <div class="relative w-14 h-14 mx-auto">
            <svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
              <circle cx="28" cy="28" r="22" fill="none"
                stroke="${compliancePct >= 80 ? '#10b981' : compliancePct >= 50 ? '#f59e0b' : '#ef4444'}"
                stroke-width="6" stroke-linecap="round"
                stroke-dasharray="${(2 * Math.PI * 22).toFixed(1)}"
                stroke-dashoffset="${((1 - compliancePct / 100) * 2 * Math.PI * 22).toFixed(1)}"
                style="transition:stroke-dashoffset 1s ease"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-bold" style="color:${compliancePct >= 80 ? '#065f46' : compliancePct >= 50 ? '#92400e' : '#991b1b'}">${compliancePct}%</span>
            </div>
          </div>
        </div>
        <div class="flex-1">
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-sm font-bold text-slate-700">อัตราผ่านเกณฑ์ความปลอดภัย (YTD)</span>
            <span class="text-xs text-slate-400">${onTrack} / ${total - noData} รายการ</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-1000"
              style="width:${compliancePct}%;background:${compliancePct >= 80 ? 'linear-gradient(90deg,#10b981,#34d399)' : compliancePct >= 50 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)' : 'linear-gradient(90deg,#ef4444,#f87171)'}">
            </div>
          </div>
          <div class="flex gap-4 mt-2">
            <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>ผ่านเกณฑ์ ${onTrack}</span>
            <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>เกินเกณฑ์ ${offTrack}</span>
            ${noData > 0 ? `<span class="flex items-center gap-1.5 text-xs text-slate-400"><span class="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>ยังไม่มีข้อมูล ${noData}</span>` : ''}
          </div>
        </div>
      </div>` : ''}

      <!-- ═══ KPI CARDS ═══ -->
      <div id="kpi-cards-container" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5 pb-8">
        ${kpiData.length > 0
          ? kpiData.map(k => createKpiMetricCard(k, isAdmin)).join('')
          : renderEmptyState(announcement, _selectedYear, isAdmin)
        }
      </div>
    </div>`;

    if (kpiData.length > 0) requestAnimationFrame(() => kpiData.forEach(drawKpiChart));

    document.getElementById('btn-prev-year')?.addEventListener('click', e => {
        const y = e.currentTarget.dataset.year; if (y) loadKpiPage(y);
    });
    document.getElementById('btn-next-year')?.addEventListener('click', e => {
        const y = e.currentTarget.dataset.year; if (y) loadKpiPage(y);
    });
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function createKpiMetricCard(kpi, isAdmin) {
    const status = calcKpiStatus(kpi);
    const latest = getLatestMonthValue(kpi);
    const ytd = calcYtdSum(kpi);
    const target = parseFloat(kpi.Target);
    const ytdPct = target > 0 ? Math.min(Math.round((ytd / target) * 100), 200) : 0;

    const statusMeta = {
        ok:     { border: '#10b981', bg: '#ecfdf5', text: '#065f46', label: 'ผ่านเกณฑ์',     dot: '#10b981' },
        over:   { border: '#ef4444', bg: '#fef2f2', text: '#991b1b', label: 'เกินเกณฑ์',     dot: '#ef4444' },
        nodata: { border: '#cbd5e1', bg: '#f8fafc', text: '#64748b', label: 'ยังไม่มีข้อมูล', dot: '#94a3b8' },
    }[status];

    const adminButtons = isAdmin ? `
        <div class="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button data-id="${kpi.id}" class="btn-edit-kpi p-1.5 rounded-lg bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
          <button data-id="${kpi.id}" class="btn-delete-kpi p-1.5 rounded-lg bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>` : '';

    return `
    <div class="bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden hover:shadow-lg transition-all duration-300 relative group"
         style="border-left-color:${statusMeta.border};border-top:1px solid #f1f5f9;border-right:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9">
      ${adminButtons}

      <!-- Card Header -->
      <div class="p-5 pb-3">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">${kpi.Department || 'General'}</span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:${statusMeta.bg};color:${statusMeta.text}">
                <span class="w-1.5 h-1.5 rounded-full inline-block ${status === 'ok' ? '' : status === 'over' ? 'animate-pulse' : ''}" style="background:${statusMeta.dot}"></span>
                ${statusMeta.label}
              </span>
            </div>
            <h3 class="font-bold text-slate-800 leading-snug pr-16" title="${kpi.Metric}">${kpi.Metric}</h3>
          </div>
        </div>

        <!-- Current month callout + target -->
        <div class="grid grid-cols-3 gap-2 mt-3">
          <div class="col-span-1 rounded-xl p-2.5 text-center" style="background:${statusMeta.bg}">
            <div class="text-[10px] font-bold uppercase tracking-wide mb-0.5" style="color:${statusMeta.text};opacity:0.7">${latest ? latest.month : '—'}</div>
            <div class="text-xl font-bold leading-none" style="color:${statusMeta.text}">${latest ? latest.value.toLocaleString() : '—'}</div>
            <div class="text-[9px] mt-0.5" style="color:${statusMeta.text};opacity:0.6">${kpi.Unit || 'หน่วย'}</div>
          </div>
          <div class="col-span-1 rounded-xl p-2.5 text-center bg-amber-50">
            <div class="text-[10px] font-bold uppercase tracking-wide text-amber-600/70 mb-0.5">เป้าหมาย</div>
            <div class="text-xl font-bold text-amber-600 leading-none">${target.toLocaleString()}</div>
            <div class="text-[9px] text-amber-500/60 mt-0.5">${kpi.Unit || 'หน่วย'}</div>
          </div>
          <div class="col-span-1 rounded-xl p-2.5 text-center bg-slate-50">
            <div class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">YTD รวม</div>
            <div class="text-xl font-bold text-slate-700 leading-none">${ytd.toLocaleString()}</div>
            <div class="text-[9px] text-slate-400 mt-0.5">${kpi.Unit || 'หน่วย'}</div>
          </div>
        </div>

        <!-- YTD Progress bar -->
        <div class="mt-3">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] text-slate-400 font-medium">ความคืบหน้า YTD เทียบเป้าหมาย</span>
            <span class="text-[10px] font-bold" style="color:${statusMeta.text}">${ytdPct}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-700"
              style="width:${Math.min(ytdPct, 100)}%;background:${status === 'ok' ? '#10b981' : status === 'over' ? '#ef4444' : '#94a3b8'}">
            </div>
          </div>
        </div>
      </div>

      <!-- Chart -->
      <div class="px-4 pb-4">
        <div class="h-44 w-full"><canvas id="kpi-chart-${kpi.id}"></canvas></div>
      </div>
    </div>`;
}

function renderEmptyState(announcement, year, isAdmin) {
    const noAnn = !announcement.id;
    return `
    <div class="col-span-full py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5)">
        <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
      </div>
      <h3 class="text-lg font-bold text-slate-700 mb-1">ยังไม่มีข้อมูล KPI</h3>
      ${noAnn
        ? `<p class="text-sm text-red-500 font-medium">⚠️ ยังไม่มีประกาศสำหรับปี ${year} — กรุณาสร้างประกาศก่อน</p>`
        : `<p class="text-sm text-slate-400">${isAdmin ? 'คลิก "เพิ่ม KPI" หรือ Import จาก Excel เพื่อเริ่มต้น' : 'ยังไม่มีข้อมูลตัวชี้วัดในปีนี้'}</p>`
      }
    </div>`;
}

// ─── Chart ────────────────────────────────────────────────────────────────────
function drawKpiChart(kpi) {
    const ctx = document.getElementById(`kpi-chart-${kpi.id}`);
    if (!ctx) return;
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

    const dataPoints = MONTHS.map(m => {
        const v = kpi[m];
        return (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
    });
    const target = parseFloat(kpi.Target);
    const barColors = dataPoints.map(v => v === null ? 'transparent' : v <= target ? '#10b981' : '#ef4444');
    const instance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [
                {
                    label: 'Actual',
                    data: dataPoints,
                    backgroundColor: barColors,
                    borderRadius: 5,
                    barPercentage: 0.65,
                    minBarLength: 4,
                    order: 2,
                    datalabels: {
                        anchor: 'end', align: 'top', offset: -2,
                        color: c => c.dataset.data[c.dataIndex] > target ? '#dc2626' : '#64748b',
                        font: { family: 'Kanit', weight: 'bold', size: 9 },
                        formatter: v => v === null ? '' : v
                    }
                },
                {
                    label: 'Target',
                    data: Array(12).fill(target),
                    type: 'line',
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    fill: false,
                    order: 1,
                    datalabels: { display: false }
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 18, left: 2, right: 2 } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { display: false } },
                x: { grid: { display: false }, ticks: { font: { family: 'Kanit', size: 9 }, color: '#94a3b8' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.92)',
                    titleFont: { family: 'Kanit', size: 11 },
                    bodyFont: { family: 'Kanit', size: 11 },
                    padding: 10, cornerRadius: 8,
                    callbacks: {
                        title: items => items[0].label,
                        label: c => {
                            const v = c.raw;
                            if (v === null) return ' ไม่มีข้อมูล';
                            return ` ค่าจริง: ${v}  ${v <= target ? '✓ ผ่านเกณฑ์' : '⚠ เกินเกณฑ์'}`;
                        },
                        afterLabel: c => c.dataset.label === 'Actual' ? ` เป้าหมาย: ${target}` : null
                    }
                }
            }
        }
    });
    chartInstances[kpi.id] = instance;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupKpiEventListeners() {
    document.addEventListener('click', async e => {
        if (!e.target.closest('#kpi-page') && !e.target.closest('#modal-container')) return;
        const t = e.target;

        if (t.closest('#btn-add-kpi')) {
            if (!currentAnnouncementId) { showToast('กรุณาสร้างประกาศสำหรับปีนี้ก่อน', 'error'); return; }
            showKpiForm(null, currentAnnouncementId); return;
        }
        if (t.closest('#btn-manage-anns')) { showAnnouncementManager(); return; }
        if (t.closest('#btn-export-excel')) { handleExportExcel(); return; }
        if (t.closest('#btn-import-excel')) {
            if (!currentAnnouncementId) { showToast('กรุณาสร้างประกาศก่อน', 'error'); return; }
            document.getElementById('kpi-file-import')?.click(); return;
        }
        if (t.matches('#btn-add-ann-modal')) { showAnnouncementForm(); return; }

        const editBtn = t.closest('.btn-edit-kpi');
        if (editBtn) {
            const kpi = allKpiDataForYear.find(k => String(k.id) === String(editBtn.dataset.id));
            if (kpi) showKpiForm(kpi); return;
        }

        const deleteBtn = t.closest('.btn-delete-kpi');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const name = allKpiDataForYear.find(k => String(k.id) === String(id))?.Metric || 'รายการนี้';
            const ok = await showConfirmationModal('ยืนยันการลบ', `ลบตัวชี้วัด "${name}" ใช่หรือไม่?`);
            if (ok) handleDeleteKpi(id); return;
        }

        const docBtn = t.closest('[data-action="view-doc"]');
        if (docBtn) { e.preventDefault(); showDocumentModal(docBtn.href, docBtn.dataset.title || 'เอกสาร'); return; }
    });

    document.addEventListener('change', async e => {
        if (e.target.id === 'kpi-file-import') {
            const f = e.target.files[0];
            if (f) handleImportExcel(f);
            e.target.value = '';
        }
    });
}

// ─── Excel Import / Export ────────────────────────────────────────────────────
function handleExportExcel() {
    const data = allKpiDataForYear.length > 0
        ? allKpiDataForYear.map(({ id, AnnouncementID, CreatedAt, UpdatedAt, Year, ...rest }) => rest)
        : [{ Metric: 'Accident Rate', Department: 'Safety', Unit: 'Cases', Target: 0, Jan: 0, Feb: 0 }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI_Data');
    XLSX.writeFile(wb, `KPI_Export_${_selectedYear || new Date().getFullYear()}.xlsx`);
}

async function handleImportExcel(file) {
    showLoading('กำลัง Import...');
    try {
        const wb = XLSX.read(await file.arrayBuffer());
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        if (!currentAnnouncementId) throw new Error('ไม่พบ Announcement ID');
        let count = 0;
        for (const row of rows) {
            await API.post('/kpidata', {
                AnnouncementID: currentAnnouncementId, Year: _selectedYear,
                Metric: row.Metric || 'New KPI', Department: row.Department || '',
                Unit: row.Unit || '', Target: row.Target || 0,
                Jan: row.Jan ?? null, Feb: row.Feb ?? null, Mar: row.Mar ?? null,
                Apr: row.Apr ?? null, May: row.May ?? null, Jun: row.Jun ?? null,
                Jul: row.Jul ?? null, Aug: row.Aug ?? null, Sep: row.Sep ?? null,
                Oct: row.Oct ?? null, Nov: row.Nov ?? null, Dec: row.Dec ?? null,
            });
            count++;
        }
        showToast(`นำเข้าสำเร็จ ${count} รายการ`, 'success');
        loadKpiPage(_selectedYear);
    } catch (err) { showError(err); } finally { hideLoading(); }
}

// ─── Announcement Manager ─────────────────────────────────────────────────────
async function showAnnouncementManager() {
    openModal('จัดการประกาศ KPI', '<div id="ann-list-content" class="py-8 text-center text-slate-400">กำลังโหลด...</div>', 'max-w-3xl');
    try {
        const announcements = await API.get('/kpiannouncements');
        const el = document.getElementById('ann-list-content');
        if (!el) return;

        el.innerHTML = `
          <div class="flex justify-between items-center mb-4">
            <p class="text-sm text-slate-500">ประกาศทั้งหมด ${announcements.length} รายการ</p>
            <button id="btn-add-ann-modal" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm" style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              สร้างประกาศใหม่
            </button>
          </div>
          <div class="space-y-2">
            ${announcements.length === 0 ? '<div class="text-center text-slate-400 py-10 bg-slate-50 rounded-xl">ยังไม่มีประกาศ</div>' :
              announcements.map(ann => `
              <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-200 hover:shadow-sm transition-all">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ann.IsCurrent ? 'bg-emerald-50' : 'bg-slate-100'}">
                    <svg class="w-5 h-5 ${ann.IsCurrent ? 'text-emerald-600' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  </div>
                  <div>
                    <div class="font-semibold text-slate-800 text-sm">${ann.AnnouncementTitle}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-xs text-slate-400">FY ${new Date(ann.EffectiveDate).getFullYear()}</span>
                      ${ann.IsCurrent
                        ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"><span class="w-1 h-1 rounded-full bg-emerald-500 animate-pulse inline-block"></span>Active</span>'
                        : '<span class="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Archived</span>'
                      }
                    </div>
                  </div>
                </div>
                <div class="flex gap-1.5 flex-shrink-0">
                  ${!ann.IsCurrent ? `<button class="btn-set-curr-ann px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors" data-id="${ann.id}">Set Active</button>` : ''}
                  <button class="btn-del-ann p-1.5 rounded-lg border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors" data-id="${ann.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>`).join('')
            }
          </div>`;

        el.querySelectorAll('.btn-del-ann').forEach(btn => btn.addEventListener('click', async () => {
            const ok = await showConfirmationModal('ยืนยันการลบ', 'ลบประกาศนี้ใช่หรือไม่?');
            if (ok) { await API.delete(`/kpiannouncements/${btn.dataset.id}`); showAnnouncementManager(); loadKpiPage(); }
        }));
        el.querySelectorAll('.btn-set-curr-ann').forEach(btn => btn.addEventListener('click', async () => {
            const ann = announcements.find(a => String(a.id) === String(btn.dataset.id));
            if (ann) { await API.put(`/kpiannouncements/${btn.dataset.id}`, { ...ann, IsCurrent: 1 }); showAnnouncementManager(); loadKpiPage(); }
        }));
    } catch (err) {
        const el = document.getElementById('ann-list-content');
        if (el) el.innerHTML = `<p class="text-red-500 text-sm p-4">${err.message}</p>`;
    }
}

// ─── Announcement Form ────────────────────────────────────────────────────────
function showAnnouncementForm() {
    openModal('สร้างประกาศใหม่', `
      <form id="ann-form" class="space-y-4 px-1">
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">ชื่อประกาศ <span class="text-red-500">*</span></label>
          <input type="text" name="AnnouncementTitle" class="form-input w-full rounded-xl" required placeholder="เช่น เป้าหมายความปลอดภัย 2568">
        </div>
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">วันที่มีผลบังคับใช้ <span class="text-red-500">*</span></label>
          <input type="text" id="ann-date" name="EffectiveDate" class="form-input w-full rounded-xl" required placeholder="เลือกวันที่">
        </div>
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">ลิงก์เอกสาร (ไม่บังคับ)</label>
          <input type="text" name="DocumentLink" class="form-input w-full rounded-xl text-sm" placeholder="https://...">
        </div>
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">หรืออัปโหลดไฟล์ (PDF / DOCX)</label>
          <input type="file" name="AnnouncementFile" accept=".pdf,.doc,.docx"
            class="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
          <p class="text-xs text-slate-400 mt-1">ถ้าเลือกไฟล์จะใช้แทนลิงก์</p>
        </div>
        <div class="flex items-center gap-2.5">
          <input type="checkbox" id="is-curr-ann" name="IsCurrent" class="w-4 h-4 rounded text-emerald-600">
          <label for="is-curr-ann" class="text-sm font-medium text-slate-700 cursor-pointer">ตั้งเป็นประกาศปัจจุบัน</label>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-ann" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">สร้างประกาศ</button>
        </div>
      </form>`, 'max-w-lg');

    flatpickr('#ann-date', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: 'today' });
    document.getElementById('ann-form').addEventListener('submit', handleAnnouncementSubmit);
}

async function handleAnnouncementSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('#btn-submit-ann');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังบันทึก...';

    const fd = new FormData(form);
    try {
        showLoading('กำลังบันทึก...');
        const file = fd.get('AnnouncementFile');
        if (file instanceof File && file.size > 0) {
            const up = new FormData(); up.append('file', file);
            const res = await API.post('/files/upload', up);
            if (!res?.url) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
            fd.set('DocumentLink', res.url);
        }
        fd.delete('AnnouncementFile');
        const data = Object.fromEntries(fd.entries());
        data.IsCurrent = form.querySelector('#is-curr-ann').checked ? 1 : 0;
        await API.post('/kpiannouncements', data);
        closeModal();
        showToast('สร้างประกาศสำเร็จ', 'success');
        await showAnnouncementManager();
        await loadKpiPage();
    } catch (err) { showError(err); }
    finally { hideLoading(); btn.disabled = false; btn.textContent = 'สร้างประกาศ'; }
}

// ─── KPI Form ─────────────────────────────────────────────────────────────────
function showKpiForm(kpi = null, announcementId = null) {
    const isEdit = !!kpi;
    const selYear = kpi?.Year ?? _selectedYear ?? new Date().getFullYear();
    const annId = kpi?.AnnouncementID ?? announcementId;

    const monthInputs = MONTHS.map(m => `
      <div class="flex flex-col items-center">
        <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">${m}</label>
        <input type="number" step="any" name="${m}"
          class="w-full text-center text-sm font-semibold rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 py-2 bg-white transition-colors"
          value="${kpi?.[m] ?? ''}" placeholder="—"
          style="min-width:0">
      </div>`).join('');

    openModal(isEdit ? 'แก้ไขตัวชี้วัด KPI' : 'เพิ่มตัวชี้วัด KPI', `
      <form id="kpi-form" novalidate class="space-y-5 px-1">
        <input type="hidden" name="id" value="${kpi?.id || ''}">
        <input type="hidden" name="Year" value="${selYear}">
        <input type="hidden" name="AnnouncementID" value="${annId || ''}">

        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-bold text-slate-700 mb-1.5">ชื่อตัวชี้วัด <span class="text-red-500">*</span></label>
            <input type="text" name="Metric" class="form-input w-full rounded-xl font-medium" value="${kpi?.Metric || ''}" required placeholder="เช่น อัตราการเกิดอุบัติเหตุ">
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1.5">แผนก / หน่วยงาน</label>
            <input type="text" name="Department" class="form-input w-full rounded-xl" value="${kpi?.Department || ''}" placeholder="เช่น Safety">
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1.5">หน่วย</label>
            <input type="text" name="Unit" class="form-input w-full rounded-xl" value="${kpi?.Unit || ''}" placeholder="เช่น ราย, ครั้ง">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-bold text-slate-700 mb-1.5">เป้าหมาย (ค่าสูงสุดที่ยอมรับได้) <span class="text-red-500">*</span></label>
            <div class="relative">
              <input type="number" step="any" name="Target" required
                class="form-input w-full rounded-xl font-bold pl-4 pr-16 border-amber-200 focus:border-amber-400 bg-amber-50/40 text-amber-700"
                value="${kpi?.Target || ''}" placeholder="0">
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">${kpi?.Unit || 'หน่วย'}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1">ค่าจริง ≤ เป้าหมาย = ผ่านเกณฑ์ (Safety Logic)</p>
          </div>
        </div>

        <div class="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div class="flex items-center justify-between mb-3">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              ข้อมูลรายเดือน (ค่าจริง)
            </label>
            <span class="text-xs text-slate-400">เว้นว่างได้ถ้าไม่มีข้อมูล</span>
          </div>
          <div class="grid grid-cols-6 gap-2">${monthInputs}</div>
        </div>

        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="document.getElementById('modal-close-btn')?.click()"
            class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-kpi"
            class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-md"
            style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก KPI</button>
        </div>
      </form>`, 'max-w-4xl');

    document.getElementById('kpi-form').addEventListener('submit', handleKpiFormSubmit);
}

async function handleKpiFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.Metric.value || !form.Target.value) { showToast('กรุณากรอกชื่อและเป้าหมาย', 'error'); return; }
    const btn = document.getElementById('btn-submit-kpi');
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังบันทึก...';

    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.AnnouncementID) { showToast('ไม่พบ Announcement ID', 'error'); btn.disabled = false; return; }
    MONTHS.forEach(m => { if (data[m] === '') data[m] = null; });

    try {
        if (data.id) await API.put(`/kpidata/${data.id}`, data);
        else await API.post('/kpidata', data);
        closeModal();
        await loadKpiPage(data.Year);
        showToast('บันทึก KPI สำเร็จ', 'success');
    } catch (err) { showError(err); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'บันทึก KPI'; } }
}

async function handleDeleteKpi(id) {
    showLoading('กำลังลบ...');
    try {
        await API.delete(`/kpidata/${id}`);
        await loadKpiPage(_selectedYear);
        showToast('ลบข้อมูลสำเร็จ', 'success');
    } catch (err) { showError(err); } finally { hideLoading(); }
}
