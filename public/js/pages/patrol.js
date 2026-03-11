import { openModal, closeModal, showLoading, hideLoading, showToast, showError } from '../ui.js';
import { API } from '../api.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const currentUser = TSHSession.getUser() || { name: 'Staff', id: 'EMP001', department: '', team: 'Safety Team', role: 'User' };
const isAdmin = !!(
    (currentUser.role && currentUser.role.toLowerCase() === 'admin') ||
    (currentUser.Role && currentUser.Role.toLowerCase() === 'admin')
);

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
let _allIssues = [];
let _activeFilter = 'all';

// ─── Main Load ────────────────────────────────────────────────────────────────
export async function loadPatrolPage() {
    window.closeModal = closeModal;
    window.loadPatrolPage = loadPatrolPage;
    window.openCheckInModal = openCheckInModal;
    window.openIssueForm = openIssueForm;
    window.handleCheckInSubmit = handleCheckInSubmit;
    window.openCarouselDetail = openCarouselDetail;

    const container = document.getElementById('patrol-page');
    container.innerHTML = getSkeletonHTML();

    try {
        const [scheduleRes, statsRes, issuesRes] = await Promise.all([
            API.get(`/patrol/my-schedule?employeeId=${currentUser.id}&month=${new Date().getMonth()+1}&year=${new Date().getFullYear()}`),
            API.get('/patrol/attendance-stats'),
            API.get('/patrol/issues')
        ]);

        _allIssues = normalizeApiArray(issuesRes);
        renderDashboard(container, {
            schedule: normalizeApiArray(scheduleRes),
            stats: normalizeApiArray(statsRes),
            issues: _allIssues
        });

        setTimeout(() => initPromoCarousel(), 100);
        loadDashboardCharts();

    } catch (err) {
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
    }
}

