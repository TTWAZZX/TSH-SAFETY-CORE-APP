import { openModal, closeModal, showLoading, hideLoading, showToast, showError } from '../ui.js';
import { API } from '../api.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const currentUser = TSHSession.getUser() || { name: 'Staff', id: 'EMP001', department: '', team: 'Safety Team', role: 'User' };

// ─── Backend URL helper (for local /uploads/ images) ─────────────────────────
const _backendBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : '';
function resolveFileUrl(url) {
    if (!url) return null;
    if (url.startsWith('/uploads/')) return _backendBase + url;
    return url;
}
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
let _allIssues      = [];
let _activeFilter   = 'all';
let _searchQuery    = '';
let _filterDept     = '';
let _filterUnit     = '';
let _monthlySummary = [];
let _myPlan         = null;  // personal monthly plan (team, sessions, compliance, roster)
let _mySelfPatrol   = null;  // self-patrol data for supervisor positions
let _patrolAreas    = [];    // master areas list — synced from Patrol_Areas table
let _masterDepts    = [];    // master departments for issue form responsible dept
let _masterUnits    = [];    // safety units per department (Master_SafetyUnits)
let _overviewYear   = new Date().getFullYear();
let _overviewData   = null;  // attendance overview cache

// ─── Main Load ────────────────────────────────────────────────────────────────
export async function loadPatrolPage() {
    window.closeModal = closeModal;
    window.loadPatrolPage = loadPatrolPage;
    window.openCheckInModal = openCheckInModal;
    window.openIssueForm = openIssueForm;
    window.handleCheckInSubmit = handleCheckInSubmit;
    window.openCarouselDetail = openCarouselDetail;
    window.openSelfCheckinModal = openSelfCheckinModal;
    window.deleteSelfCheckin = deleteSelfCheckin;
    window.switchOverviewYear = switchOverviewYear;
    window.exportIssuesToExcel = exportIssuesToExcel;
    window._issueChangeDept = _issueChangeDept;
    window.deleteIssue = deleteIssue;
    window._issueFilterDept = _issueFilterDept;

    const container = document.getElementById('patrol-page');
    container.innerHTML = getSkeletonHTML();

    try {
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear  = now.getFullYear();

        const [scheduleRes, statsRes, issuesRes, summaryRes, planRes, selfPatrolRes, areasRes, deptsRes, unitsRes] = await Promise.all([
            API.get(`/patrol/my-schedule?employeeId=${currentUser.id}&month=${curMonth}&year=${curYear}`),
            API.get('/patrol/attendance-stats'),
            API.get('/patrol/issues'),
            API.get(`/patrol/monthly-summary?year=${curYear}&month=${curMonth}`).catch(() => ({ data: [] })),
            API.get(`/patrol/my-monthly-plan?year=${curYear}&month=${curMonth}`).catch(() => ({ data: null })),
            API.get(`/patrol/my-self-patrol?year=${curYear}&month=${curMonth}`).catch(() => ({ data: null })),
            API.get('/master/areas').catch(() => ({ data: [] })),
            API.get('/master/departments').catch(() => ({ data: [] })),
            API.get('/master/safety-units').catch(() => ({ data: [] })),
        ]);

        _allIssues      = normalizeApiArray(issuesRes);
        _monthlySummary = summaryRes.data || [];
        _myPlan         = planRes.data || null;
        _mySelfPatrol   = selfPatrolRes.data || null;
        _patrolAreas    = areasRes.data || [];
        _masterDepts    = deptsRes.data || [];
        _masterUnits    = unitsRes.data || [];

        renderDashboard(container, {
            schedule: normalizeApiArray(scheduleRes),
            stats:    normalizeApiArray(statsRes),
            issues:   _allIssues,
            summary:  _monthlySummary,
        });

        setTimeout(() => initPromoCarousel(), 100);
        loadDashboardCharts();

        // Restore saved tab (patrol / overview / issues)
        const _savedTab = window._getTab?.('patrol', 'patrol');
        if (_savedTab && _savedTab !== 'patrol') {
            setTimeout(() => window.switchTab?.(_savedTab), 0);
        }

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

    // ── Per-tab hero stats ───────────────────────────────────────────────────
    const _personalStats = [
        { label: 'เดินตรวจแล้ว',    val: walks,                                                                        color: '#6ee7b7' },
        { label: 'อัตราผ่านเกณฑ์',  val: `${myStats.Percent || 0}%`,                                                   color: '#6ee7b7' },
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
        else if (tab === 'issues')   renderStatsStrip(_issueStats);
        // FAB: show only on issues tab
        const fab = document.getElementById('issue-fab');
        if (fab) fab.classList.toggle('hidden', tab !== 'issues');
        // lazy-load overview data on first switch
        if (tab === 'overview' && !_overviewData) {
            const now = new Date();
            loadOverview(_overviewYear);
            loadSupervisorOverview(now.getFullYear(), now.getMonth() + 1);
        }
    };
    // expose for loadOverview to refresh hero stats when overview is active
    window._refreshOverviewHero = () => renderStatsStrip(getOverviewHeroStats());

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
            <button onclick="loadPatrolPage()" class="p-2.5 rounded-xl bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors flex-shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
          </div>

          <!-- Dynamic stats strip — updated by switchTab -->
          <div id="hero-stats-strip" class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"></div>
        </div>
      </div>

      <!-- ═══ TABS ═══ -->
      <div class="bg-slate-100 p-1 rounded-xl flex gap-1 mb-6">
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

      <!-- ═══ PATROL TAB ═══ -->
      <div id="content-patrol" class="space-y-5 animate-fade-in">
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div class="xl:col-span-2 space-y-5">

          <!-- Check-in Card -->
          <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100" style="box-shadow:0 4px 24px rgba(5,150,105,0.07)">
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
                          const isRequired = _myPlan.required.some(r => r.id === s.id);
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
                <button onclick="openCheckInModal()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
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
                    const d     = new Date(item.PatrolDate || item.ScheduledDate);
                    const isTd  = d.toDateString() === today.toDateString();
                    // หา area info จาก monthly-summary (match วันที่ + TeamID หรือ TeamName)
                    const sumItem = _monthlySummary.find(s =>
                        new Date(s.ScheduledDate || s.PatrolDate).toDateString() === d.toDateString() &&
                        (s.TeamID === item.TeamID || s.TeamName === item.TeamName)
                    ) || item;
                    const areaLabel  = sumItem.AreaName || sumItem.AreaCode || 'Factory Area';
                    const teamColor  = sumItem.TeamColor || '#6366f1';
                    const round      = sumItem.PatrolRound;
                    const statusColor = { Pending:'bg-amber-100 text-amber-700', Completed:'bg-emerald-100 text-emerald-700', Missed:'bg-red-100 text-red-600' };
                    const sc = statusColor[item.Status] || 'bg-slate-100 text-slate-400';
                    return `<div class="flex items-center px-4 py-2.5 hover:bg-slate-50 transition-colors ${isTd ? 'bg-emerald-50/40' : ''}">
                      <div class="w-10 text-center border-r border-slate-100 pr-3 mr-3 flex-shrink-0">
                        <div class="text-lg font-bold ${isTd ? 'text-emerald-600' : 'text-slate-700'}">${d.getDate()}</div>
                        <div class="text-[9px] font-bold text-slate-400 uppercase">${d.toLocaleString('en-US',{month:'short'})}</div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${teamColor}"></span>
                          <p class="text-xs font-bold text-slate-800 truncate">${item.TeamName}</p>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-[9px] font-semibold text-slate-500">${areaLabel}</span>
                          ${round ? `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">รอบ ${round}</span>` : ''}
                          <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${sc}">${item.Status||'Pending'}</span>
                        </div>
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

          <!-- Self-Patrol Card (หัวหน้าส่วน/แผนก) — conditional -->
          ${_mySelfPatrol?.isSupervisorPatrol ? (() => {
            const sp = _mySelfPatrol;
            const attended = sp.checkins.length;
            const target   = sp.target || 2;
            const pct      = Math.min(Math.round((attended / target) * 100), 100);
            const done     = attended >= target;
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden" style="box-shadow:0 4px 24px rgba(245,158,11,0.08)">
            <div class="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between" style="background:linear-gradient(135deg,#fffbeb,#fef3c7)">
              <h3 class="font-bold text-amber-800 text-sm flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100">
                  <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                </div>
                การเดินตรวจ (Self-Patrol)
              </h3>
              <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-200 text-amber-800'}">${attended}/${target} ครั้ง · ${pct}%</span>
            </div>
            <div class="p-5">
              <div class="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${done?'linear-gradient(90deg,#059669,#10b981)':'linear-gradient(90deg,#f59e0b,#fbbf24)'}"></div>
              </div>
              ${sp.checkins.length === 0
                ? `<p class="text-xs text-slate-400 text-center py-3 italic">ยังไม่มีการบันทึกเดือนนี้</p>`
                : sp.checkins.map(c => {
                    const d = new Date(c.CheckinDate);
                    return `<div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 flex-shrink-0">
                        <div class="text-center">
                          <div class="text-sm font-bold text-amber-700">${d.getDate()}</div>
                          <div class="text-[8px] text-amber-400">${d.toLocaleString('th-TH',{month:'short'})}</div>
                        </div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-slate-700">${c.Location || 'ไม่ระบุสถานที่'}</p>
                        ${c.Notes ? `<p class="text-[10px] text-slate-400 truncate">${c.Notes}</p>` : ''}
                      </div>
                      <button onclick="deleteSelfCheckin(${c.id})" class="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>`;
                  }).join('')}
              <button onclick="openSelfCheckinModal()" class="mt-4 w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]" style="background:linear-gradient(135deg,#d97706,#f59e0b)">
                <svg class="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                บันทึกการเดินตรวจ
              </button>
            </div>
          </div>`;
          })() : ''}

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
          </div>

          <!-- Team Roster Card -->
          ${_myPlan?.roster?.length > 0 ? (() => {
            const typeColor = { top:'rose', committee:'amber', management:'indigo' };
            const typeLabel = { top:'Top', committee:'คปอ.', management:'Mgmt' };
            const roster = _myPlan.roster;
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${_myPlan.team.color}"></span>
                ทีมของฉันเดือนนี้
              </h3>
              <span class="text-[10px] text-slate-400 font-semibold">${roster.length} คน</span>
            </div>
            <div class="space-y-1">
              ${roster.map(m => {
                const tc = typeColor[m.PatrolType] || 'slate';
                const tl = typeLabel[m.PatrolType] || m.PatrolType;
                const isMe = m.EmployeeID === currentUser.id;
                return `<div class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg ${isMe?'bg-emerald-50 border border-emerald-100':'hover:bg-slate-50'} transition-colors">
                  <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${isMe?'bg-emerald-500 text-white':'bg-slate-100 text-slate-600'}">
                    ${(m.EmployeeName||'?').charAt(0)}
                  </div>
                  <span class="text-xs font-medium text-slate-700 flex-1 truncate ${isMe?'font-bold':''}">${m.EmployeeName}${isMe?' (ฉัน)':''}</span>
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-${tc}-100 text-${tc}-700 flex-shrink-0">${tl}</span>
                </div>`;
              }).join('')}
            </div>
          </div>`;
          })() : ''}

          <div class="hidden"><!-- placeholder --></div>
            ${rank.needed ? `<p class="text-[10px] text-slate-400 mt-2 text-center">อีก <strong class="text-slate-600">${Math.max(0, rank.needed - walks)}</strong> ครั้ง จะขึ้นเป็น ${rank.nextLabel}</p>` : `<p class="text-[10px] text-emerald-600 font-bold mt-2 text-center">ระดับสูงสุดแล้ว</p>`}
          </div>

        </div><!-- /sidebar -->
      </div><!-- /grid -->

      <!-- Safety Tips Carousel — full width -->
      <div id="promo-carousel" class="relative overflow-hidden rounded-2xl shadow-md bg-slate-900 group" style="height:260px">
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

        <!-- Filter bar -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-600">ปี</label>
            <select id="overview-year-select" onchange="switchOverviewYear(this.value)"
              class="text-sm font-bold rounded-xl border border-slate-200 px-3 py-1.5 focus:outline-none focus:border-emerald-400 text-slate-700">
              ${[new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(y =>
                `<option value="${y}" ${y === _overviewYear ? 'selected' : ''}>${y}</option>`
              ).join('')}
            </select>
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <select id="overview-type-filter" onchange="filterOverviewTable(this.value)"
              class="text-xs font-semibold rounded-xl border border-slate-200 px-3 py-1.5 focus:outline-none focus:border-emerald-400 text-slate-600">
              <option value="all">ทุกประเภท</option>
              <option value="top">Top Management</option>
              <option value="committee">คปอ.</option>
              <option value="management">Management</option>
            </select>
          </div>
        </div>

        <!-- Main 2-col -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">

          <!-- Attendance Table -->
          <div class="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                สรุปการเข้าร่วมเดินตรวจ
              </h3>
              <span id="ov-table-subtitle" class="text-[10px] text-slate-400 font-semibold">ปี ${_overviewYear}</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="text-[10px] uppercase bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th class="px-4 py-3 font-bold text-slate-400 w-8">#</th>
                    <th class="px-4 py-3 font-bold text-slate-600">ชื่อ-สกุล</th>
                    <th class="px-4 py-3 font-bold text-slate-400 text-center">ประเภท</th>
                    <th class="px-4 py-3 font-bold text-slate-400 text-center">ปี</th>
                    <th class="px-4 py-3 font-bold text-slate-400 text-center">ทั้งหมด</th>
                    <th class="px-4 py-3 font-bold text-emerald-600 text-center">เข้าร่วม</th>
                    <th class="px-4 py-3 font-bold text-slate-400 text-center">%</th>
                  </tr>
                </thead>
                <tbody id="overview-table-body" class="divide-y divide-slate-50">
                  <tr><td colspan="7" class="text-center py-12 text-slate-300 text-xs">
                    <div class="inline-flex flex-col items-center gap-2">
                      <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                      <span>กำลังโหลด...</span>
                    </div>
                  </td></tr>
                </tbody>
              </table>
            </div>
            <!-- Evaluation Criteria -->
            <div class="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
              <p class="text-[10px] font-bold text-slate-500 uppercase mb-2">Evaluation Criteria</p>
              <div class="overflow-x-auto">
                <table class="text-[10px] text-slate-600 w-full">
                  <thead><tr class="border-b border-slate-200">
                    <th class="pb-1.5 font-bold text-slate-400 text-left pr-4">Rating</th>
                    ${[1,2,3,4,5].map(r=>`<th class="pb-1.5 font-bold text-center px-3">${r}</th>`).join('')}
                    <th class="pb-1.5 font-bold text-slate-400 text-center px-3">Weight</th>
                  </tr></thead>
                  <tbody><tr>
                    <td class="py-1.5 text-slate-400 pr-4">%</td>
                    ${['≥ 60','≥ 65','≥ 70','≥ 75','≥ 80'].map(v=>`<td class="py-1.5 text-center px-3 font-semibold">${v}</td>`).join('')}
                    <td class="py-1.5 text-center px-3 font-bold text-indigo-600">0.4</td>
                  </tr></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Right column -->
          <div class="space-y-5">

            <!-- Pie chart -->
            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 class="font-bold text-slate-700 text-sm mb-4">Safety Patrol Pie Chart</h3>
              <div class="relative h-52 flex items-center justify-center">
                <canvas id="overviewPieChart"></canvas>
                <div id="overview-pie-center" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p class="text-3xl font-bold text-emerald-600" id="ov-pie-pct">—%</p>
                  <p class="text-[10px] text-slate-400 mt-0.5">อัตราเข้าร่วม</p>
                </div>
              </div>
            </div>

            <!-- Stats summary card -->
            <div class="rounded-2xl overflow-hidden shadow-sm" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 60%,#0d9488 100%)">
              <div class="p-5">
                <div class="flex items-center gap-2 mb-3">
                  <svg class="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  <span class="text-xs font-bold text-white/80 uppercase tracking-wide">Safety Patrol Record</span>
                </div>
                <p class="text-[10px] text-white/50 mb-4" id="ov-card-date">—</p>
                <div class="grid grid-cols-2 gap-3">
                  <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.12)">
                    <p class="text-2xl font-bold text-white" id="ov-card-total">—</p>
                    <p class="text-[10px] text-white/60 mt-0.5">เซสชันทั้งหมด</p>
                  </div>
                  <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.12)">
                    <p class="text-2xl font-bold text-emerald-300" id="ov-card-attended">—</p>
                    <p class="text-[10px] text-white/60 mt-0.5">เข้าร่วม</p>
                  </div>
                </div>
                <div class="mt-3 rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.08)">
                  <p class="text-3xl font-bold text-white" id="ov-card-pct">—%</p>
                  <p class="text-[10px] text-white/60 mt-0.5">อัตราการเข้าร่วม</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Team overview this month -->
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
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
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

        <!-- Leaderboard -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2 mb-4">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50">
              <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
            </div>
            ผู้เข้าร่วมเดินตรวจ (Top 10)
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
            ${normalizeApiArray(data.stats).slice(0,10).map((r, i) => `
            <div class="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg transition-colors">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${i+1}</span>
              <div class="w-6 h-6 rounded-full bg-slate-100 text-[9px] flex items-center justify-center font-bold text-slate-600 flex-shrink-0">${r.Name?r.Name[0]:'?'}</div>
              <span class="text-xs font-semibold text-slate-600 truncate flex-1">${r.Name}</span>
              <div class="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden flex-shrink-0">
                <div class="bg-emerald-500 h-full rounded-full" style="width:${Math.min(r.Percent||0,100)}%"></div>
              </div>
              <span class="text-[9px] text-slate-400 font-mono flex-shrink-0 w-6 text-right">${r.Total}</span>
            </div>`).join('')}
          </div>
        </div>

        <!-- Supervisor Patrol Overview -->
        <div class="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between bg-amber-50/50">
            <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100">
                <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
              การเดินตรวจหัวหน้าส่วน/แผนก
              <span class="text-[9px] font-normal text-slate-400">(เป้าหมาย 2 ครั้ง/เดือน)</span>
            </h3>
            <span class="text-[10px] text-slate-400" id="sv-overview-subtitle"></span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="text-[10px] uppercase bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-4 py-3 font-bold text-slate-400 w-8">#</th>
                  <th class="px-4 py-3 font-bold text-slate-600">ชื่อ-สกุล</th>
                  <th class="px-4 py-3 font-bold text-slate-400">ตำแหน่ง</th>
                  <th class="px-4 py-3 font-bold text-slate-400">แผนก</th>
                  <th class="px-4 py-3 font-bold text-slate-400 text-center">เดินแล้ว</th>
                  <th class="px-4 py-3 font-bold text-slate-400 text-center">เป้า</th>
                  <th class="px-4 py-3 font-bold text-slate-400 text-center">%</th>
                  <th class="px-4 py-3 font-bold text-slate-400 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody id="sv-overview-body">
                <tr><td colspan="8" class="text-center py-8 text-slate-300 text-xs">
                  <div class="inline-flex flex-col items-center gap-2">
                    <div class="animate-spin rounded-full h-6 w-6 border-3 border-amber-400 border-t-transparent"></div>
                    <span>กำลังโหลด...</span>
                  </div>
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- ═══ ISSUES TAB ═══ -->
      <div id="content-issues" class="hidden space-y-5">

        <!-- Quick stats strip -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col" style="min-height:220px">
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

          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col" style="min-height:220px">
            <h3 class="font-bold text-slate-700 text-sm mb-3">สถิติแยกส่วนงานรับผิดชอบ</h3>
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

        <!-- Charts row 2 — STOP×Rank table + Rank pie -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

          <!-- STOP × Rank matrix table -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between" style="background:linear-gradient(135deg,#064e3b08,#065f4608)">
              <h3 class="font-bold text-slate-700 text-sm">ชนิดอันตราย (STOP) × ระดับความเร่งด่วน</h3>
              <div class="flex items-center gap-3 text-[10px] font-bold">
                <span class="text-red-500">Rank A</span>
                <span class="text-orange-400">Rank B</span>
                <span class="text-emerald-600">Rank C</span>
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

          <!-- Rank pie chart -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col" style="min-height:280px">
            <h3 class="font-bold text-slate-700 text-sm mb-1">ระดับความเร่งด่วน (Rank)</h3>
            <p class="text-[10px] text-slate-400 mb-3">สัดส่วนปัญหาแยกตาม Rank</p>
            <div class="flex-1 relative flex items-center justify-center" style="min-height:200px">
              <canvas id="rankPieChart"></canvas>
            </div>
            <div id="rank-pie-legend" class="flex items-center justify-center gap-5 mt-3 text-[11px] font-semibold"></div>
          </div>
        </div>

        <!-- Issue Register -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-100">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-slate-700 text-sm">ทะเบียนปัญหา</h3>
                <span id="issue-count-badge" class="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-400 font-mono">ทั้งหมด ${total}</span>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="exportIssuesToExcel()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Excel
                </button>
                <button onclick="openIssueForm('OPEN')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all" style="background:linear-gradient(135deg,#dc2626,#ef4444)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  รายงานปัญหาใหม่
                </button>
              </div>
            </div>
            <!-- Search + Dept/Unit filters row -->
            <div class="flex flex-col sm:flex-row gap-2 mb-3">
              <div class="relative flex-1">
                <svg class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input id="issue-search-input" type="text" placeholder="ค้นหาพื้นที่ คำอธิบาย เครื่องจักร..." value="${_searchQuery}"
                  class="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 bg-slate-50 transition-all">
              </div>
              <select id="issue-dept-filter" onchange="window._issueFilterDept(this.value)"
                class="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all min-w-[150px]">
                <option value="">ทุกส่วนงาน</option>
                ${_masterDepts.map(d => `<option value="${d.Name}" ${_filterDept === d.Name ? 'selected' : ''}>${d.Name}</option>`).join('')}
              </select>
              <select id="issue-unit-filter" onchange="_filterUnit=this.value;applyIssueFilter()"
                class="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all min-w-[130px] ${_filterDept ? '' : 'opacity-50'}">
                <option value="">ทุก Unit</option>
                ${(_filterDept ? _masterUnits.filter(u => {
                    const dept = _masterDepts.find(d => d.Name === _filterDept);
                    return dept && u.department_id === (dept.id || dept.ID);
                  }) : []).map(u => `<option value="${u.name}" ${_filterUnit === u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
              </select>
            </div>
            <!-- Filter pills (functional) -->
            <div class="flex flex-wrap gap-2" id="issue-filter-bar">
              ${[
                { key:'all',     label:'ทั้งหมด',      dot:'' },
                { key:'open',    label:'รอแก้ไข',      dot:'bg-red-500' },
                { key:'temp',    label:'แก้ชั่วคราว',   dot:'bg-orange-400' },
                { key:'closed',  label:'เสร็จสิ้น',     dot:'bg-emerald-500' },
                { key:'high',    label:'ความเสี่ยงสูง',  dot:'bg-rose-600' },
                { key:'overdue', label:'เกินกำหนด',     dot:'bg-red-700' },
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
                  <th class="px-4 py-3 font-bold text-center">กำหนด</th>
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

    function applyIssueFilter() {
        const filtered = getFilteredIssues(_allIssues, _activeFilter);
        const tbody = document.getElementById('issue-table-body');
        if (tbody) tbody.innerHTML = renderIssueRows(filtered);
        const badge = document.getElementById('issue-count-badge');
        if (badge) badge.textContent = `${filtered.length} / ${_allIssues.length}`;
    }

    // Status filter pills
    document.getElementById('issue-filter-bar')?.addEventListener('click', e => {
        const btn = e.target.closest('.issue-filter-btn');
        if (!btn) return;
        _activeFilter = btn.dataset.filter;
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
            applyIssueFilter();
        }, 250);
    });
}

// ─── Dept filter → rebuild unit dropdown ──────────────────────────────────────
function _issueFilterDept(deptName) {
    _filterDept = deptName;
    _filterUnit = '';

    // Rebuild unit dropdown
    const unitSel = document.getElementById('issue-unit-filter');
    if (unitSel) {
        const dept = _masterDepts.find(d => d.Name === deptName);
        const units = dept ? _masterUnits.filter(u => u.department_id === (dept.id || dept.ID)) : [];
        unitSel.innerHTML = `<option value="">ทุก Unit</option>` +
            units.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
        unitSel.className = unitSel.className.replace('opacity-50', '') + (units.length ? '' : ' opacity-50');
        unitSel.onchange = () => { _filterUnit = unitSel.value; applyIssueFilter(); };
    }

    // Trigger filter (applyIssueFilter is closure inside renderDashboard — call via DOM trick)
    const tbody = document.getElementById('issue-table-body');
    const badge  = document.getElementById('issue-count-badge');
    if (!tbody) return;
    const filtered = getFilteredIssues(_allIssues, _activeFilter);
    tbody.innerHTML = renderIssueRows(filtered);
    if (badge) badge.textContent = `${filtered.length} / ${_allIssues.length}`;
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────
function _normalizeDept(raw) {
    // Support both plain string and legacy JSON array
    try { return raw?.startsWith('[') ? JSON.parse(raw) : raw ? [raw] : []; }
    catch { return raw ? [raw] : []; }
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
        default:        result = issues;
    }
    // Dept filter
    if (_filterDept) {
        result = result.filter(i => _normalizeDept(i.ResponsibleDept).includes(_filterDept));
    }
    // Unit filter
    if (_filterUnit) {
        result = result.filter(i => (i.ResponsibleUnit || '') === _filterUnit);
    }
    // Text search
    if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        result = result.filter(i =>
            (i.HazardDescription||'').toLowerCase().includes(q) ||
            (i.Area||'').toLowerCase().includes(q) ||
            (i.MachineName||'').toLowerCase().includes(q) ||
            (i.ResponsibleDept||'').toLowerCase().includes(q) ||
            (i.ResponsibleUnit||'').toLowerCase().includes(q)
        );
    }
    return result;
}

function renderIssueRows(issues) {
    if (!issues.length) return `<tr><td colspan="6" class="text-center py-10 text-sm text-slate-400">ไม่พบรายการที่ตรงกัน</td></tr>`;
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

function renderIssueRow(rawItem) {
    const item = normalizeApiObject(rawItem);
    const isClosed = item.CurrentStatus === 'Closed';
    const isTemp = item.CurrentStatus === 'Temporary';

    const today = new Date(); today.setHours(0,0,0,0);
    const isOverdue = !isClosed && item.DueDate && new Date(item.DueDate) < today;

    const statusMeta = isClosed
        ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'เสร็จสิ้น', border: '#10b981' }
        : isTemp
            ? { cls: 'bg-orange-50 text-orange-700 border-orange-100', label: 'แก้ชั่วคราว', border: '#f97316' }
            : { cls: 'bg-red-50 text-red-700 border-red-100', label: 'รอแก้ไข', border: '#ef4444' };

    // Use Rank (A/B/C) for border — the form saves Rank, not Risk
    const rankBorder = item.Rank === 'A' ? '#f43f5e' : item.Rank === 'B' ? '#fb923c' : item.Rank === 'C' ? '#10b981' : 'transparent';
    const rowBg = isOverdue ? 'bg-red-50/30' : '';
    const imgUrl = resolveFileUrl(item.BeforeImage) || 'https://placehold.co/40x40?text=IMG';

    // Normalize ResponsibleDept (may be plain string or legacy JSON array)
    const deptDisplay = (() => {
        const raw = item.ResponsibleDept || '';
        try { return raw.startsWith('[') ? JSON.parse(raw).join(', ') : raw; }
        catch { return raw; }
    })();
    const rankLabel = { A: 'Rank A', B: 'Rank B', C: 'Rank C' }[item.Rank] || '';

    let actionBtns = '';
    if (!isClosed || isAdmin) {
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

    return `<tr class="hover:bg-slate-50/70 transition-colors group cursor-pointer border-l-4 ${rowBg}" style="border-left-color:${isOverdue ? '#ef4444' : rankBorder}" onclick='openIssueForm("VIEW",${JSON.stringify(item)})'>
        <td class="px-5 py-4 align-middle">
            <div class="text-[10px] text-slate-400 font-mono">#${item.IssueID || '?'}</div>
            ${rankLabel ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${item.Rank === 'A' ? 'bg-red-100 text-red-600' : item.Rank === 'B' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}">${rankLabel}</span>` : ''}
        </td>
        <td class="px-5 py-3 align-middle">
            <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shadow-sm transition-transform group-hover:scale-110">
                <img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/40x40?text=No+Img'">
            </div>
        </td>
        <td class="px-5 py-3 align-middle">
            <div class="font-bold text-slate-700 text-xs mb-0.5">${item.Area || 'ไม่ระบุพื้นที่'}</div>
            <div class="text-[10px] text-slate-400 line-clamp-1 max-w-[200px]">${item.HazardDescription || '—'}</div>
            ${deptDisplay || item.ResponsibleUnit ? `<div class="flex flex-wrap gap-1 mt-1">
                ${deptDisplay ? `<span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[9px] font-medium border border-blue-100">${deptDisplay}</span>` : ''}
                ${item.ResponsibleUnit ? `<span class="px-1.5 py-0.5 rounded bg-sky-50 text-sky-500 text-[9px] border border-sky-100">${item.ResponsibleUnit}</span>` : ''}
            </div>` : ''}
        </td>
        <td class="px-5 py-4 text-center align-middle">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold border ${statusMeta.cls}">
                <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${statusMeta.border}"></span>
                ${statusMeta.label}
            </span>
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
    const todaySess = _myPlan?.sessions?.find(s => {
        const d = new Date(s.PatrolDate);
        return d.toDateString() === today.toDateString();
    }) || null;
    const isPatrolDay = !!todaySess;
    const isRequired  = todaySess ? (_myPlan?.required?.some(r => r.id === todaySess.id) ?? true) : false;
    const areaLabel   = todaySess ? (todaySess.AreaCode || todaySess.AreaName || '') : '';
    const compliance  = _myPlan?.compliance;

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
        <span class="text-[10px] font-bold ${compliance.done?'text-emerald-600':'text-amber-600'}">${compliance.attended}/${compliance.required} รอบ ${compliance.done?'✓':''}</span>
      </div>` : ''}
    </div>` : '';

    openModal('บันทึกการเดินตรวจ', `
      <form id="checkin-form" onsubmit="handleCheckInSubmit(event)" class="space-y-4">
        <!-- User info -->
        <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100">
            <span class="text-emerald-700 font-bold text-sm">${(currentUser.name||'?').charAt(0)}</span>
          </div>
          <div>
            <p class="font-bold text-slate-800 text-sm">${currentUser.name}</p>
            <p class="text-[10px] text-slate-400">${currentUser.department || ''}</p>
          </div>
        </div>

        ${planBanner}

        ${!isPatrolDay && _myPlan ? `
        <div class="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700 flex items-start gap-2">
          <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>วันนี้ไม่ใช่วันเดินตรวจตามตาราง สามารถ Check-in ได้แต่จะนับเป็นการเดินนอกตาราง</span>
        </div>` : ''}

        <div class="grid grid-cols-2 gap-3">
          <label class="cursor-pointer">
            <input type="radio" name="PatrolType" value="Normal" class="peer sr-only" checked>
            <div class="p-3.5 rounded-xl border-2 border-slate-100 bg-white text-center hover:border-emerald-100 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 transition-all">
              <svg class="w-5 h-5 mx-auto mb-1.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              <p class="text-xs font-bold text-slate-700">เดินตรวจปกติ</p>
              <p class="text-[9px] text-slate-400">Routine Patrol</p>
            </div>
          </label>
          <label class="cursor-pointer">
            <input type="radio" name="PatrolType" value="Re-inspection" class="peer sr-only">
            <div class="p-3.5 rounded-xl border-2 border-slate-100 bg-white text-center hover:border-amber-100 peer-checked:border-amber-500 peer-checked:bg-amber-50 transition-all">
              <svg class="w-5 h-5 mx-auto mb-1.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
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

window.openIssueForm = function(mode, rawIssueData = null) {
    const issueData = normalizeApiObject(rawIssueData);
    const isView = mode === 'VIEW';
    const isEdit = mode === 'EDIT';
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
    const stepIdx = mode === 'OPEN' ? 0 : mode === 'EDIT' ? 1 : (issueData?.CurrentStatus === 'Closed' ? 2 : issueData?.CurrentStatus === 'Temporary' ? 1 : 0);
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

    // Responsible dept + unit helpers
    const deptList = (_masterDepts.length ? _masterDepts : [{ Name:'Maintenance' },{ Name:'Safety' },{ Name:'Production' }]);
    const selectedDeptName = issueData?.ResponsibleDept || '';
    const selectedUnitName = issueData?.ResponsibleUnit || '';
    // Pre-compute units for initial dept
    const initialDeptObj = deptList.find(d => d.Name === selectedDeptName);
    const initialUnits = initialDeptObj
        ? _masterUnits.filter(u => u.department_id === (initialDeptObj.id || initialDeptObj.ID))
        : [];

    // Rank badge color
    const rankColor = issueData?.Rank === 'A' ? '#dc2626' : issueData?.Rank === 'B' ? '#f97316' : '#059669';

    const html = `
    <div class="text-sm">

      <!-- ── Stepper ── -->
      <div class="flex items-start px-1 mb-6">${stepHtml}</div>

      <form id="issue-form" class="space-y-5">
        <input type="hidden" name="ActionType" value="${mode === 'EDIT' ? 'UPDATE' : mode}">
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

            <!-- วันที่พบ + พื้นที่ -->
            <div class="grid grid-cols-2 gap-4">
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
                    .map(a => `<option value="${a.Name}" ${issueData?.Area === a.Name ? 'selected':''}>${a.Name}</option>`).join('')}
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
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-semibold text-slate-500">ชนิดอันตราย (STOP)</label>
                <select name="HazardType" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all" ${s1d}>
                  <option value="">-- เลือกประเภท --</option>
                  ${['STOP 1 อันตรายจากเครื่องจักร','STOP 2 อันตรายจากวัตถุหนักตกทับ','STOP 3 อันตรายจากยานพาหนะ','STOP 4 อันตรายจากการตกจากที่สูง','STOP 5 อันตรายจากกระแสไฟฟ้า','STOP 6 อันตรายอื่นๆ']
                    .map(h => `<option value="${h}" ${issueData?.HazardType === h ? 'selected':''}>${h}</option>`).join('')}
                </select>
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
                      <span class="text-sm font-medium text-blue-700">${selectedDeptName || '—'}</span>
                    </div>
                    ${selectedUnitName ? `
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-100">
                      <svg class="w-3.5 h-3.5 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      <span class="text-xs font-medium text-sky-700">${selectedUnitName}</span>
                      <span class="text-[10px] text-sky-400 ml-1">Safety Unit</span>
                    </div>` : ''}
                  </div>`
                : `<div class="space-y-2">
                    <select id="if-resp-dept" name="ResponsibleDept"
                      class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
                      onchange="window._issueChangeDept(this.value)" ${s1d}>
                      <option value="">— เลือกส่วนงาน —</option>
                      ${deptList.map(d => `<option value="${d.Name}" data-dept-id="${d.id||''}" ${selectedDeptName === d.Name ? 'selected' : ''}>${d.Name}</option>`).join('')}
                    </select>
                    <div id="if-unit-container">
                      ${initialUnits.length ? `
                      <select id="if-unit-select"
                        class="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
                        onchange="document.getElementById('if-resp-unit').value=this.value">
                        <option value="">— เลือก Safety Unit (ถ้ามี) —</option>
                        ${initialUnits.map(u => `<option value="${u.name}" ${selectedUnitName === u.name ? 'selected' : ''}>${u.name}${u.short_code ? ' · '+u.short_code : ''}</option>`).join('')}
                      </select>` : ''}
                    </div>
                    <input type="hidden" id="if-resp-unit" name="ResponsibleUnit" value="${selectedUnitName}">
                  </div>`
              }
            </div>

            <!-- ภาพก่อนซ่อม (OPEN mode) -->
            ${mode === 'OPEN' ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">ภาพก่อนซ่อม <span class="text-slate-300 font-normal">(ไม่บังคับ)</span></label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 px-4 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-all group">
                <svg class="w-8 h-8 text-slate-300 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-xs text-slate-400 group-hover:text-emerald-600 transition-colors">คลิกเพื่อเลือกรูปภาพ</span>
                <input type="file" name="BeforeImage" accept="image/*" class="hidden" onchange="this.previousElementSibling.textContent = this.files[0]?.name || 'คลิกเพื่อเลือกรูปภาพ'">
              </label>
            </div>` : ''}

            <!-- ภาพ Before (VIEW/EDIT) -->
            ${(isView || isEdit) && beforeUrl ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-500">ภาพก่อนซ่อม</label>
              <div class="relative rounded-xl overflow-hidden h-40 bg-slate-900">
                <img src="${beforeUrl}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-slate-500 text-xs\\'>ไม่พบภาพ</div>'">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-600/90 text-white">BEFORE</span>
              </div>
            </div>` : ''}

          </div>
        </div>

        <!-- ═══ SECTION 2: Temp Fix ═══ -->
        ${(isEdit || (isView && issueData?.TempDescription)) ? `
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
              <div class="relative rounded-xl overflow-hidden h-36 bg-slate-900">
                <img src="${tempUrl}" class="w-full h-full object-cover">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-500/90 text-white">TEMP FIX</span>
              </div>
            </div>` : ''}
            ${!isView ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-orange-700">ภาพประกอบการแก้ไข <span class="text-orange-300 font-normal">(ไม่บังคับ)</span></label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-orange-200 rounded-xl py-5 px-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all group">
                <svg class="w-7 h-7 text-orange-300 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-xs text-orange-400 group-hover:text-orange-600 transition-colors">คลิกเพื่อเลือกรูปภาพ</span>
                <input type="file" name="TempImage" accept="image/*" class="hidden" onchange="this.previousElementSibling.textContent = this.files[0]?.name || 'คลิกเพื่อเลือกรูปภาพ'">
              </label>
            </div>` : ''}
          </div>
        </div>` : ''}

        <!-- ═══ SECTION 3: Final Solution ═══ -->
        ${(isEdit || (isView && issueData?.ActionDescription)) ? `
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
              <div class="relative rounded-xl overflow-hidden h-40 bg-slate-900">
                <img src="${afterUrl}" class="w-full h-full object-cover">
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-600/90 text-white">AFTER</span>
              </div>
            </div>` : ''}
            ${!isView ? `
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-emerald-700">ภาพหลังแก้ไข <span class="text-emerald-300 font-normal">(ไม่บังคับ)</span></label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-emerald-200 rounded-xl py-5 px-4 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
                <svg class="w-7 h-7 text-emerald-300 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-xs text-emerald-400 group-hover:text-emerald-600 transition-colors">คลิกเพื่อเลือกรูปภาพ</span>
                <input type="file" name="AfterImage" accept="image/*" class="hidden" onchange="this.previousElementSibling.textContent = this.files[0]?.name || 'คลิกเพื่อเลือกรูปภาพ'">
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
          ${!isView ? `
          <button type="submit" id="btn-issue-submit"
            class="px-7 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            style="background:linear-gradient(135deg,#059669,#0d9488)">
            ${mode === 'EDIT' ? 'บันทึกข้อมูล' : 'รายงานปัญหา'}
          </button>` : ''}
        </div>
      </form>
    </div>`;

    const titleMap = { OPEN: 'รายงานปัญหาใหม่', EDIT: 'อัปเดตการดำเนินการ', VIEW: 'รายละเอียดปัญหา' };
    openModal(titleMap[mode], html, 'max-w-2xl');

    if (!isView) {
        const form = document.getElementById('issue-form');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-issue-submit');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5 align-middle"></span>กำลังบันทึก...'; }
            const formData = new FormData(form);
            if (mode === 'OPEN') {
                if (!formData.get('FoundByTeam')) formData.append('FoundByTeam', currentUser.team || '');
            }
            showLoading('กำลังบันทึก...');
            try {
                const res = await API.post('/patrol/issue/save', formData);
                if (res?.success === false) throw new Error(res.message || 'บันทึกไม่สำเร็จ');
                showToast('บันทึกสำเร็จ', 'success');
                closeModal();
                loadPatrolPage();
            } catch (err) { showError(err); }
            finally { hideLoading(); if (btn) { btn.disabled = false; btn.textContent = mode === 'EDIT' ? 'บันทึกข้อมูล' : 'รายงานปัญหา'; } }
        });
    }
};

// ─── Dept → Units dynamic selector ───────────────────────────────────────────
function _issueChangeDept(deptName) {
    const container = document.getElementById('if-unit-container');
    const unitInput  = document.getElementById('if-resp-unit');
    if (!container) return;
    if (unitInput) unitInput.value = '';

    if (!deptName) { container.innerHTML = ''; return; }

    const dept  = _masterDepts.find(d => d.Name === deptName);
    if (!dept)   { container.innerHTML = ''; return; }

    const units = _masterUnits.filter(u => u.department_id === (dept.id || dept.ID));
    if (!units.length) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <select id="if-unit-select"
          class="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all animate-fade-in"
          onchange="document.getElementById('if-resp-unit').value=this.value">
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
        // Stats cards
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('ov-stat-members', _overviewData.members.length);
        setEl('ov-stat-total', s.totalSessions);
        setEl('ov-stat-attended', s.totalAttended);
        setEl('ov-stat-pct', `${s.percent}%`);
        setEl('ov-table-subtitle', `ปี ${year}`);
        // Summary card
        setEl('ov-card-total', s.totalSessions);
        setEl('ov-card-attended', s.totalAttended);
        setEl('ov-card-pct', `${s.percent}%`);
        setEl('ov-pie-pct', `${s.percent}%`);
        if (s.latestDate) {
            const d = new Date(s.latestDate);
            setEl('ov-card-date', d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }));
        }

        // Refresh hero stats if overview tab is active
        window._refreshOverviewHero?.();
        // Table
        const typeFilter = document.getElementById('overview-type-filter')?.value || 'all';
        renderOverviewTable(_overviewData.members, typeFilter);

        // Pie chart
        renderOverviewChart(s.percent);

    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-xs text-slate-400">ไม่สามารถโหลดข้อมูลได้: ${err.message}</td></tr>`;
    }
}

