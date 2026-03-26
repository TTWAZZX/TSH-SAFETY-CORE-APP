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
let _deptStatSel    = null;  // admin-saved dept stat selection (from DB)
let _unitStatSel    = null;  // admin-saved unit stat selection (from DB)
let _myYearlyStats       = null;  // yearly patrol stats for personal dashboard (Phase 3)
let _positionThresholds  = [];    // position pass thresholds (PatrolPassPct) for compliance indicators
let _overviewYear   = new Date().getFullYear();
let _overviewData   = null;  // attendance overview cache
let _filterRank     = '';    // active Rank filter on issues tab (A/B/C or '')
let _filterStop     = 0;     // active Stop filter on issues tab (1-6 or 0)
let _filterArea     = '';    // active Area filter on issues tab
let _areaStatSel    = null;  // admin-saved area stat selection (from DB)

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
    window.openCalendarDay = openCalendarDay;
    window.savePositionThreshold = savePositionThreshold;
    window.openThresholdSettings = openThresholdSettings;
    window.exportIssuesToExcel = exportIssuesToExcel;
    window.exportIssuesToPDF   = exportIssuesToPDF;
    window._issueChangeDept = _issueChangeDept;
    window.deleteIssue = deleteIssue;
    window._issueFilterDept = _issueFilterDept;
    window._issueFilterRank    = (rank)   => { _filterRank = (_filterRank === rank) ? '' : rank; _filterStop = 0; _applyIssueTableFilter(); };
    window._issueFilterStop    = (stopId) => { _filterStop = (_filterStop === stopId) ? 0 : stopId; _filterRank = ''; _applyIssueTableFilter(); };
    window._issueClearRankStop = ()       => { _filterRank = ''; _filterStop = 0; _applyIssueTableFilter(); };
    window._issueUnitFilter    = (v)      => { _filterUnit = v; _applyIssueTableFilter(); };
    window._issueFilterArea    = (area)   => {
        _filterArea = (_filterArea === area) ? '' : area;
        _applyIssueTableFilter();
        renderAreaStats();
        if (_filterArea) document.getElementById('dashboard-section-body')?.closest('.bg-white')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    };

    const container = document.getElementById('patrol-page');
    container.innerHTML = getSkeletonHTML();

    try {
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear  = now.getFullYear();

        const [scheduleRes, statsRes, issuesRes, summaryRes, planRes, selfPatrolRes, areasRes, deptsRes, unitsRes, deptSelRes, unitSelRes, areaSelRes, yearlyRes, thresholdsRes] = await Promise.all([
            API.get(`/patrol/my-schedule?employeeId=${currentUser.id}&month=${curMonth}&year=${curYear}`),
            API.get('/patrol/attendance-stats'),
            API.get('/patrol/issues'),
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
            API.get('/patrol/position-thresholds').catch(() => ({ data: [] })),
        ]);

        _allIssues      = normalizeApiArray(issuesRes);
        _monthlySummary = summaryRes.data || [];
        _myPlan         = planRes.data || null;
        _mySelfPatrol   = selfPatrolRes.data || null;
        _patrolAreas    = areasRes.data || [];
        _masterDepts    = deptsRes.data || [];
        _masterUnits    = unitsRes.data || [];
        _myYearlyStats       = yearlyRes.data     || null;
        _positionThresholds  = thresholdsRes.data || [];
        try { _deptStatSel = deptSelRes.value ? JSON.parse(deptSelRes.value) : null; } catch { _deptStatSel = null; }
        try { _unitStatSel = unitSelRes.value ? JSON.parse(unitSelRes.value) : null; } catch { _unitStatSel = null; }
        try { _areaStatSel = areaSelRes.value ? JSON.parse(areaSelRes.value) : null; } catch { _areaStatSel = null; }

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
    window._lastStatsData = data.stats; // cache for duplicate-checkin guard
    const myStats = statsArray.find(r => r.Name === currentUser.name) || { Total: 0, Percent: 0 };

    // Smart CTA helpers
    const todayCheckedIn = myStats.LastWalk
        ? new Date(myStats.LastWalk).toDateString() === today.toDateString()
        : false;
    const todaySessForCTA = _myPlan?.sessions?.find(s => new Date(s.PatrolDate).toDateString() === today.toDateString()) || null;
    const nextSess = _myPlan?.sessions?.find(s => new Date(s.PatrolDate) > today) || null;
    const nextDaysLeft = nextSess ? Math.ceil((new Date(nextSess.PatrolDate) - today) / 86400000) : null;
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
    const _yearlyCount  = _myYearlyStats?.yearlyCount  ?? walks;
    const _yearlyTarget = _myYearlyStats?.yearlyTarget ?? null;
    const _personalStats = [
        { label: 'รวมปีนี้',         val: _yearlyTarget ? `${_yearlyCount}/${_yearlyTarget}` : _yearlyCount,           color: '#6ee7b7' },
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
        else if (tab === 'issues') { renderStatsStrip(_issueStats); renderAreaStats(); renderRankStopSummary(); }
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
            <div class="flex items-center gap-2 flex-shrink-0">
              ${isAdmin ? `
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
                ${todayCheckedIn
                  ? `<div class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2" style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2)">
                      <svg class="w-4 h-4 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                      เช็คอินแล้ว · ${new Date(myStats.LastWalk).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.
                    </div>
                    <button onclick="openCheckInModal()" class="relative z-10 mt-2 w-full py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)">
                      บันทึกอีกครั้ง
                    </button>`
                  : todaySessForCTA
                  ? `<button onclick="openCheckInModal()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg flex items-center justify-center gap-2" style="background:rgba(255,255,255,0.95);color:#065f46">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                      เช็คอินเดินตรวจ วันนี้
                    </button>`
                  : nextSess
                  ? `<button onclick="openCheckInModal()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                      เช็คอินเดินตรวจ
                    </button>
                    <p class="relative z-10 mt-1.5 text-center text-[10px]" style="color:rgba(255,255,255,0.45)">
                      ครั้งถัดไป ${new Date(nextSess.PatrolDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})} · อีก ${nextDaysLeft} วัน
                    </p>`
                  : `<button onclick="openCheckInModal()" class="relative z-10 mt-3 w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                      เช็คอินเดินตรวจ
                    </button>`
                }
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
              ${getCalendarLegendHTML()}
            </div>
            <div class="grid grid-cols-7 gap-1 text-center mb-2">
              ${['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<div class="text-[9px] font-bold text-slate-400">${d}</div>`).join('')}
            </div>
            <div class="grid grid-cols-7 gap-1 text-center">${generateMiniCalendarHTML(data.schedule)}</div>
          </div>

          <!-- Self-Patrol Card (หัวหน้าส่วน/แผนก) — conditional -->
          ${_mySelfPatrol?.isSupervisorPatrol ? (() => {
            const sp        = _mySelfPatrol;
            const attended  = sp.checkins.length;
            const target    = sp.target || 2;
            const pct       = Math.min(Math.round((attended / target) * 100), 100);
            const done      = attended >= target;
            const spYear         = _myYearlyStats?.selfPatrolYear;
            const yearlySpTarget = 24;
            const yearlySpCount  = spYear?.count ?? 0;
            const yearlySpPct    = Math.min(Math.round((yearlySpCount / yearlySpTarget) * 100), 100);
            const yearlySpDone   = yearlySpCount >= yearlySpTarget;
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden" style="box-shadow:0 4px 24px rgba(245,158,11,0.08)">
            <div class="px-5 py-3.5 border-b border-amber-100" style="background:linear-gradient(135deg,#fffbeb,#fef3c7)">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-amber-800 text-sm flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100">
                    <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  </div>
                  Self-Patrol
                </h3>
                <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-200 text-amber-800'}">${attended}/${target} เดือนนี้</span>
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
            </div>
            <div class="p-5">
              <div class="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${done?'linear-gradient(90deg,#059669,#10b981)':'linear-gradient(90deg,#f59e0b,#fbbf24)'}"></div>
              </div>
              ${sp.checkins.length === 0
                ? `<p class="text-xs text-slate-400 text-center py-3 italic">ยังไม่มีการบันทึกเดือนนี้</p>`
                : sp.checkins.map(c => {
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

            <!-- Yearly Progress (Phase 3) -->
            ${_myYearlyStats ? (() => {
              const yc  = _myYearlyStats.yearlyCount;
              const yt  = _myYearlyStats.yearlyTarget;
              const yPct = yt ? Math.min(Math.round((yc / yt) * 100), 100) : null;
              const yDone = yt ? yc >= yt : false;
              const tr = _myYearlyStats.teamRank;
              return `
              <div class="rounded-xl border border-emerald-100 p-3 mb-4" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5)">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[10px] font-bold text-emerald-700">ความก้าวหน้ารายปี</span>
                  <div class="flex items-center gap-2">
                    ${tr ? `<span class="text-[10px] font-bold text-slate-500">อันดับ #${tr.rank}/${tr.total} ในทีม</span>` : ''}
                    <span class="text-[10px] font-bold ${yDone ? 'text-emerald-600' : 'text-amber-600'}">${yc}${yt ? `/${yt}` : ''} ครั้ง</span>
                  </div>
                </div>
                ${yt ? `
                <div class="w-full bg-white/70 rounded-full h-2.5 overflow-hidden border border-emerald-100">
                  <div class="h-full rounded-full transition-all duration-700" style="width:${yPct}%;background:${yDone ? 'linear-gradient(90deg,#059669,#10b981)' : 'linear-gradient(90deg,#f59e0b,#fbbf24)'}"></div>
                </div>
                <p class="text-[9px] text-emerald-500/70 mt-1">${yDone ? 'ครบเป้าหมายแล้ว' : `เหลือ ${yt - yc} ครั้งจะครบเป้า`}</p>
                ` : `<p class="text-[9px] text-slate-400 mt-0.5">ยังไม่มีเป้าหมายรายปี</p>`}
              </div>`;
            })() : ''}

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

          <!-- Recent Check-in Timeline (Phase 3) -->
          ${_myYearlyStats?.recentCheckins?.length > 0 ? `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
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
                  const typeLabel = c.PatrolType === 'Re-inspection' ? 'ตรวจซ้ำ' : 'ปกติ';
                  const typeColor = c.PatrolType === 'Re-inspection' ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50';
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

          <!-- Team Roster Card (Phase 4 — YTD stats + pass/fail) -->
          ${_myPlan?.roster?.length > 0 ? (() => {
            const typeColor = { top:'rose', committee:'amber', management:'indigo' };
            const typeLabel = { top:'Top', committee:'คปอ.', management:'Mgmt' };
            const roster    = _myPlan.roster;
            // Build member stats map: EmployeeID → { yearlyCount, position }
            const memberMap = {};
            (_myYearlyStats?.teamMemberStats || []).forEach(s => {
                memberMap[s.EmployeeID] = { yearlyCount: s.yearlyCount, position: s.position };
            });
            // Build threshold map: position name → PatrolPassPct
            const thresholdMap = {};
            _positionThresholds.forEach(t => { thresholdMap[t.Name] = t.PatrolPassPct; });
            const yearlyTarget = _myYearlyStats?.yearlyTarget || null;
            const curYear = new Date().getFullYear();
            const maxCount = Math.max(1, ...Object.values(memberMap).map(m => m.yearlyCount ?? 0));
            return `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="px-5 py-3 flex items-center justify-between border-b border-slate-50">
              <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${_myPlan.team.color}"></span>
                ทีมของฉัน · สถานะ YTD ${curYear}
              </h3>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-slate-400 font-semibold">${roster.length} คน</span>
                ${isAdmin ? `<button onclick="openThresholdSettings()" title="ตั้งค่าเกณฑ์ผ่าน"
                  class="p-1.5 rounded-lg bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors border border-slate-100">
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
                const threshold = position ? (thresholdMap[position] ?? 80) : null;
                const ytdPct    = yearlyTarget && ytdCount !== null
                    ? Math.min(Math.round((ytdCount / yearlyTarget) * 100), 100) : null;
                const barPct    = ytdCount !== null
                    ? Math.min(Math.round((ytdCount / maxCount) * 100), 100) : 0;
                const ytdDone   = yearlyTarget && ytdCount !== null && ytdCount >= yearlyTarget;
                // Pass/fail
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
          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
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

        <!-- Sub-tab toggle -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-1.5 flex gap-1">
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
        <div id="ov-sub-mgmt" class="space-y-5">
          <!-- Filter bar -->
          <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <label class="text-xs font-bold text-slate-600">ปี</label>
            <select id="overview-year-select" onchange="switchOverviewYear(this.value)"
              class="text-sm font-bold rounded-xl border border-slate-200 px-3 py-1.5 focus:outline-none focus:border-emerald-400 text-slate-700">
              ${[new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(y =>
                `<option value="${y}" ${y === _overviewYear ? 'selected' : ''}>${y}</option>`
              ).join('')}
            </select>
            ${isAdmin ? `<button onclick="window.openRosterAddModal('top_management')"
              class="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all"
              style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
              เพิ่มสมาชิก
            </button>` : ''}
          </div>

          <!-- 2-col grid -->
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">

            <!-- Attendance Table xl:col-span-2 -->
            <div class="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                  <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  Summary of Top &amp; Management Safety Patrol Attendance
                </h3>
                <span id="ov-table-subtitle" class="text-[10px] text-slate-400 font-semibold">ปี ${_overviewYear}</span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                  <thead class="text-[10px] uppercase bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th class="px-4 py-3 font-bold text-slate-400 w-8">#</th>
                      <th class="px-4 py-3 font-bold text-slate-600">ชื่อ-สกุล</th>
                      <th class="px-4 py-3 font-bold text-slate-400">ตำแหน่ง</th>
                      <th class="px-4 py-3 font-bold text-slate-400">แผนก</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">เป้า/ปี</th>
                      <th class="px-4 py-3 font-bold text-emerald-600 text-center">เข้าร่วม</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">%</th>
                      ${isAdmin ? `<th class="px-4 py-3 font-bold text-slate-400 text-center">จัดการ</th>` : ''}
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
                  <canvas id="ov-mgmt-pie"></canvas>
                  <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p class="text-3xl font-bold text-emerald-600" id="ov-mgmt-pie-pct">—%</p>
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
        </div>

        <!-- ── Sub-tab 2: Sec. & Supervisor ── -->
        <div id="ov-sub-sv" class="hidden space-y-5">

          <!-- Filter bar: year only (annual view) -->
          <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <label class="text-xs font-bold text-slate-600">ปี</label>
            <select id="sv-year-select" onchange="window.switchSvFilter()"
              class="text-sm font-bold rounded-xl border border-slate-200 px-3 py-1.5 focus:outline-none focus:border-amber-400 text-slate-700">
              ${[new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(y=>
                `<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`
              ).join('')}
            </select>
            ${isAdmin ? `<button onclick="window.openRosterAddModal('supervisor')"
              class="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all"
              style="background:linear-gradient(135deg,#d97706,#f59e0b)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
              เพิ่มสมาชิก
            </button>` : ''}
          </div>

          <!-- 2-col grid -->
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">

            <!-- Supervisor Table xl:col-span-2 -->
            <div class="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
              <div class="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between bg-amber-50/50">
                <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100">
                    <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  </div>
                  Summary of Sec. &amp; Supervisor Safety Patrol Attendance
                  <span class="text-[9px] font-normal text-slate-400">(เป้าหมาย 24 ครั้ง/ปี)</span>
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
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">เป้า/ปี</th>
                      <th class="px-4 py-3 font-bold text-amber-600 text-center">เดินแล้ว</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">%</th>
                      <th class="px-4 py-3 font-bold text-slate-400 text-center">สถานะ</th>
                      ${isAdmin ? `<th class="px-4 py-3 font-bold text-slate-400 text-center">จัดการ</th>` : ''}
                    </tr>
                  </thead>
                  <tbody id="sv-overview-body">
                    <tr><td colspan="${isAdmin ? 9 : 8}" class="text-center py-8 text-slate-300 text-xs">
                      <div class="inline-flex flex-col items-center gap-2">
                        <div class="animate-spin rounded-full h-6 w-6 border-3 border-amber-400 border-t-transparent"></div>
                        <span>กำลังโหลด...</span>
                      </div>
                    </td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Right column -->
            <div class="space-y-5">
              <!-- Pie chart -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <h3 class="font-bold text-slate-700 text-sm mb-4">Safety Patrol Pie Chart</h3>
                <div class="relative h-52 flex items-center justify-center">
                  <canvas id="ov-sv-pie"></canvas>
                  <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p class="text-3xl font-bold text-amber-600" id="ov-sv-pie-pct">—%</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">อัตราเข้าร่วม</p>
                  </div>
                </div>
              </div>
              <!-- Stats summary card -->
              <div class="rounded-2xl overflow-hidden shadow-sm" style="background:linear-gradient(135deg,#78350f 0%,#92400e 55%,#b45309 100%)">
                <div class="p-5">
                  <div class="flex items-center gap-2 mb-3">
                    <svg class="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    <span class="text-xs font-bold text-white/80 uppercase tracking-wide">Safety Patrol Record</span>
                  </div>
                  <p class="text-[10px] text-white/50 mb-4" id="sv-card-subtitle">—</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.12)">
                      <p class="text-2xl font-bold text-white" id="sv-card-total">—</p>
                      <p class="text-[10px] text-white/60 mt-0.5">ผู้ควบคุมทั้งหมด</p>
                    </div>
                    <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.12)">
                      <p class="text-2xl font-bold text-amber-300" id="sv-card-done">—</p>
                      <p class="text-[10px] text-white/60 mt-0.5">ครบเป้าหมาย</p>
                    </div>
                  </div>
                  <div class="mt-3 rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.08)">
                    <p class="text-3xl font-bold text-white" id="sv-card-pct">—%</p>
                    <p class="text-[10px] text-white/60 mt-0.5">อัตราการเดินตรวจครบ</p>
                  </div>
                </div>
              </div>
            </div>

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
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-bold text-slate-700 text-sm">สถิติแยกพื้นที่</h3>
              <div class="flex items-center gap-1.5">
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

          <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col" style="min-height:220px">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-bold text-slate-700 text-sm">สถิติแยกส่วนงานรับผิดชอบ</h3>
              <div class="flex items-center gap-1.5">
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

        <!-- Charts row 2 — STOP×Rank matrix (full width) -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
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

        <!-- Issue Register -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-100">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-slate-700 text-sm">ทะเบียนปัญหา</h3>
                <span id="issue-count-badge" class="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-400 font-mono">ทั้งหมด ${total}</span>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="window.exportIssuesToPDF()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-all">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  PDF
                </button>
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
              <select id="issue-unit-filter" onchange="window._issueUnitFilter(this.value)"
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

    // Sync the dropdown in ทะเบียนปัญหา filter bar
    const deptSel = document.getElementById('issue-dept-filter');
    if (deptSel) deptSel.value = deptName;

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

    // Refresh dept stats table (re-highlight active row + badge)
    renderDeptStats();

    // Filter issues table
    const tbody = document.getElementById('issue-table-body');
    const badge  = document.getElementById('issue-count-badge');
    if (!tbody) return;
    const filtered = getFilteredIssues(_allIssues, _activeFilter);
    tbody.innerHTML = renderIssueRows(filtered);
    if (badge) badge.textContent = `${filtered.length} / ${_allIssues.length}`;

    // Scroll to ทะเบียนปัญหา section smoothly
    if (deptName) {
        document.getElementById('issue-table-body')?.closest('.bg-white')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ─── Rank / Stop filter (from summary cards) ──────────────────────────────────
function _applyIssueTableFilter() {
    const filtered = getFilteredIssues(_allIssues, _activeFilter);
    const tbody = document.getElementById('issue-table-body');
    const badge = document.getElementById('issue-count-badge');
    if (tbody) tbody.innerHTML = renderIssueRows(filtered);
    if (badge) badge.textContent = `${filtered.length} / ${_allIssues.length}`;
    renderAreaStats();
    renderDeptStats();
    renderRankStopSummary();
}

window._issueFilterRank = function(rank) {
    _filterRank = (_filterRank === rank) ? '' : rank;
    _filterStop = 0;
    _applyIssueTableFilter();
    document.getElementById('patrol-rank-stop-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window._issueFilterStop = function(stopId) {
    _filterStop = (_filterStop === stopId) ? 0 : stopId;
    _filterRank = '';
    _applyIssueTableFilter();
    document.getElementById('patrol-rank-stop-summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window._issueClearRankStop = function() {
    _filterRank = '';
    _filterStop = 0;
    _applyIssueTableFilter();
};

// Click on unit row in stats table → filter issues by that unit
window._issueFilterUnit = function(unitName) {
    // Clear dept filter, set unit filter
    _filterDept = '';
    _filterUnit = unitName;

    // Sync dropdowns
    const deptSel = document.getElementById('issue-dept-filter');
    if (deptSel) deptSel.value = '';
    const unitSel = document.getElementById('issue-unit-filter');
    if (unitSel) { unitSel.value = unitName; }

    renderDeptStats();

    const tbody = document.getElementById('issue-table-body');
    const badge  = document.getElementById('issue-count-badge');
    if (!tbody) return;
    const filtered = getFilteredIssues(_allIssues, _activeFilter);
    tbody.innerHTML = renderIssueRows(filtered);
    if (badge) badge.textContent = `${filtered.length} / ${_allIssues.length}`;

    if (unitName) {
        document.getElementById('issue-table-body')?.closest('.bg-white')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

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
    // Area filter (from area stats table)
    if (_filterArea) {
        result = result.filter(i => (i.Area || '') === _filterArea);
    }
    // Rank filter (from Rank/Stop summary cards)
    if (_filterRank) {
        result = result.filter(i => i.Rank === _filterRank);
    }
    // Stop filter (from Rank/Stop summary cards)
    if (_filterStop) {
        result = result.filter(i => {
            const m = (i.HazardType || '').match(/STOP\s*(\d)/i);
            return m && parseInt(m[1]) === _filterStop;
        });
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

    // ── ป้องกันเช็คอินซ้ำวันเดียวกัน ──────────────────────────────────────────
    const statsArr  = normalizeApiArray(window._lastStatsData || []);
    const myStat    = statsArr.find(r => r.Name === currentUser.name) || {};
    const alreadyToday = myStat.LastWalk
        ? new Date(myStat.LastWalk).toDateString() === today.toDateString()
        : false;

    if (alreadyToday && !window._skipDuplicateCheck) {
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

        <!-- Area confirmation (Phase 2.2) -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">พื้นที่ที่เดินตรวจ</label>
          <select name="Area" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all">
            <option value="">— ไม่ระบุ —</option>
            ${(_patrolAreas.length
              ? _patrolAreas
              : [{ Name:'โรงงาน 1' },{ Name:'โรงงาน 2' },{ Name:'รอบนอก' }]
            ).map(a => `<option value="${a.Name}" ${a.Name === areaLabel ? 'selected' : ''}>${a.Name}</option>`).join('')}
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
      </form>`, 'max-w-sm');
}

async function handleCheckInSubmit(e) {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const type  = fd.get('PatrolType');
    const area  = fd.get('Area') || null;
    const notes = fd.get('Notes')?.trim() || null;
    showLoading();
    try {
        await API.post('/patrol/checkin', { UserID: currentUser.id, UserName: currentUser.name, TeamName: currentUser.team, PatrolType: type, Area: area, Notes: notes });
        closeModal();
        showCheckinSuccessScreen(type);
    } catch (err) { showError(err); } finally { hideLoading(); }
}

// ─── Post Check-in Success Screen ─────────────────────────────────────────────
function showCheckinSuccessScreen(patrolType) {
    const now         = new Date();
    const timeStr     = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const compliance  = _myPlan?.compliance;
    const todaySess   = _myPlan?.sessions?.find(s => new Date(s.PatrolDate).toDateString() === now.toDateString()) || null;
    const areaName    = todaySess?.AreaName || todaySess?.AreaCode || null;
    const newAttended = (compliance?.attended || 0) + 1;
    const required    = compliance?.required || 0;
    const nowDone     = newAttended >= required && required > 0;
    const pct         = required > 0 ? Math.min(Math.round((newAttended / required) * 100), 100) : 0;
    const typeLabel   = patrolType === 'Re-inspection' ? 'ตรวจซ้ำ/ติดตาม' : 'เดินตรวจปกติ';

    openModal('เช็คอินสำเร็จ', `
      <div class="space-y-4">
        <!-- Success banner -->
        <div class="rounded-2xl p-5 text-center" style="background:linear-gradient(135deg,#064e3b,#065f46)">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style="background:rgba(255,255,255,0.15)">
            <svg class="w-7 h-7 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p class="font-bold text-white text-base">${currentUser.name}</p>
          <p class="text-emerald-300/80 text-xs mt-0.5">${typeLabel} · ${timeStr} น.</p>
          ${areaName ? `<span class="inline-block mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full" style="background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.7)">${areaName}</span>` : ''}
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
            <p class="text-[10px] text-slate-400 mt-0.5">บันทึกปัญหาได้ทันที${areaName ? ` (พื้นที่ ${areaName} จะถูกกรอกให้)` : ''}</p>
          </div>
          <button onclick="window.closeModal&&window.closeModal();window._openIssueFromCheckin(${JSON.stringify(areaName || '')})"
            class="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.97]" style="background:linear-gradient(135deg,#dc2626,#ef4444)">
            รายงานปัญหา
          </button>
        </div>

        <button onclick="window.closeModal&&window.closeModal()" class="w-full py-2.5 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">
          ปิด
        </button>
      </div>`, 'max-w-sm');

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
        setEl('ov-mgmt-pie-pct', `${s.percent}%`);
        if (s.latestDate) {
            const d = new Date(s.latestDate);
            setEl('ov-card-date', d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }));
        }

        // Refresh hero stats if overview tab is active
        window._refreshOverviewHero?.();
        // Table
        renderOverviewTable(_overviewData.members);

        // Pie chart
        renderOverviewChart(s.percent);

    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-xs text-slate-400">ไม่สามารถโหลดข้อมูลได้: ${err.message}</td></tr>`;
    }
}

function renderOverviewTable(members) {
    const tbody = document.getElementById('overview-table-body');
    if (!tbody) return;
    const ratingOf = pct => {
        if (pct >= 80) return { r: 5, cls: 'bg-emerald-100 text-emerald-700' };
        if (pct >= 75) return { r: 4, cls: 'bg-teal-100 text-teal-700' };
        if (pct >= 70) return { r: 3, cls: 'bg-blue-100 text-blue-700' };
        if (pct >= 65) return { r: 2, cls: 'bg-amber-100 text-amber-700' };
        if (pct >= 60) return { r: 1, cls: 'bg-orange-100 text-orange-700' };
        return { r: 0, cls: 'bg-red-100 text-red-700' };
    };

    if (!members.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" class="text-center py-14 text-xs text-slate-400">
          <div class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p class="font-medium text-slate-400">ยังไม่มีสมาชิกในรายการ</p>
            ${isAdmin ? '<p class="text-[10px] text-slate-300">กด "เพิ่มสมาชิก" เพื่อเพิ่มพนักงานเข้าตาราง</p>' : ''}
          </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = members.map((m, i) => {
        const { r, cls } = ratingOf(m.Percent);
        const barW = Math.min(m.Percent, 100);
        const isMe = m.EmployeeID === currentUser.id;
        return `<tr class="hover:bg-slate-50 transition-colors ${isMe ? 'bg-emerald-50/40' : ''}">
          <td class="px-4 py-3 text-slate-400 font-mono text-xs">${i+1}</td>
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
          ${isAdmin ? `<td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-1">
              <button onclick="window.editRosterTarget(${m.RosterID},'top_management',${m.Total},'${(m.Name||'').replace(/'/g,"\\'")}',true)"
                class="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="แก้ไขเป้าหมาย">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button onclick="window.deleteRosterMember(${m.RosterID},'top_management','${(m.Name||'').replace(/'/g,"\\'")}',true)"
                class="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="ลบออกจากรายการ">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>` : ''}
        </tr>`;
    }).join('');
}

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

// ─── Supervisor Overview ───────────────────────────────────────────────────────
async function loadSupervisorOverview(year) {
    year = year || new Date().getFullYear();
    const tbody = document.getElementById('sv-overview-body');
    const subEl = document.getElementById('sv-overview-subtitle');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 9 : 8}" class="text-center py-8 text-slate-300 text-xs">
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
            tbody.innerHTML = `<tr><td colspan="${isAdmin ? 9 : 8}" class="text-center py-12 text-xs text-slate-400">
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
        const doneCount    = members.filter(m => m.attended >= m.target).length;
        const totalAtt     = members.reduce((s, m) => s + m.attended, 0);
        const totalTgt     = members.reduce((s, m) => s + m.target,   0);
        const svPct        = totalTgt > 0 ? Math.round(totalAtt / totalTgt * 100) : 0;

        setEl('sv-card-total',    totalMembers);
        setEl('sv-card-done',     doneCount);
        setEl('sv-card-pct',      `${svPct}%`);
        setEl('ov-sv-pie-pct',    `${svPct}%`);
        setEl('sv-card-subtitle', `ปี ${year}`);
        renderSvPieChart(svPct);

        tbody.innerHTML = members.map((m, i) => {
            const done = m.attended >= m.target;
            const half = m.attended > 0 && m.attended < m.target;
            const statusCls = done ? 'bg-emerald-100 text-emerald-700' : half ? 'bg-amber-100 text-amber-700' : 'bg-red-50 text-red-500';
            const statusLbl = done ? 'ครบแล้ว' : half ? 'บางส่วน' : 'ยังไม่เดิน';
            const isMe = m.EmployeeID === currentUser.id;
            return `<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors ${isMe ? 'bg-amber-50/30' : ''}">
              <td class="px-4 py-3 text-slate-400 text-[10px] font-mono">${i+1}</td>
              <td class="px-4 py-3 font-semibold text-slate-700">${m.EmployeeName}${isMe ? ' <span class="text-[9px] text-amber-500">(ฉัน)</span>' : ''}</td>
              <td class="px-4 py-3 text-xs text-slate-500 max-w-[120px] truncate" title="${m.Position||''}">${m.Position||'—'}</td>
              <td class="px-4 py-3 text-xs text-slate-500 max-w-[100px] truncate" title="${m.Department||''}">${m.Department||'—'}</td>
              <td class="px-4 py-3 text-center font-bold text-slate-600">${m.target}</td>
              <td class="px-4 py-3 text-center font-bold ${done ? 'text-emerald-600' : half ? 'text-amber-600' : 'text-slate-400'}">${m.attended}</td>
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
              ${isAdmin ? `<td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <button onclick="window.editRosterTarget(${m.RosterID},'supervisor',${m.target},'${(m.EmployeeName||'').replace(/'/g,"\\'")}',false)"
                    class="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="แก้ไขเป้าหมาย">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onclick="window.deleteRosterMember(${m.RosterID},'supervisor','${(m.EmployeeName||'').replace(/'/g,"\\'")}',false)"
                    class="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="ลบออกจากรายการ">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </td>` : ''}
            </tr>`;
        }).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 9 : 8}" class="text-center py-6 text-xs text-slate-400">โหลดไม่ได้</td></tr>`;
    }
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

// Open modal to add employee to roster
window.openRosterAddModal = async function(group) {
    if (!isAdmin) return;
    const isMgmt = group === 'top_management';
    const groupLabel = isMgmt ? 'Top & Management' : 'Sec. & Supervisor';
    const accentColor = isMgmt ? '#059669' : '#d97706';

    openModal(`เพิ่มสมาชิก — ${groupLabel}`, `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">ค้นหาพนักงาน</label>
          <input type="text" id="roster-search-input" placeholder="พิมพ์ชื่อ, รหัส, ตำแหน่ง หรือแผนก..."
            class="form-input w-full rounded-xl text-sm border border-slate-200 px-3 py-2 focus:outline-none focus:border-emerald-400"
            oninput="window._filterRosterSearch()">
        </div>
        <div id="roster-emp-list" class="max-h-64 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 bg-slate-50">
          <div class="text-center py-6 text-xs text-slate-400">
            <div class="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent mx-auto mb-2"></div>
            กำลังโหลดรายชื่อพนักงาน...
          </div>
        </div>
        <div id="roster-selected-emp" class="hidden rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3">
          <p class="text-xs font-bold text-emerald-700 mb-1">พนักงานที่เลือก</p>
          <p id="roster-selected-name" class="text-sm font-bold text-slate-800"></p>
          <p id="roster-selected-detail" class="text-xs text-slate-500 mt-0.5"></p>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1.5">เป้าหมายการเดินตรวจ (ครั้ง/ปี)</label>
          <input type="number" id="roster-target-input" min="1" max="365" value="${isMgmt ? 12 : 24}"
            class="form-input w-full rounded-xl text-sm border border-slate-200 px-3 py-2 focus:outline-none focus:border-emerald-400">
          <p class="text-[10px] text-slate-400 mt-1">
            ${isMgmt ? 'ผู้จัดการทั่วไป/ผอ. = 12 ครั้ง • ผู้ชำนาญการพิเศษ/ผจก. = 24 ครั้ง' : 'หัวหน้าส่วน/แผนก = 24 ครั้ง (2 ครั้ง/เดือน)'}
          </p>
        </div>
        <input type="hidden" id="roster-group-input" value="${group}">
        <input type="hidden" id="roster-emp-id-input" value="">
        <div class="flex gap-2 pt-2">
          <button onclick="window.closeModal&&window.closeModal()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            ยกเลิก
          </button>
          <button onclick="window.confirmRosterAdd()"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
            style="background:linear-gradient(135deg,${accentColor},${isMgmt?'#0d9488':'#f59e0b'})">
            เพิ่มสมาชิก
          </button>
        </div>
      </div>
    `, 'max-w-md');

    // Load employees
    const emps = await _getEmpMaster();
    window._rosterEmpList = emps;
    window._rosterSelectedEmp = null;
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
    listEl.innerHTML = filtered.slice(0, 50).map(e => `
      <button onclick="window._selectRosterEmp('${e.EmployeeID}','${(e.EmployeeName||'').replace(/'/g,"\\'")}','${(e.Position||'').replace(/'/g,"\\'")}','${(e.Department||'').replace(/'/g,"\\'")}')"
        class="w-full text-left px-3 py-2.5 hover:bg-white transition-colors flex items-center gap-3 group">
        <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600">
          ${(e.EmployeeName||'?').charAt(0)}
        </div>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-slate-700 truncate">${e.EmployeeName}</p>
          <p class="text-[10px] text-slate-400 truncate">${e.Position||'—'} · ${e.Department||'—'} · ${e.EmployeeID}</p>
        </div>
      </button>
    `).join('');
};

window._selectRosterEmp = function(id, name, position, dept) {
    window._rosterSelectedEmp = { id, name, position, dept };
    const empIdEl   = document.getElementById('roster-emp-id-input');
    const nameEl    = document.getElementById('roster-selected-name');
    const detailEl  = document.getElementById('roster-selected-detail');
    const boxEl     = document.getElementById('roster-selected-emp');
    if (empIdEl) empIdEl.value = id;
    if (nameEl)  nameEl.textContent = name;
    if (detailEl) detailEl.textContent = `${position||'—'} · ${dept||'—'} · ${id}`;
    if (boxEl)   boxEl.classList.remove('hidden');

    // Auto-suggest target based on position
    const isMgmt = (document.getElementById('roster-group-input')?.value) === 'top_management';
    const suggested = _rosterDefaultTarget(position, isMgmt);
    const targetEl = document.getElementById('roster-target-input');
    if (targetEl) targetEl.value = suggested;
};

window.confirmRosterAdd = async function() {
    const empId  = document.getElementById('roster-emp-id-input')?.value;
    const group  = document.getElementById('roster-group-input')?.value;
    const target = parseInt(document.getElementById('roster-target-input')?.value || '12');
    if (!empId) { showToast('กรุณาเลือกพนักงาน', 'warning'); return; }
    if (!target || target < 1) { showToast('กรุณาระบุเป้าหมายที่ถูกต้อง', 'warning'); return; }
    try {
        await API.post('/patrol/roster', { EmployeeID: empId, RosterGroup: group, TargetPerYear: target });
        showToast('เพิ่มสมาชิกสำเร็จ', 'success');
        closeModal();
        // Reload the appropriate table
        if (group === 'top_management') {
            _overviewData = null;
            loadOverview(_overviewYear);
        } else {
            const yr = document.getElementById('sv-year-select')?.value || new Date().getFullYear();
            loadSupervisorOverview(parseInt(yr));
        }
    } catch (err) {
        showToast(err.message || 'เพิ่มไม่สำเร็จ', 'error');
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
const _SC_CHECKLIST = [
    { key: 'housekeeping',  label: 'ความสะอาด / 5S' },
    { key: 'fire',          label: 'ป้องกันอัคคีภัย' },
    { key: 'ppe',           label: 'การสวมใส่ PPE' },
    { key: 'machine',       label: 'เครื่องจักร/อุปกรณ์' },
    { key: 'walkway',       label: 'ทางเดิน/ทางออกฉุกเฉิน' },
    { key: 'chemical',      label: 'สารเคมี/วัตถุอันตราย' },
];

function openSelfCheckinModal() {
    const today = new Date().toISOString().split('T')[0];
    const areaList = _patrolAreas.length
        ? _patrolAreas
        : [{ Name:'โรงงาน 1' },{ Name:'โรงงาน 2' },{ Name:'รอบนอก+พื้นที่ส่วนกลาง' }];

    openModal('บันทึกการเดินตรวจ (Self-Patrol)', `
        <form id="self-checkin-form" class="space-y-4">
          <!-- Date -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">วันที่เดินตรวจ</label>
            <input type="date" id="sc-date" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all" value="${today}" max="${today}" required>
          </div>

          <!-- Multi-area checkboxes (Phase 2.3) -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">พื้นที่ที่เดินตรวจ <span class="text-red-400">*</span></label>
            <div id="sc-area-grid" class="grid grid-cols-2 gap-2">
              ${areaList.map(a => `
                <label class="cursor-pointer flex items-center gap-2 p-2.5 rounded-xl border border-slate-100 bg-white hover:border-amber-300 hover:bg-amber-50 transition-all has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50">
                  <input type="checkbox" class="sc-area-cb w-4 h-4 rounded accent-amber-500 flex-shrink-0" value="${a.Name}">
                  <span class="text-xs font-medium text-slate-700">${a.Name}</span>
                </label>`).join('')}
            </div>
            <p id="sc-area-err" class="text-xs text-red-500 mt-1 hidden">กรุณาเลือกอย่างน้อย 1 พื้นที่</p>
          </div>

          <!-- Observation checklist (Phase 2.4) -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">รายการที่ตรวจ <span class="text-slate-300">(ทำเครื่องหมายที่ตรวจแล้ว)</span></label>
            <div class="grid grid-cols-2 gap-2">
              ${_SC_CHECKLIST.map(c => `
                <label class="cursor-pointer flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-all has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50">
                  <input type="checkbox" class="sc-checklist-cb w-3.5 h-3.5 rounded accent-emerald-500 flex-shrink-0" value="${c.label}">
                  <span class="text-xs text-slate-600">${c.label}</span>
                </label>`).join('')}
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">บันทึกเพิ่มเติม <span class="text-slate-300">(ไม่บังคับ)</span></label>
            <textarea id="sc-notes" rows="2" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-none placeholder:text-slate-300" placeholder="สิ่งที่พบ หรือรายละเอียดเพิ่มเติม..."></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">ยกเลิก</button>
            <button type="submit" class="px-5 py-2 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#d97706,#f59e0b)">บันทึก</button>
          </div>
        </form>`, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('self-checkin-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const CheckinDate = document.getElementById('sc-date')?.value;

            // Collect multi-area selections
            const checkedAreas = [...document.querySelectorAll('.sc-area-cb:checked')].map(cb => cb.value);
            if (!CheckinDate || checkedAreas.length === 0) {
                document.getElementById('sc-area-err')?.classList.remove('hidden');
                if (!CheckinDate) showToast('กรุณาระบุวันที่', 'error');
                return;
            }
            document.getElementById('sc-area-err')?.classList.add('hidden');
            const Location = checkedAreas.join(', ');

            // Collect checklist
            const checkedItems = [...document.querySelectorAll('.sc-checklist-cb:checked')].map(cb => cb.value);
            const manualNotes  = document.getElementById('sc-notes')?.value.trim() || '';
            let Notes = '';
            if (checkedItems.length > 0) Notes += `[ตรวจแล้ว: ${checkedItems.join(' / ')}]`;
            if (manualNotes) Notes += (Notes ? '\n' : '') + manualNotes;

            try {
                const res = await API.post('/patrol/self-checkin', { CheckinDate, Location, Notes: Notes || null });
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
        renderRankStopSummary();
    } catch (err) {
        showError(err.message || 'ลบไม่สำเร็จ');
    } finally {
        hideLoading();
    }
}

// ─── Export to PDF (A4 formal report) ────────────────────────────────────────
async function exportIssuesToPDF() {
    if (!window.jspdf || !window.html2canvas) { showToast('ไม่พบ jsPDF หรือ html2canvas', 'error'); return; }

    const filtered = getFilteredIssues(_allIssues, _activeFilter);
    const now      = new Date();
    const pad      = n => String(n).padStart(2, '0');
    const dateStr  = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr  = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const docNo    = `SP-${now.getFullYear()}-${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    // ── Step 1: Summary counts ──────────────────────────────────────────────
    const counts = { open: 0, temp: 0, closed: 0 };
    const byRank = { A: 0, B: 0, C: 0 };
    const byStop = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const matrix = {}; // matrix[stopId][rank] = count
    CCCF_STOP_TYPES.forEach(s => { matrix[s.id] = { A:0, B:0, C:0 }; });

    filtered.forEach(i => {
        if (i.CurrentStatus === 'Open')      counts.open++;
        else if (i.CurrentStatus === 'Temporary') counts.temp++;
        else if (i.CurrentStatus === 'Closed')    counts.closed++;
        if (byRank[i.Rank] !== undefined) byRank[i.Rank]++;
        const m = (i.HazardType || '').match(/STOP\s*(\d)/i);
        if (m) {
            const n = parseInt(m[1]);
            if (byStop[n] !== undefined) byStop[n]++;
            if (matrix[n] && i.Rank && matrix[n][i.Rank] !== undefined) matrix[n][i.Rank]++;
        }
    });

    const closePct = filtered.length ? Math.round((counts.closed / filtered.length) * 100) : 0;

    // ── Step 2: Date range ──────────────────────────────────────────────────
    const dates = filtered.map(i => i.DateFound).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
    const minDate = dates.length ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
    const fmtDate = d => d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const dateRange = minDate && maxDate
        ? (minDate.toDateString() === maxDate.toDateString() ? fmtDate(minDate) : `${fmtDate(minDate)} – ${fmtDate(maxDate)}`)
        : '—';

    // ── Step 3: Filter label ────────────────────────────────────────────────
    const fParts = [];
    if (_activeFilter !== 'all') fParts.push({ open:'รอแก้ไข', temp:'แก้ชั่วคราว', closed:'เสร็จสิ้น', high:'Rank A', overdue:'เกินกำหนด' }[_activeFilter] || '');
    if (_filterDept)  fParts.push(`ส่วนงาน: ${_filterDept}`);
    if (_filterUnit)  fParts.push(`Unit: ${_filterUnit}`);
    if (_filterArea)  fParts.push(`พื้นที่: ${_filterArea}`);
    if (_filterRank)  fParts.push(`Rank ${_filterRank}`);
    if (_filterStop)  fParts.push(`Stop ${_filterStop}`);
    if (_searchQuery) fParts.push(`ค้นหา: "${_searchQuery}"`);
    const filterLabel = fParts.length ? fParts.join(' · ') : 'แสดงทั้งหมด';

    // ── Step 4: Helper fns ──────────────────────────────────────────────────
    const sColor = s => s === 'Closed' ? '#059669' : s === 'Temporary' ? '#f97316' : '#dc2626';
    const sLabel = s => s === 'Closed' ? 'เสร็จสิ้น' : s === 'Temporary' ? 'แก้ชั่วคราว' : 'รอแก้ไข';
    const rColor = r => r === 'A' ? '#dc2626' : r === 'B' ? '#f97316' : '#059669';
    const K      = `font-family:'Kanit',sans-serif;`;

    // ── Step 5: Area breakdown ──────────────────────────────────────────────
    const areaMap = {};
    filtered.forEach(i => {
        const a = i.Area || 'ไม่ระบุ';
        if (!areaMap[a]) areaMap[a] = { found:0, closed:0 };
        areaMap[a].found++;
        if (i.CurrentStatus === 'Closed') areaMap[a].closed++;
    });
    const areaRows = Object.entries(areaMap).sort((a,b) => b[1].found - a[1].found).map(([name, r], idx) => {
        const pct = r.found ? Math.round((r.closed/r.found)*100) : 0;
        return `<tr style="background:${idx%2?'#f8fafc':'#fff'}; border-bottom:1px solid #f1f5f9;">
          <td style="padding:5px 8px; font-size:10px; ${K} color:#1e293b;">${name}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:#475569;">${r.found}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:#059669;">${r.closed}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${r.found-r.closed>0?'#f97316':'#cbd5e1'};">${r.found-r.closed}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${pct>=80?'#059669':pct>=50?'#f97316':'#dc2626'};">${r.found?pct+'%':'—'}</td>
        </tr>`;
    }).join('');

    // ── Step 6: Dept breakdown ──────────────────────────────────────────────
    const deptMap = {};
    filtered.forEach(i => {
        const raw = i.ResponsibleDept || 'ไม่ระบุ';
        let depts = [];
        try { depts = raw.startsWith('[') ? JSON.parse(raw) : [raw]; } catch { depts = [raw]; }
        depts.forEach(d => {
            if (!deptMap[d]) deptMap[d] = { found:0, closed:0 };
            deptMap[d].found++;
            if (i.CurrentStatus === 'Closed') deptMap[d].closed++;
        });
    });
    const deptRows = Object.entries(deptMap).sort((a,b) => b[1].found - a[1].found).map(([name, r], idx) => {
        const pct = r.found ? Math.round((r.closed/r.found)*100) : 0;
        return `<tr style="background:${idx%2?'#f8fafc':'#fff'}; border-bottom:1px solid #f1f5f9;">
          <td style="padding:5px 8px; font-size:10px; ${K} color:#1e293b;">${name}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:#475569;">${r.found}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:#059669;">${r.closed}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${r.found-r.closed>0?'#f97316':'#cbd5e1'};">${r.found-r.closed}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${pct>=80?'#059669':pct>=50?'#f97316':'#dc2626'};">${r.found?pct+'%':'—'}</td>
        </tr>`;
    }).join('');

    // ── Step 7: Issue table rows ────────────────────────────────────────────
    const tableRows = filtered.map((i, idx) => {
        const date = i.DateFound ? new Date(i.DateFound).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '—';
        const due  = i.DueDate   ? new Date(i.DueDate ).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '—';
        const isOverdue = i.CurrentStatus !== 'Closed' && i.DueDate && new Date(i.DueDate) < now;
        const desc = (i.HazardDescription || '').slice(0, 80) + ((i.HazardDescription||'').length > 80 ? '…' : '');
        const sc = sColor(i.CurrentStatus), rc = rColor(i.Rank);
        return `<tr style="background:${idx%2?'#f8fafc':'#fff'}; border-bottom:1px solid #f1f5f9;">
          <td style="padding:6px 8px; font-size:10px; color:#94a3b8; ${K} width:32px; text-align:center;">${i.IssueID||idx+1}</td>
          <td style="padding:6px 8px; font-size:10px; color:#475569; ${K} width:70px; white-space:nowrap;">${date}</td>
          <td style="padding:6px 8px; font-size:10px; color:#475569; ${K} width:78px;">${i.Area||'—'}</td>
          <td style="padding:6px 8px; font-size:10px; color:#475569; ${K} width:88px;">${i.ResponsibleDept||'—'}</td>
          <td style="padding:6px 8px; font-size:10.5px; color:#1e293b; ${K}">${desc||'—'}</td>
          <td style="padding:6px 8px; text-align:center; width:40px;">
            ${i.Rank?`<span style="background:${rc};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;${K}">${i.Rank}</span>`:`<span style="color:#cbd5e1;font-size:10px;${K}">—</span>`}
          </td>
          <td style="padding:6px 8px; text-align:center; width:74px;">
            <span style="background:${sc}18;color:${sc};font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;${K}">${sLabel(i.CurrentStatus)}</span>
          </td>
          <td style="padding:6px 8px; font-size:10px; text-align:center; width:58px; color:${isOverdue?'#dc2626':'#475569'}; font-weight:${isOverdue?700:400}; ${K} white-space:nowrap;">${due}</td>
        </tr>`;
    }).join('');

    // ── Step 8: Photo cards (issues with images) ────────────────────────────
    const withPhotos = filtered.filter(i => i.BeforeImage || i.AfterImage || i.TempImage);
    const photoCards = withPhotos.map((i, idx) => {
        const rc = rColor(i.Rank); const sc = sColor(i.CurrentStatus);
        const date = i.DateFound ? new Date(i.DateFound).toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'numeric'}) : '—';
        const beforeUrl = resolveFileUrl(i.BeforeImage);
        const tempUrl   = resolveFileUrl(i.TempImage);
        const afterUrl  = resolveFileUrl(i.AfterImage);
        const imgSlot = (url, label, borderColor) => url
            ? `<div style="flex:1; min-width:0;">
                <div style="font-size:9px; font-weight:700; color:${borderColor}; ${K} margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">${label}</div>
                <img src="${url}" crossorigin="anonymous" style="width:100%; height:140px; object-fit:cover; border-radius:8px; border:2px solid ${borderColor}30;" onerror="this.style.display='none'"/>
               </div>`
            : `<div style="flex:1; min-width:0;">
                <div style="font-size:9px; font-weight:700; color:#cbd5e1; ${K} margin-bottom:4px;">${label}</div>
                <div style="height:140px; background:#f8fafc; border-radius:8px; border:2px dashed #e2e8f0; display:flex; align-items:center; justify-content:center;">
                  <span style="font-size:10px; color:#cbd5e1; ${K}">ไม่มีรูปภาพ</span>
                </div>
               </div>`;
        return `
        <div style="background:#fff; border:1.5px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:14px; page-break-inside:avoid;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:10px; color:#94a3b8; ${K} font-weight:600;">#${i.IssueID||idx+1}</span>
              ${i.Rank?`<span style="background:${rc};color:#fff;font-size:10px;font-weight:800;padding:2px 10px;border-radius:8px;${K}">${i.Rank}</span>`:''}
              <span style="background:${sc}18;color:${sc};font-size:10px;font-weight:700;padding:2px 10px;border-radius:99px;${K}">${sLabel(i.CurrentStatus)}</span>
            </div>
            <span style="font-size:10px; color:#94a3b8; ${K}">${date} · ${i.Area||''}</span>
          </div>
          <div style="font-size:11px; color:#1e293b; ${K} font-weight:600; margin-bottom:6px; line-height:1.5;">${i.HazardDescription||'—'}</div>
          ${i.TempDescription?`<div style="font-size:10px; color:#f97316; ${K} margin-bottom:6px;">แก้ชั่วคราว: ${i.TempDescription}</div>`:''}
          ${i.ActionDescription?`<div style="font-size:10px; color:#059669; ${K} margin-bottom:10px;">การแก้ไขถาวร: ${i.ActionDescription}</div>`:''}
          <div style="display:flex; gap:10px;">
            ${imgSlot(beforeUrl, 'ก่อนแก้ไข (Before)', '#dc2626')}
            ${tempUrl ? imgSlot(tempUrl, 'แก้ชั่วคราว (Temp)', '#f97316') : ''}
            ${imgSlot(afterUrl, 'หลังแก้ไข (After)', '#059669')}
          </div>
        </div>`;
    }).join('');

    // ── Step 9: Stop grid ───────────────────────────────────────────────────
    const stopGrid = CCCF_STOP_TYPES.map(s => `
        <div style="flex:1; min-width:110px; background:${s.bg}; border:1px solid ${s.border}; border-radius:8px; padding:8px 10px;">
          <div style="font-size:9px; font-weight:700; color:${s.color}; ${K}">${s.code}</div>
          <div style="font-size:20px; font-weight:900; color:${byStop[s.id]>0?s.color:'#cbd5e1'}; ${K} line-height:1.1;">${byStop[s.id]}</div>
          <div style="font-size:8.5px; color:#64748b; ${K} margin-top:1px;">${s.label}</div>
        </div>`).join('');

    // ── Step 10: STOP × Rank matrix ─────────────────────────────────────────
    const matrixRows = CCCF_STOP_TYPES.map((s, idx) => {
        const r = matrix[s.id]; const total = r.A + r.B + r.C;
        return `<tr style="background:${idx%2?'#f8fafc':'#fff'}; border-bottom:1px solid #f1f5f9;">
          <td style="padding:5px 8px; font-size:10px; ${K} color:#475569;">${s.code} ${s.label}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${r.A>0?'#dc2626':'#cbd5e1'};">${r.A}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${r.B>0?'#f97316':'#cbd5e1'};">${r.B}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${r.C>0?'#059669':'#cbd5e1'};">${r.C}</td>
          <td style="padding:5px 8px; text-align:center; font-size:10px; font-weight:700; ${K} color:${total>0?'#1e293b':'#cbd5e1'};">${total}</td>
        </tr>`;
    }).join('');
    const mTotalA = CCCF_STOP_TYPES.reduce((s,t)=>s+matrix[t.id].A,0);
    const mTotalB = CCCF_STOP_TYPES.reduce((s,t)=>s+matrix[t.id].B,0);
    const mTotalC = CCCF_STOP_TYPES.reduce((s,t)=>s+matrix[t.id].C,0);

    // ── Step 11: Section header helper ─────────────────────────────────────
    const secHeader = (title) =>
        `<div style="font-size:10px; font-weight:700; color:#94a3b8; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; padding-bottom:6px; border-bottom:1.5px solid #f1f5f9;">${title}</div>`;

    const thStyle = `padding:8px; font-size:9px; font-weight:700; ${K} text-align:center; color:#fff;`;
    const thL     = `padding:8px; font-size:9px; font-weight:700; ${K} text-align:left; color:#fff;`;

    // ── Step 12: Section helpers ────────────────────────────────────────────
    // Each section is rendered to its own canvas → placed on PDF without arbitrary cuts
    const S = `width:794px;background:#f8fafc;${K}padding:0 36px;box-sizing:border-box;`;

    // Wrap a card HTML in the outer shell with optional vertical padding
    const sec = (cardHtml, ptop = 0) =>
        `<div style="${S}padding-top:${ptop}px;padding-bottom:14px;">${cardHtml}</div>`;

    // Card wrapper
    const card = (inner, extraStyle = '') =>
        `<div style="background:#fff;border-radius:12px;padding:16px 18px;border:1px solid #e2e8f0;${extraStyle}">${inner}</div>`;

    // ── Build section list ───────────────────────────────────────────────────
    // Section 1: Header
    const s1 = `<div style="width:794px;background:#f8fafc;${K}padding:32px 36px 14px;box-sizing:border-box;">
      <div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%);border-radius:14px;padding:24px 28px;position:relative;overflow:hidden;">
        <div style="position:absolute;right:-20px;top:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;position:relative;">
          <div>
            <div style="font-size:10px;color:rgba(167,243,208,0.9);font-weight:600;letter-spacing:1.5px;margin-bottom:6px;">TSH SAFETY CORE ACTIVITY</div>
            <div style="font-size:21px;font-weight:800;color:#fff;line-height:1.2;">รายงานสรุปประเด็นจากการเดินตรวจ</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:3px;">Safety Patrol Issue Report</div>
          </div>
          <div style="text-align:right;color:rgba(255,255,255,0.75);font-size:10px;line-height:2;">
            <div>เลขที่: <strong style="color:#fff;font-family:monospace;">${docNo}</strong></div>
            <div>วันที่: <strong style="color:#fff;">${dateStr}</strong></div>
            <div>เวลา: <strong style="color:#fff;">${timeStr} น.</strong></div>
            <div>จัดทำโดย: <strong style="color:#fff;">${currentUser.name||'—'}</strong></div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.15);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:10px;color:rgba(167,243,208,0.85);font-weight:600;">ขอบเขต:</span>
          <span style="background:rgba(255,255,255,0.15);color:#fff;font-size:10px;font-weight:600;padding:2px 12px;border-radius:99px;">${filterLabel}</span>
          <span style="background:rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:2px 10px;border-radius:99px;">ช่วงวันที่: ${dateRange}</span>
          <span style="margin-left:auto;background:rgba(255,255,255,0.2);color:#fff;font-size:10px;font-weight:800;padding:2px 14px;border-radius:99px;">${filtered.length} ประเด็น</span>
        </div>
      </div>
    </div>`;

    // Section 2: Summary + progress
    const s2 = sec(card(`
      ${secHeader('สรุปภาพรวม')}
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        ${[
          {label:'ทั้งหมด',val:filtered.length,bg:'#f8fafc',border:'#e2e8f0',vc:'#1e293b'},
          {label:'รอแก้ไข',val:counts.open,bg:'#fef2f2',border:'#fecaca',vc:'#dc2626'},
          {label:'แก้ชั่วคราว',val:counts.temp,bg:'#fff7ed',border:'#fed7aa',vc:'#f97316'},
          {label:'เสร็จสิ้น',val:counts.closed,bg:'#f0fdf4',border:'#bbf7d0',vc:'#059669'},
          {label:'Rank A',val:byRank.A,bg:'#fef2f2',border:'#fecaca',vc:'#dc2626'},
          {label:'Rank B',val:byRank.B,bg:'#fff7ed',border:'#fed7aa',vc:'#f97316'},
          {label:'Rank C',val:byRank.C,bg:'#f0fdf4',border:'#bbf7d0',vc:'#059669'},
        ].map(s=>`<div style="flex:1;background:${s.bg};border:1.5px solid ${s.border};border-radius:10px;padding:10px 12px;">
          <div style="font-size:24px;font-weight:900;color:${s.vc};${K}line-height:1;">${s.val}</div>
          <div style="font-size:9.5px;margin-top:2px;${K}font-weight:${s.label.startsWith('Rank')?700:400};color:${s.label.startsWith('Rank')?s.vc:'#64748b'};">${s.label}</div>
        </div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:10px;font-weight:700;color:#475569;${K}white-space:nowrap;">อัตราการแก้ไขเสร็จสิ้น</div>
        <div style="flex:1;height:10px;background:#f1f5f9;border-radius:99px;overflow:hidden;">
          <div style="height:100%;width:${closePct}%;background:linear-gradient(90deg,#059669,#0d9488);border-radius:99px;"></div>
        </div>
        <div style="font-size:14px;font-weight:900;${K}white-space:nowrap;color:${closePct>=80?'#059669':closePct>=50?'#f97316':'#dc2626'};">${closePct}%</div>
      </div>
    `));

    // Section 3: Stop 1-6
    const s3 = sec(card(`
      ${secHeader('อันตราย 6 ประการ (Stop 1–6)')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${CCCF_STOP_TYPES.map(s=>`
          <div style="flex:1;min-width:110px;background:${s.bg};border:1px solid ${s.border};border-radius:8px;padding:8px 10px;">
            <div style="font-size:9px;font-weight:700;color:${s.color};${K}">${s.code}</div>
            <div style="font-size:20px;font-weight:900;${K}line-height:1.1;color:${byStop[s.id]>0?s.color:'#cbd5e1'};">${byStop[s.id]}</div>
            <div style="font-size:8.5px;color:#64748b;${K}margin-top:1px;">${s.label}</div>
          </div>`).join('')}
      </div>
    `));

    // Section 4: STOP × Rank matrix
    const s4 = sec(card(`
      ${secHeader('ชนิดอันตราย × ระดับความรุนแรง (STOP × Rank)')}
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:linear-gradient(135deg,#064e3b,#065f46);">
            <th style="${thL}">ชนิดอันตราย</th>
            <th style="${thStyle}color:#fca5a5;">Rank A</th>
            <th style="${thStyle}color:#fdba74;">Rank B</th>
            <th style="${thStyle}color:#6ee7b7;">Rank C</th>
            <th style="${thStyle}">รวม</th>
          </tr>
        </thead>
        <tbody>${CCCF_STOP_TYPES.map((s,idx)=>{
          const r=matrix[s.id]; const total=r.A+r.B+r.C;
          return `<tr style="background:${idx%2?'#f8fafc':'#fff'};border-bottom:1px solid #f1f5f9;">
            <td style="padding:5px 8px;font-size:10px;${K}color:#475569;">${s.code} ${s.label}</td>
            <td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:700;${K}color:${r.A>0?'#dc2626':'#cbd5e1'};">${r.A}</td>
            <td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:700;${K}color:${r.B>0?'#f97316':'#cbd5e1'};">${r.B}</td>
            <td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:700;${K}color:${r.C>0?'#059669':'#cbd5e1'};">${r.C}</td>
            <td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:700;${K}color:${total>0?'#1e293b':'#cbd5e1'};">${total}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot>
          <tr style="background:#f8fafc;border-top:2px solid #e2e8f0;">
            <td style="padding:6px 8px;font-size:10px;font-weight:700;${K}color:#1e293b;">รวมทั้งหมด</td>
            <td style="padding:6px 8px;text-align:center;font-size:10px;font-weight:900;${K}color:#dc2626;">${mTotalA}</td>
            <td style="padding:6px 8px;text-align:center;font-size:10px;font-weight:900;${K}color:#f97316;">${mTotalB}</td>
            <td style="padding:6px 8px;text-align:center;font-size:10px;font-weight:900;${K}color:#059669;">${mTotalC}</td>
            <td style="padding:6px 8px;text-align:center;font-size:10px;font-weight:900;${K}color:#1e293b;">${mTotalA+mTotalB+mTotalC}</td>
          </tr>
        </tfoot>
      </table>
    `));

    // Section 5: Area + Dept breakdown (side by side)
    const mkBreakTable = (rows, emptyLabel) => `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;">
          <th style="padding:6px 8px;font-size:9px;font-weight:700;${K}color:#94a3b8;text-align:left;">${emptyLabel}</th>
          <th style="padding:6px 8px;font-size:9px;font-weight:700;${K}color:#475569;text-align:center;">พบ</th>
          <th style="padding:6px 8px;font-size:9px;font-weight:700;${K}color:#059669;text-align:center;">เสร็จ</th>
          <th style="padding:6px 8px;font-size:9px;font-weight:700;${K}color:#f97316;text-align:center;">ค้าง</th>
          <th style="padding:6px 8px;font-size:9px;font-weight:700;${K}color:#94a3b8;text-align:center;">%</th>
        </tr></thead>
        <tbody>${rows||`<tr><td colspan="5" style="text-align:center;padding:12px;color:#cbd5e1;font-size:10px;${K}">ไม่มีข้อมูล</td></tr>`}</tbody>
      </table>`;

    const s5 = sec(`<div style="display:flex;gap:14px;">
      <div style="flex:1;min-width:0;background:#fff;border-radius:12px;padding:16px 18px;border:1px solid #e2e8f0;">
        ${secHeader('สถิติแยกพื้นที่')}
        ${mkBreakTable(areaRows,'พื้นที่')}
      </div>
      <div style="flex:1;min-width:0;background:#fff;border-radius:12px;padding:16px 18px;border:1px solid #e2e8f0;">
        ${secHeader('สถิติแยกส่วนงาน')}
        ${mkBreakTable(deptRows,'ส่วนงาน')}
      </div>
    </div>`);

    // Section 6: Issue register table
    const s6 = sec(card(`
      ${secHeader(`ทะเบียนประเด็น (${filtered.length} รายการ)`)}
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:linear-gradient(135deg,#064e3b,#065f46);color:#fff;">
            <th style="${thStyle}width:32px;">#</th>
            <th style="${thL}width:70px;">วันที่พบ</th>
            <th style="${thL}width:78px;">พื้นที่</th>
            <th style="${thL}width:88px;">ส่วนงาน</th>
            <th style="${thL}">รายละเอียดอันตราย</th>
            <th style="${thStyle}width:40px;">Rank</th>
            <th style="${thStyle}width:74px;">สถานะ</th>
            <th style="${thStyle}width:58px;">กำหนด</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length ? tableRows : `<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;${K}font-size:11px;">ไม่มีข้อมูล</td></tr>`}
        </tbody>
      </table>
    `));

    // Section 7: Photo cards — one canvas per card to avoid splits
    const photoSections = withPhotos.map((i, idx) => {
        const rc = rColor(i.Rank); const sc = sColor(i.CurrentStatus);
        const date = i.DateFound ? new Date(i.DateFound).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}) : '—';
        const beforeUrl = resolveFileUrl(i.BeforeImage);
        const tempUrl   = resolveFileUrl(i.TempImage);
        const afterUrl  = resolveFileUrl(i.AfterImage);
        const imgSlot = (url, label, borderColor) => url
            ? `<div style="flex:1;min-width:0;">
                <div style="font-size:9px;font-weight:700;color:${borderColor};${K}margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
                <img src="${url}" crossorigin="anonymous" style="width:100%;height:140px;object-fit:cover;border-radius:8px;border:2px solid ${borderColor}30;" onerror="this.style.display='none'"/>
               </div>`
            : `<div style="flex:1;min-width:0;">
                <div style="font-size:9px;font-weight:700;color:#cbd5e1;${K}margin-bottom:4px;">${label}</div>
                <div style="height:140px;background:#f8fafc;border-radius:8px;border:2px dashed #e2e8f0;display:flex;align-items:center;justify-content:center;">
                  <span style="font-size:10px;color:#cbd5e1;${K}">ไม่มีรูปภาพ</span>
                </div>
               </div>`;
        const isFirst = idx === 0;
        return sec(card(`
          ${isFirst ? secHeader(`ภาพประกอบ Before / After (${withPhotos.length} ประเด็น)`) : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:10px;color:#94a3b8;${K}font-weight:600;">#${i.IssueID||idx+1}</span>
              ${i.Rank?`<span style="background:${rc};color:#fff;font-size:10px;font-weight:800;padding:2px 10px;border-radius:8px;${K}">${i.Rank}</span>`:''}
              <span style="background:${sc}18;color:${sc};font-size:10px;font-weight:700;padding:2px 10px;border-radius:99px;${K}">${sLabel(i.CurrentStatus)}</span>
            </div>
            <span style="font-size:10px;color:#94a3b8;${K}">${date} · ${i.Area||''}</span>
          </div>
          <div style="font-size:11px;color:#1e293b;${K}font-weight:600;margin-bottom:6px;line-height:1.5;">${i.HazardDescription||'—'}</div>
          ${i.TempDescription?`<div style="font-size:10px;color:#f97316;${K}margin-bottom:6px;">แก้ชั่วคราว: ${i.TempDescription}</div>`:''}
          ${i.ActionDescription?`<div style="font-size:10px;color:#059669;${K}margin-bottom:10px;">การแก้ไขถาวร: ${i.ActionDescription}</div>`:''}
          <div style="display:flex;gap:10px;">
            ${imgSlot(beforeUrl,'ก่อนแก้ไข (Before)','#dc2626')}
            ${tempUrl?imgSlot(tempUrl,'แก้ชั่วคราว (Temp)','#f97316'):''}
            ${imgSlot(afterUrl,'หลังแก้ไข (After)','#059669')}
          </div>
        `));
    });

    // Section 8: Signature
    const s8 = sec(card(`
      <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:1px;margin-bottom:16px;text-transform:uppercase;">รับรองและอนุมัติ</div>
      <div style="display:flex;justify-content:space-between;gap:24px;">
        ${['ผู้จัดทำรายงาน','หัวหน้าส่วนงาน','ผู้จัดการ'].map(role=>`
          <div style="flex:1;text-align:center;">
            <div style="height:52px;border-bottom:1.5px solid #cbd5e1;margin-bottom:8px;"></div>
            <div style="font-size:10px;color:#64748b;${K}">(........................................)</div>
            <div style="font-size:10.5px;font-weight:700;color:#374151;margin-top:4px;${K}">${role}</div>
            <div style="font-size:9.5px;color:#94a3b8;margin-top:3px;${K}">วันที่ ......../......../.........</div>
          </div>`).join('')}
      </div>
    `));

    // Assemble all sections
    const allSections = [s1, s2, s3, s4, s5, s6, ...photoSections, s8];

    // ── Step 13: Render each section to canvas, place on PDF ────────────────
    const renderToCanvas = async (htmlStr) => {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;width:794px;';
        el.innerHTML = htmlStr;
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 40));
        const c = await html2canvas(el, {
            scale: 2, useCORS: true, logging: false,
            backgroundColor: '#f8fafc', windowWidth: 794, allowTaint: false,
        });
        document.body.removeChild(el);
        return c;
    };

    // A4 dimensions (mm) — declared here so toMM and section logic can use them
    const pageW = 210, pageH = 297;

    // px→mm: at scale:2 canvas.width = 794*2 = 1588px → 210mm
    const toMM = (canvas) => canvas.height * pageW / canvas.width;

    const elOuter = document.createElement('div'); // keep reference for cleanup
    document.body.appendChild(elOuter); // placeholder so finally can remove something
    try {
        showLoading('กำลังสร้าง PDF...');
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 400));

        const { jsPDF } = window.jspdf;
        const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const marginT = 8, marginB = 12;
        let   curY = marginT;

        for (let si = 0; si < allSections.length; si++) {
            const canvas = await renderToCanvas(allSections[si]);
            const imgH   = toMM(canvas);
            const imgData = canvas.toDataURL('image/jpeg', 0.92);

            // Start a new page if section won't fit (and we're not at page start)
            if (curY > marginT && curY + imgH > pageH - marginB) {
                pdf.addPage();
                curY = marginT;
            }

            // If single section is taller than a full page, slice it across pages
            if (imgH > pageH - marginT - marginB) {
                let yInImg = 0; // mm into the image we've placed so far
                while (yInImg < imgH) {
                    const sliceH = Math.min(pageH - curY - marginB, imgH - yInImg);
                    // Render only the visible slice by offsetting the image upward
                    pdf.addImage(imgData, 'JPEG', 0, curY - yInImg, pageW, imgH);
                    yInImg += sliceH;
                    curY   += sliceH;
                    if (yInImg < imgH) { pdf.addPage(); curY = marginT; }
                }
            } else {
                pdf.addImage(imgData, 'JPEG', 0, curY, pageW, imgH);
                curY += imgH + 2;
            }
        }

        // Page numbers + doc number on every page
        const totalPages = pdf.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            pdf.setPage(p);
            pdf.setFontSize(8); pdf.setTextColor(148, 163, 184);
            pdf.text(`หน้า ${p} / ${totalPages}`, pageW - 14, pageH - 5, { align: 'right' });
            pdf.text(docNo, 14, pageH - 5);
            if (p < totalPages) {
                // light separator line
                pdf.setDrawColor(226, 232, 240);
                pdf.line(14, pageH - 8, pageW - 14, pageH - 8);
            }
        }

        pdf.save(`patrol_issues_${now.toISOString().slice(0,10)}.pdf`);
        showToast(`ส่งออก PDF สำเร็จ (${filtered.length} ประเด็น)`, 'success');
    } catch (err) {
        console.error('PDF error:', err);
        showToast('ส่งออก PDF ไม่สำเร็จ', 'error');
    } finally {
        if (document.body.contains(elOuter)) document.body.removeChild(elOuter);
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

// ─── Patrol Rank & Stop Summary (Issues Tab) ─────────────────────────────────
function renderRankStopSummary() {
    const el = document.getElementById('patrol-rank-stop-summary');
    if (!el) return;

    // Count from context pool (dept/unit/status/search filtered) but NOT rank/stop
    // so cards show counts matching the table context, and clicking further filters
    const savedRank = _filterRank; const savedStop = _filterStop;
    _filterRank = ''; _filterStop = 0;
    const contextPool = getFilteredIssues(_allIssues, _activeFilter);
    _filterRank = savedRank; _filterStop = savedStop;

    // Count Rank from context pool (respects dept/unit/status/search filters)
    const byRank = { A: 0, B: 0, C: 0 };
    contextPool.forEach(i => { if (byRank[i.Rank] !== undefined) byRank[i.Rank]++; });

    // Count StopType from context pool
    const byStop = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    contextPool.forEach(i => {
        const m = (i.HazardType || '').match(/STOP\s*(\d)/i);
        if (m) { const n = parseInt(m[1]); if (byStop[n] !== undefined) byStop[n]++; }
    });

    const total = contextPool.length;
    const hasContextFilter = !!(_filterDept || _filterUnit || _activeFilter !== 'all' || _searchQuery);
    const contextLabel = _filterDept || _filterUnit
        ? `เฉพาะ: ${_filterDept || _filterUnit}`
        : _activeFilter !== 'all'
            ? ({ open:'รอแก้ไข', temp:'แก้ชั่วคราว', closed:'เสร็จสิ้น', high:'Rank A', overdue:'เกินกำหนด' }[_activeFilter] || '')
            : '';

    el.innerHTML = `
    <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background:linear-gradient(135deg,#dc2626,#9f1239)">
            <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <span class="text-sm font-bold text-slate-700">สถิติปัญหาจากการตรวจ</span>
          ${hasContextFilter && contextLabel ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold border border-indigo-100">${contextLabel}</span>` : ''}
        </div>
        <div class="flex items-center gap-2">
          ${(_filterRank || _filterStop) ? `<button onclick="window._issueClearRankStop()" class="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1">
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
          <div class="grid grid-cols-3 gap-2">
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
              const isActive = _filterStop === s.id;
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

// ─── Area Stats (Issues Tab) ──────────────────────────────────────────────────
function renderAreaStats() {
    const tbody = document.getElementById('dashboard-section-body');
    if (!tbody) return;

    const allAreaNames = _patrolAreas.map(a => a.Name || a.AreaName).filter(Boolean);
    if (!allAreaNames.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-xs text-slate-300">ยังไม่มีพื้นที่ใน Master Data</td></tr>`;
        return;
    }

    const toShow = _areaStatSel ? allAreaNames.filter(n => _areaStatSel.includes(n)) : allAreaNames;
    if (!toShow.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-xs text-slate-300">ไม่มีข้อมูล — กด ⚙ เพื่อตั้งค่า</td></tr>`;
        _updateAreaBadge(); return;
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
        const raw = issue.ResponsibleDept || '';
        let depts = [];
        try { depts = raw.startsWith('[') ? JSON.parse(raw) : raw ? [raw] : []; } catch { depts = raw ? [raw] : []; }
        depts.forEach(d => {
            if (deptMap[d] !== undefined) {
                deptMap[d].found++;
                if (issue.CurrentStatus === 'Closed') deptMap[d].achieved++;
                else                                   deptMap[d].onProcess++;
            }
        });
        const u = issue.ResponsibleUnit || '';
        if (unitMap[u] !== undefined) {
            unitMap[u].found++;
            if (issue.CurrentStatus === 'Closed') unitMap[u].achieved++;
            else                                   unitMap[u].onProcess++;
        }
    });

    const rows = [];
    const shownUnitNames = new Set();

    for (const dept of deptNames) {
        const r = deptMap[dept];
        const pct = r.found > 0 ? Math.round((r.achieved / r.found) * 100) : null;
        const pctColor = pct === null ? 'text-slate-300' : pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-orange-500' : 'text-red-500';
        const isActive = _filterDept === dept;
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
                    const uActive = _filterUnit === unit.name;
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
        const orphans = selectedUnitNames.filter(n => !shownUnitNames.has(n));
        if (orphans.length) {
            rows.push(`<tr class="bg-sky-50/60"><td colspan="5" class="px-3 py-1.5 text-[9px] font-bold text-sky-600 uppercase tracking-wide border-t border-sky-100">Safety Unit (อื่นๆ)</td></tr>`);
            for (const unitName of orphans) {
                const ur = unitMap[unitName];
                if (!ur) continue;
                const upct = ur.found > 0 ? Math.round((ur.achieved / ur.found) * 100) : null;
                const upctColor = upct === null ? 'text-slate-300' : upct >= 80 ? 'text-emerald-600' : upct >= 50 ? 'text-orange-500' : 'text-red-500';
                const uActive = _filterUnit === unitName;
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

    tbody.innerHTML = rows.length
        ? rows.join('')
        : `<tr><td colspan="5" class="text-center py-6 text-xs text-slate-300">ไม่มีข้อมูล — กด ⚙ เพื่อตั้งค่า</td></tr>`;

    // Show/hide active filter badge above table
    const badge = document.getElementById('dept-stat-filter-badge');
    const labelEl = document.getElementById('dept-stat-filter-label');
    if (badge && labelEl) {
        const rankLabel = _filterRank ? `Rank ${_filterRank}` : '';
        const stopLabel = _filterStop ? `Stop ${_filterStop}` : '';
        const activeLabel = _filterDept || _filterUnit || rankLabel || stopLabel;
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
        _saveUnitStatSelection(unitChecked.length === unitAll.length ? null : unitChecked),
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


async function loadDashboardCharts() {
    try {
        renderAreaStats();
        renderDeptStats();
        renderStopRankStats();
        initPromoCarousel();
    } catch (e) { console.error('Chart error:', e); }
}
