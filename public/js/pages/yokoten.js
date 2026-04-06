// public/js/pages/yokoten.js
// Yokoten — Lesson Learned Sharing
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, closeModal, showToast, showConfirmationModal,
} from '../ui.js';
import { normalizeApiArray } from '../utils/normalize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = ['ทั่วไป', 'อุปกรณ์', 'กระบวนการ', 'สิ่งแวดล้อม', 'พฤติกรรม'];
const RISK_LEVELS = [
    { value: 'Low',      label: 'ต่ำ'      },
    { value: 'Medium',   label: 'ปานกลาง'  },
    { value: 'High',     label: 'สูง'       },
    { value: 'Critical', label: 'วิกฤต'    },
];
const RISK_BADGE = {
    Low:      'bg-emerald-100 text-emerald-700',
    Medium:   'bg-yellow-100 text-yellow-700',
    High:     'bg-orange-100 text-orange-700',
    Critical: 'bg-red-100 text-red-700',
};
const RISK_LABEL = { Low: 'ต่ำ', Medium: 'ปานกลาง', High: 'สูง', Critical: 'วิกฤต' };

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin       = false;
let _activeTab     = 'topics';
let _topics        = [];
let _history       = [];
let _filterRisk    = '';
let _filterAck     = '';
let _searchQ       = '';
let _listenersReady = false;

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export async function loadYokotenPage() {
    const container = document.getElementById('yokoten-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';
    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    _activeTab = window._getTab?.('yokoten', _activeTab) || _activeTab;
    await refreshData();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'Dashboard',        icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'topics',    label: 'หัวข้อ Yokoten',    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>` },
        { id: 'history',   label: 'ประวัติแผนก',       icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>` },
        ...(_isAdmin ? [{ id: 'admin', label: 'จัดการ', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabHtml = _getTabs().map(t => `
        <button id="yok-tab-btn-${t.id}" data-tab="${t.id}"
            class="yok-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="yok-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#yok-dots)"/></svg>
            </div>
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>
                                </svg>
                                Yokoten
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">แบ่งปันบทเรียนด้านความปลอดภัย</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Lesson Learned Sharing · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <div id="yok-hero-stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full sm:w-auto">
                            ${[1,2,3,4].map(() => `
                            <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
                                <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
                                <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
                            </div>`).join('')}
                        </div>
                        ${_isAdmin ? `
                        <button id="yok-add-btn"
                            class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all border border-white/30 bg-white/15 hover:bg-white/25 whitespace-nowrap">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            เพิ่มหัวข้อใหม่
                        </button>` : ''}
                    </div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Tab Content -->
        <div id="yok-content" class="min-h-[400px]">
            ${_spinner()}
        </div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB SWITCH
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('yokoten', tab);

    const active   = 'yok-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'yok-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';

    _getTabs().forEach(t => {
        const btn = document.getElementById(`yok-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });

    const content = document.getElementById('yok-content');
    if (!content) return;

    switch (tab) {
        case 'dashboard': renderDashboard(content);  break;
        case 'topics':    renderTopics(content);     break;
        case 'history':   renderHistory(content);    break;
        case 'admin':     renderAdmin(content);      break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────────────────────────────────────
async function refreshData() {
    showLoading('กำลังโหลด Yokoten...');
    try {
        const [topicsRes, histRes] = await Promise.all([
            API.get('/yokoten/topics'),
            API.get('/yokoten/dept-history'),
        ]);
        _topics  = normalizeApiArray(topicsRes?.data ?? topicsRes);
        _history = normalizeApiArray(histRes?.data ?? histRes);
    } catch (err) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
    _renderHeroStats();
    switchTab(_activeTab);
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
function _renderHeroStats() {
    const strip = document.getElementById('yok-hero-stats');
    if (!strip) return;
    const total   = _topics.length;
    const acked   = _topics.filter(t => t.myResponse).length;
    const pending = total - acked;
    const near    = _topics.filter(t => !t.myResponse && _isNearOrOver(t.Deadline)).length;

    const stats = [
        { value: total,   label: 'หัวข้อทั้งหมด',  color: '#6ee7b7' },
        { value: acked,   label: 'รับทราบแล้ว',    color: '#6ee7b7' },
        { value: pending, label: 'รอรับทราบ',      color: pending > 0 ? '#fde68a' : '#6ee7b7' },
        { value: near,    label: 'ใกล้/เกินกำหนด', color: near > 0   ? '#fca5a5' : '#6ee7b7' },
    ];

    strip.innerHTML = stats.map(s => `
        <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
            <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
        </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function renderDashboard(container) {
    const total   = _topics.length;
    const acked   = _topics.filter(t => t.myResponse).length;
    const pending = total - acked;
    const overdue = _topics.filter(t => !t.myResponse && _isOverdue(t.Deadline)).length;
    const near    = _topics.filter(t => !t.myResponse && _isNearDeadline(t.Deadline)).length;
    const pct     = total ? Math.round(acked * 100 / total) : 0;
    const pendingTopics = _topics.filter(t => !t.myResponse);

    const barColor = pct === 100 ? '#059669' : pct >= 60 ? '#0ea5e9' : pct >= 30 ? '#f59e0b' : '#ef4444';

    container.innerHTML = `
    <div class="space-y-5">
        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-sky-50">
                    <svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${total}</p>
                    <p class="text-xs text-slate-500">หัวข้อทั้งหมด</p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                    <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${acked}</p>
                    <p class="text-xs text-slate-500">รับทราบแล้ว</p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                    <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${pending}</p>
                    <p class="text-xs text-slate-500">รอรับทราบ</p>
                </div>
            </div>
            <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50">
                    <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${overdue + near}</p>
                    <p class="text-xs text-slate-500">ใกล้/เกินกำหนด</p>
                </div>
            </div>
        </div>

        <!-- Acknowledgment Progress -->
        <div class="card p-5">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">ความคืบหน้าการรับทราบของคุณ</h3>
                </div>
                <span class="text-xl font-black" style="color:${barColor}">${pct}%</span>
            </div>
            <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                <div class="h-full rounded-full transition-all duration-700"
                     style="width:${pct}%; background:linear-gradient(90deg,#0ea5e9,#6366f1)"></div>
            </div>
            <p class="text-xs text-slate-400">รับทราบ ${acked} จาก ${total} หัวข้อ</p>
        </div>

        <!-- Pending Topics -->
        ${pendingTopics.length > 0 ? `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">หัวข้อที่ยังไม่ได้รับทราบ (${pendingTopics.length})</h3>
                </div>
                <button class="text-xs text-sky-600 hover:underline font-medium" data-switch-tab="topics">ดูทั้งหมด</button>
            </div>
            <div class="divide-y divide-slate-100">
                ${pendingTopics.slice(0, 5).map(t => `
                <div class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-slate-800 truncate">${_esc(t.Title || t.TopicDescription)}</p>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="px-1.5 py-0.5 rounded text-xs font-medium ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                                ${RISK_LABEL[t.RiskLevel] || t.RiskLevel}
                            </span>
                            ${_deadlineBadge(t.Deadline, false)}
                        </div>
                    </div>
                    <button class="btn-yok-ack-open flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                            style="background:linear-gradient(135deg,#0ea5e9,#6366f1)"
                            data-id="${t.YokotenID}">รับทราบ</button>
                </div>`).join('')}
                ${pendingTopics.length > 5 ? `
                <div class="px-5 py-3 text-center">
                    <button class="text-xs text-sky-600 hover:underline font-medium" data-switch-tab="topics">
                        ดูอีก ${pendingTopics.length - 5} หัวข้อ
                    </button>
                </div>` : ''}
            </div>
        </div>` : `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
            </div>
            <p class="font-semibold text-emerald-700">รับทราบครบทุกหัวข้อแล้ว!</p>
            <p class="text-sm mt-1">คุณรับทราบหัวข้อ Yokoten ทั้ง ${total} หัวข้อแล้ว</p>
        </div>`}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: TOPICS
// ─────────────────────────────────────────────────────────────────────────────
function renderTopics(container) {
    let filtered = _topics;
    if (_filterRisk) filtered = filtered.filter(t => t.RiskLevel === _filterRisk);
    if (_filterAck === 'pending') filtered = filtered.filter(t => !t.myResponse);
    if (_filterAck === 'acked')   filtered = filtered.filter(t => !!t.myResponse);
    if (_searchQ.trim()) {
        const q = _searchQ.trim().toLowerCase();
        filtered = filtered.filter(t =>
            (t.Title || '').toLowerCase().includes(q) ||
            (t.TopicDescription || '').toLowerCase().includes(q)
        );
    }

    container.innerHTML = `
    <div class="space-y-4">
        <!-- Filter bar -->
        <div class="card p-4 flex flex-wrap gap-3 items-center">
            <select id="yok-filter-risk" class="form-input py-1.5 text-sm">
                <option value="">ทุกระดับความเสี่ยง</option>
                ${RISK_LEVELS.map(r => `<option value="${r.value}" ${_filterRisk === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
            <select id="yok-filter-ack" class="form-input py-1.5 text-sm">
                <option value="">ทุกสถานะ</option>
                <option value="pending" ${_filterAck === 'pending' ? 'selected' : ''}>รอรับทราบ</option>
                <option value="acked"   ${_filterAck === 'acked'   ? 'selected' : ''}>รับทราบแล้ว</option>
            </select>
            <div class="relative flex-1 min-w-[160px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input id="yok-search" type="text" placeholder="ค้นหาหัวข้อ..."
                       value="${_esc(_searchQ)}" class="form-input w-full pl-9 text-sm py-1.5">
            </div>
            <span class="text-xs text-slate-400 ml-auto">${filtered.length} หัวข้อ</span>
        </div>

        <!-- Topic cards -->
        ${filtered.length ? `<div class="space-y-4" id="yok-topic-list">${filtered.map(t => buildTopicCard(t)).join('')}</div>`
        : `<div class="text-center py-16 text-slate-400">
               <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                   <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                   </svg>
               </div>
               <p class="font-medium">ไม่มีหัวข้อที่ตรงกับเงื่อนไข</p>
           </div>`}
    </div>`;
}

function buildTopicCard(t) {
    const acked = !!t.myResponse;
    const deptCount = t.deptResponseCount || 0;

    return `
    <div class="card overflow-hidden">
        <div class="h-1 w-full" style="background:linear-gradient(90deg,${acked ? '#059669' : '#f59e0b'},${acked ? '#0d9488' : '#ef4444'})"></div>
        <div class="p-5">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                            <span class="w-1.5 h-1.5 rounded-full inline-block mr-1" style="background:currentColor"></span>
                            ${RISK_LABEL[t.RiskLevel] || t.RiskLevel}
                        </span>
                        <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${_esc(t.Category || 'ทั่วไป')}</span>
                        ${_deadlineBadge(t.Deadline, acked)}
                    </div>
                    ${t.Title ? `<h3 class="font-semibold text-slate-800 mb-1">${_esc(t.Title)}</h3>` : ''}
                    <p class="text-sm text-slate-600 leading-relaxed">${_esc(t.TopicDescription)}</p>
                    ${t.AttachmentUrl ? `
                    <a href="${t.AttachmentUrl}" target="_blank" rel="noopener noreferrer"
                       class="inline-flex items-center gap-1.5 text-xs text-sky-600 hover:underline mt-2">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                        </svg>
                        ${_esc(t.AttachmentName || 'ดูไฟล์แนบ')}
                    </a>` : ''}
                    <p class="text-xs text-slate-400 mt-2">
                        ประกาศ: ${_fmtDate(t.DateIssued)} · แผนกคุณตอบแล้ว ${deptCount} คน
                    </p>
                </div>
                <div class="flex-shrink-0">
                    ${acked
                        ? `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                               <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                               รับทราบแล้ว
                           </span>`
                        : `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                               <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                               รอรับทราบ
                           </span>`
                    }
                </div>
            </div>

            <!-- Acknowledge area -->
            ${acked ? `
            <div class="mt-4 pt-4 border-t border-slate-100">
                <div class="flex items-center gap-2 text-sm">
                    <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span class="font-semibold text-emerald-600">รับทราบแล้ว</span>
                    <span class="text-slate-400">·</span>
                    <span class="${t.myResponse.IsRelated === 'Yes' ? 'text-emerald-600 font-medium' : 'text-slate-500'}">
                        ${t.myResponse.IsRelated === 'Yes' ? 'เกี่ยวข้องกับแผนก' : 'ไม่เกี่ยวข้อง'}
                    </span>
                    <span class="text-slate-400">·</span>
                    <span class="text-slate-400 text-xs">${_fmtDate(t.myResponse.ResponseDate)}</span>
                </div>
                ${t.myResponse.Comment ? `<p class="text-sm text-slate-500 mt-1 ml-6 italic">"${_esc(t.myResponse.Comment)}"</p>` : ''}
            </div>` : `
            <div class="mt-4 pt-4 border-t border-slate-100">
                <form class="yok-ack-form space-y-3" data-id="${t.YokotenID}">
                    <p class="text-sm font-semibold text-slate-700">บันทึกการรับทราบ</p>
                    <div class="flex gap-5">
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="isRelated" value="Yes" class="accent-emerald-500"> เกี่ยวข้องกับแผนก
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="isRelated" value="No" checked class="accent-slate-400"> ไม่เกี่ยวข้อง
                        </label>
                    </div>
                    <textarea name="comment" rows="2" placeholder="ความคิดเห็น / การดำเนินการ (ถ้ามี)"
                              class="form-textarea w-full resize-none text-sm"></textarea>
                    <div class="flex justify-end">
                        <button type="submit"
                                class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
                                style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                            </svg>
                            ยืนยันการรับทราบ
                        </button>
                    </div>
                </form>
            </div>`}
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function renderHistory(container) {
    container.innerHTML = `
    <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">ประวัติการรับทราบของแผนก</h3>
            </div>
            <span class="text-xs text-slate-400">${_history.length} รายการ (100 ล่าสุด)</span>
        </div>
        ${_history.length ? `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th class="px-4 py-3">หัวข้อ</th>
                        <th class="px-4 py-3">พนักงาน</th>
                        <th class="px-4 py-3">ความเกี่ยวข้อง</th>
                        <th class="px-4 py-3">ความคิดเห็น</th>
                        <th class="px-4 py-3">วันที่</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${_history.map(r => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3 max-w-[180px]">
                            <p class="text-sm font-medium text-slate-800 truncate">${_esc(r.Title || r.TopicDescription || '-')}</p>
                            ${r.RiskLevel ? `<span class="px-1.5 py-0.5 rounded text-xs font-medium ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[r.RiskLevel] || r.RiskLevel}</span>` : ''}
                        </td>
                        <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">${_esc(r.EmployeeName || r.EmployeeID || '-')}</td>
                        <td class="px-4 py-3">
                            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${r.IsRelated === 'Yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                ${r.IsRelated === 'Yes' ? 'เกี่ยวข้อง' : 'ไม่เกี่ยวข้อง'}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">${r.Comment ? _esc(r.Comment) : '-'}</td>
                        <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${_fmtDate(r.ResponseDate)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>` : `
        <div class="text-center py-16 text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
            </div>
            <p class="font-medium">ยังไม่มีประวัติ</p>
            <p class="text-sm mt-1">ยังไม่มีการรับทราบ Yokoten ในแผนกคุณ</p>
        </div>`}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: ADMIN
// ─────────────────────────────────────────────────────────────────────────────
function renderAdmin(container) {
    container.innerHTML = `
    <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <h3 class="text-sm font-bold text-slate-700">รายการหัวข้อทั้งหมด (${_topics.length} หัวข้อ รวม inactive)</h3>
            </div>
        </div>
        ${_topics.length ? `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th class="px-4 py-3">หัวข้อ / รายละเอียด</th>
                        <th class="px-4 py-3">ความเสี่ยง</th>
                        <th class="px-4 py-3">หมวดหมู่</th>
                        <th class="px-4 py-3">ครบกำหนด</th>
                        <th class="px-4 py-3">ตอบแล้ว</th>
                        <th class="px-4 py-3">สถานะ</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${_topics.map(t => `
                    <tr class="hover:bg-slate-50 transition-colors ${!t.IsActive ? 'opacity-50' : ''}">
                        <td class="px-4 py-3 max-w-[220px]">
                            <p class="font-medium text-slate-800 truncate">${_esc(t.Title || '—')}</p>
                            <p class="text-xs text-slate-400 truncate mt-0.5">${_esc(t.TopicDescription)}</p>
                        </td>
                        <td class="px-4 py-3">
                            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[t.RiskLevel] || 'bg-slate-100 text-slate-500'}">
                                ${RISK_LABEL[t.RiskLevel] || t.RiskLevel}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-500">${_esc(t.Category || 'ทั่วไป')}</td>
                        <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${t.Deadline ? _fmtDateOnly(t.Deadline) : '-'}</td>
                        <td class="px-4 py-3 text-xs text-slate-600 font-medium">${t.deptResponseCount || 0} คน</td>
                        <td class="px-4 py-3">
                            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${t.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                ${t.IsActive ? 'ใช้งาน' : 'ปิดแล้ว'}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <div class="flex items-center gap-1 justify-end">
                                <button class="btn-yok-edit px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors"
                                        data-id="${t.YokotenID}">แก้ไข</button>
                                <button class="btn-yok-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        data-id="${t.YokotenID}" data-title="${_esc(t.Title || t.TopicDescription)}" title="ลบ">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>` : `
        <div class="text-center py-16 text-slate-400">
            <p class="font-medium">ยังไม่มีหัวข้อ Yokoten</p>
            <p class="text-sm mt-1">กดปุ่ม "เพิ่มหัวข้อใหม่" เพื่อเริ่มต้น</p>
        </div>`}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC FORM MODAL (Add / Edit)
// ─────────────────────────────────────────────────────────────────────────────
function openTopicForm(topic = null) {
    const isEdit = !!topic;
    const t = topic || {};

    const catOpts  = CATEGORIES.map(c => `<option value="${c}" ${(t.Category||'ทั่วไป') === c ? 'selected' : ''}>${c}</option>`).join('');
    const riskOpts = RISK_LEVELS.map(r => `<option value="${r.value}" ${(t.RiskLevel||'Low') === r.value ? 'selected' : ''}>${r.label}</option>`).join('');

    const html = `
    <form id="yok-topic-form" class="space-y-4">
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหัวข้อ (ย่อ)</label>
            <input id="yt-title" type="text" value="${_esc(t.Title || '')}" maxlength="200"
                   placeholder="เช่น: อุบัติเหตุเครื่องปั๊ม ไลน์ B"
                   class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด <span class="text-red-500">*</span></label>
            <textarea id="yt-desc" rows="4" required
                      placeholder="อธิบายบทเรียน / เหตุการณ์ / ความรู้ที่ต้องการแบ่งปัน"
                      class="form-textarea w-full">${_esc(t.TopicDescription || '')}</textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมวดหมู่</label>
                <select id="yt-cat" class="form-input w-full">${catOpts}</select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ระดับความเสี่ยง</label>
                <select id="yt-risk" class="form-input w-full">${riskOpts}</select>
            </div>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันครบกำหนดรับทราบ</label>
            <input id="yt-deadline" type="date" value="${t.Deadline ? t.Deadline.split('T')[0] : ''}" class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">URL ไฟล์แนบ</label>
            <input id="yt-attach" type="url" value="${_esc(t.AttachmentUrl || '')}"
                   placeholder="https://..." class="form-input w-full">
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อไฟล์แนบ</label>
            <input id="yt-attachname" type="text" value="${_esc(t.AttachmentName || '')}"
                   placeholder="เช่น: รายงานการสอบสวน.pdf" class="form-input w-full">
        </div>
        ${isEdit ? `
        <div class="flex items-center gap-3">
            <input id="yt-active" type="checkbox" ${t.IsActive ? 'checked' : ''} class="w-4 h-4 accent-emerald-500">
            <label for="yt-active" class="text-sm font-semibold text-slate-700">แสดงหัวข้อนี้ (ใช้งาน)</label>
        </div>` : ''}
        <div id="yt-error" class="text-sm text-red-500 font-medium hidden"></div>
        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" id="yt-submit" class="btn btn-primary px-5">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ'}</button>
        </div>
    </form>`;

    openModal(isEdit ? 'แก้ไขหัวข้อ Yokoten' : 'เพิ่มหัวข้อ Yokoten', html, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('yok-topic-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl  = document.getElementById('yt-error');
            const submit = document.getElementById('yt-submit');
            const desc   = document.getElementById('yt-desc').value.trim();
            if (!desc) {
                errEl.textContent = 'กรุณากรอกรายละเอียดหัวข้อ';
                errEl.classList.remove('hidden');
                return;
            }
            errEl.classList.add('hidden');
            submit.disabled = true;
            submit.textContent = 'กำลังบันทึก...';

            const payload = {
                Title:            document.getElementById('yt-title').value.trim() || null,
                TopicDescription: desc,
                Category:         document.getElementById('yt-cat').value,
                RiskLevel:        document.getElementById('yt-risk').value,
                Deadline:         document.getElementById('yt-deadline').value || null,
                AttachmentUrl:    document.getElementById('yt-attach').value.trim() || null,
                AttachmentName:   document.getElementById('yt-attachname').value.trim() || null,
            };
            if (isEdit) {
                payload.IsActive = document.getElementById('yt-active').checked ? 1 : 0;
            }

            try {
                showLoading('กำลังบันทึก...');
                if (isEdit) {
                    await API.put(`/yokoten/topics/${topic.YokotenID}`, payload);
                } else {
                    await API.post('/yokoten/topics', payload);
                }
                closeModal();
                showToast(isEdit ? 'อัปเดตหัวข้อสำเร็จ' : 'เพิ่มหัวข้อสำเร็จ', 'success');
                await refreshData();
            } catch (err) {
                errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
                errEl.classList.remove('hidden');
                submit.disabled = false;
                submit.textContent = isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ';
            } finally {
                hideLoading();
            }
        });
    }, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACKNOWLEDGE MODAL (from dashboard quick-ack button)
// ─────────────────────────────────────────────────────────────────────────────
function openAckModal(id) {
    const t = _topics.find(x => x.YokotenID === id);
    if (!t) return;

    const html = `
    <form id="yok-ack-modal-form" class="space-y-4" data-id="${id}">
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
            <p class="font-semibold text-slate-800">${_esc(t.Title || t.TopicDescription)}</p>
            ${t.TopicDescription && t.Title ? `<p class="text-slate-500 mt-1 text-xs">${_esc(t.TopicDescription)}</p>` : ''}
        </div>
        <div class="flex gap-5">
            <label class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="isRelated" value="Yes" class="accent-emerald-500"> เกี่ยวข้องกับแผนก
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="isRelated" value="No" checked class="accent-slate-400"> ไม่เกี่ยวข้อง
            </label>
        </div>
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">ความคิดเห็น (ถ้ามี)</label>
            <textarea name="comment" rows="2" class="form-textarea w-full resize-none" placeholder="ความคิดเห็น / การดำเนินการ..."></textarea>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window.closeModal&&window.closeModal()" class="btn btn-secondary px-4">ยกเลิก</button>
            <button type="submit" id="yok-ack-modal-btn"
                    class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
                    style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                ยืนยันการรับทราบ
            </button>
        </div>
    </form>`;

    openModal('รับทราบ Yokoten', html, 'max-w-md');

    setTimeout(() => {
        document.getElementById('yok-ack-modal-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _submitAck(e.target, document.getElementById('yok-ack-modal-btn'));
        });
    }, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACK SUBMIT HANDLER (shared)
// ─────────────────────────────────────────────────────────────────────────────
async function _submitAck(form, btn) {
    const yokotenId = form.dataset.id;
    const isRelated = form.querySelector('input[name="isRelated"]:checked')?.value || 'No';
    const comment   = form.querySelector('[name="comment"]')?.value || '';

    if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

    try {
        showLoading('กำลังบันทึก...');
        await API.post('/yokoten/acknowledge', { yokotenId, isRelated, comment });
        closeModal();
        showToast('บันทึกการรับทราบสำเร็จ', 'success');
        await refreshData();
    } catch (err) {
        showError(err);
        if (btn) { btn.disabled = false; btn.textContent = 'ยืนยันการรับทราบ'; }
    } finally {
        hideLoading();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    // Click delegation
    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#yokoten-page')) return;

        // Tab switch
        const tabBtn = e.target.closest('.yok-tab');
        if (tabBtn?.dataset.tab) { switchTab(tabBtn.dataset.tab); return; }

        // Add topic
        if (e.target.closest('#yok-add-btn')) { openTopicForm(null); return; }

        // Edit topic
        const editBtn = e.target.closest('.btn-yok-edit');
        if (editBtn) {
            const t = _topics.find(x => x.YokotenID === editBtn.dataset.id);
            if (t) openTopicForm(t);
            return;
        }

        // Delete topic
        const delBtn = e.target.closest('.btn-yok-delete');
        if (delBtn) {
            const confirmed = await showConfirmationModal(
                'ยืนยันการลบ',
                `ต้องการลบหัวข้อ "${delBtn.dataset.title}" ?\n(หากมีการตอบกลับแล้ว ระบบจะปิดหัวข้อแทนการลบ)`
            );
            if (confirmed) {
                showLoading('กำลังดำเนินการ...');
                try {
                    await API.delete(`/yokoten/topics/${delBtn.dataset.id}`);
                    showToast('ดำเนินการสำเร็จ', 'success');
                    await refreshData();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Quick-ack open (from dashboard)
        const ackOpenBtn = e.target.closest('.btn-yok-ack-open');
        if (ackOpenBtn) { openAckModal(ackOpenBtn.dataset.id); return; }

        // Switch-tab link (dashboard → topics)
        const switchBtn = e.target.closest('[data-switch-tab]');
        if (switchBtn) { switchTab(switchBtn.dataset.switchTab); return; }
    });

    // Inline ack form submit (in topics tab)
    document.addEventListener('submit', async (e) => {
        if (!e.target.closest('#yokoten-page')) return;
        if (!e.target.classList.contains('yok-ack-form')) return;
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        await _submitAck(e.target, btn);
    });

    // Filter changes
    document.addEventListener('change', (e) => {
        if (!e.target.closest('#yokoten-page')) return;
        if (e.target.id === 'yok-filter-risk') { _filterRisk = e.target.value; renderTopics(document.getElementById('yok-content')); return; }
        if (e.target.id === 'yok-filter-ack')  { _filterAck  = e.target.value; renderTopics(document.getElementById('yok-content')); return; }
    });

    // Search debounce
    document.addEventListener('input', _debounce((e) => {
        if (!e.target.closest('#yokoten-page')) return;
        if (e.target.id === 'yok-search') {
            _searchQ = e.target.value;
            renderTopics(document.getElementById('yok-content'));
        }
    }, 300));
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function _isNearDeadline(deadline) {
    if (!deadline) return false;
    const diff = new Date(deadline) - new Date();
    return diff > 0 && diff < 3 * 86400000;
}
function _isOverdue(deadline) {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
}
function _isNearOrOver(deadline) {
    return _isNearDeadline(deadline) || _isOverdue(deadline);
}

function _deadlineBadge(deadline, acked) {
    if (!deadline || acked) return '';
    const d    = new Date(deadline);
    const now  = new Date();
    const diff = d - now;
    if (diff < 0)          return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">เกินกำหนด</span>`;
    if (diff < 86400000)   return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 animate-pulse">ครบกำหนดวันนี้</span>`;
    if (diff < 3*86400000) return `<span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700">ใกล้ครบกำหนด</span>`;
    return `<span class="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">กำหนด: ${_fmtDateOnly(deadline)}</span>`;
}

function _fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
function _fmtDateOnly(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _spinner() {
    return `<div class="flex flex-col items-center justify-center py-20 text-slate-400">
        <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
        <p class="text-sm">กำลังโหลด...</p>
    </div>`;
}

function _debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