function renderOverviewTable(members, typeFilter = 'all') {
    const tbody = document.getElementById('overview-table-body');
    if (!tbody) return;
    const filtered = typeFilter === 'all' ? members : members.filter(m => m.PatrolType === typeFilter);

    const PT_LABEL = { top: 'Top Mgmt', committee: 'คปอ.', management: 'Management' };
    const PT_COLOR = { top: 'rose', committee: 'amber', management: 'indigo' };
    const ratingOf = pct => {
        if (pct >= 80) return { r: 5, cls: 'bg-emerald-100 text-emerald-700' };
        if (pct >= 75) return { r: 4, cls: 'bg-teal-100 text-teal-700' };
        if (pct >= 70) return { r: 3, cls: 'bg-blue-100 text-blue-700' };
        if (pct >= 65) return { r: 2, cls: 'bg-amber-100 text-amber-700' };
        if (pct >= 60) return { r: 1, cls: 'bg-orange-100 text-orange-700' };
        return { r: 0, cls: 'bg-red-100 text-red-700' };
    };

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-xs text-slate-400">ไม่มีข้อมูล</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((m, i) => {
        const tc = PT_COLOR[m.PatrolType] || 'slate';
        const tl = PT_LABEL[m.PatrolType] || m.PatrolType;
        const { r, cls } = ratingOf(m.Percent);
        const barW = Math.min(m.Percent, 100);
        const isMe = m.EmployeeID === currentUser.id;
        return `<tr class="hover:bg-slate-50 transition-colors ${isMe ? 'bg-emerald-50/40' : ''}">
          <td class="px-4 py-3 text-slate-400 font-mono">${i+1}</td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isMe ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}">
                ${(m.Name||'?').charAt(0)}
              </div>
              <span class="font-semibold text-slate-800 ${isMe ? 'font-bold' : ''}">${m.Name}${isMe ? ' (ฉัน)' : ''}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-${tc}-100 text-${tc}-700">${tl}</span>
          </td>
          <td class="px-4 py-3 text-center text-slate-500 font-mono">${m.Year}</td>
          <td class="px-4 py-3 text-center font-bold text-slate-700">${m.Total}</td>
          <td class="px-4 py-3 text-center">
            <span class="font-bold ${m.Attended >= m.Total && m.Total > 0 ? 'text-emerald-600' : 'text-slate-700'}">${m.Attended}</span>
          </td>
          <td class="px-4 py-3 text-center">
            <div class="flex items-center gap-2 justify-end">
              <div class="w-16 h-1.5 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                <div class="h-full rounded-full" style="width:${barW}%;background:${barW>=80?'#10b981':barW>=60?'#f59e0b':'#f43f5e'}"></div>
              </div>
              <span class="inline-flex items-center justify-center w-14 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cls}">${m.Percent}%${r>0?' ('+r+')':''}</span>
            </div>
          </td>
        </tr>`;
    }).join('');
}