// ─── Render Dashboard ─────────────────────────────────────────────────────────
function renderDashboard(container, data) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const issuesArray = _allIssues;
    const statsArray  = normalizeApiArray(data.stats);
    const myStats = statsArray.find(r => r.Name === currentUser.name) || { Total: 0, Percent: 0 };
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

    // Tabs state
    window.switchTab = function(tab) {
        ['patrol','issues'].forEach(t => {
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
    };

    container.innerHTML = `
    <div class="pb-20 animate-fade-in">

      <!-- ═══ HERO BANNER ═══ -->
      <div class="relative overflow-hidden rounded-2xl mb-6" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
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
              <p class="text-sm mt-1" style="color:rgba(167,243,208,0.8)">${dateStr} · ${currentUser.name}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="loadPatrolPage()" class="p-2.5 rounded-xl bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
              <button onclick="openIssueForm('OPEN')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                รายงานปัญหา
              </button>
            </div>
          </div>

          <!-- Stats strip -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            ${[
              { label: 'การเดินตรวจ', val: walks, sub: 'ครั้ง', color: '#6ee7b7' },
              { label: 'อัตราผ่านเกณฑ์', val: `${myStats.Percent || 0}%`, sub: 'เป้าหมาย', color: '#6ee7b7' },
              { label: 'ปัญหารอแก้', val: openIssues + tempIssues, sub: 'รายการ', color: openIssues > 0 ? '#fca5a5' : '#6ee7b7' },
              { label: 'แก้ไขแล้ว', val: closedIssues, sub: 'รายการ', color: '#6ee7b7' },
            ].map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-xl font-bold" style="color:${s.color}">${s.val}</p>
              <p class="text-[11px] mt-0.5 text-white/70">${s.label}</p>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- ═══ TABS ═══ -->
      <div class="bg-slate-100 p-1 rounded-xl flex gap-1 max-w-sm mb-6">
        <button id="btn-tab-patrol" onclick="switchTab('patrol')"
          class="flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm flex justify-center items-center gap-2 transition-all"
          style="background:linear-gradient(135deg,#059669,#0d9488)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          การเดินตรวจ
        </button>
        <button id="btn-tab-issues" onclick="switchTab('issues')"
          class="flex-1 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-xl transition-all flex justify-center items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          ปัญหา & สถิติ
          ${openIssues > 0 ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white bg-red-500">${openIssues}</span>` : ''}
        </button>
      </div>

      <!-- ═══ PATROL TAB ═══ -->
      <div id="content-patrol" class="grid grid-cols-1 xl:grid-cols-3 gap-5 animate-fade-in">
        <div class="xl:col-span-2 space-y-5">

          <!-- Check-in Card -->
          <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100" style="box-shadow:0 4px 24px rgba(5,150,105,0.07)">
            <div class="flex flex-col md:flex-row">
              <div class="md:w-5/12 p-6 flex flex-col justify-between relative overflow-hidden" style="background:linear-gradient(135deg,#064e3b,#065f46)">
                <div class="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
                <div class="relative z-10">
                  <div class="flex items-center gap-2 mb-3">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse inline-block"></span>
                      พร้อมปฏิบัติงาน
                    </span>
                  </div>
                  <h3 class="text-lg font-bold text-white">บันทึกการเดินตรวจ</h3>
                  <p class="text-xs mt-1" style="color:rgba(167,243,208,0.7)">Daily Check-in</p>
                </div>
                <button onclick="openCheckInModal()" class="relative z-10 mt-5 w-full py-3 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                  เช็คอินเดินตรวจ
                </button>
              </div>
              <div class="md:w-7/12 flex flex-col bg-white">
                <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 class="font-bold text-slate-700 text-sm">ตารางงาน (My Schedule)</h3>
                  <span class="text-[10px] text-slate-400">${today.toLocaleString('th-TH',{month:'long',year:'numeric'})}</span>
                </div>
                <div class="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50" style="max-height:200px">
                  ${data.schedule.length > 0 ? data.schedule.map(item => {
                    const d = new Date(item.ScheduledDate);
                    const isTd = d.toDateString() === today.toDateString();
                    return `<div class="flex items-center px-5 py-3 hover:bg-slate-50 transition-colors ${isTd ? 'bg-emerald-50/40' : ''}">
                      <div class="w-10 text-center border-r border-slate-100 pr-3 mr-3 flex-shrink-0">
                        <div class="text-lg font-bold ${isTd ? 'text-emerald-600' : 'text-slate-700'}">${d.getDate()}</div>
                        <div class="text-[9px] font-bold text-slate-400 uppercase">${d.toLocaleString('en-US',{month:'short'})}</div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-slate-800 truncate">${item.TeamName}</p>
                        <p class="text-[10px] text-slate-400">Factory Area</p>
                      </div>
                      ${isTd ? `<span class="flex-shrink-0 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">วันนี้</span>` : ''}
                    </div>`;
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
              <div class="flex items-center gap-3 text-xs text-slate-400">
                <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-md bg-emerald-500 inline-block"></span>วันนี้</span>
                <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-md bg-emerald-100 border border-emerald-200 inline-block"></span>มีตาราง</span>
              </div>
            </div>
            <div class="grid grid-cols-7 gap-1 text-center mb-2">
              ${['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<div class="text-[9px] font-bold text-slate-400">${d}</div>`).join('')}
            </div>
            <div class="grid grid-cols-7 gap-1 text-center">${generateMiniCalendarHTML(data.schedule)}</div>
          </div>
        </div>

        <div class="xl:col-span-1 space-y-5">

          <!-- Performance Card -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 overflow-hidden relative">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-5" style="background:${rank.color}"></div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                ผลงานของฉัน
              </h3>
              <span class="text-[10px] font-bold px-2 py-1 rounded-full" style="background:${rank.bg};color:${rank.color}">${rank.title}</span>
            </div>

            <!-- Tier Progress -->
            <div class="space-y-2 mb-4">
              ${rankTiers.map((tier) => {
                const isCurrentTier = walks >= tier.min && walks <= tier.max;
                const isDoneTier = walks > tier.max;
                return `<div class="flex items-center gap-3">
                  <div class="w-2 h-2 rounded-full flex-shrink-0 ${isDoneTier ? 'bg-emerald-500' : isCurrentTier ? 'bg-amber-400' : 'bg-slate-200'}"></div>
                  <div class="flex-1">
                    <div class="flex justify-between items-center mb-0.5">
                      <span class="text-[10px] font-bold ${isCurrentTier ? 'text-slate-700' : 'text-slate-400'}">${tier.title}</span>
                      <span class="text-[10px] text-slate-400">${tier.min}${tier.needed ? `–${tier.needed-1}` : '+'} ครั้ง</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-700" style="width:${isDoneTier ? 100 : isCurrentTier ? rankPct : 0}%;background:${isDoneTier ? '#10b981' : isCurrentTier ? rank.color : '#e2e8f0'}"></div>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>

            <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
              <div>
                <p class="text-[10px] text-slate-400 font-medium">การเดินตรวจทั้งหมด</p>
                <p class="text-xl font-bold" style="color:${rank.color}">${walks} <span class="text-xs font-normal text-slate-400">ครั้ง</span></p>
              </div>
              <div class="text-right">
                <p class="text-[10px] text-slate-400 font-medium">อัตราผ่าน</p>
                <p class="text-xl font-bold text-emerald-600">${myStats.Percent || 0}%</p>
              </div>
            </div>
            ${rank.needed ? `<p class="text-[10px] text-slate-400 mt-2 text-center">อีก <strong class="text-slate-600">${Math.max(0, rank.needed - walks)}</strong> ครั้ง จะขึ้นเป็น ${rank.nextLabel}</p>` : `<p class="text-[10px] text-emerald-600 font-bold mt-2 text-center">🏆 ระดับสูงสุดแล้ว</p>`}
          </div>

          <!-- Safety Carousel -->
          <div id="promo-carousel" class="relative overflow-hidden rounded-2xl shadow-md h-80 bg-slate-900 group">
            <div id="carousel-slides" class="relative w-full h-full">
              ${SAFETY_IMAGES.map((img, idx) => `
              <div class="carousel-item absolute inset-0 pointer-events-none transition-opacity duration-700 opacity-0 z-0" data-index="${idx}">
                <img src="${img.src}" class="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000 ease-out">
                <div class="absolute inset-0" style="background:linear-gradient(to top,rgba(6,30,20,0.95) 0%,rgba(6,30,20,0.3) 50%,transparent 100%)"></div>
                <div class="absolute bottom-0 left-0 right-0 p-5">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <span class="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold mb-2" style="background:rgba(16,185,129,0.3);color:#6ee7b7;border:1px solid rgba(16,185,129,0.4)">ความปลอดภัย</span>
                      <h3 class="text-base font-bold text-white leading-tight">${img.title}</h3>
                      <p class="text-[11px] mt-1 line-clamp-2" style="color:rgba(167,243,208,0.7)">${img.desc}</p>
                    </div>
                  </div>
                  <button onclick="openCarouselDetail(${idx})" class="mt-3 text-[10px] font-semibold px-4 py-1.5 rounded-full border border-white/30 text-white hover:bg-white/20 transition-colors pointer-events-auto backdrop-blur-sm">
                    ดูรายละเอียด →
                  </button>
                </div>
              </div>`).join('')}
            </div>

            <!-- Dots + counter -->
            <div class="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-full pointer-events-none">
              <span id="carousel-counter" class="text-[10px] font-bold text-white">1/${SAFETY_IMAGES.length}</span>
            </div>
            <div class="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-auto">
              ${SAFETY_IMAGES.map((_, idx) => `<button class="carousel-dot h-1 w-1.5 bg-white/30 rounded-full transition-all duration-300 hover:bg-white/60" data-index="${idx}"></button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ ISSUES TAB ═══ -->
      <div id="content-issues" class="hidden space-y-5">

        <!-- Stats row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 h-72 flex flex-col">
            <h3 class="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
              <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
              ผู้ร่วมเดินตรวจ
            </h3>
            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              ${statsArray.slice(0,10).map((r, i) => `
              <div class="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                <span class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${i+1}</span>
                <div class="w-6 h-6 rounded-full bg-slate-100 text-[9px] flex items-center justify-center font-bold text-slate-600 flex-shrink-0">${r.Name?r.Name[0]:'?'}</div>
                <span class="text-xs font-semibold text-slate-600 truncate flex-1">${r.Name}</span>
                <div class="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden flex-shrink-0">
                  <div class="bg-emerald-500 h-full rounded-full" style="width:${Math.min(r.Percent||0,100)}%"></div>
                </div>
                <span class="text-[9px] text-slate-400 font-mono flex-shrink-0 w-4 text-right">${r.Total}</span>
              </div>`).join('')}
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 h-72 flex flex-col">
            <h3 class="font-bold text-slate-700 text-sm mb-3">สถิติแยกพื้นที่</h3>
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <table class="w-full text-xs text-left">
                <thead><tr class="border-b border-slate-100">
                  <th class="pb-2 font-bold text-slate-400 text-[10px] uppercase">พื้นที่</th>
                  <th class="pb-2 font-bold text-emerald-600 text-[10px] uppercase text-center">เสร็จ</th>
                  <th class="pb-2 font-bold text-orange-500 text-[10px] uppercase text-center">รอ</th>
                </tr></thead>
                <tbody id="dashboard-section-body">
                  <tr><td colspan="3" class="text-center py-4 text-slate-300 text-xs">กำลังโหลด...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 h-72 flex flex-col">
            <h3 class="font-bold text-slate-700 text-sm mb-3">วิเคราะห์ความเสี่ยง</h3>
            <div class="flex-1 relative flex items-center justify-center"><canvas id="rankChart"></canvas></div>
          </div>
        </div>

        <!-- Issue Register -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-100">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-slate-700 text-sm">ทะเบียนปัญหา</h3>
                <span class="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-400 font-mono">ทั้งหมด ${total}</span>
              </div>
              <div class="flex gap-2">
                <span class="text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-1 rounded-lg font-bold">รอแก้ ${openIssues}</span>
                <span class="text-[10px] bg-orange-50 text-orange-600 border border-orange-100 px-2 py-1 rounded-lg font-bold">ชั่วคราว ${tempIssues}</span>
                <span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg font-bold">เสร็จ ${closedIssues}</span>
              </div>
            </div>
            <!-- Filter pills (functional) -->
            <div class="flex flex-wrap gap-2" id="issue-filter-bar">
              ${[
                { key:'all',    label:'ทั้งหมด',     dot:'' },
                { key:'open',   label:'รอแก้ไข',     dot:'bg-red-500' },
                { key:'temp',   label:'แก้ชั่วคราว',  dot:'bg-orange-400' },
                { key:'closed', label:'เสร็จสิ้น',    dot:'bg-emerald-500' },
                { key:'high',   label:'ความเสี่ยงสูง', dot:'bg-rose-600' },
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
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="text-[10px] text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-5 py-3 font-bold">ID</th>
                  <th class="px-5 py-3 font-bold">ภาพ</th>
                  <th class="px-5 py-3 font-bold">รายละเอียด / พื้นที่</th>
                  <th class="px-5 py-3 font-bold text-center">สถานะ</th>
                  <th class="px-5 py-3 font-bold text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody id="issue-table-body" class="divide-y divide-slate-50">
                ${renderIssueRows(issuesArray)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <!-- FAB -->
    <button onclick="openIssueForm('OPEN')" title="รายงานปัญหาเร่งด่วน"
      class="fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-50 group border-4 border-white transition-transform hover:scale-110 active:scale-95"
      style="background:linear-gradient(135deg,#dc2626,#ef4444)">
      <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      <span class="absolute right-16 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">รายงานเร่งด่วน</span>
    </button>`;

    // Filter event
    document.getElementById('issue-filter-bar')?.addEventListener('click', e => {
        const btn = e.target.closest('.issue-filter-btn');
        if (!btn) return;
        _activeFilter = btn.dataset.filter;
        // update button styles
        document.querySelectorAll('.issue-filter-btn').forEach(b => {
            const isActive = b.dataset.filter === _activeFilter;
            b.className = `issue-filter-btn px-3 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 ${isActive ? 'text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'}`;
            b.style.background = isActive ? 'linear-gradient(135deg,#059669,#0d9488)' : '';
        });
        // re-render rows
        const filtered = getFilteredIssues(_allIssues, _activeFilter);
        const tbody = document.getElementById('issue-table-body');
        if (tbody) tbody.innerHTML = renderIssueRows(filtered);
    });
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────
function getFilteredIssues(issues, filter) {
    switch (filter) {
        case 'open':   return issues.filter(i => i.CurrentStatus === 'Open');
        case 'temp':   return issues.filter(i => i.CurrentStatus === 'Temporary');
        case 'closed': return issues.filter(i => i.CurrentStatus === 'Closed');
        case 'high':   return issues.filter(i => i.Risk === 'High');
        default:       return issues;
    }
}

function renderIssueRows(issues) {
    if (!issues.length) return `<tr><td colspan="5" class="text-center py-10 text-sm text-slate-400">ไม่พบรายการที่ตรงกัน</td></tr>`;
    return issues.map(rawItem => renderIssueRow(rawItem)).join('');
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function generateMiniCalendarHTML(scheduleData) {
    const today = new Date();
    const year = today.getFullYear(), month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="h-8"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        const isScheduled = Array.isArray(scheduleData) && scheduleData.some(s => s?.PatrolDate && new Date(s.PatrolDate).getDate() === day);
        const isToday = day === today.getDate();
        let cls = "h-8 flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer transition-all hover:bg-slate-50";
        if (isToday) cls += " text-white font-bold shadow-sm";
        else if (isScheduled) cls += " bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold";
        else cls += " text-slate-500";
        html += `<div class="${cls}" ${isToday ? 'style="background:linear-gradient(135deg,#059669,#0d9488)"' : ''}>${day}</div>`;
    }
    return html;
}

// ─── Issue Row ────────────────────────────────────────────────────────────────
function renderIssueRow(rawItem) {
    const item = normalizeApiObject(rawItem);
    const isClosed = item.CurrentStatus === 'Closed';
    const isTemp = item.CurrentStatus === 'Temporary';

    const statusMeta = isClosed
        ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'เสร็จสิ้น', border: '#10b981' }
        : isTemp
            ? { cls: 'bg-orange-50 text-orange-700 border-orange-100', label: 'แก้ชั่วคราว', border: '#f97316' }
            : { cls: 'bg-red-50 text-red-700 border-red-100', label: 'รอแก้ไข', border: '#ef4444' };

    const riskBorder = item.Risk === 'High' ? '#f43f5e' : item.Risk === 'Medium' ? '#fb923c' : 'transparent';
    const imgUrl = item.BeforeImage || 'https://placehold.co/40x40?text=IMG';

    let actionBtns = '';
    if (!isClosed) {
        actionBtns = `<button onclick='event.stopPropagation();openIssueForm("TEMP",${JSON.stringify(item)})' class="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-200 shadow-sm transition-all" title="อัปเดต">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        </button>`;
    }
    if (isAdmin && !isClosed) {
        actionBtns += `<button onclick='event.stopPropagation();openIssueForm("CLOSE",${JSON.stringify(item)})' class="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition-all ml-1" title="ปิดงาน">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </button>`;
    }
    actionBtns += `<button onclick='event.stopPropagation();openIssueForm("VIEW",${JSON.stringify(item)})' class="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition-all ml-1" title="ดูรายละเอียด">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.235 3.932-5.732 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
    </button>`;

    return `<tr class="hover:bg-slate-50/70 transition-colors group cursor-pointer border-l-4" style="border-left-color:${riskBorder}" onclick='openIssueForm("VIEW",${JSON.stringify(item)})'>
        <td class="px-5 py-4 text-[10px] text-slate-400 font-mono align-middle">#${item.IssueID || '?'}</td>
        <td class="px-5 py-3 align-middle">
            <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shadow-sm transition-transform group-hover:scale-110">
                <img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/40x40?text=No+Img'">
            </div>
        </td>
        <td class="px-5 py-3 align-middle">
            <div class="font-bold text-slate-700 text-xs mb-0.5">${item.Area || 'ไม่ระบุพื้นที่'}</div>
            <div class="text-[10px] text-slate-400 line-clamp-2 max-w-[220px]">${item.HazardDescription || '—'}</div>
        </td>
        <td class="px-5 py-4 text-center align-middle">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold border ${statusMeta.cls}">
                <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${statusMeta.border}"></span>
                ${statusMeta.label}
            </span>
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

// ─── Check-in Modal ───────────────────────────────────────────────────────────
function openCheckInModal() {
    openModal('บันทึกการเดินตรวจ', `
      <form id="checkin-form" onsubmit="handleCheckInSubmit(event)" class="space-y-5">
        <div class="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5)">
            <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          </div>
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ผู้ปฏิบัติงาน</p>
            <p class="font-bold text-slate-800">${currentUser.name}</p>
            <p class="text-xs text-slate-400 mt-0.5">${currentUser.team || '—'}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="cursor-pointer">
            <input type="radio" name="PatrolType" value="Normal" class="peer sr-only" checked>
            <div class="p-4 rounded-xl border-2 border-slate-100 bg-white text-center hover:border-emerald-100 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 transition-all">
              <div class="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 peer-checked:bg-emerald-500 flex items-center justify-center transition-all" style="background:inherit">
                <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              </div>
              <p class="text-xs font-bold text-slate-700">เดินตรวจปกติ</p>
              <p class="text-[9px] text-slate-400">Routine Patrol</p>
            </div>
          </label>
          <label class="cursor-pointer">
            <input type="radio" name="PatrolType" value="Re-inspection" class="peer sr-only">
            <div class="p-4 rounded-xl border-2 border-slate-100 bg-white text-center hover:border-amber-100 peer-checked:border-amber-500 peer-checked:bg-amber-50 transition-all">
              <div class="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
              <p class="text-xs font-bold text-slate-700">ตรวจซ้ำ / ติดตาม</p>
              <p class="text-[9px] text-slate-400">Re-inspection</p>
            </div>
          </label>
        </div>

        <button type="submit" class="w-full py-3 rounded-xl font-bold text-sm text-white shadow-sm transition-all active:scale-[0.98]" style="background:linear-gradient(135deg,#059669,#0d9488)">
          ยืนยันเช็คอิน
        </button>
      </form>`, 'max-w-sm');
}

async function handleCheckInSubmit(e) {
    e.preventDefault();
    const type = new FormData(e.target).get('PatrolType');
    showLoading();
    try {
        await API.post('/patrol/checkin', { UserID: currentUser.id, UserName: currentUser.name, TeamName: currentUser.team, PatrolType: type });
        closeModal();
        showToast(`เช็คอินสำเร็จ — ${type}`, 'success');
        loadPatrolPage();
    } catch (err) { showError(err); } finally { hideLoading(); }
}

// ─── Issue Form ───────────────────────────────────────────────────────────────
window.openIssueForm = function(mode, rawIssueData = null) {
    const issueData = normalizeApiObject(rawIssueData);
    const isView = mode === 'VIEW';
    const isEdit = !isView;
    const today = new Date().toISOString().split('T')[0];
    const d = isEdit ? '' : 'disabled';
    const r = isEdit ? '' : 'readonly';

    // Step indicator
    const steps = [
        { key: 'OPEN',  label: 'รายงานปัญหา',    modes: ['OPEN'] },
        { key: 'TEMP',  label: 'แก้ชั่วคราว',     modes: ['TEMP'] },
        { key: 'CLOSE', label: 'ปิดงาน (Final)',  modes: ['CLOSE'] },
    ];
    const stepHtml = steps.map((s, i) => {
        const isActive = s.modes.includes(mode);
        const isDone = (mode === 'TEMP' && i === 0) || (mode === 'CLOSE' && i <= 1) || (mode === 'VIEW' && issueData?.CurrentStatus === 'Closed');
        return `<div class="flex items-center gap-1.5 ${i > 0 ? 'flex-1' : ''}">
            ${i > 0 ? `<div class="flex-1 h-px ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}"></div>` : ''}
            <div class="flex flex-col items-center">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${isActive ? 'text-white' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}" style="${isActive ? 'background:linear-gradient(135deg,#059669,#0d9488)' : ''}">
                    ${isDone && !isActive ? '✓' : i+1}
                </div>
                <span class="text-[8px] mt-1 font-bold ${isActive ? 'text-emerald-600' : isDone ? 'text-emerald-500' : 'text-slate-400'} whitespace-nowrap">${s.label}</span>
            </div>
        </div>`;
    }).join('');

    const html = `
      <div class="space-y-5 text-sm">
        <!-- Step indicator -->
        <div class="flex items-start justify-between px-2">${stepHtml}</div>

        <form id="issue-form" class="space-y-4">
          <input type="hidden" name="ActionType" value="${mode}">
          <input type="hidden" name="IssueID" value="${issueData?.IssueID || ''}">

          <!-- Before/After images -->
          ${(isView || mode === 'CLOSE') && issueData ? `
          <div class="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
            <div class="grid grid-cols-2 divide-x divide-slate-700">
              <div class="relative h-44 overflow-hidden">
                <img src="${issueData.BeforeImage || 'https://placehold.co/400x176?text=No+Image'}" class="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-bold bg-red-600/90 text-white">BEFORE</span>
              </div>
              <div class="relative h-44 overflow-hidden flex items-center justify-center bg-slate-800">
                ${issueData.AfterImage
                    ? `<img src="${issueData.AfterImage}" class="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity">`
                    : `<div class="text-slate-500 text-xs flex flex-col items-center gap-1"><svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>รอภาพหลังซ่อม</div>`}
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-600/90 text-white">AFTER</span>
              </div>
            </div>
          </div>` : ''}

          <!-- Section 1: Issue Detail -->
          <div class="rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">1</span>
              <span class="text-xs font-bold text-slate-700">รายละเอียดปัญหา (Issue Detail)</span>
            </div>
            <div class="p-4 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วันที่พบ</label>
                  <input type="date" name="DateFound" class="form-input w-full rounded-lg text-xs bg-slate-50" value="${issueData?.DateFound ? issueData.DateFound.split('T')[0] : today}" ${r}>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">พื้นที่</label>
                  <select name="Area" class="form-select w-full rounded-lg text-xs" ${d}>
                    ${['Line 1','Line 2','Warehouse','Office','Outdoor'].map(a => `<option value="${a}" ${issueData?.Area === a ? 'selected':''}>${a}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">รายละเอียด</label>
                <textarea name="HazardDescription" rows="3" class="form-input w-full rounded-lg text-xs bg-slate-50 resize-none" ${r} placeholder="อธิบายลักษณะปัญหา...">${issueData?.HazardDescription || ''}</textarea>
              </div>
              ${mode === 'OPEN' ? `
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ภาพก่อนซ่อม</label>
                <input type="file" name="BeforeImage" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">
              </div>` : ''}
            </div>
          </div>

          <!-- Section 2: Temp Fix -->
          ${mode === 'TEMP' || mode === 'CLOSE' || mode === 'VIEW' && issueData?.TempDescription ? `
          <div class="rounded-xl border border-orange-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-orange-50 border-b border-orange-200 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-orange-500 text-[9px] font-bold flex items-center justify-center text-white">2</span>
              <span class="text-xs font-bold text-orange-800">การแก้ไขเบื้องต้น (Temporary Fix)</span>
            </div>
            <div class="p-4 space-y-3">
              <textarea name="TempDescription" rows="2" class="form-input w-full rounded-lg text-xs border-orange-200 resize-none" ${isView ? 'readonly' : ''} placeholder="อธิบายการแก้ไขเบื้องต้น...">${issueData?.TempDescription || ''}</textarea>
              ${!isView ? `<input type="file" name="TempImage" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100">` : ''}
            </div>
          </div>` : ''}

          <!-- Section 3: Final Solution -->
          ${mode === 'CLOSE' || mode === 'VIEW' && issueData?.ActionDescription ? `
          <div class="rounded-xl border border-emerald-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-emerald-600 text-[9px] font-bold flex items-center justify-center text-white">3</span>
              <span class="text-xs font-bold text-emerald-800">การแก้ไขถาวร (Final Solution)</span>
            </div>
            <div class="p-4 space-y-3">
              <textarea name="ActionDescription" rows="2" class="form-input w-full rounded-lg text-xs border-emerald-200 resize-none" ${isView ? 'readonly' : ''} placeholder="อธิบายการแก้ไขถาวร...">${issueData?.ActionDescription || ''}</textarea>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold text-emerald-700 uppercase mb-1">วันที่เสร็จ</label>
                  <input type="date" name="FinishDate" class="form-input w-full text-xs rounded-lg border-emerald-200" value="${issueData?.FinishDate ? issueData.FinishDate.split('T')[0] : today}" ${isView ? 'readonly' : ''}>
                </div>
              </div>
              ${!isView ? `<input type="file" name="AfterImage" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">` : ''}
            </div>
          </div>` : ''}

          <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onclick="document.getElementById('modal-close-btn')?.click()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
              ${isView ? 'ปิด' : 'ยกเลิก'}
            </button>
            ${!isView ? `<button type="submit" id="btn-issue-submit" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]" style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึกข้อมูล</button>` : ''}
          </div>
        </form>
      </div>`;

    const titleMap = { OPEN: 'รายงานปัญหาใหม่', TEMP: 'อัปเดตการแก้ไขเบื้องต้น', CLOSE: 'ปิดงาน — การแก้ไขถาวร', VIEW: 'รายละเอียดปัญหา' };
    openModal(titleMap[mode], html, 'max-w-xl');

    if (!isView) {
        const form = document.getElementById('issue-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('btn-issue-submit');
                if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังบันทึก...'; }
                const formData = new FormData(form);
                if (mode === 'OPEN') {
                    if (!formData.get('FoundByTeam')) formData.append('FoundByTeam', currentUser.team || '');
                    if (!formData.get('ResponsibleDept')) formData.append('ResponsibleDept', 'Maintenance');
                    if (!formData.get('HazardType')) formData.append('HazardType', 'Unsafe Condition');
                }
                showLoading('กำลังบันทึก...');
                try {
                    const res = await API.post('/patrol/issue/save', formData);
                    if (res?.success === false) throw new Error(res.message || 'บันทึกไม่สำเร็จ');
                    showToast('บันทึกสำเร็จ', 'success');
                    closeModal();
                    loadPatrolPage();
                } catch (err) { showError(err); }
                finally { hideLoading(); if (btn) { btn.disabled = false; btn.textContent = 'บันทึกข้อมูล'; } }
            });
        }
    }
};

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

// ─── Charts ───────────────────────────────────────────────────────────────────
async function loadDashboardCharts() {
    try {
        const res = await API.get('/patrol/dashboard-stats');
        const data = normalizeApiObject(res);
        const bySection = normalizeApiArray(data.bySection);
        const byRank    = normalizeApiArray(data.byRank);

        const tbody = document.getElementById('dashboard-section-body');
        if (tbody) {
            tbody.innerHTML = bySection.length > 0
                ? bySection.map(row => `<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-2.5 font-medium text-slate-700 text-xs">${row.Section || 'ทั่วไป'}</td>
                    <td class="px-4 py-2.5 text-center text-emerald-600 font-bold text-xs">${row.Achieved || 0}</td>
                    <td class="px-4 py-2.5 text-center text-orange-500 font-bold text-xs">${row.OnProcess || 0}</td>
                  </tr>`).join('')
                : `<tr><td colspan="3" class="text-center py-6 text-xs text-slate-300">ยังไม่มีข้อมูล</td></tr>`;
        }

        const ctxRank = document.getElementById('rankChart');
        if (ctxRank && byRank.length > 0) {
            const rankMap = { A: 0, B: 0, C: 0 };
            byRank.forEach(r => rankMap[r.Rank] = r.Count);
            if (window._rankChart) window._rankChart.destroy();
            window._rankChart = new Chart(ctxRank.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['A (สูง)', 'B (กลาง)', 'C (ต่ำ)'],
                    datasets: [{ data: [rankMap.A, rankMap.B, rankMap.C], backgroundColor: ['#f43f5e', '#fb923c', '#10b981'], borderWidth: 0, hoverOffset: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%',
                    plugins: { legend: { position: 'right', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10, family: 'Kanit' } } } }
                }
            });
        }
        initPromoCarousel();
    } catch (e) { console.error('Chart error:', e); }
}
