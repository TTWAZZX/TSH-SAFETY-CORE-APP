// public/js/pages/dashboard.js
// Cross-module KPI Dashboard — ภาพรวมทุก module (all authenticated users)
import { API } from '../api.js';
import { escHtml } from '../ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadDashboardPage() {
    const container = document.getElementById('dashboard-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    const year = new Date().getFullYear();

    container.innerHTML = buildShell(user, year);
    _loadKpis(year);
    _loadMyTargets();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell(user, year) {
    const greeting = _greeting();
    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl"
             style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="db-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="12" cy="12" r="1.3" fill="white"/>
                </pattern></defs><rect width="100%" height="100%" fill="url(#db-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                        <p class="text-sm font-medium mb-1" style="color:rgba(167,243,208,0.85)">${greeting}</p>
                        <h1 class="text-2xl font-bold text-white">${escHtml(user.name || '—')}</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.75)">
                            ${escHtml(user.department || '')}
                            ${user.department && user.role ? ' · ' : ''}
                            ${escHtml(user.role || '')} · ${year}
                        </p>
                    </div>
                    <!-- Hero stats strip -->
                    <div id="db-hero-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto flex-shrink-0">
                        ${[1,2,3,4].map(() => `
                        <div class="rounded-xl px-4 py-3 text-center animate-pulse"
                             style="background:rgba(255,255,255,0.12);min-width:80px">
                            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
                            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ MODULE KPI CARDS ═══ -->
        <div>
            <h2 class="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style="background:linear-gradient(135deg,#059669,#0d9488)">
                    <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                </span>
                ภาพรวมระบบ ${year}
            </h2>
            <div id="db-module-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${_skeletonCards(8)}
            </div>
        </div>

        <!-- ═══ MY ACTIVITY TARGETS ═══ -->
        <div>
            <h2 class="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style="background:linear-gradient(135deg,#0284c7,#0891b2)">
                    <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                    </svg>
                </span>
                เป้าหมายกิจกรรมส่วนตัว ${year}
            </h2>
            <div id="db-my-targets">
                <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                    <div class="flex flex-col items-center py-6 text-slate-400">
                        <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mb-3"></div>
                        <p class="text-sm">กำลังโหลด...</p>
                    </div>
                </div>
            </div>
        </div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD MODULE KPIs
// ─────────────────────────────────────────────────────────────────────────────
async function _loadKpis(year) {
    try {
        const res = await API.get('/dashboard/overview');
        const d   = res?.data;
        if (!d) return;

        _renderHeroStats(d);
        _renderModuleCards(d);
    } catch {
        document.getElementById('db-hero-stats').innerHTML = '';
        document.getElementById('db-module-cards').innerHTML = `
            <div class="col-span-full text-center py-8 text-slate-400 text-sm">ไม่สามารถโหลดข้อมูลได้</div>`;
    }
}

function _renderHeroStats(d) {
    const strip = document.getElementById('db-hero-stats');
    if (!strip) return;

    const hiyariAlert = d.hiyari?.open > 0;
    const accAlert    = d.accident?.recordable > 0;

    const stats = [
        { value: d.patrol?.attended   ?? '—', label: 'การเดินตรวจ',    color: '#6ee7b7' },
        { value: d.hiyari?.open       ?? '—', label: 'Hiyari ค้างอยู่', color: hiyariAlert ? '#fca5a5' : '#6ee7b7' },
        { value: d.cccf?.workerYear   ?? '—', label: 'CCCF Worker',     color: '#6ee7b7' },
        { value: d.training?.passRate != null ? d.training.passRate + '%' : '—', label: 'อบรมผ่านเกณฑ์', color: (d.training?.passRate ?? 0) >= 80 ? '#6ee7b7' : '#fde68a' },
    ];

    strip.innerHTML = stats.map(s => `
        <div class="rounded-xl px-4 py-3 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
            <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
        </div>`).join('');
}

function _renderModuleCards(d) {
    const wrap = document.getElementById('db-module-cards');
    if (!wrap) return;

    const modules = [
        {
            hash: 'patrol',
            label: 'Safety Patrol',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>`,
            grad: 'linear-gradient(135deg,#059669,#0d9488)',
            shadow: 'rgba(5,150,105,0.3)',
            primary: d.patrol?.attended ?? '—',
            primaryLabel: 'การเข้าร่วมปีนี้',
            secondary: d.patrol?.openIssues > 0
                ? `<span class="text-amber-600 font-semibold">${d.patrol.openIssues} ประเด็นค้าง</span>`
                : `<span class="text-emerald-600">ไม่มีประเด็นค้าง</span>`,
            pct: d.patrol?.rate,
        },
        {
            hash: 'hiyari',
            label: 'Hiyari Near-Miss',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`,
            grad: 'linear-gradient(135deg,#f97316,#ef4444)',
            shadow: 'rgba(249,115,22,0.3)',
            primary: d.hiyari?.year ?? '—',
            primaryLabel: `รายงานปี ${d.year}`,
            secondary: d.hiyari?.open > 0
                ? `<span class="text-red-600 font-semibold">${d.hiyari.open} รอดำเนินการ</span>`
                : `<span class="text-emerald-600">ดำเนินการครบแล้ว</span>`,
            alert: d.hiyari?.open > 0,
        },
        {
            hash: 'ky',
            label: 'KY Activity',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>`,
            grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            shadow: 'rgba(99,102,241,0.3)',
            primary: d.ky?.year ?? '—',
            primaryLabel: `กิจกรรมปี ${d.year}`,
            secondary: `<span class="text-slate-500">ทำนายอันตราย (Kiken Yochi)</span>`,
        },
        {
            hash: 'cccf',
            label: 'CCCF Activity',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>`,
            grad: 'linear-gradient(135deg,#059669,#0d9488)',
            shadow: 'rgba(5,150,105,0.3)',
            primary: d.cccf?.workerYear ?? '—',
            primaryLabel: 'CCCF Worker ปีนี้',
            secondary: d.cccf?.permPct != null
                ? `<span class="${d.cccf.permPct >= 80 ? 'text-emerald-600' : 'text-amber-600'} font-semibold">Permanent ${d.cccf.permPct}%</span>`
                : `<span class="text-slate-400">ยังไม่มีข้อมูล</span>`,
            pct: d.cccf?.permPct,
        },
        {
            hash: 'yokoten',
            label: 'Yokoten',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>`,
            grad: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
            shadow: 'rgba(14,165,233,0.3)',
            primary: d.yokoten?.responded ?? '—',
            primaryLabel: 'แผนกตอบกลับแล้ว',
            secondary: d.yokoten?.pct != null
                ? `<span class="${d.yokoten.pct >= 80 ? 'text-emerald-600' : 'text-amber-600'} font-semibold">${d.yokoten.pct}% ของ ${d.yokoten.topics} หัวข้อ</span>`
                : `<span class="text-slate-400">ยังไม่มีหัวข้อ</span>`,
            pct: d.yokoten?.pct,
        },
        {
            hash: 'training',
            label: 'Safety Training',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>`,
            grad: 'linear-gradient(135deg,#0284c7,#0891b2)',
            shadow: 'rgba(2,132,199,0.3)',
            primary: d.training?.passRate != null ? d.training.passRate + '%' : '—',
            primaryLabel: 'Pass Rate ปีนี้',
            secondary: d.training?.totalEmp
                ? `<span class="text-slate-600">${d.training.passed}/${d.training.totalEmp} คน</span>`
                : `<span class="text-slate-400">ยังไม่มีข้อมูล</span>`,
            pct: d.training?.passRate,
        },
        {
            hash: 'accident',
            label: 'รายงานอุบัติเหตุ',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>`,
            grad: 'linear-gradient(135deg,#dc2626,#9f1239)',
            shadow: 'rgba(220,38,38,0.3)',
            primary: d.accident?.year ?? '—',
            primaryLabel: `รายงานปี ${d.year}`,
            secondary: d.accident?.recordable === 0
                ? `<span class="text-emerald-600 font-bold">Zero Recordable</span>`
                : d.accident?.recordable > 0
                    ? `<span class="text-red-600 font-semibold">${d.accident.recordable} Recordable</span>`
                    : `<span class="text-slate-400">—</span>`,
            alert: d.accident?.recordable > 0,
        },
        {
            hash: 'fourm',
            label: '4M Change',
            icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>`,
            grad: 'linear-gradient(135deg,#6366f1,#0284c7)',
            shadow: 'rgba(99,102,241,0.3)',
            primary: d.fourm?.open ?? '—',
            primaryLabel: 'Change Notice ค้างอยู่',
            secondary: d.fourm?.open === 0
                ? `<span class="text-emerald-600">ไม่มีรายการค้าง</span>`
                : `<span class="text-amber-600 font-semibold">รอดำเนินการ ${d.fourm?.open} รายการ</span>`,
            alert: d.fourm?.open > 0,
        },
    ];

    wrap.innerHTML = modules.map(m => {
        const hasPct  = m.pct != null;
        const pctBar  = hasPct ? `
            <div class="mt-3">
                <div class="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>ความคืบหน้า</span><span>${m.pct}%</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700"
                         style="width:${m.pct}%;background:${m.pct>=80?'#10b981':m.pct>=50?'#f59e0b':'#ef4444'}"></div>
                </div>
            </div>` : '';

        return `
        <a href="#${m.hash}"
           class="bg-white rounded-xl border ${m.alert ? 'border-red-200' : 'border-slate-100'}
                  shadow-sm p-5 hover:shadow-md transition-all group cursor-pointer
                  ${m.alert ? 'ring-1 ring-red-200' : ''}">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:${m.grad};box-shadow:0 2px 10px ${m.shadow}">
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        ${m.icon}
                    </svg>
                </div>
                <svg class="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors mt-1"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </div>
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">${m.label}</p>
            <p class="text-3xl font-bold text-slate-800 leading-none">${m.primary}</p>
            <p class="text-xs text-slate-500 mt-1">${m.primaryLabel}</p>
            <div class="mt-2 text-xs">${m.secondary}</div>
            ${pctBar}
        </a>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// MY ACTIVITY TARGETS
// ─────────────────────────────────────────────────────────────────────────────
async function _loadMyTargets() {
    const wrap = document.getElementById('db-my-targets');
    if (!wrap) return;

    try {
        const res = await API.get('/activity-targets/me');
        const targets = res?.data?.targets ?? [];
        const year    = res?.data?.year ?? new Date().getFullYear();

        if (!targets.length) {
            wrap.innerHTML = `
                <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                    <div class="text-center py-8 text-slate-400">
                        <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                            <svg class="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138z"/>
                            </svg>
                        </div>
                        <p class="font-medium text-slate-500">ยังไม่มีเป้าหมายกิจกรรม</p>
                        <p class="text-sm mt-1">ติดต่อ Admin เพื่อตั้งเป้าหมายของคุณ</p>
                    </div>
                </div>`;
            return;
        }

        const passed  = targets.filter(t => t.passed === true).length;
        const total   = targets.length;
        const overallPct = total ? Math.round(passed / total * 100) : 0;

        wrap.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <!-- summary bar -->
                <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100"
                     style="background:linear-gradient(135deg,rgba(5,150,105,0.05),rgba(13,148,136,0.04))">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl font-bold text-slate-800">${passed}<span class="text-base font-normal text-slate-400">/${total}</span></div>
                        <div>
                            <p class="text-xs font-semibold text-slate-600">กิจกรรมที่ผ่านเกณฑ์</p>
                            <p class="text-[11px] text-slate-400">ปี ${year}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-bold ${overallPct >= 80 ? 'text-emerald-600' : overallPct >= 50 ? 'text-amber-500' : 'text-red-500'}">${overallPct}%</p>
                        <p class="text-[11px] text-slate-400">ภาพรวม</p>
                    </div>
                </div>
                <!-- activity rows -->
                <div class="divide-y divide-slate-50">
                    ${targets.map(t => {
                        const pct    = t.completionPct ?? 0;
                        const passed = t.passed === true;
                        const barBg  = passed ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                        const badge  = passed
                            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                   <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>ผ่าน
                               </span>`
                            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                                   <span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>ยังไม่ผ่าน
                               </span>`;
                        return `
                        <div class="px-5 py-3 flex items-center gap-4">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between mb-1 gap-2">
                                    <p class="text-sm font-medium text-slate-700 truncate">${escHtml(t.label)}</p>
                                    ${badge}
                                </div>
                                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full transition-all duration-700"
                                         style="width:${pct}%;background:${barBg}"></div>
                                </div>
                            </div>
                            <div class="text-right flex-shrink-0 w-16">
                                <p class="text-sm font-bold text-slate-700">${t.actualCount ?? 0}<span class="text-slate-400 font-normal">/${t.yearlyTarget}</span></p>
                                <p class="text-[10px] text-slate-400">${pct}%</p>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    } catch {
        wrap.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5 text-center text-slate-400 text-sm">
                ไม่สามารถโหลดเป้าหมายส่วนตัวได้
            </div>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'สวัสดีตอนเช้า';
    if (h < 17) return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
}

function _skeletonCards(n) {
    return Array(n).fill(0).map(() => `
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-5 animate-pulse">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-xl bg-slate-100"></div>
                <div class="w-4 h-4 rounded bg-slate-100 mt-1"></div>
            </div>
            <div class="h-3 bg-slate-100 rounded w-20 mb-2"></div>
            <div class="h-8 bg-slate-100 rounded w-14 mb-2"></div>
            <div class="h-3 bg-slate-100 rounded w-28"></div>
        </div>`).join('');
}
