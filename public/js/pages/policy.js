import { API } from '../api.js';
import { hideLoading, showError, showLoading, openModal, closeModal, showDocumentModal, showToast, showConfirmationModal } from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// --- State ---
let allPolicies   = [];
let _currentPolicy = null;
let _pastPolicies  = [];
let _searchText    = '';
let _descExpanded  = false;
let policyEventListenersInitialized = false;

window.closeModal = closeModal;

// --- Category config ---
const CAT = {
    'ความปลอดภัย':  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
    'อาชีวอนามัย':  { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-400' },
    'สิ่งแวดล้อม':  { bg: 'bg-teal-100',    text: 'text-teal-700',    dot: 'bg-teal-400' },
    'คุณภาพ':       { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-400' },
    'ทั่วไป':        { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400' },
};

// ─────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────
export async function loadPolicyPage() {
    const container = document.getElementById('policy-page');
    if (!policyEventListenersInitialized) {
        setupPolicyPageEventListeners();
        policyEventListenersInitialized = true;
    }

    const currentUser = TSHSession.getUser() || { role: 'User' };
    const isAdmin = currentUser.role?.toLowerCase() === 'admin';

    container.innerHTML = `
        <div class="space-y-6 animate-fade-in pb-10">

            <!-- Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                              style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                            </svg>
                        </span>
                        นโยบายความปลอดภัย
                    </h1>
                    <p class="text-sm text-slate-500 mt-1 ml-11">Safety Policy · Thai Summit Harness Co., Ltd.</p>
                </div>
                ${isAdmin ? `
                <button id="btn-add-policy"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all flex-shrink-0"
                        style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 8px rgba(5,150,105,0.3)"
                        onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 15px rgba(5,150,105,0.4)'"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(5,150,105,0.3)'">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    เพิ่มนโยบาย
                </button>` : ''}
            </div>

            <!-- Stats Bar (skeleton) -->
            <div id="stats-bar" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                ${[1,2,3,4].map(() => `
                <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm animate-pulse">
                    <div class="h-6 bg-slate-100 rounded w-16 mb-2"></div>
                    <div class="h-3 bg-slate-100 rounded w-28"></div>
                </div>`).join('')}
            </div>

            <!-- Current Policy -->
            <div id="current-policy-container">
                <div class="card p-10 text-center">
                    <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mx-auto mb-3"></div>
                    <p class="text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
                </div>
            </div>

            <!-- History Section -->
            <div id="history-section" class="hidden space-y-4">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider">ประวัตินโยบาย</h2>
                        <span id="history-count" class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium"></span>
                    </div>
                    <div class="relative">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="policy-search" type="text" placeholder="ค้นหาในประวัติ..."
                               class="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 w-52 transition-all">
                    </div>
                </div>
                <div id="past-policy-container"></div>
            </div>

        </div>
    `;

    try {
        const raw  = await API.get('/pagedata/policies');
        const data = normalizeApiObject(raw);
        _currentPolicy = normalizeApiObject(data.current);
        _pastPolicies  = normalizeApiArray(data.past);
        allPolicies    = [_currentPolicy, ..._pastPolicies].filter(Boolean);

        renderStatsBar(_currentPolicy, allPolicies);
        renderCurrentPolicy(_currentPolicy, isAdmin);
        renderPastPolicies(_pastPolicies, isAdmin);
    } catch (err) {
        console.error('Error loading policies:', err);
        document.getElementById('current-policy-container').innerHTML = `
            <div class="card p-8 text-center">
                <p class="text-red-500 text-sm font-medium">เกิดข้อผิดพลาด: ${err.message}</p>
            </div>`;
    }
}

// ─────────────────────────────────────────────
// STATS BAR
// ─────────────────────────────────────────────
function renderStatsBar(policy, all) {
    const bar = document.getElementById('stats-bar');
    if (!bar) return;

    // Age of current policy
    let ageTxt = '—', ageSub = 'ยังไม่มีนโยบาย';
    if (policy?.EffectiveDate) {
        const days = Math.floor((Date.now() - new Date(policy.EffectiveDate)) / 86400000);
        if (days < 30)        { ageTxt = `${days} วัน`;            ageSub = 'อายุนโยบายปัจจุบัน'; }
        else if (days < 365)  { ageTxt = `${Math.floor(days/30)} เดือน`; ageSub = 'อายุนโยบายปัจจุบัน'; }
        else                  { ageTxt = `${(days/365).toFixed(1)} ปี`;   ageSub = 'อายุนโยบายปัจจุบัน'; }
    }

    // Ack progress
    const ackCount = policy?.ackCount ?? 0;
    const total    = policy?.totalEmployees ?? 0;
    const pct      = total > 0 ? Math.round(ackCount / total * 100) : 0;
    const ackColor = pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'red';

    // Review date
    let reviewTxt = '—', reviewSub = 'ไม่ได้กำหนด', reviewColor = 'slate';
    if (policy?.ReviewDate) {
        const daysLeft = Math.floor((new Date(policy.ReviewDate) - Date.now()) / 86400000);
        if (daysLeft < 0)      { reviewTxt = 'เกินกำหนด';    reviewSub = 'ครบ Review แล้ว';         reviewColor = 'red'; }
        else if (daysLeft < 30){ reviewTxt = `${daysLeft} วัน`; reviewSub = 'ใกล้ถึงวัน Review';    reviewColor = 'amber'; }
        else                   { reviewTxt = formatDate(policy.ReviewDate); reviewSub = 'วัน Review ถัดไป'; reviewColor = 'emerald'; }
    } else if (policy?.EffectiveDate) {
        const nextReview = new Date(policy.EffectiveDate);
        nextReview.setFullYear(nextReview.getFullYear() + 1);
        const daysLeft = Math.floor((nextReview - Date.now()) / 86400000);
        if (daysLeft < 0)       { reviewTxt = 'เกิน 1 ปี';    reviewSub = 'ควร Review นโยบาย';  reviewColor = 'amber'; }
        else if (daysLeft < 60) { reviewTxt = `${daysLeft} วัน`; reviewSub = 'ครบ 1 ปี ในอีก';    reviewColor = 'amber'; }
        else                    { reviewTxt = `${Math.ceil(daysLeft/30)} เดือน`; reviewSub = 'ครบ 1 ปี ในอีก'; reviewColor = 'slate'; }
    }

    bar.innerHTML = `
        <!-- Age -->
        <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
            </div>
            <div>
                <p class="text-2xl font-bold text-slate-800">${ageTxt}</p>
                <p class="text-xs text-slate-500">${ageSub}</p>
            </div>
        </div>

        <!-- Ack progress -->
        <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-${ackColor}-50">
                <svg class="w-5 h-5 text-${ackColor}-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-2xl font-bold text-slate-800">${pct}%</p>
                <p class="text-xs text-slate-500">${ackCount}/${total} คน รับทราบแล้ว</p>
                <div class="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-${ackColor}-400 rounded-full transition-all" style="width:${pct}%"></div>
                </div>
            </div>
        </div>

        <!-- Total versions -->
        <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            <div>
                <p class="text-2xl font-bold text-slate-800">${all.length}</p>
                <p class="text-xs text-slate-500">ฉบับตลอดประวัติ</p>
            </div>
        </div>

        <!-- Review date -->
        <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-${reviewColor}-50">
                <svg class="w-5 h-5 text-${reviewColor}-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
            </div>
            <div>
                <p class="text-lg font-bold text-slate-800 leading-tight">${reviewTxt}</p>
                <p class="text-xs text-slate-500">${reviewSub}</p>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────
// CURRENT POLICY CARD
// ─────────────────────────────────────────────
function renderCurrentPolicy(rawPolicy, isAdmin) {
    const container = document.getElementById('current-policy-container');
    const policy = normalizeApiObject(rawPolicy);

    if (!policy) {
        container.innerHTML = `
            <div class="card p-14 text-center">
                <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <p class="font-medium text-slate-500">ยังไม่มีนโยบายปัจจุบัน</p>
                <p class="text-sm text-slate-400 mt-1">กดปุ่ม "เพิ่มนโยบาย" เพื่อเริ่มต้น</p>
            </div>`;
        return;
    }

    const year       = policy.EffectiveDate ? new Date(policy.EffectiveDate).getFullYear() + 543 : '-';
    const version    = policy.version || allPolicies.length;
    const catCfg     = CAT[policy.Category] || null;
    const ackCount   = policy.ackCount   ?? 0;
    const total      = policy.totalEmployees ?? 0;
    const pct        = total > 0 ? Math.round(ackCount / total * 100) : 0;
    const ackBarColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const userAcked  = policy.userAcknowledged;

    // Review alert
    let reviewAlert = '';
    const reviewDate = policy.ReviewDate
        ? new Date(policy.ReviewDate)
        : (() => { const d = new Date(policy.EffectiveDate); d.setFullYear(d.getFullYear() + 1); return d; })();
    const daysToReview = Math.floor((reviewDate - Date.now()) / 86400000);
    if (daysToReview < 0) {
        reviewAlert = `
        <div class="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span><strong>ครบกำหนด Review แล้ว</strong> — นโยบายนี้ควรได้รับการทบทวนและอัปเดต</span>
        </div>`;
    } else if (daysToReview < 60) {
        reviewAlert = `
        <div class="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span>ใกล้ถึงวัน Review — อีก <strong>${daysToReview} วัน</strong> (${formatDate(reviewDate)})</span>
        </div>`;
    }

    // Description (truncate if long)
    const desc = policy.Description || '';
    const descPlainLen = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
    const isLong = descPlainLen > 300;
    const descHtml = desc ? `
        <div class="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
            <div id="desc-content" class="${isLong ? 'max-h-24 overflow-hidden' : ''} p-5 text-slate-700 text-sm leading-relaxed pol-rte-content transition-all duration-300">
                ${_sanitizeHtml(desc)}
            </div>
            ${isLong ? `
            <div class="border-t border-slate-100 px-5 py-2.5 text-center">
                <button id="btn-expand-desc" class="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mx-auto">
                    <svg id="expand-icon" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                    อ่านเพิ่มเติม
                </button>
            </div>` : ''}
        </div>` : '';

    container.innerHTML = `
        <div class="card overflow-hidden">
            <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#059669,#0d9488,#0891b2)"></div>

            <div class="p-6 md:p-8 space-y-5">

                <!-- Header row -->
                <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                            <svg class="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                            </svg>
                        </div>
                        <div class="space-y-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                                    ฉบับปัจจุบัน (Active)
                                </span>
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500">
                                    Rev.${version}
                                </span>
                                ${catCfg ? `
                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${catCfg.bg} ${catCfg.text}">
                                    <span class="w-1.5 h-1.5 rounded-full ${catCfg.dot} inline-block"></span>
                                    ${policy.Category}
                                </span>` : ''}
                            </div>
                            <h2 class="text-xl font-bold text-slate-800 leading-snug">${policy.PolicyTitle}</h2>
                            <div class="flex items-center gap-1.5 text-xs text-slate-400">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                มีผลบังคับใช้: <span class="font-medium text-slate-600">${formatDate(policy.EffectiveDate)}</span>
                                <span class="text-slate-200 mx-1">·</span>
                                <span>พ.ศ. ${year}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Action buttons -->
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                        <!-- Print -->
                        <button id="btn-print-policy" title="พิมพ์นโยบาย"
                                class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                            </svg>
                        </button>
                        ${isAdmin ? `
                        <button class="btn-edit-policy p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                data-id="${policy.id || policy.PolicyID}" title="แก้ไข">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </div>

                <!-- Review alert -->
                ${reviewAlert}

                <!-- Description -->
                ${descHtml}

                <!-- Document -->
                ${policy.DocumentLink ? `
                <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div class="flex items-center gap-1.5 text-xs text-slate-400">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                        </svg>
                        เอกสารประกอบนโยบาย
                    </div>
                    <a href="${policy.DocumentLink}" data-action="view-doc"
                       class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                       style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 8px rgba(5,150,105,0.25)"
                       onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(5,150,105,0.4)'"
                       onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(5,150,105,0.25)'">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                        เปิดดูเอกสาร
                    </a>
                </div>` : ''}

                <!-- Acknowledge Section -->
                <div class="pt-4 border-t border-slate-100">
                    ${isAdmin ? renderAckAdminSection(policy.id, ackCount, total, pct, ackBarColor) : renderAckUserSection(policy.id, userAcked)}
                </div>

            </div>
        </div>
    `;
}

function renderAckAdminSection(policyId, ackCount, total, pct, barColor) {
    return `
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm font-semibold text-slate-700">การรับทราบนโยบาย</p>
                    <p class="text-xs text-slate-400 mt-0.5">
                        <span class="font-semibold text-slate-600">${ackCount}</span> จาก
                        <span class="font-semibold text-slate-600">${total}</span> คน
                        <span class="ml-1">(${pct}%)</span>
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-view-ack" data-id="${policyId}"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        ดูรายชื่อ
                    </button>
                    <button id="btn-export-ack" data-id="${policyId}"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                        Export Excel
                    </button>
                </div>
            </div>
            <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${barColor}"></div>
            </div>
        </div>
    `;
}

function renderAckUserSection(policyId, userAcked) {
    if (userAcked) {
        return `
        <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <div>
                <p class="text-sm font-semibold text-emerald-700">คุณรับทราบนโยบายนี้แล้ว</p>
                <p class="text-xs text-slate-400">ขอบคุณสำหรับการรับทราบ</p>
            </div>
        </div>`;
    }
    return `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
                <p class="text-sm font-semibold text-slate-700">รับทราบนโยบาย</p>
                <p class="text-xs text-slate-400 mt-0.5">กรุณากดปุ่มเพื่อยืนยันว่าคุณได้อ่านและเข้าใจนโยบายนี้แล้ว</p>
            </div>
            <button id="btn-acknowledge" data-id="${policyId}"
                    class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex-shrink-0"
                    style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 8px rgba(5,150,105,0.3)"
                    onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 15px rgba(5,150,105,0.4)'"
                    onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(5,150,105,0.3)'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                รับทราบนโยบาย
            </button>
        </div>`;
}

// ─────────────────────────────────────────────
// HISTORY TIMELINE
// ─────────────────────────────────────────────
function renderPastPolicies(rawPolicies, isAdmin, search = '') {
    const list = normalizeApiArray(rawPolicies);
    const historySection  = document.getElementById('history-section');
    const container       = document.getElementById('past-policy-container');
    const countBadge      = document.getElementById('history-count');

    if (!list.length) { historySection?.classList.add('hidden'); return; }
    historySection?.classList.remove('hidden');

    const filtered = search
        ? list.filter(p => {
            const p2 = normalizeApiObject(p);
            return (p2.PolicyTitle || '').toLowerCase().includes(search.toLowerCase())
                || String(new Date(p2.EffectiveDate).getFullYear() + 543).includes(search);
          })
        : list;

    if (countBadge) countBadge.textContent = `${filtered.length} ฉบับ`;

    if (!filtered.length) {
        container.innerHTML = `
            <div class="text-center py-10 text-slate-400">
                <svg class="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <p class="text-sm">ไม่พบผลการค้นหา</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="relative">
            <div class="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-full"></div>
            <div class="space-y-3">
                ${filtered.map(raw => {
                    const p       = normalizeApiObject(raw);
                    const year    = p.EffectiveDate ? new Date(p.EffectiveDate).getFullYear() + 543 : '-';
                    const catCfg  = p.Category ? (CAT[p.Category] || null) : null;
                    const ackPct  = p.totalEmployees > 0 ? Math.round((p.ackCount || 0) / p.totalEmployees * 100) : 0;
                    const ackColor = ackPct >= 80 ? 'emerald' : ackPct >= 50 ? 'amber' : 'slate';
                    return `
                    <div class="relative flex items-start gap-4 group">
                        <!-- Dot -->
                        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10
                                    group-hover:border-emerald-300 transition-colors">
                            <span class="text-xs font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">
                                ${String(year).slice(-2)}
                            </span>
                        </div>

                        <!-- Card -->
                        <div class="flex-1 card p-4 hover:border-emerald-200 transition-all" style="margin-top:4px;">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                        <span class="text-xs font-semibold text-slate-400">พ.ศ. ${year}</span>
                                        <span class="text-slate-200">·</span>
                                        <span class="text-xs text-slate-400">${formatDate(p.EffectiveDate)}</span>
                                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-500">
                                            Rev.${p.version || '?'}
                                        </span>
                                        ${catCfg ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${catCfg.bg} ${catCfg.text}">${p.Category}</span>` : ''}
                                    </div>
                                    <h4 class="font-semibold text-slate-700 text-sm group-hover:text-emerald-700 transition-colors">${p.PolicyTitle || '-'}</h4>
                                    ${p.totalEmployees > 0 ? `
                                    <div class="flex items-center gap-2 mt-1.5">
                                        <div class="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
                                            <div class="h-full bg-${ackColor}-400 rounded-full" style="width:${ackPct}%"></div>
                                        </div>
                                        <span class="text-xs text-slate-400">${p.ackCount || 0}/${p.totalEmployees} รับทราบ</span>
                                    </div>` : ''}
                                </div>

                                <!-- Actions -->
                                <div class="flex items-center gap-1 flex-shrink-0">
                                    ${p.DocumentLink ? `
                                    <a href="${p.DocumentLink}" data-action="view-doc"
                                       class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="ดูเอกสาร">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                                        </svg>
                                    </a>` : ''}
                                    ${isAdmin ? `
                                    <button class="btn-restore-policy p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            data-id="${p.id}" title="ตั้งเป็นฉบับปัจจุบัน">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                        </svg>
                                    </button>
                                    <button class="btn-edit-policy p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                            data-id="${p.id}" title="แก้ไข">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                        </svg>
                                    </button>
                                    <button class="btn-delete-policy p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            data-id="${p.id}" title="ลบ">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                    </button>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────
function setupPolicyPageEventListeners() {
    const currentUser = TSHSession.getUser() || { role: 'User' };
    const isAdmin = currentUser.role?.toLowerCase() === 'admin';

    document.addEventListener('click', async (event) => {
        if (!event.target.closest('#policy-page')) return;
        const t = event.target;

        // Add policy
        if (t.closest('#btn-add-policy')) { showPolicyForm(); return; }

        // Expand description
        if (t.closest('#btn-expand-desc')) {
            _descExpanded = !_descExpanded;
            const content = document.getElementById('desc-content');
            const icon    = document.getElementById('expand-icon');
            const btn     = document.getElementById('btn-expand-desc');
            if (content) content.classList.toggle('max-h-24', !_descExpanded);
            if (icon)    icon.style.transform = _descExpanded ? 'rotate(180deg)' : '';
            if (btn)     btn.childNodes[btn.childNodes.length - 1].textContent = _descExpanded ? ' ย่อลง' : ' อ่านเพิ่มเติม';
            return;
        }

        // Print
        if (t.closest('#btn-print-policy')) { printPolicy(_currentPolicy); return; }

        // Edit
        const editBtn = t.closest('.btn-edit-policy');
        if (editBtn) {
            const p = allPolicies.find(p => String(p.id) === String(editBtn.dataset.id));
            if (p) showPolicyForm(p);
            return;
        }

        // Delete
        const deleteBtn = t.closest('.btn-delete-policy');
        if (deleteBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบนโยบายนี้ใช่หรือไม่? ไม่สามารถย้อนกลับได้');
            if (confirmed) {
                showLoading('กำลังลบข้อมูล...');
                try {
                    await API.delete(`/policies/${deleteBtn.dataset.id}`);
                    showToast('ลบข้อมูลเรียบร้อยแล้ว', 'success');
                    await loadPolicyPage();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Restore
        const restoreBtn = t.closest('.btn-restore-policy');
        if (restoreBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการกู้คืน', 'ต้องการตั้งนโยบายนี้เป็นฉบับปัจจุบันใช่หรือไม่?');
            if (confirmed) {
                showLoading('กำลังอัปเดต...');
                try {
                    await API.put(`/policies/${restoreBtn.dataset.id}/restore`, {});
                    showToast('ตั้งเป็นฉบับปัจจุบันเรียบร้อยแล้ว', 'success');
                    await loadPolicyPage();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Acknowledge (User)
        if (t.closest('#btn-acknowledge')) {
            const confirmed = await showConfirmationModal(
                'ยืนยันการรับทราบ',
                'คุณยืนยันว่าได้อ่านและเข้าใจนโยบายความปลอดภัยฉบับนี้แล้ว?'
            );
            if (confirmed) {
                const btn = document.getElementById('btn-acknowledge');
                const policyId = btn?.dataset.id;
                showLoading('กำลังบันทึก...');
                try {
                    await API.post(`/policies/${policyId}/acknowledge`, {});
                    showToast('รับทราบนโยบายเรียบร้อยแล้ว', 'success');
                    await loadPolicyPage();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // View acknowledgement list (Admin)
        if (t.closest('#btn-view-ack')) {
            const policyId = t.closest('#btn-view-ack').dataset.id;
            showAckListModal(policyId);
            return;
        }

        // Export Excel acknowledgements (Admin)
        if (t.closest('#btn-export-ack')) {
            const policyId = t.closest('#btn-export-ack').dataset.id;
            exportAckExcel(policyId);
            return;
        }

        // View document
        const viewDocBtn = t.closest('[data-action="view-doc"]');
        if (viewDocBtn) {
            event.preventDefault();
            showDocumentModal(viewDocBtn.href, 'เอกสารแนบนโยบาย');
            return;
        }
    });

    // Search timeline
    document.addEventListener('input', (event) => {
        if (event.target.id !== 'policy-search') return;
        _searchText = event.target.value.trim();
        renderPastPolicies(_pastPolicies, isAdmin, _searchText);
    });
}

// ─────────────────────────────────────────────
// POLICY FORM MODAL
// ─────────────────────────────────────────────
function showPolicyForm(rawPolicy = null) {
    const policy   = normalizeApiObject(rawPolicy);
    const isEditing = policy !== null;

    const categories = ['ความปลอดภัย', 'อาชีวอนามัย', 'สิ่งแวดล้อม', 'คุณภาพ', 'ทั่วไป'];
    const catOptions = categories.map(c =>
        `<option value="${c}" ${policy?.Category === c ? 'selected' : ''}>${c}</option>`
    ).join('');

    const html = `
        <form id="policy-form" class="space-y-4">
            <input type="hidden" name="id" value="${policy?.id || ''}">

            <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2 text-sm text-emerald-700">
                <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>กรอกข้อมูลนโยบาย — ถ้าอัปโหลดไฟล์จะใช้ไฟล์แทนลิงก์ URL</span>
            </div>

            <!-- Title -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                    หัวข้อนโยบาย <span class="text-red-500">*</span>
                </label>
                <input type="text" name="PolicyTitle" class="form-input w-full"
                       value="${policy?.PolicyTitle || ''}" required
                       placeholder="เช่น นโยบายความปลอดภัย ปี 2568">
            </div>

            <!-- Description (RTE) -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
                <!-- Rich text toolbar -->
                <div class="flex flex-wrap gap-0.5 p-1.5 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50" id="pol-rte-toolbar">
                    <button type="button" data-cmd="bold" title="หนา (Ctrl+B)"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
                    </button>
                    <button type="button" data-cmd="italic" title="เอียง (Ctrl+I)"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
                    </button>
                    <button type="button" data-cmd="underline" title="ขีดเส้นใต้ (Ctrl+U)"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
                    </button>
                    <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                    <button type="button" data-cmd="insertUnorderedList" title="รายการแบบจุด"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
                    </button>
                    <button type="button" data-cmd="insertOrderedList" title="รายการแบบตัวเลข"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-8v2h14V3H7zm0 18h14v-2H7v2zm0-7h14v-2H7v2z"/></svg>
                    </button>
                    <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                    <button type="button" data-cmd="formatBlock" data-val="h3" title="หัวข้อ"
                        class="rte-btn px-2 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white hover:shadow-sm transition-all">H</button>
                    <button type="button" data-cmd="removeFormat" title="ล้างการจัดรูปแบบ"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                    <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                    <button type="button" data-cmd="justifyLeft" title="ชิดซ้าย"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
                    </button>
                    <button type="button" data-cmd="justifyCenter" title="กึ่งกลาง"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
                    </button>
                    <button type="button" data-cmd="justifyRight" title="ชิดขวา"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
                    </button>
                    <button type="button" data-cmd="justifyFull" title="เต็มบรรทัด (Justify)"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/></svg>
                    </button>
                    <div class="w-px h-6 bg-slate-200 mx-0.5 self-center"></div>
                    <button type="button" data-rte-action="link" title="แทรกลิงก์"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                    </button>
                    <button type="button" data-cmd="unlink" title="ลบลิงก์"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8v-2zm8.71 7.29l1.41-1.41L20 20.88 21.46 22 22 21.46 8.29 7.75 6.88 9.17z"/></svg>
                    </button>
                    <button type="button" data-rte-action="image" title="แทรกรูปภาพ (URL)"
                        class="rte-btn w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:bg-white hover:shadow-sm transition-all">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                    </button>
                </div>
                <!-- Link / Image URL input bar -->
                <div id="pol-rte-input-bar" class="hidden items-center gap-2 border border-slate-200 border-t-0 bg-slate-50 px-2 py-1.5">
                    <span id="pol-rte-input-label" class="text-xs text-slate-500 flex-shrink-0 w-16">URL ลิงก์:</span>
                    <input id="pol-rte-url-input" type="text" placeholder="https://..."
                           class="flex-1 text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200">
                    <button type="button" id="pol-rte-insert-btn"
                            class="flex-shrink-0 text-xs px-3 py-1 rounded bg-sky-500 text-white hover:bg-sky-600 font-semibold transition-colors">แทรก</button>
                    <button type="button" id="pol-rte-cancel-bar"
                            class="flex-shrink-0 text-xs px-2 py-1 rounded text-slate-400 hover:bg-slate-200 transition-colors">ยกเลิก</button>
                </div>
                <!-- Editable area -->
                <div id="pol-desc"
                     contenteditable="true"
                     class="form-textarea w-full rounded-t-none min-h-[120px] focus:outline-none pol-rte-content"
                     style="min-height:120px;border-top:0"
                     data-placeholder="รายละเอียดเพิ่มเติม สาระสำคัญของนโยบาย..."></div>
            </div>

            <!-- Category + IsCurrent -->
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมวดหมู่</label>
                    <select name="Category" class="form-input w-full">
                        <option value="">— ไม่ระบุ —</option>
                        ${catOptions}
                    </select>
                </div>
                <div class="flex flex-col justify-end pb-0.5">
                    <label class="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" id="IsCurrent" name="IsCurrent"
                               class="rounded text-emerald-600 w-4 h-4 focus:ring-emerald-500"
                               ${policy?.IsCurrent ? 'checked' : ''}>
                        <span class="text-sm text-slate-700">
                            ตั้งเป็น <span class="font-semibold text-emerald-700">ฉบับปัจจุบัน</span>
                        </span>
                    </label>
                </div>
            </div>

            <!-- Dates -->
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">
                        วันที่บังคับใช้ <span class="text-red-500">*</span>
                    </label>
                    <input type="text" id="EffectiveDate" name="EffectiveDate" class="form-input w-full bg-white"
                           value="${policy?.EffectiveDate ? policy.EffectiveDate.split('T')[0] : ''}" required>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันครบ Review</label>
                    <input type="text" id="ReviewDate" name="ReviewDate" class="form-input w-full bg-white"
                           value="${policy?.ReviewDate ? policy.ReviewDate.split('T')[0] : ''}"
                           placeholder="ไม่บังคับ (default: 1 ปี)">
                </div>
            </div>

            <!-- Document URL -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลิงก์เอกสาร (URL)</label>
                <input type="text" name="DocumentLink" class="form-input w-full"
                       value="${policy?.DocumentLink || ''}" placeholder="https://...">
            </div>

            <!-- File upload -->
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หรืออัปโหลดไฟล์ (PDF / DOCX)</label>
                <input type="file" name="PolicyFile" accept=".pdf,.doc,.docx"
                       class="block w-full text-sm text-slate-600
                              file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                              file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700
                              hover:file:bg-emerald-100 transition-all">
                <p class="text-xs text-slate-400 mt-1">ถ้าเลือกไฟล์ ระบบจะใช้ไฟล์แทนลิงก์ · สูงสุด 20 MB</p>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4"
                        onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
                <button type="submit" class="btn btn-primary px-5">บันทึกข้อมูล</button>
            </div>
        </form>
    `;

    // Inject RTE styles once
    if (!document.getElementById('pol-rte-style')) {
        const s = document.createElement('style');
        s.id = 'pol-rte-style';
        s.textContent = `
            #pol-desc[contenteditable]:empty:not(:focus)::before,
            #pol-desc.rte-empty:not(:focus)::before {
                content: attr(data-placeholder);
                color: #94a3b8;
                pointer-events: none;
            }
            #pol-desc[contenteditable] { outline: none; }
            #pol-desc h3 { font-size: 0.95em; font-weight: 700; margin: 0.3em 0; }
            #pol-desc ul, #pol-desc ol { padding-left: 1.5em; margin: 0.3em 0; }
            #pol-desc li { margin: 0.15em 0; }
            #pol-desc a { color: #0ea5e9; text-decoration: underline; }
            #pol-desc img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.2em 0; display: block; }
            .pol-rte-content h3 { font-size: 0.9em; font-weight: 700; margin: 0.25em 0; color: #1e293b; }
            .pol-rte-content ul, .pol-rte-content ol { padding-left: 1.4em; margin: 0.2em 0; }
            .pol-rte-content li { margin: 0.1em 0; }
            .pol-rte-content b, .pol-rte-content strong { font-weight: 700; }
            .pol-rte-content em { font-style: italic; }
            .pol-rte-content u { text-decoration: underline; }
            .pol-rte-content a { color: #0ea5e9; text-decoration: underline; }
            .pol-rte-content img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.3em 0; display: block; }
            .rte-btn.rte-active { background: #e0f2fe; color: #0284c7; }
        `;
        document.head.appendChild(s);
    }

    openModal(isEditing ? 'แก้ไขนโยบาย' : 'เพิ่มนโยบายใหม่', html, 'max-w-2xl');

    flatpickr('#EffectiveDate', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: policy?.EffectiveDate?.split('T')[0] || 'today' });
    flatpickr('#ReviewDate',    { locale: 'th', dateFormat: 'Y-m-d' });

    // ── Rich text editor init ─────────────────────────────────────────────
    setTimeout(() => {
        const rteEl = document.getElementById('pol-desc');
        if (rteEl) {
            rteEl.innerHTML = policy?.Description ? _sanitizeHtml(policy.Description) : '';

            const updatePlaceholder = () => {
                if (rteEl.innerText.trim() === '') {
                    rteEl.classList.add('rte-empty');
                } else {
                    rteEl.classList.remove('rte-empty');
                }
            };
            updatePlaceholder();
            rteEl.addEventListener('input', updatePlaceholder);
            rteEl.addEventListener('focus', updatePlaceholder);
            rteEl.addEventListener('blur',  updatePlaceholder);

            let _rteAction  = null;
            let _savedRange = null;

            const inputBar   = document.getElementById('pol-rte-input-bar');
            const inputLabel = document.getElementById('pol-rte-input-label');
            const urlInput   = document.getElementById('pol-rte-url-input');
            const insertBtn  = document.getElementById('pol-rte-insert-btn');
            const cancelBar  = document.getElementById('pol-rte-cancel-bar');

            const _hideInputBar = () => {
                inputBar?.classList.add('hidden');
                inputBar?.classList.remove('flex');
                _rteAction  = null;
                _savedRange = null;
            };

            const _saveSelection = () => {
                const sel = window.getSelection();
                return sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
            };

            const _restoreSelection = (range) => {
                if (!range) return;
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            };

            const _updateAlignBtns = () => {
                ['justifyLeft','justifyCenter','justifyRight','justifyFull'].forEach(cmd => {
                    const btn = document.querySelector(`#pol-rte-toolbar [data-cmd="${cmd}"]`);
                    if (btn) btn.classList.toggle('rte-active', document.queryCommandState(cmd));
                });
            };
            rteEl.addEventListener('keyup',   _updateAlignBtns);
            rteEl.addEventListener('mouseup', _updateAlignBtns);
            rteEl.addEventListener('focus',   _updateAlignBtns);

            document.getElementById('pol-rte-toolbar')?.addEventListener('mousedown', (ev) => {
                const btn = ev.target.closest('.rte-btn');
                if (!btn) return;
                ev.preventDefault();

                const action = btn.dataset.rteAction;
                const cmd    = btn.dataset.cmd;
                const val    = btn.dataset.val || null;

                if (action === 'link' || action === 'image') {
                    _savedRange = _saveSelection();
                    _rteAction  = action;
                    if (inputLabel) inputLabel.textContent = action === 'link' ? 'URL ลิงก์:' : 'URL รูปภาพ:';
                    if (urlInput) urlInput.value = '';
                    inputBar?.classList.remove('hidden');
                    inputBar?.classList.add('flex');
                    setTimeout(() => urlInput?.focus(), 0);
                    return;
                }

                if (cmd) {
                    document.execCommand(cmd, false, val);
                    rteEl.focus();
                    _updateAlignBtns();
                }
            });

            insertBtn?.addEventListener('click', () => {
                const url = urlInput?.value.trim();
                if (!url) return;
                _restoreSelection(_savedRange);
                rteEl.focus();
                if (_rteAction === 'link') {
                    document.execCommand('createLink', false, url);
                    rteEl.querySelectorAll('a[href]').forEach(a => {
                        if (!a.target) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                    });
                } else if (_rteAction === 'image') {
                    document.execCommand('insertImage', false, url);
                }
                _hideInputBar();
                updatePlaceholder();
            });

            cancelBar?.addEventListener('click', _hideInputBar);

            urlInput?.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter')  { ev.preventDefault(); insertBtn?.click(); }
                if (ev.key === 'Escape') _hideInputBar();
            });
        }
    }, 0);

    document.getElementById('policy-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEl    = e.target;
        const submitBtn = formEl.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>กำลังบันทึก...';

        const formData = new FormData(formEl);
        // Read Description from RTE contenteditable
        const rteEl = document.getElementById('pol-desc');
        const descHtml = rteEl ? _sanitizeHtml(rteEl.innerHTML).trim() : '';
        try {
            showLoading('กำลังบันทึก...');
            const file = formData.get('PolicyFile');
            if (file && file.size > 0) {
                const uploadData = new FormData();
                uploadData.append('document', file);
                const uploadRes = await API.post('/upload/document', uploadData);
                if (!uploadRes?.url && !uploadRes?.secure_url) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
                formData.set('DocumentLink', uploadRes.secure_url || uploadRes.url);
            }
            formData.delete('PolicyFile');

            const data = Object.fromEntries(formData.entries());
            data.Description = descHtml;
            data.IsCurrent = formEl.querySelector('#IsCurrent').checked ? 1 : 0;
            if (!data.ReviewDate) delete data.ReviewDate;
            if (!data.Category)   delete data.Category;

            if (data.id) {
                await API.put(`/policies/${data.id}`, data);
            } else {
                await API.post('/policies', data);
            }

            closeModal();
            showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
            await loadPolicyPage();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
            submitBtn.disabled = false;
            submitBtn.textContent = 'บันทึกข้อมูล';
        }
    });
}

