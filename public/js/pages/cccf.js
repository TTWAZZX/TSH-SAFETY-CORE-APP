import { API } from '../api.js';
import { showLoading, hideLoading, showError, showToast, openModal, closeModal, showConfirmationModal } from '../ui.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const userStr = localStorage.getItem('currentUser');
const currentUser = userStr ? JSON.parse(userStr) : { name: '', id: '', team: '', role: 'User' };
const isAdmin = !!(
    currentUser.role?.toLowerCase() === 'admin' ||
    currentUser.Role?.toLowerCase() === 'admin'
);

// ─── Static Data ──────────────────────────────────────────────────────────────
const STOP_TYPES = [
    { id: 1, code: 'Stop 1', label: 'อันตรายจากเครื่องจักร',           en: 'Machine hazard',                   color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 2, code: 'Stop 2', label: 'อันตรายจากวัตถุหนักตกใส่',        en: 'Hazard of heavy objects falling',  color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: 'M19 14l-7 7m0 0l-7-7m7 7V3' },
    { id: 3, code: 'Stop 3', label: 'อันตรายจากยานพาหนะ',              en: 'Vehicle hazard',                   color: '#eab308', bg: '#fefce8', border: '#fef08a', icon: 'M8 17h8m-4-4v4M12 3L4 9v12h16V9l-8-6z' },
    { id: 4, code: 'Stop 4', label: 'อันตรายจากการตกจากที่สูง',        en: 'Hazard of falling from a height',  color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
    { id: 5, code: 'Stop 5', label: 'อันตรายจากไฟฟ้า',                 en: 'Electrical hazard',                color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 6, code: 'Stop 6', label: 'อันตรายอื่นๆ',                    en: 'Other hazard',                     color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
];

const RANKS = [
    { rank: 'A', label: 'Rank A', desc: 'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail: '7 วัน', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { rank: 'B', label: 'Rank B', desc: 'บาดเจ็บหยุดงาน',                  detail: '15 วัน', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { rank: 'C', label: 'Rank C', desc: 'บาดเจ็บเล็กน้อย ไม่หยุดงาน',     detail: '30 วัน', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
];

const BODY_PARTS = ['ศีรษะ/หน้า','ตา','คอ','ไหล่','แขน','มือ/นิ้ว','ลำตัว/หลัง','ขา','เท้า/นิ้วเท้า','อื่นๆ'];

// ─── State ────────────────────────────────────────────────────────────────────
let _workerData    = [];
let _permanentData = [];
let _departments   = [];
let _assignments   = []; // permanent form assignments (admin sets)
let _activeTab     = 'worker'; // tracked by _cccfSwitchTab

// ─── Main Loader ─────────────────────────────────────────────────────────────
export async function loadCccfPage() {
    const container = document.getElementById('cccf-page');
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <span class="text-sm">กำลังโหลดข้อมูล CCCF...</span>
        </div>`;

    try {
        const [workerRes, permanentRes, deptRes] = await Promise.all([
            API.get('/cccf/form-a-worker').catch(() => []),
            API.get('/cccf/form-a-permanent').catch(() => []),
            API.get('/master/departments').catch(() => ({ data: [] })),
        ]);

        _workerData    = Array.isArray(workerRes)    ? workerRes    : workerRes?.data    ?? [];
        _permanentData = Array.isArray(permanentRes) ? permanentRes : permanentRes?.data ?? [];
        _departments   = Array.isArray(deptRes)      ? deptRes      : deptRes?.data      ?? [];

        // get assignments (for permanent tab)
        const assignRes = await API.get('/cccf/assignments').catch(() => []);
        _assignments = Array.isArray(assignRes) ? assignRes : assignRes?.data ?? [];

        renderPage(container);
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="p-6 text-center text-red-500 text-sm">${err.message}</div>`;
    }
}

// ─── Main Render ──────────────────────────────────────────────────────────────
function renderPage(container) {
    const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Worker stats
    const totalWorker = _workerData.length;
    const byRank = { A: 0, B: 0, C: 0 };
    _workerData.forEach(r => { if (byRank[r.Rank] !== undefined) byRank[r.Rank]++; });

    // Dept breakdown
    const deptMap = {};
    _workerData.forEach(r => {
        const d = r.Department || 'ไม่ระบุ';
        deptMap[d] = (deptMap[d] || 0) + 1;
    });
    const deptEntries = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);

    // Permanent stats
    const totalAssigned   = _assignments.length;
    const totalSubmitted  = _permanentData.length;
    const submitPct = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 0;

    container.innerHTML = `
    <div class="animate-fade-in pb-20">

      <!-- ═══ HERO ═══ -->
      <div class="relative overflow-hidden rounded-2xl mb-6" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
        <div class="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><defs><pattern id="cccf-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#cccf-dots)"/></svg>
        </div>
        <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>
        <div class="relative z-10 p-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  CCCF Activity
                </span>
              </div>
              <h1 class="text-2xl font-bold text-white">ค้นหาอันตราย & ปรับปรุงสภาพแวดล้อม</h1>
              <p class="text-sm mt-1" style="color:rgba(167,243,208,0.8)">Concern, Care, Continuous Find & Fix</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-xs" style="color:rgba(167,243,208,0.7)">${today}</p>
              <p class="text-sm font-semibold text-white mt-0.5">${currentUser.name || '—'}</p>
            </div>
          </div>

          <!-- Stats strip -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold text-white">${totalWorker}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">รายงานทั้งหมด</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:#fca5a5">${byRank.A}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Rank A (วิกฤต)</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:#fdba74">${byRank.B}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Rank B (หยุดงาน)</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:#6ee7b7">${byRank.C}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">Rank C (เล็กน้อย)</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ TABS ═══ -->
      <div class="bg-slate-100 p-1 rounded-xl flex gap-1 max-w-md mb-6">
        <button id="btn-tab-worker" onclick="window._cccfSwitchTab('worker')"
          class="flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm flex justify-center items-center gap-2 transition-all"
          style="background:linear-gradient(135deg,#059669,#0d9488)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          Form A Worker
        </button>
        <button id="btn-tab-permanent" onclick="window._cccfSwitchTab('permanent')"
          class="flex-1 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-xl transition-all flex justify-center items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Form A Permanent
          ${submitPct < 100 && totalAssigned > 0 ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white bg-amber-500">${totalAssigned - totalSubmitted}</span>` : ''}
        </button>
      </div>

      <!-- ═══ WORKER TAB ═══ -->
      <div id="content-worker" class="space-y-5 animate-fade-in">

        <!-- Action bar -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 class="text-base font-bold text-slate-800">CCCF Form A — Worker</h2>
            <p class="text-sm text-slate-400">การค้นหาอันตรายจากผู้ปฏิบัติงาน (Hazard Identification by Worker)</p>
          </div>
          <button id="btn-open-worker-form"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all flex-shrink-0"
            style="background:linear-gradient(135deg,#059669,#0d9488)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            ส่งแบบฟอร์ม CCCF
          </button>
        </div>

        <!-- Rank criteria cards -->
        <div class="grid grid-cols-3 gap-3">
          ${RANKS.map(r => `
          <div class="rounded-xl p-4 border-2 flex items-start gap-3" style="background:${r.bg};border-color:${r.border}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 text-white" style="background:${r.color}">${r.rank}</div>
            <div class="min-w-0">
              <p class="font-bold text-sm" style="color:${r.color}">${r.label}</p>
              <p class="text-xs text-slate-600 mt-0.5 leading-snug">${r.desc}</p>
              <p class="text-[10px] font-bold mt-1.5 px-2 py-0.5 rounded-full inline-block" style="background:${r.color}20;color:${r.color}">ระยะเวลา ${r.detail}</p>
            </div>
          </div>`).join('')}
        </div>

        <!-- Stop Types overview -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 class="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background:#ecfdf5">
              <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
            </div>
            อันตราย 6 ประการ (Stop 1–6)
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            ${STOP_TYPES.map(s => {
                const count = _workerData.filter(r => r.StopType == s.id).length;
                return `<div class="flex items-center gap-3 p-3 rounded-xl border" style="background:${s.bg};border-color:${s.border}">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${s.color}20">
                    <svg class="w-4 h-4" style="color:${s.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}"/></svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[10px] font-bold" style="color:${s.color}">${s.code}</p>
                    <p class="text-xs font-semibold text-slate-700 leading-snug truncate">${s.label}</p>
                  </div>
                  <span class="text-lg font-black flex-shrink-0" style="color:${s.color}">${count}</span>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Two-column: dept summary + submission list -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

          <!-- Dept summary -->
          <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 class="text-sm font-bold text-slate-700 mb-4">สรุปรายส่วนงาน</h3>
            ${deptEntries.length > 0 ? `
            <div class="space-y-2.5">
              ${deptEntries.map(([dept, count]) => {
                const pct = totalWorker > 0 ? Math.round((count / totalWorker) * 100) : 0;
                return `<div>
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold text-slate-600 truncate">${dept}</span>
                    <span class="text-xs font-bold text-slate-400 ml-2 flex-shrink-0">${count} รายการ</span>
                  </div>
                  <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:linear-gradient(90deg,#059669,#0d9488)"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>` : `<div class="text-center py-6 text-slate-400 text-xs">ยังไม่มีข้อมูล</div>`}
          </div>

          <!-- Submission list -->
          <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 class="text-sm font-bold text-slate-700">รายการที่ส่งแล้ว</h3>
              <span class="text-xs text-slate-400">ทั้งหมด ${totalWorker} รายการ</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase">ชื่อ / ส่วนงาน</th>
                    <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase">ประเภทอันตราย</th>
                    <th class="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase">Rank</th>
                    <th class="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase">วันที่</th>
                    ${isAdmin ? `<th class="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase">จัดการ</th>` : ''}
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50" id="worker-table-body">
                  ${renderWorkerRows(_workerData)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ PERMANENT TAB ═══ -->
      <div id="content-permanent" class="hidden space-y-5 animate-fade-in">

        <!-- Action bar -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 class="text-base font-bold text-slate-800">CCCF Form A — Permanent</h2>
            <p class="text-sm text-slate-400">การส่งผลการดำเนินการถาวร (Permanent Improvement Submission)</p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            ${isAdmin ? `
            <button id="btn-manage-assignments"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              จัดการการมอบหมาย
            </button>` : ''}
            <button id="btn-open-permanent-form"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all"
              style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              ส่งแบบฟอร์ม
            </button>
          </div>
        </div>

        <!-- Overall progress -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div class="flex items-center gap-4">
            <div class="flex-shrink-0 relative w-16 h-16">
              <svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" stroke-width="7"/>
                <circle cx="32" cy="32" r="26" fill="none"
                  stroke="${submitPct >= 100 ? '#10b981' : submitPct >= 50 ? '#f59e0b' : '#ef4444'}"
                  stroke-width="7" stroke-linecap="round"
                  stroke-dasharray="${(2*Math.PI*26).toFixed(1)}"
                  stroke-dashoffset="${((1-submitPct/100)*2*Math.PI*26).toFixed(1)}"
                  style="transition:stroke-dashoffset 1s ease"/>
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-xs font-bold text-slate-700">${submitPct}%</span>
              </div>
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-bold text-slate-700">ความคืบหน้าการส่งแบบฟอร์ม</span>
                <span class="text-xs text-slate-400">${totalSubmitted} / ${totalAssigned} หน่วยงาน</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
                <div class="h-full rounded-full transition-all duration-700"
                  style="width:${submitPct}%;background:${submitPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : submitPct >= 50 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)' : 'linear-gradient(90deg,#ef4444,#f87171)'}"></div>
              </div>
              <div class="flex gap-4 text-xs text-slate-500">
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>ส่งแล้ว ${totalSubmitted}</span>
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>ยังไม่ส่ง ${Math.max(0, totalAssigned - totalSubmitted)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Department progress grid -->
        <div id="permanent-dept-grid">
          ${renderPermanentDeptGrid()}
        </div>

        <!-- Submission list -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 class="text-sm font-bold text-slate-700">รายการที่ส่งแล้ว (Permanent)</h3>
            <span class="text-xs text-slate-400">${totalSubmitted} รายการ</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase">ชื่อ / ส่วนงาน</th>
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase">ชื่องาน / พื้นที่</th>
                  <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase">ไฟล์</th>
                  <th class="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase">วันที่ส่ง</th>
                  ${isAdmin ? `<th class="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase">จัดการ</th>` : ''}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50" id="permanent-table-body">
                ${renderPermanentRows(_permanentData)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

    // Tab switcher
    window._cccfSwitchTab = (tab) => {
        _activeTab = tab;
        ['worker', 'permanent'].forEach(t => {
            const btn = document.getElementById(`btn-tab-${t}`);
            const content = document.getElementById(`content-${t}`);
            const isActive = t === tab;
            if (btn) {
                btn.className = `flex-1 py-2.5 text-sm font-bold ${isActive ? 'text-white rounded-xl shadow-sm' : 'font-medium text-slate-500 hover:bg-slate-50 rounded-xl'} flex justify-center items-center gap-2 transition-all`;
                btn.style.background = isActive ? 'linear-gradient(135deg,#059669,#0d9488)' : '';
            }
            if (content) { content.classList.toggle('hidden', !isActive); if (isActive) content.classList.add('animate-fade-in'); }
        });
    };

    // Buttons
    document.getElementById('btn-open-worker-form')?.addEventListener('click', openWorkerForm);
    document.getElementById('btn-open-permanent-form')?.addEventListener('click', openPermanentForm);
    document.getElementById('btn-manage-assignments')?.addEventListener('click', openAssignmentManager);
}

// ─── Worker Table Rows ────────────────────────────────────────────────────────
function renderWorkerRows(data) {
    if (!data.length) return `<tr><td colspan="${isAdmin ? 5 : 4}" class="text-center py-10 text-sm text-slate-400">ยังไม่มีข้อมูล</td></tr>`;
    return data.map(r => {
        const rank = RANKS.find(x => x.rank === r.Rank) || RANKS[2];
        const stop = STOP_TYPES.find(x => x.id == r.StopType) || STOP_TYPES[5];
        const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        return `<tr class="hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3">
            <p class="font-semibold text-slate-800 text-xs">${r.EmployeeName || '—'}</p>
            <p class="text-[10px] text-slate-400">${r.Department || '—'}</p>
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-1.5">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border" style="background:${stop.bg};color:${stop.color};border-color:${stop.border}">${stop.code}</span>
            </div>
            <p class="text-[10px] text-slate-500 mt-0.5 truncate max-w-[160px]">${r.JobArea || '—'}</p>
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black text-white" style="background:${rank.color}">${rank.rank}</span>
          </td>
          <td class="px-4 py-3 text-center text-[10px] text-slate-400">${dateStr}</td>
          ${isAdmin ? `<td class="px-4 py-3 text-right">
            <button data-id="${r.id}" class="btn-delete-worker p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>` : ''}
        </tr>`;
    }).join('');
}

// ─── Permanent Table Rows ────────────────────────────────────────────────────
function renderPermanentRows(data) {
    if (!data.length) return `<tr><td colspan="${isAdmin ? 5 : 4}" class="text-center py-10 text-sm text-slate-400">ยังไม่มีข้อมูล</td></tr>`;
    return data.map(r => {
        const dateStr = r.SubmitDate ? new Date(r.SubmitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        return `<tr class="hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3">
            <p class="font-semibold text-slate-800 text-xs">${r.SubmitterName || '—'}</p>
            <p class="text-[10px] text-slate-400">${r.Department || '—'}</p>
          </td>
          <td class="px-4 py-3 text-xs text-slate-600">${r.JobArea || '—'}</td>
          <td class="px-4 py-3">
            ${r.FileUrl ? `<a href="${r.FileUrl}" target="_blank" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              ดูไฟล์
            </a>` : `<span class="text-[10px] text-slate-300">ไม่มีไฟล์</span>`}
          </td>
          <td class="px-4 py-3 text-center text-[10px] text-slate-400">${dateStr}</td>
          ${isAdmin ? `<td class="px-4 py-3 text-right">
            <button data-id="${r.id}" class="btn-delete-permanent p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>` : ''}
        </tr>`;
    }).join('');
}

// ─── Permanent Dept Grid ─────────────────────────────────────────────────────
function renderPermanentDeptGrid() {
    if (!_assignments.length) {
        return `<div class="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400 text-sm">
            ${isAdmin ? 'คลิก "จัดการการมอบหมาย" เพื่อกำหนดส่วนงานที่ต้องส่ง' : 'ยังไม่มีการมอบหมายจาก Admin'}
        </div>`;
    }
    return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        ${_assignments.map(a => {
            const submitted = _permanentData.filter(p => p.Department === a.Department && p.AssigneeID === a.AssigneeID);
            const isDone = submitted.length > 0;
            return `<div class="bg-white rounded-xl border p-4 transition-all ${isDone ? 'border-emerald-200' : 'border-slate-200'}" style="${isDone ? 'box-shadow:0 2px 12px rgba(5,150,105,0.08)' : ''}">
              <div class="flex items-start justify-between gap-2 mb-3">
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-slate-800 text-sm truncate">${a.AssigneeName || '—'}</p>
                  <p class="text-[10px] text-slate-400 mt-0.5">${a.Department || '—'}</p>
                </div>
                <div class="flex-shrink-0">
                  ${isDone
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"><span class="w-1 h-1 rounded-full bg-emerald-500 inline-block"></span>ส่งแล้ว</span>`
                    : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100"><span class="w-1 h-1 rounded-full bg-amber-400 animate-pulse inline-block"></span>รอส่ง</span>`}
                </div>
              </div>
              ${isDone && submitted[0]?.FileUrl ? `
              <a href="${submitted[0].FileUrl}" target="_blank" class="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                ดูเอกสาร
              </a>` : `<p class="text-[10px] text-slate-400">ยังไม่มีเอกสาร</p>`}
            </div>`;
        }).join('')}
    </div>`;
}

// ─── Worker Form Modal ────────────────────────────────────────────────────────
function openWorkerForm() {
    const deptOptions = _departments.map(d => `<option value="${d.Name || d}">${d.Name || d}</option>`).join('');
    const today = new Date().toISOString().split('T')[0];

    openModal('CCCF Form A — Worker', `
      <form id="cccf-worker-form" class="space-y-5 px-1" novalidate>

        <!-- Header info box -->
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2.5 text-sm text-emerald-800">
          <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          กรอกข้อมูลการค้นหาอันตรายในพื้นที่ทำงาน เพื่อนำไปปรับปรุงความปลอดภัย
        </div>

        <!-- Section 1: ข้อมูลพนักงาน -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">1</span>
            <span class="text-xs font-bold text-slate-700">ข้อมูลพนักงาน</span>
          </div>
          <div class="p-4 grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ชื่อพนักงาน <span class="text-red-500">*</span></label>
              <input type="text" name="EmployeeName" class="form-input w-full rounded-xl text-sm" required value="${currentUser.name || ''}" placeholder="ชื่อ-นามสกุล">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">รหัสพนักงาน <span class="text-red-500">*</span></label>
              <input type="text" name="EmployeeID" class="form-input w-full rounded-xl text-sm" required value="${currentUser.id || ''}" placeholder="EMP001">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">หน่วยงาน <span class="text-red-500">*</span></label>
              <select name="Department" class="form-select w-full rounded-xl text-sm" required>
                <option value="">-- เลือกหน่วยงาน --</option>
                ${deptOptions}
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วันที่ลงข้อมูล <span class="text-red-500">*</span></label>
              <input type="date" name="SubmitDate" class="form-input w-full rounded-xl text-sm" required value="${today}">
            </div>
          </div>
        </div>

        <!-- Section 2: รายละเอียดงาน -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">2</span>
            <span class="text-xs font-bold text-slate-700">รายละเอียดงาน</span>
          </div>
          <div class="p-4 grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ชื่องาน / พื้นที่ <span class="text-red-500">*</span></label>
              <input type="text" name="JobArea" class="form-input w-full rounded-xl text-sm" required placeholder="เช่น งานเชื่อม / Line 1">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อุปกรณ์ / เครื่องจักร</label>
              <input type="text" name="Equipment" class="form-input w-full rounded-xl text-sm" placeholder="เช่น เครื่องกลึง, รถ Forklift">
            </div>
          </div>
        </div>

        <!-- Section 3: รายละเอียดอันตราย -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">3</span>
            <span class="text-xs font-bold text-slate-700">รายละเอียดอันตราย</span>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ระบุอันตรายที่เกิดขึ้น <span class="text-red-500">*</span></label>
              <textarea name="HazardDescription" rows="2" class="form-input w-full rounded-xl text-sm resize-none" required placeholder="อธิบายอันตรายที่พบ..."></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">เกิดขึ้นอย่างไร</label>
                <textarea name="HowItHappened" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="ลักษณะการเกิดอันตราย..."></textarea>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">อวัยวะที่ได้รับผลกระทบ</label>
                <select name="BodyPart" class="form-select w-full rounded-xl text-sm">
                  <option value="">-- เลือกอวัยวะ --</option>
                  ${BODY_PARTS.map(b => `<option value="${b}">${b}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ข้อเสนอในการปรับปรุง</label>
              <textarea name="Suggestion" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="แนวทางแก้ไข / ข้อเสนอแนะ..."></textarea>
            </div>
          </div>
        </div>

        <!-- Section 4: ประเภทอันตราย (Stop 1-6) -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">4</span>
            <span class="text-xs font-bold text-slate-700">ประเภทอันตราย (Stop Type) <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 grid grid-cols-2 gap-2">
            ${STOP_TYPES.map(s => `
            <label class="cursor-pointer">
              <input type="radio" name="StopType" value="${s.id}" class="peer sr-only" required>
              <div class="flex items-center gap-2.5 p-3 rounded-xl border-2 border-slate-100 hover:border-slate-200 peer-checked:border-current transition-all"
                   style="--tw-border-opacity:1">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${s.bg}">
                  <svg class="w-4 h-4" style="color:${s.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}"/></svg>
                </div>
                <div class="min-w-0">
                  <p class="text-[10px] font-bold" style="color:${s.color}">${s.code}</p>
                  <p class="text-[10px] text-slate-600 leading-snug truncate">${s.label}</p>
                </div>
              </div>
            </label>`).join('')}
          </div>
        </div>

        <!-- Section 5: Rank -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span class="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style="background:linear-gradient(135deg,#059669,#0d9488)">5</span>
            <span class="text-xs font-bold text-slate-700">ระดับความรุนแรง (Rank) <span class="text-red-500">*</span></span>
          </div>
          <div class="p-4 grid grid-cols-3 gap-2">
            ${RANKS.map(r => `
            <label class="cursor-pointer">
              <input type="radio" name="Rank" value="${r.rank}" class="peer sr-only" required>
              <div class="p-3 rounded-xl border-2 text-center border-slate-100 peer-checked:border-current hover:border-slate-200 transition-all" style="--tw-border-opacity:1">
                <div class="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-sm font-black text-white" style="background:${r.color}">${r.rank}</div>
                <p class="text-[10px] font-bold" style="color:${r.color}">${r.label}</p>
                <p class="text-[9px] text-slate-500 mt-0.5 leading-snug">${r.desc}</p>
                <p class="text-[9px] font-bold mt-1" style="color:${r.color}">${r.detail}</p>
              </div>
            </label>`).join('')}
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-worker" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:shadow-md transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">ส่งแบบฟอร์ม</button>
        </div>
      </form>`, 'max-w-2xl');

    document.getElementById('cccf-worker-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-worker');
        if (!e.target.StopType.value) { showToast('กรุณาเลือกประเภทอันตราย', 'error'); return; }
        if (!e.target.Rank.value) { showToast('กรุณาเลือกระดับความรุนแรง', 'error'); return; }
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังส่ง...';
        showLoading('กำลังบันทึก...');
        try {
            const data = Object.fromEntries(new FormData(e.target).entries());
            await API.post('/cccf/form-a-worker', data);
            closeModal();
            showToast('ส่งแบบฟอร์ม CCCF สำเร็จ', 'success');
            loadCccfPage();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'ส่งแบบฟอร์ม'; }
    });
}

// ─── Permanent Form Modal ────────────────────────────────────────────────────
function openPermanentForm() {
    const deptOptions = _departments.map(d => `<option value="${d.Name || d}">${d.Name || d}</option>`).join('');
    const today = new Date().toISOString().split('T')[0];

    openModal('CCCF Form A — Permanent (ส่งผลการดำเนินการถาวร)', `
      <form id="cccf-permanent-form" class="space-y-4 px-1">
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2.5 text-sm text-emerald-800">
          <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          หัวหน้างานขึ้นไปส่งแบบฟอร์มที่ดำเนินการเสร็จแล้ว พร้อมแนบไฟล์เอกสาร
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ชื่อผู้ส่ง <span class="text-red-500">*</span></label>
            <input type="text" name="SubmitterName" class="form-input w-full rounded-xl text-sm" required value="${currentUser.name || ''}">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หน่วยงาน <span class="text-red-500">*</span></label>
            <select name="Department" class="form-select w-full rounded-xl text-sm" required>
              <option value="">-- เลือกหน่วยงาน --</option>
              ${deptOptions}
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ชื่องาน / พื้นที่ <span class="text-red-500">*</span></label>
            <input type="text" name="JobArea" class="form-input w-full rounded-xl text-sm" required placeholder="เช่น งานปรับปรุง Line 2">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันที่ส่ง</label>
            <input type="date" name="SubmitDate" class="form-input w-full rounded-xl text-sm" value="${today}">
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">สรุปการดำเนินการ</label>
            <textarea name="Summary" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="สรุปสิ่งที่ดำเนินการแก้ไขถาวร..."></textarea>
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">แนบไฟล์เอกสาร (PDF / รูปภาพ)</label>
            <input type="file" name="FormFile" accept=".pdf,.png,.jpg,.jpeg"
              class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
            <p class="text-xs text-slate-400 mt-1">รองรับ PDF, JPG, PNG — ขนาดไม่เกิน 10 MB</p>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-permanent" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">ส่งเอกสาร</button>
        </div>
      </form>`, 'max-w-lg');

    document.getElementById('cccf-permanent-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-permanent');
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังส่ง...';
        showLoading('กำลังบันทึก...');
        try {
            const fd = new FormData(e.target);
            await API.post('/cccf/form-a-permanent', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            closeModal();
            showToast('ส่งเอกสาร CCCF Permanent สำเร็จ', 'success');
            loadCccfPage();
        } catch (err) { showError(err); }
        finally { hideLoading(); btn.disabled = false; btn.textContent = 'ส่งเอกสาร'; }
    });
}

// ─── Assignment Manager (Admin) ───────────────────────────────────────────────
async function openAssignmentManager() {
    const deptOptions = _departments.map(d => `<option value="${d.Name || d}">${d.Name || d}</option>`).join('');

    openModal('จัดการการมอบหมาย Form A Permanent', `
      <div class="space-y-4" id="assignment-manager">
        <div class="flex justify-between items-center">
          <p class="text-sm text-slate-500">กำหนดว่าส่วนงานใดต้องส่ง Form A Permanent</p>
          <span class="text-xs font-bold text-slate-400">${_assignments.length} รายการ</span>
        </div>

        <!-- Add form -->
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
          <p class="text-xs font-bold text-slate-600 uppercase tracking-wider">เพิ่มรายการใหม่</p>
          <div class="grid grid-cols-2 gap-2">
            <input type="text" id="new-assignee-name" class="form-input rounded-xl text-sm" placeholder="ชื่อหัวหน้างาน">
            <select id="new-assignee-dept" class="form-select rounded-xl text-sm">
              <option value="">-- เลือกหน่วยงาน --</option>
              ${deptOptions}
            </select>
          </div>
          <button id="btn-add-assignment" class="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all" style="background:linear-gradient(135deg,#059669,#0d9488)">
            + เพิ่มรายการ
          </button>
        </div>

        <!-- List -->
        <div class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar" id="assignment-list">
          ${_assignments.length > 0
            ? _assignments.map(a => `
              <div class="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-200 transition-all">
                <div>
                  <p class="font-semibold text-slate-800 text-sm">${a.AssigneeName}</p>
                  <p class="text-[10px] text-slate-400">${a.Department}</p>
                </div>
                <button data-id="${a.id}" class="btn-del-assignment p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>`).join('')
            : '<div class="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl">ยังไม่มีรายการ</div>'
          }
        </div>
      </div>`, 'max-w-lg');

    document.getElementById('btn-add-assignment')?.addEventListener('click', async () => {
        const name = document.getElementById('new-assignee-name').value.trim();
        const dept = document.getElementById('new-assignee-dept').value;
        if (!name || !dept) { showToast('กรุณากรอกชื่อและเลือกหน่วยงาน', 'error'); return; }
        showLoading();
        try {
            await API.post('/cccf/assignments', { AssigneeName: name, Department: dept });
            showToast('เพิ่มรายการสำเร็จ', 'success');
            const res = await API.get('/cccf/assignments').catch(() => []);
            _assignments = Array.isArray(res) ? res : res?.data ?? [];
            closeModal();
            openAssignmentManager();
            document.getElementById('permanent-dept-grid').innerHTML = renderPermanentDeptGrid();
        } catch (err) { showError(err); }
        finally { hideLoading(); }
    });

    document.getElementById('assignment-list')?.addEventListener('click', async e => {
        const btn = e.target.closest('.btn-del-assignment');
        if (!btn) return;
        const ok = await showConfirmationModal('ยืนยันการลบ', 'ลบรายการมอบหมายนี้ใช่หรือไม่?');
        if (!ok) return;
        showLoading();
        try {
            await API.delete(`/cccf/assignments/${btn.dataset.id}`);
            showToast('ลบสำเร็จ', 'success');
            const res = await API.get('/cccf/assignments').catch(() => []);
            _assignments = Array.isArray(res) ? res : res?.data ?? [];
            closeModal();
            openAssignmentManager();
        } catch (err) { showError(err); }
        finally { hideLoading(); }
    });
}