function renderOverviewChart(percent) {
    const ctx = document.getElementById('overviewPieChart');
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

function switchOverviewYear(year) {
    _overviewYear = parseInt(year);
    _overviewData = null;
    loadOverview(_overviewYear);
}

window.filterOverviewTable = function(typeFilter) {
    if (_overviewData) renderOverviewTable(_overviewData.members, typeFilter);
};

// ─── Supervisor Overview ───────────────────────────────────────────────────────
async function loadSupervisorOverview(year, month) {
    const tbody  = document.getElementById('sv-overview-body');
    const subEl  = document.getElementById('sv-overview-subtitle');
    if (!tbody) return;
    try {
        const res = await API.get(`/patrol/supervisor-overview?year=${year}&month=${month}`);
        const members = res.data || [];
        if (subEl) {
            const d = new Date(year, month - 1, 1);
            subEl.textContent = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
        }
        if (!members.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-xs text-slate-400">ยังไม่มีข้อมูลหัวหน้าส่วน/แผนก<br><span class="text-[10px] text-slate-300">ตั้งค่า Self-Patrol ให้กับ Position ในหน้า Admin → Master Data → Positions</span></td></tr>`;
            return;
        }
        tbody.innerHTML = members.map((m, i) => {
            const done = m.attended >= m.target;
            const half = m.attended > 0 && m.attended < m.target;
            const statusCls = done  ? 'bg-emerald-100 text-emerald-700'
                            : half ? 'bg-amber-100 text-amber-700'
                            :        'bg-red-50 text-red-500';
            const statusLbl = done ? 'ครบแล้ว' : half ? 'บางส่วน' : 'ยังไม่เดิน';
            return `<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 text-slate-400 text-[10px] font-mono">${i+1}</td>
              <td class="px-4 py-3 font-semibold text-slate-700">${m.EmployeeName}</td>
              <td class="px-4 py-3 text-slate-500">${m.Position || '—'}</td>
              <td class="px-4 py-3 text-slate-500">${m.Department || '—'}</td>
              <td class="px-4 py-3 text-center font-bold ${done ? 'text-emerald-600' : 'text-amber-600'}">${m.attended}</td>
              <td class="px-4 py-3 text-center text-slate-400">${m.target}</td>
              <td class="px-4 py-3 text-center">
                <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full rounded-full" style="width:${m.percent}%;background:${done?'#10b981':half?'#f59e0b':'#fca5a5'}"></div>
                </div>
                <span class="text-[10px] text-slate-500">${m.percent}%</span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCls}">
                  <span class="w-1.5 h-1.5 rounded-full inline-block ${done?'bg-emerald-400 animate-pulse':half?'bg-amber-400':'bg-red-300'}"></span>
                  ${statusLbl}
                </span>
              </td>
            </tr>`;
        }).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-xs text-slate-400">โหลดไม่ได้</td></tr>`;
    }
}

// ─── Self-Patrol Modal / Delete ───────────────────────────────────────────────
function openSelfCheckinModal() {
    const today = new Date().toISOString().split('T')[0];
    openModal('บันทึกการเดินตรวจ (Self-Patrol)', `
        <form id="self-checkin-form" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">วันที่เดินตรวจ</label>
            <input type="date" id="sc-date" class="form-input w-full rounded-lg text-sm" value="${today}" max="${today}" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">พื้นที่ที่เดินตรวจ <span class="text-red-400">*</span></label>
            <select id="sc-location" class="form-select w-full rounded-lg text-sm" required>
              <option value="">— เลือกพื้นที่ —</option>
              ${(_patrolAreas.length
                  ? _patrolAreas
                  : [{ Name:'โรงงาน 1' },{ Name:'โรงงาน 2' },{ Name:'รอบนอก+พื้นที่ส่วนกลาง' }]
                ).map(a => `<option value="${a.Name}">${a.Name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">หมายเหตุ (ถ้ามี)</label>
            <textarea id="sc-notes" rows="2" class="form-input w-full rounded-lg text-sm resize-none" placeholder="สิ่งที่พบ หรือรายละเอียดเพิ่มเติม..."></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-lg text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button type="submit" class="px-5 py-2 rounded-lg text-sm font-bold text-white" style="background:linear-gradient(135deg,#d97706,#f59e0b)">บันทึก</button>
          </div>
        </form>`, 'max-w-sm');
    setTimeout(() => {
        document.getElementById('self-checkin-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const CheckinDate = document.getElementById('sc-date')?.value;
            const Location    = document.getElementById('sc-location')?.value.trim();
            const Notes       = document.getElementById('sc-notes')?.value.trim();
            if (!CheckinDate || !Location) { showToast('กรุณาระบุวันที่และสถานที่', 'error'); return; }
            try {
                const res = await API.post('/patrol/self-checkin', { CheckinDate, Location, Notes });
                if (res.success) { showToast('บันทึกสำเร็จ', 'success'); closeModal(); loadPatrolPage(); }
                else showError(res.message);
            } catch (err) { showError(err.message); }
        });
    }, 50);
}

async function deleteSelfCheckin(id) {
    if (!confirm('ลบรายการนี้?')) return;
    try {
        const res = await API.delete(`/patrol/self-checkin/${id}`);
        if (res.success) { showToast('ลบสำเร็จ', 'success'); loadPatrolPage(); }
        else showError(res.message);
    } catch (err) { showError(err.message); }
}

// ─── Delete Issue (Admin only) ────────────────────────────────────────────────
async function deleteIssue(issueId) {
    if (!isAdmin) return;
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
    try {
        showLoading('กำลังลบ...');
        const res = await API.delete(`/patrol/issue/${issueId}`);
        if (res?.success === false) throw new Error(res.message || 'ลบไม่สำเร็จ');
        showToast(`ลบปัญหา #${issueId} สำเร็จ`, 'success');
        // Remove from local cache and re-render without full reload
        _allIssues = _allIssues.filter(i => (i.IssueID || i.issueid) != issueId);
        const filtered = getFilteredIssues(_allIssues, _activeFilter);
        const tbody = document.getElementById('issue-table-body');
        if (tbody) tbody.innerHTML = renderIssueRows(filtered);
        const badge = document.getElementById('issue-count-badge');
        if (badge) badge.textContent = `${filtered.length} / ${_allIssues.length}`;
        renderDeptStats();
        renderStopRankStats();
        renderRankPieChart();
    } catch (err) {
        showError(err.message || 'ลบไม่สำเร็จ');
    } finally {
        hideLoading();
    }
}

// ─── Export to Excel ──────────────────────────────────────────────────────────
function exportIssuesToExcel() {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library', 'error'); return; }
    const filtered = getFilteredIssues(_allIssues, _activeFilter);
    if (!filtered.length) { showToast('ไม่มีข้อมูลที่จะส่งออก', 'error'); return; }

    const rows = filtered.map(raw => {
        const i = normalizeApiObject(raw);
        return {
            'ID':               i.IssueID || '',
            'วันที่พบ':          i.FoundDate ? new Date(i.FoundDate).toLocaleDateString('th-TH') : '',
            'พื้นที่':           i.Area || '',
            'ประเภทอันตราย':     i.HazardType || '',
            'คำอธิบาย':          i.HazardDescription || '',
            'Rank (A/B/C)':      i.Rank || '',
            'วันกำหนด':          i.DueDate ? new Date(i.DueDate).toLocaleDateString('th-TH') : '',
            'ส่วนงานรับผิดชอบ':  i.ResponsibleDept || '',
            'Safety Unit':       i.ResponsibleUnit || '',
            'การแก้ไขชั่วคราว':  i.TempDescription || '',
            'การแก้ไขถาวร':      i.ActionDescription || '',
            'วันปิดงาน':         i.FinishDate ? new Date(i.FinishDate).toLocaleDateString('th-TH') : '',
            'สถานะ':             i.CurrentStatus === 'Closed' ? 'เสร็จสิ้น' : i.CurrentStatus === 'Temporary' ? 'แก้ชั่วคราว' : 'รอแก้ไข',
            'ผู้รายงาน':         i.ReporterName || '',
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ทะเบียนปัญหา');
    const fileName = `patrol_issues_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`ส่งออกสำเร็จ ${filtered.length} รายการ`, 'success');
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderDeptStats() {
    const tbody = document.getElementById('dashboard-dept-body');
    if (!tbody) return;

    // Use master departments — admin manages these in Master Data tab
    const deptNames = _masterDepts.map(d => d.Name).filter(Boolean);
    if (!deptNames.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-xs text-slate-300">ยังไม่มีส่วนงานใน Master Data</td></tr>`;
        return;
    }

    // Build count map
    const deptMap = {};
    for (const name of deptNames) deptMap[name] = { found:0, achieved:0, onProcess:0 };

    _allIssues.forEach(issue => {
        // ResponsibleDept may be plain string (new) or JSON array string (legacy)
        const raw = issue.ResponsibleDept || '';
        let depts = [];
        try {
            depts = raw.startsWith('[') ? JSON.parse(raw) : raw ? [raw] : [];
        } catch { depts = raw ? [raw] : []; }
        depts.forEach(d => {
            if (deptMap[d] !== undefined) {
                deptMap[d].found++;
                if (issue.CurrentStatus === 'Closed') deptMap[d].achieved++;
                else                                   deptMap[d].onProcess++;
            }
        });
    });

    // Only show depts that have issues, or all if none have any
    const hasAny = deptNames.some(n => deptMap[n].found > 0);
    const toShow = hasAny ? deptNames.filter(n => deptMap[n].found > 0) : deptNames;

    const rows = toShow.map(dept => {
        const r = deptMap[dept];
        const pct = r.found > 0 ? Math.round((r.achieved / r.found) * 100) : null;
        const pctColor = pct === null ? 'text-slate-300' : pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-orange-500' : 'text-red-500';
        return `<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="px-3 py-2 text-[10px] font-medium text-slate-600 max-w-[110px] truncate" title="${dept}">${dept}</td>
            <td class="px-2 py-2 text-center text-slate-500 font-bold text-xs">${r.found || '—'}</td>
            <td class="px-2 py-2 text-center text-emerald-600 font-bold text-xs">${r.achieved || 0}</td>
            <td class="px-2 py-2 text-center text-orange-500 font-bold text-xs">${r.onProcess || 0}</td>
            <td class="px-2 py-2 text-center font-bold text-xs ${pctColor}">${pct !== null ? pct+'%' : '—'}</td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
}

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
        const type  = item.HazardType || '';
        const rank  = item.Rank || '';
        if (!rank || !['A','B','C'].includes(rank)) return;
        const stop = STOP_TYPES.find(s => type.startsWith(s.key));
        const key  = stop ? stop.key : 'STOP 6';
        if (matrix[key]) matrix[key][rank]++;
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

function renderRankPieChart() {
    // Compute Rank A/B/C totals from _allIssues
    const rankMap = { A:0, B:0, C:0 };
    _allIssues.forEach(issue => {
        const item = normalizeApiObject(issue);
        const r = item.Rank || '';
        if (rankMap[r] !== undefined) rankMap[r]++;
    });

    const total = rankMap.A + rankMap.B + rankMap.C;
    const ctx = document.getElementById('rankPieChart');
    if (!ctx) return;

    if (window._rankPieChart) window._rankPieChart.destroy();

    if (total === 0) {
        ctx.closest('.flex-1').innerHTML = '<p class="text-slate-300 text-xs">ยังไม่มีข้อมูล</p>';
        return;
    }

    window._rankPieChart = new Chart(ctx.getContext('2d'), {
        type: 'pie',
        data: {
            labels: [`Rank A (${rankMap.A})`, `Rank B (${rankMap.B})`, `Rank C (${rankMap.C})`],
            datasets: [{
                data: [rankMap.A, rankMap.B, rankMap.C],
                backgroundColor: ['#f43f5e', '#fb923c', '#22c55e'],
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { size: 13, weight: 'bold', family: 'Kanit' },
                    formatter: (val) => val > 0 ? val : '',
                }
            }
        }
    });

    // Custom legend
    const legend = document.getElementById('rank-pie-legend');
    if (legend) {
        const colors = ['#f43f5e', '#fb923c', '#22c55e'];
        const labels = ['Rank A', 'Rank B', 'Rank C'];
        const vals   = [rankMap.A, rankMap.B, rankMap.C];
        legend.innerHTML = labels.map((l, i) => `
            <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${colors[i]}"></span>
                <span style="color:${colors[i]}">${l}</span>
                <span class="text-slate-400 font-normal">(${vals[i]})</span>
            </span>`).join('');
    }
}

async function loadDashboardCharts() {
    try {
        const res = await API.get('/patrol/dashboard-stats');
        const data = normalizeApiObject(res);
        const bySection = normalizeApiArray(data.bySection);

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

        renderDeptStats();
        renderStopRankStats();
        renderRankPieChart();
        initPromoCarousel();
    } catch (e) { console.error('Chart error:', e); }
}