// ─────────────────────────────────────────────
// ACK LIST MODAL (Admin)
// ─────────────────────────────────────────────
async function showAckListModal(policyId) {
    openModal('รายชื่อผู้รับทราบนโยบาย', `
        <div class="flex items-center justify-center py-10">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
        </div>`, 'max-w-2xl');

    try {
        const data = await API.get(`/policies/${policyId}/acknowledgements`);
        const acked    = data.acknowledged    || [];
        const notAcked = data.notAcknowledged || [];
        const pct      = data.totalEmployees > 0 ? Math.round(data.ackCount / data.totalEmployees * 100) : 0;
        const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

        const html = `
            <div class="space-y-4">
                <!-- Summary bar -->
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-semibold text-slate-700">
                            รับทราบแล้ว ${data.ackCount} / ${data.totalEmployees} คน
                        </span>
                        <span class="text-sm font-bold text-slate-800">${pct}%</span>
                    </div>
                    <div class="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div class="h-full rounded-full" style="width:${pct}%;background:${barColor}"></div>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="flex gap-2 border-b border-slate-100 pb-0">
                    <button id="tab1-btn"
                            onclick="document.getElementById('tab-acked').classList.remove('hidden');document.getElementById('tab-notacked').classList.add('hidden');document.getElementById('tab1-btn').classList.add('border-b-2','border-emerald-500','text-emerald-700');document.getElementById('tab2-btn').classList.remove('border-b-2','border-emerald-500','text-emerald-700')"
                            class="px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-500 -mb-px transition-colors">
                        รับทราบแล้ว (${acked.length})
                    </button>
                    <button id="tab2-btn"
                            onclick="document.getElementById('tab-notacked').classList.remove('hidden');document.getElementById('tab-acked').classList.add('hidden');document.getElementById('tab2-btn').classList.add('border-b-2','border-emerald-500','text-emerald-700');document.getElementById('tab1-btn').classList.remove('border-b-2','border-emerald-500','text-emerald-700')"
                            class="px-4 py-2 text-sm font-semibold text-slate-500 -mb-px transition-colors hover:text-slate-700">
                        ยังไม่รับทราบ (${notAcked.length})
                    </button>
                </div>

                <!-- Tab: Acked -->
                <div id="tab-acked" class="max-h-72 overflow-y-auto space-y-1.5">
                    ${acked.length === 0
                        ? `<p class="text-center text-slate-400 py-6 text-sm">ยังไม่มีผู้รับทราบ</p>`
                        : acked.map(a => `
                        <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                            <div class="flex items-center gap-2.5">
                                <div class="w-7 h-7 rounded-full bg-emerald-200 flex items-center justify-center">
                                    <svg class="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm font-semibold text-slate-700">${a.UserName || a.UserID}</p>
                                    <p class="text-xs text-slate-400">${a.Department || '—'}</p>
                                </div>
                            </div>
                            <span class="text-xs text-slate-400">${formatDateTime(a.AcknowledgedAt)}</span>
                        </div>`).join('')}
                </div>

                <!-- Tab: Not Acked -->
                <div id="tab-notacked" class="hidden max-h-72 overflow-y-auto space-y-1.5">
                    ${notAcked.length === 0
                        ? `<p class="text-center text-slate-400 py-6 text-sm">ทุกคนรับทราบแล้ว</p>`
                        : notAcked.map(e => `
                        <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                            <div class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                                <svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-semibold text-slate-700">${e.Name || e.EmployeeID}</p>
                                <p class="text-xs text-slate-400">${e.Department || '—'}</p>
                            </div>
                        </div>`).join('')}
                </div>

                <div class="flex justify-end pt-2 border-t border-slate-100">
                    <button onclick="window.closeModal&&window.closeModal()"
                            class="btn btn-secondary px-4">ปิด</button>
                </div>
            </div>
        `;

        // Re-open with content
        openModal('รายชื่อผู้รับทราบนโยบาย', html, 'max-w-2xl');
    } catch (err) {
        showError(err);
        closeModal();
    }
}

// ─────────────────────────────────────────────
// EXPORT EXCEL (Admin)
// ─────────────────────────────────────────────
async function exportAckExcel(policyId) {
    const policy = allPolicies.find(p => String(p.id) === String(policyId));
    showLoading('กำลังดึงข้อมูล...');
    try {
        const data = await API.get(`/policies/${policyId}/acknowledgements`);
        const acked    = data.acknowledged    || [];
        const notAcked = data.notAcknowledged || [];

        if (typeof XLSX === 'undefined') {
            showToast('กรุณาเปิดหน้าใหม่แล้วลองใหม่ (SheetJS ยังโหลดไม่เสร็จ)', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Sheet 1: Acked
        const ackedRows = acked.map(a => ({
            'รหัสพนักงาน':  a.UserID,
            'ชื่อ':          a.UserName || '',
            'แผนก':         a.Department || '',
            'วันที่รับทราบ': a.AcknowledgedAt ? new Date(a.AcknowledgedAt).toLocaleString('th-TH') : '',
        }));
        const ws1 = XLSX.utils.json_to_sheet(ackedRows.length ? ackedRows : [{ 'ข้อมูล': 'ยังไม่มีผู้รับทราบ' }]);
        XLSX.utils.book_append_sheet(wb, ws1, 'รับทราบแล้ว');

        // Sheet 2: Not Acked
        const notAckedRows = notAcked.map(e => ({
            'รหัสพนักงาน': e.EmployeeID,
            'ชื่อ':        e.Name || '',
            'แผนก':       e.Department || '',
        }));
        const ws2 = XLSX.utils.json_to_sheet(notAckedRows.length ? notAckedRows : [{ 'ข้อมูล': 'ทุกคนรับทราบแล้ว' }]);
        XLSX.utils.book_append_sheet(wb, ws2, 'ยังไม่รับทราบ');

        const title = policy?.PolicyTitle || `policy_${policyId}`;
        XLSX.writeFile(wb, `รายชื่อรับทราบนโยบาย_${title}.xlsx`);
        showToast('Export เรียบร้อยแล้ว', 'success');
    } catch (err) {
        showError(err);
    } finally {
        hideLoading();
    }
}

// ─────────────────────────────────────────────
// PRINT POLICY
// ─────────────────────────────────────────────
function printPolicy(policy) {
    if (!policy) return;
    const p    = normalizeApiObject(policy);
    const year = p.EffectiveDate ? new Date(p.EffectiveDate).getFullYear() + 543 : '-';
    const win  = window.open('', '_blank', 'width=800,height=600');
    win.document.open();
    win.document.write(`
        <!DOCTYPE html><html lang="th"><head>
        <meta charset="UTF-8">
        <title>นโยบายความปลอดภัย</title>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:'Kanit',sans-serif; padding:40px; color:#1e293b; font-size:14px; }
            .header { display:flex; align-items:center; gap:16px; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #059669; }
            .logo-circle { width:56px; height:56px; border-radius:12px; background:linear-gradient(135deg,#059669,#0d9488); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .logo-circle svg { width:28px; height:28px; }
            .company { font-size:11px; color:#64748b; margin-top:2px; }
            .badge { display:inline-block; padding:3px 10px; border-radius:999px; background:#dcfce7; color:#15803d; font-size:11px; font-weight:600; margin-bottom:8px; }
            h1 { font-size:22px; font-weight:700; color:#0f172a; margin:8px 0; }
            .meta { font-size:12px; color:#64748b; margin-bottom:24px; }
            .desc-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px; line-height:1.8; margin-bottom:24px; }
            .desc-box h3 { font-size:14px; font-weight:700; margin:0.3em 0; color:#0f172a; }
            .desc-box ul, .desc-box ol { padding-left:1.5em; margin:0.4em 0; }
            .desc-box li { margin:0.2em 0; }
            .desc-box b, .desc-box strong { font-weight:700; }
            .desc-box em { font-style:italic; }
            .desc-box u { text-decoration:underline; }
            .desc-box a { color:#0284c7; text-decoration:underline; }
            .desc-box img { max-width:100%; height:auto; border-radius:6px; margin:0.3em 0; display:block; }
            .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; display:flex; justify-content:space-between; }
            @media print { body { padding:20px; } }
        </style>
        </head><body>
        <div class="header">
            <div class="logo-circle">
                <svg fill="white" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
            </div>
            <div>
                <p class="company">Thai Summit Harness Co., Ltd.</p>
                <p style="font-size:18px;font-weight:700;color:#0f172a">นโยบายความปลอดภัย</p>
                <p class="company">Safety Policy Document</p>
            </div>
        </div>
        <div class="badge">Rev.${p.version || allPolicies.length} · ฉบับปัจจุบัน${p.Category ? ` · ${p.Category}` : ''}</div>
        <h1>${p.PolicyTitle || ''}</h1>
        <p class="meta">
            วันที่บังคับใช้: ${formatDate(p.EffectiveDate)} (พ.ศ. ${year})
            ${p.ReviewDate ? ` &nbsp;|&nbsp; วัน Review: ${formatDate(p.ReviewDate)}` : ''}
        </p>
        ${p.Description ? `<div class="desc-box">${p.Description}</div>` : ''}
        <div class="footer">
            <span>พิมพ์เมื่อ: ${new Date().toLocaleString('th-TH')}</span>
            <span>เอกสารฉบับนี้ออกโดยระบบ TSH Safety Core</span>
        </div>
        <script>window.onload = () => { window.print(); }<\/script>
        </body></html>
    `);
    win.document.close();
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function _sanitizeHtml(html) {
    if (!html) return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?>/gi, '')
        .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '');
}
