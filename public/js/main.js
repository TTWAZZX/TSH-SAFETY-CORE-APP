// public/js/main.js
// ======================================================
// TSH Safety Core - Frontend Main Controller (FINAL)
// ======================================================

import * as UI from './ui.js?v=20260714-phase21-platform-shell';
import { API, apiFetch } from './api.js?v=20260902-patrol-live-stats-r1';
import { guardSubmitHandler } from './utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';

// --- Page Loaders ---
import { loadPolicyPage } from './pages/policy.js?v=20260715-phase32d-remaining-async-ux';
import { loadCommitteePage } from './pages/committee.js?v=20260715-phase32d-remaining-async-ux';
import { loadPatrolPage } from './pages/patrol.js?v=20260902-patrol-live-stats-r1';
import { loadCccfPage } from './pages/cccf.js?v=20260822-cccf-worker-pdf-r10';
import { loadKpiPage } from './pages/kpi.js?v=20260715-phase32d-remaining-async-ux';
import { loadYokotenPage } from './pages/yokoten.js?v=20260825-yokoten-department-relevance-r1';
import { loadAdminPage } from './pages/admin.js?v=20260902-bbs-auto-reference-r1';
import { loadMachineSafetyPage } from './pages/machine-safety.js?v=20260820-card-image-phase2b';
import { loadForkliftPage } from './pages/forklift.js?v=20260831-forklift-renewal-retry-r1';
import { loadOjtPage } from './pages/ojt.js?v=20260820-card-image-phase2d';
import { loadTrainingPage } from './pages/training.js?v=20260820-card-image-phase2d-rollout-r2';
import { loadAccidentPage } from './pages/accident.js?v=20260820-card-image-phase2a';
import { loadSafetyCulturePage } from './pages/safety-culture.js?v=20260824-safety-culture-ppe-form-r1';
import { loadBbsSmartCardPage } from './pages/bbs-smart-card.js?v=20260901-bbs-phase10d5-foundation-r1';
import { loadContractorPage } from './pages/contractor.js?v=20260715-phase32d-remaining-async-ux';
import { loadHiyariPage } from './pages/hiyari.js?v=20260824-hiyari-dept-progress-r1';
import { loadKyPage } from './pages/ky.js?v=20260831-ky-chunk-upload-r1';
import { loadFourmPage } from './pages/fourm.js?v=20260821-fourm-kpi-refresh-r1';
import { loadJohnnyAiPage } from './pages/johnny-ai.js?v=20260715-phase32d-remaining-async-ux';
import { openProfileDrawer, closeProfileDrawer } from './pages/profile.js?v=20260723-onboarding-release';
import { loadDashboardPage } from './pages/dashboard.js?v=20260822-cccf-shared-target-r4';
import { loadSearchPage } from './pages/search.js?v=20260715-phase32d-remaining-async-ux';
import { initLoginModuleGuides } from './login-guides.js?v=20260825-bbs-phase4-r1';
import { MODULE_ORDER, moduleTitleMap } from './module-meta.js?v=20260825-bbs-phase4-r1';

const CARD_IMAGE_EXPORT_V2_MODULES = Object.freeze([
    'dashboard',
    'accident',
    'machine-safety',
    'yokoten',
    'fourm',
    'safety-culture',
    'ojt',
    'training',
    'ky',
]);
window.__TSH_FEATURE_FLAGS__ = window.__TSH_FEATURE_FLAGS__ || {};
if (window.__TSH_FEATURE_FLAGS__.cardImageExportV2 === undefined) {
    window.__TSH_FEATURE_FLAGS__.cardImageExportV2 = [...CARD_IMAGE_EXPORT_V2_MODULES];
}

window.openProfileDrawer  = openProfileDrawer;
window.closeProfileDrawer = closeProfileDrawer;
window.continueAfterProfileUpdate = continueAfterProfileUpdate;

// ======================================================
// Tab State Persistence (sessionStorage)
// ======================================================
window._saveTab = (page, tab) => {
    try { sessionStorage.setItem(`tsh_tab_${page}`, tab); } catch {}
};
window._getTab = (page, defaultTab = '') => {
    try { return sessionStorage.getItem(`tsh_tab_${page}`) || defaultTab; } catch { return defaultTab; }
};

// ======================================================
// Global App State
// ======================================================
const AppState = {
    currentUser: null,
    isAdmin: false
};
let _safetyUnitGateActive = false;

const DEFAULT_BRANDING = {
    appName: 'TSH Safety Core',
    tagline: 'Activity System',
    loginHeroTitle: '',
    loginHeroSubtitle: '',
    logoUrl: ''
};
let _currentBranding = { ...DEFAULT_BRANDING };

function _normalizeBranding(raw = {}) {
    const appName = String(raw.appName || DEFAULT_BRANDING.appName).trim().slice(0, 80) || DEFAULT_BRANDING.appName;
    const tagline = String(raw.tagline || DEFAULT_BRANDING.tagline).trim().slice(0, 80) || DEFAULT_BRANDING.tagline;
    const loginHeroTitle = String(raw.loginHeroTitle || '').trim().slice(0, 140);
    const loginHeroSubtitle = String(raw.loginHeroSubtitle || '').trim().slice(0, 180);
    return {
        appName,
        tagline,
        loginHeroTitle,
        loginHeroSubtitle,
        logoUrl: String(raw.logoUrl || '').trim().slice(0, 1024)
    };
}

function applyAppBranding(branding = {}) {
    _currentBranding = _normalizeBranding(branding);

    document.querySelectorAll('[data-brand-logo]').forEach(el => {
        if (!el.dataset.defaultLogo) el.dataset.defaultLogo = el.innerHTML;
        el.classList.toggle('has-custom-logo', Boolean(_currentBranding.logoUrl));
        const size = Math.max(24, Math.min(64, Number.parseInt(el.dataset.brandSize || '32', 10) || 32));
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.maxWidth = `${size}px`;
        el.style.maxHeight = `${size}px`;
        el.style.overflow = 'hidden';
        if (!_currentBranding.logoUrl) {
            el.innerHTML = el.dataset.defaultLogo;
            return;
        }
        el.innerHTML = '';
        const img = document.createElement('img');
        img.src = _currentBranding.logoUrl;
        img.alt = _currentBranding.appName;
        img.loading = 'eager';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        img.onerror = () => {
            el.classList.remove('has-custom-logo');
            el.innerHTML = el.dataset.defaultLogo || '';
        };
        el.appendChild(img);
    });

    document.querySelectorAll('[data-brand-name]').forEach(el => { el.textContent = _currentBranding.appName; });
    document.querySelectorAll('[data-brand-tagline]').forEach(el => { el.textContent = _currentBranding.tagline; });
    document.querySelectorAll('[data-brand-login-title]').forEach(el => {
        el.textContent = _currentBranding.loginHeroTitle || _currentBranding.appName;
    });
    document.querySelectorAll('[data-brand-login-subtitle]').forEach(el => {
        el.textContent = _currentBranding.loginHeroSubtitle || _currentBranding.tagline;
    });
    document.title = _currentBranding.appName;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', _currentBranding.appName);

    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && _currentBranding.logoUrl) favicon.href = _currentBranding.logoUrl;
}

async function loadAppBranding() {
    try {
        const res = await apiFetch('/public/branding');
        applyAppBranding(res?.data || {});
    } catch (err) {
        applyAppBranding(DEFAULT_BRANDING);
    }
}

window._refreshAppBranding = loadAppBranding;

// ======================================================
// App Bootstrap
// ======================================================
document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
    document.querySelectorAll('[data-module-count]').forEach(el => { el.textContent = String(MODULE_ORDER.length); });
    console.log('🚀 Frontend Application Started');

    await loadAppBranding();
    initLoginModuleGuides();
    setupGlobalEventListeners();
    setupMobileViewportBehavior();

    await captureBbsQrIntent();

    // 🔒 รอ session ให้จบก่อนทำอย่างอื่น
    await initializeSession();
});

// ======================================================
// Session Handling
// ======================================================
async function initializeSession() {
    UI.showLoading('กำลังตรวจสอบเซสชัน...');

    const verification = await TSHSession.refreshSession();

    if (!verification) {
        showLoginScreen();
        return;
    }

    await startApp(verification.user, verification.status || verification.onboardingStatus);
}

async function startApp(user, onboardingStatus = null) {
    AppState.currentUser = user;
    AppState.isAdmin = (user.role === 'Admin' || user.Role === 'Admin');
    _safetyUnitGateActive = false;

    UI.hideLoading();

    // แสดง App / ซ่อน Login
    document.getElementById('login-overlay')?.classList.add('hidden');
    const app = document.getElementById('app-container');
    app.classList.remove('hidden');
    app.style.display = 'flex';
    restoreSidebarState();

    if (user.mustChangePassword) {
        openChangePasswordModal(true);
        return;
    }

    // แสดง User Info + ปุ่มเปิด Profile Drawer
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        const initial = (user.name || '?').charAt(0).toUpperCase();
        userInfo.innerHTML = `
            <button id="open-profile-btn" title="ดูโปรไฟล์"
                class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl
                       hover:bg-emerald-50 dark:hover:bg-slate-700 transition-colors group">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                     style="background:linear-gradient(135deg,#064e3b,#0d9488)">
                    ${initial}
                </div>
                <div class="text-right leading-tight hidden sm:block">
                    <div class="font-semibold text-sm text-slate-700 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        ${user.name}
                        ${AppState.isAdmin
                            ? '<span class="ml-1 text-xs bg-red-100 text-red-600 px-1 rounded">ADMIN</span>'
                            : ''}
                    </div>
                    <div class="text-xs text-slate-400">คลิกเพื่อดูโปรไฟล์</div>
                </div>
                <svg class="w-4 h-4 text-slate-400 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </button>
        `;
        document.getElementById('open-profile-btn')
            ?.addEventListener('click', openProfileDrawer);
    }

    toggleAdminFeatures();
    await refreshBbsNavigation();

    // เริ่ม routing หลัง login สำเร็จเท่านั้น
    const gate = await getSafetyUnitGateRequirement(onboardingStatus);
    if (gate.required) {
        renderSafetyUnitGate(gate.profile, gate.units);
        return;
    }

    if (await consumeBbsQrIntent()) return;
    consumePendingGuideRoute();
    handleRouting();
}

async function captureBbsQrIntent() {
    const match = String(window.location.hash || '').match(/^#bbs-qr=([A-Za-z0-9_-]{43})$/);
    if (!match) return false;
    const token = match[1];
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    try {
        await API.post('/bbs/qr/resolve', { token });
        sessionStorage.setItem('bbs_qr_intent', token);
        return true;
    } catch (error) {
        sessionStorage.removeItem('bbs_qr_intent');
        window.__bbsQrError = error?.message || 'QR นี้ไม่พร้อมใช้งาน';
        return false;
    }
}

async function consumeBbsQrIntent() {
    const token = sessionStorage.getItem('bbs_qr_intent');
    if (!token || !AppState.currentUser) {
        if (window.__bbsQrError) { UI.showToast(window.__bbsQrError, 'error'); delete window.__bbsQrError; }
        return false;
    }
    try {
        const result = await API.post('/bbs/qr/claim', { token, returnRoute:'#bbs-smart-card' });
        sessionStorage.removeItem('bbs_qr_intent');
        if (result.data?.mode === 'observation' && result.data?.employee?.EmployeeID) {
            sessionStorage.setItem('bbs_qr_observed_employee', String(result.data.employee.EmployeeID));
        }
        if (result.data?.mode === 'community' && result.data?.departmentId) {
            sessionStorage.setItem('bbs_community_department_id', String(result.data.departmentId));
        }
        window.location.hash = 'bbs-smart-card';
        handleRouting();
        return true;
    } catch (error) {
        sessionStorage.removeItem('bbs_qr_intent');
        UI.showToast(error?.message || 'ไม่สามารถเปิด BBS Workspace จาก QR นี้ได้', 'error');
        window.location.hash = 'bbs-smart-card';
        handleRouting();
        return true;
    }
}

function consumePendingGuideRoute() {
    const route = String(window.__tshPendingGuideRoute || '').trim();
    delete window.__tshPendingGuideRoute;
    if (!AppState.currentUser || !MODULE_ORDER.includes(route)) return;
    window.location.hash = route;
}

function showLoginScreen() {
    UI.hideLoading();
    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('login-overlay')?.classList.remove('hidden');
}

function handleLogout() {
    TSHSession.logout();
}

function restoreSidebarState() {
    const app = document.getElementById('app-container');
    if (!app) return;

    if (window.innerWidth < 768) {
        app.classList.remove('sidebar-collapsed');
        return;
    }

    try {
        app.classList.toggle('sidebar-collapsed', localStorage.getItem('tsh_sidebar_collapsed') === '1');
    } catch {
        app.classList.remove('sidebar-collapsed');
    }
}

// ======================================================
// Admin Feature Toggle
// ======================================================
function toggleAdminFeatures() {
    document.querySelectorAll('.admin-feature').forEach(el => {
        if (AppState.isAdmin) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
}

async function refreshBbsNavigation() {
    const nav = document.getElementById('bbs-smart-card-nav-item');
    if (!nav) return;
    nav.classList.add('hidden');
    try {
        const response = await apiFetch('/bbs/me/context', { suppressErrorLog: true });
        if (AppState.isAdmin || response?.data?.pilot?.inPilot) nav.classList.remove('hidden');
    } catch (_) {}
}

function normalizeSafetyGateName(value) {
    return String(value ?? '').replace(/[\r\n]/g, '').trim().replace(/\s+/gu, '').toLocaleLowerCase('en-US');
}

async function continueAfterProfileUpdate(result) {
    const status = result?.status || result?.onboardingStatus;
    if (!result?.user || !result?.token
        || !['READY', 'SAFETY_UNIT_REQUIRED'].includes(status)
        || !['ENTER_APP', 'SELECT_SAFETY_UNIT'].includes(result?.nextAction)) {
        throw new TypeError('Profile update response was incomplete.');
    }
    TSHSession.setSession(result.user, result.token);
    AppState.currentUser = result.user;
    AppState.isAdmin = (result.user.role === 'Admin' || result.user.Role === 'Admin');
    closeProfileDrawer();
    await startApp(result.user, status);
}

async function getSafetyUnitGateRequirement(statusHint = null) {
    try {
        const statusRes = statusHint
            ? { status: statusHint }
            : await apiFetch('/onboarding/status');
        const status = statusRes?.status || statusRes?.onboardingStatus;
        if (status !== 'SAFETY_UNIT_REQUIRED') return { required: false };
        const optionsRes = await apiFetch('/register/options');

        const profile = {
            EmployeeID: AppState.currentUser?.id || '',
            EmployeeName: AppState.currentUser?.name || '',
            Department: AppState.currentUser?.department || '',
            Unit: AppState.currentUser?.unit || '',
        };
        const departmentKey = normalizeSafetyGateName(profile.Department);

        const departments = optionsRes?.data?.departments || [];
        const units = optionsRes?.data?.units || [];
        const dept = departments.find(row => normalizeSafetyGateName(row.Name) === departmentKey);
        const deptUnits = dept
            ? units.filter(unit => Number(unit.department_id) === Number(dept.id))
            : [];
        return { required: true, profile, units: deptUnits };
    } catch (err) {
        console.warn('Safety Unit gate check failed:', err?.message || err);
        UI.showToast('ไม่สามารถตรวจสอบ Safety Unit ได้ กรุณาลองใหม่', 'error');
        if (statusHint === 'SAFETY_UNIT_REQUIRED') {
            return { required: true, profile: {}, units: [] };
        }
        return { required: false };
    }
}

function renderSafetyUnitGate(profile, units) {
    _safetyUnitGateActive = true;
    document.querySelectorAll('.page-content').forEach(p => {
        p.classList.add('hidden');
        p.style.display = 'none';
    });
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = 'Safety Unit Required';
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    const main = document.getElementById('main-content');
    if (!main) return;
    let gate = document.getElementById('safety-unit-gate-page');
    if (!gate) {
        gate = document.createElement('div');
        gate.id = 'safety-unit-gate-page';
        main.appendChild(gate);
    }
    const options = units.map(unit => {
        const name = unit.name || unit.Name || '';
        return `<option value="${UI.escHtml(name)}">${UI.escHtml(name)}${unit.short_code ? ` · ${UI.escHtml(unit.short_code)}` : ''}</option>`;
    }).join('');
    gate.className = 'min-h-full flex items-center justify-center py-10';
    gate.innerHTML = `
        <section class="w-full max-w-xl rounded-2xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 bg-emerald-50/70">
                <p class="text-[10px] font-black uppercase tracking-widest text-emerald-700">First-use setup</p>
                <h2 class="mt-1 text-lg font-black text-slate-800">เลือก Safety Unit ก่อนใช้งาน</h2>
                <p class="mt-1 text-sm text-slate-500">แผนกของคุณมีการตั้งค่า Safety Unit ไว้ กรุณาเลือกหน่วยงานของคุณเพื่อเปิดใช้งานระบบต่อ</p>
            </div>
            <form id="safety-unit-gate-form" class="p-5 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Employee</p>
                        <p class="mt-1 font-bold text-slate-700">${UI.escHtml(profile.EmployeeName || AppState.currentUser?.name || '-')}</p>
                        <p class="text-xs text-slate-400">${UI.escHtml(profile.EmployeeID || AppState.currentUser?.id || '')}</p>
                    </div>
                    <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Department</p>
                        <p class="mt-1 font-bold text-slate-700">${UI.escHtml(profile.Department || AppState.currentUser?.department || '-')}</p>
                    </div>
                </div>
                <label class="block">
                    <span class="block text-xs font-bold text-slate-500 uppercase mb-1.5">Safety Unit <span class="text-red-500">*</span></span>
                    <select id="safety-unit-gate-select" required class="form-input w-full rounded-xl border-slate-200 text-sm">
                        <option value="">-- เลือก Safety Unit --</option>
                        ${options}
                    </select>
                </label>
                <div id="safety-unit-gate-error" class="hidden rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600"></div>
                <button type="button" id="safety-unit-gate-recheck"
                    class="hidden w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
                    ตรวจสอบสถานะอีกครั้ง
                </button>
                <div class="flex flex-col sm:flex-row gap-2 sm:justify-between pt-2">
                    <button type="button" id="safety-unit-gate-logout" class="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50">ออกจากระบบ</button>
                    <button type="submit" id="safety-unit-gate-save" class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">บันทึกและเข้าใช้งาน</button>
                </div>
            </form>
        </section>`;

    document.getElementById('safety-unit-gate-logout')?.addEventListener('click', handleLogout);
    document.getElementById('safety-unit-gate-form')?.addEventListener('submit', guardSubmitHandler(handleSafetyUnitGateSubmit));
    document.getElementById('safety-unit-gate-recheck')?.addEventListener('click', recoverSafetyUnitContinuation);
}

async function handleSafetyUnitGateSubmit(event) {
    event.preventDefault();
    const select = document.getElementById('safety-unit-gate-select');
    const errorEl = document.getElementById('safety-unit-gate-error');
    const btn = document.getElementById('safety-unit-gate-save');
    const recheckBtn = document.getElementById('safety-unit-gate-recheck');
    const unit = String(select?.value || '').trim();
    if (!unit) {
        if (errorEl) {
            errorEl.textContent = 'กรุณาเลือก Safety Unit';
            errorEl.classList.remove('hidden');
        }
        return;
    }
    if (errorEl) errorEl.classList.add('hidden');
    recheckBtn?.classList.add('hidden');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'กำลังบันทึก...';
    }
    try {
        const res = await apiFetch('/profile/safety-unit', {
            method: 'PUT',
            body: JSON.stringify({ Unit: unit })
        });
        const status = res?.status || res?.onboardingStatus;
        if (!res?.user || !res?.token || status !== 'READY' || res?.nextAction !== 'ENTER_APP') {
            const ambiguousError = new TypeError('Safety Unit response was incomplete.');
            ambiguousError.recoveryRequired = true;
            throw ambiguousError;
        }
        TSHSession.setSession(res.user, res.token);
        AppState.currentUser = res.user;
        AppState.isAdmin = (res.user.role === 'Admin' || res.user.Role === 'Admin');
        _safetyUnitGateActive = false;
        document.getElementById('safety-unit-gate-page')?.remove();
        UI.showToast('บันทึก Safety Unit สำเร็จ', 'success');
        await startApp(res.user, status);
    } catch (err) {
        const ambiguousFailure = err instanceof TypeError
            || err?.recoveryRequired === true
            || err?.code === 'ONBOARDING_STATE_UNAVAILABLE'
            || err?.code === 'ONBOARDING_ALREADY_COMPLETED'
            || err?.code === 'SAFETY_UNIT_NOT_REQUIRED';
        if (errorEl) {
            errorEl.textContent = ambiguousFailure
                ? 'ผลการบันทึกยังไม่แน่นอน กำลังตรวจสอบสถานะล่าสุด'
                : (err?.message || 'ไม่สามารถบันทึก Safety Unit ได้');
            errorEl.classList.remove('hidden');
        }
        if (ambiguousFailure) {
            recheckBtn?.classList.remove('hidden');
            await recoverSafetyUnitContinuation();
            return;
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'บันทึกและเข้าใช้งาน';
        }
    }
}

// ======================================================
// Routing (Hash-based)
// ======================================================
// ─── Page Title Map ────────────────────────────────────────────────────────────
const PAGE_TITLES = moduleTitleMap({
    dashboard: 'ภาพรวม',
    search: 'ค้นหารายบุคคล',
    'johnny-ai': 'Johnny AI',
    admin: 'System Console',
    employee: 'ข้อมูลพนักงาน',
    forklift: 'ใบอนุญาตรถยก',
});

async function handleRouting() {
    if (!AppState.currentUser) {
        console.warn('⛔ Routing blocked: not authenticated');
        return;
    }

    if (_safetyUnitGateActive) {
        console.warn('Routing blocked: Safety Unit is required');
        return;
    }

    const hash = window.location.hash.replace('#', '') || 'dashboard';
    document.body.dataset.activePage = hash;
    console.log('➡️ Navigate:', hash);

    // อัปเดต page title ใน header
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = PAGE_TITLES[hash] || hash;

    // อัปเดต active state ใน sidebar nav
    document.querySelectorAll('.nav-link').forEach(el => {
        const href = el.getAttribute('href')?.replace('#', '');
        if (href === hash) el.classList.add('active');
        else el.classList.remove('active');
    });

    // ปิด sidebar บน mobile เมื่อ navigate
    if (window.innerWidth < 768) {
        document.getElementById('sidebar')?.classList.add('-translate-x-full');
        document.getElementById('sidebar')?.classList.remove('translate-x-0');
        document.getElementById('sidebar-backdrop')?.classList.remove('open');
        document.getElementById('btab-more')?.classList.remove('btab-more-open');
        document.body.classList.remove('mobile-sidebar-open');
    }

    // อัปเดต active state ใน bottom tab bar
    const _btabMap = { dashboard:'dashboard', patrol:'patrol', cccf:'patrol', hiyari:'hiyari', fourm:'fourm' };
    const _btabActive = _btabMap[hash] || null;
    document.querySelectorAll('#bottom-tab-bar .btab[data-btab]').forEach(tab => {
        if (tab.getAttribute('data-btab') === _btabActive) tab.classList.add('btab-active');
        else tab.classList.remove('btab-active');
    });

    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-content').forEach(p => {
        p.classList.add('hidden');
        p.style.display = 'none';
    });

    const targetId = `${hash}-page`;
    const target = document.getElementById(targetId);

    if (!target) {
        console.error(`❌ Page not found: ${targetId}`);
        window.location.hash = 'dashboard';
        return;
    }

    target.classList.remove('hidden');
    target.style.display = 'block';
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.scrollTo({ top: 0, left: 0 });

    // Load page data
    switch (hash) {
        case 'policy':
            await loadPolicyPage();
            break;
        case 'committee':
            await loadCommitteePage();
            break;
        case 'kpi':
            await loadKpiPage();
            break;
        case 'patrol':
            await loadPatrolPage();
            break;
        case 'cccf':
            await loadCccfPage();
            break;
        case 'yokoten':
            await loadYokotenPage();
            break;
        case 'admin':
            if (AppState.isAdmin) loadAdminPage();
            else alert('ไม่มีสิทธิ์เข้าหน้านี้');
            break;
        case 'employee':
            // รวมเข้า System Console แล้ว — redirect ไป #admin tab employees
            window.location.hash = 'admin';
            await loadAdminPage();
            setTimeout(() => window._adminTab?.('employees'), 100);
            break;
        case 'machine-safety':
            await loadMachineSafetyPage();
            break;
        case 'forklift':
            await loadForkliftPage();
            break;
        case 'ojt':
            await loadOjtPage();
            break;
        case 'training':
            await loadTrainingPage();
            break;
        case 'accident':
            await loadAccidentPage();
            break;
        case 'safety-culture':
            await loadSafetyCulturePage();
            break;
        case 'bbs-smart-card':
            await loadBbsSmartCardPage();
            break;
        case 'contractor':
            await loadContractorPage();
            break;
        case 'hiyari':
            await loadHiyariPage();
            break;
        case 'ky':
            await loadKyPage();
            break;
        case 'fourm':
            await loadFourmPage();
            break;
        case 'johnny-ai':
            await loadJohnnyAiPage();
            break;
        case 'dashboard':
            await loadDashboardPage();
            break;
        case 'search':
            await loadSearchPage();
            break;
        default:
            loadPlaceholderPage(targetId, hash);
    }
}

// ======================================================
// Login / Global Events
// ======================================================
function setupGlobalEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', guardSubmitHandler(handleLogin));
    window.__tshLoginReady = true;

    // Hash change
    window.addEventListener('hashchange', handleRouting);

    // Sidebar toggle (mobile + desktop rail)
    (function() {
        const appEl      = document.getElementById('app-container');
        const sidebarEl  = document.getElementById('sidebar');
        const backdropEl = document.getElementById('sidebar-backdrop');
        const moreBtn    = document.getElementById('btab-more');
        const collapseBtn = document.getElementById('sidebar-collapse-btn');

        function _openSidebar() {
            sidebarEl?.classList.remove('-translate-x-full');
            sidebarEl?.classList.add('translate-x-0');
            backdropEl?.classList.add('open');
            moreBtn?.classList.add('btab-more-open');
            document.body.classList.add('mobile-sidebar-open');
        }
        function _closeSidebar() {
            sidebarEl?.classList.add('-translate-x-full');
            sidebarEl?.classList.remove('translate-x-0');
            backdropEl?.classList.remove('open');
            moreBtn?.classList.remove('btab-more-open');
            document.body.classList.remove('mobile-sidebar-open');
        }
        function _toggleDesktopSidebar() {
            if (window.innerWidth < 768) {
                _openSidebar();
                return;
            }
            appEl?.classList.toggle('sidebar-collapsed');
            try {
                localStorage.setItem('tsh_sidebar_collapsed', appEl?.classList.contains('sidebar-collapsed') ? '1' : '0');
            } catch {}
        }

        document.getElementById('sidebar-toggle')?.addEventListener('click', _openSidebar);
        document.getElementById('desktop-sidebar-toggle')?.addEventListener('click', _toggleDesktopSidebar);
        collapseBtn?.addEventListener('click', _toggleDesktopSidebar);
        backdropEl?.addEventListener('click', _closeSidebar);
        moreBtn?.addEventListener('click', _openSidebar);
        sidebarEl?.addEventListener('click', (event) => {
            if (window.innerWidth < 768 && event.target.closest('a.nav-link')) _closeSidebar();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') _closeSidebar();
        });
        window.addEventListener('resize', () => {
            restoreSidebarState();
            if (window.innerWidth >= 768) _closeSidebar();
        });
    })();

    // Global click handler
    document.body.addEventListener('click', (e) => {
        const el = e.target.closest('button, a');
        if (!el) return;

        if (el.id === 'user-logout-btn' || el.id === 'mobile-header-logout-btn') {
            handleLogout();
            return;
        }

        if (el.tagName === 'A' && shouldOpenDocumentViewer(e, el)) {
            e.preventDefault();
            UI.showDocumentModal(el.href, el.dataset.title || el.textContent.trim() || 'เอกสาร');
            return;
        }

        if (el.id === 'modal-close-btn' || el.id === 'modal-backdrop') {
            UI.closeModal();
        }
    });
}

function setupMobileViewportBehavior() {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const editableSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea, [contenteditable="true"]';
    let focusTimer = null;
    let settleTimer = null;

    const isMobileLayout = () => window.innerWidth < 768;
    const hasEditableFocus = () => document.activeElement?.matches?.(editableSelector);
    const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const recoverOverlayState = () => {
        const wrapper = document.getElementById('modal-wrapper');
        const hasSharedModal = !!wrapper && !wrapper.classList.contains('hidden');
        const hasModuleDialog = !!document.querySelector('[data-mobile-overlay-dialog="true"]');
        const hasVisibleModal = (hasSharedModal || hasModuleDialog) && document.body.classList.contains('mobile-modal-open');
        const hasDocumentViewer = !!document.getElementById('__dv_overlay') && document.body.classList.contains('mobile-document-viewer-open');
        const overlayActive = hasVisibleModal || hasDocumentViewer;
        document.body.dataset.mobileOverlayActive = overlayActive ? '1' : '0';
        if (!hasVisibleModal) document.body.classList.remove('mobile-modal-open');
        if (!hasDocumentViewer) document.body.classList.remove('mobile-document-viewer-open');
        if (!overlayActive && !hasEditableFocus()) document.body.classList.remove('mobile-keyboard-open');
    };
    const updateViewport = () => {
        const height = viewport?.height || window.innerHeight;
        const offsetTop = viewport?.offsetTop || 0;
        const roundedHeight = Math.round(height);
        recoverOverlayState();
        const keyboardOpen = isMobileLayout() && hasEditableFocus();

        root.style.setProperty('--app-visual-viewport-height', `${roundedHeight}px`);
        root.style.setProperty('--app-visual-viewport-offset-top', `${Math.round(offsetTop)}px`);
        document.body.classList.toggle('mobile-keyboard-open', keyboardOpen);
        document.body.classList.toggle('mobile-pwa-standalone', isStandalone());
    };
    const settleViewport = () => {
        clearTimeout(settleTimer);
        updateViewport();
        requestAnimationFrame(updateViewport);
        settleTimer = setTimeout(updateViewport, 320);
    };
    const bringFocusedFieldIntoView = (target) => {
        if (!isMobileLayout() || !target?.matches?.(editableSelector)) return;
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
            updateViewport();
            target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        }, 180);
    };

    settleViewport();
    viewport?.addEventListener('resize', () => updateViewport());
    viewport?.addEventListener('scroll', () => updateViewport());
    window.addEventListener('resize', () => settleViewport());
    window.addEventListener('orientationchange', () => setTimeout(settleViewport, 350));
    window.addEventListener('tsh:mobile-overlay-state', settleViewport);
    window.addEventListener('hashchange', settleViewport);
    window.addEventListener('pageshow', settleViewport);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') settleViewport();
    });
    document.addEventListener('focusin', (event) => bringFocusedFieldIntoView(event.target));
    document.addEventListener('focusout', () => {
        clearTimeout(focusTimer);
        setTimeout(() => settleViewport(), 180);
    });
}

function shouldOpenDocumentViewer(event, link) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return false;
    if (link.closest('#__dv_overlay')) return false;
    if (link.hasAttribute('download')) return false;
    const rawHref = link.getAttribute('href') || '';
    if (!rawHref || rawHref.startsWith('#') || /^(mailto|tel|javascript):/i.test(rawHref)) return false;

    const fileExtPattern = /\.(pdf|png|jpe?g|gif|webp|avif|docx?|xlsx?|pptx?|mp4|webm|ogg|mov)(\?|#|$)/i;
    const looksLikeUpload = /\/uploads\//i.test(rawHref) || /\/uploads\//i.test(link.href);
    const looksLikeFile = fileExtPattern.test(rawHref) || fileExtPattern.test(link.href);

    return looksLikeUpload || looksLikeFile;
}

// ======================================================
// Change Password Modal
// ======================================================
function openChangePasswordModal(forced = false) {
    const html = `
        <form id="change-password-form" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    รหัสผ่านปัจจุบัน
                </label>
                <input id="cp-current" type="password" required autocomplete="current-password"
                    placeholder="กรอกรหัสผ่านปัจจุบัน"
                    class="w-full px-3 py-2 form-input rounded-lg border dark:bg-slate-800 dark:border-slate-600">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    รหัสผ่านใหม่
                </label>
                <input id="cp-new" type="password" required autocomplete="new-password"
                    placeholder="อย่างน้อย 4 ตัวอักษร"
                    class="w-full px-3 py-2 form-input rounded-lg border dark:bg-slate-800 dark:border-slate-600"
                    oninput="_cpPwdStrength(this.value)">
                <!-- Strength meter -->
                <div id="cp-pwd-strength" class="mt-1.5 hidden">
                    <div class="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div id="cp-pwd-bar" class="h-full rounded-full transition-all duration-300" style="width:0%"></div>
                    </div>
                    <p id="cp-pwd-label" class="text-xs mt-1 font-medium"></p>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ยืนยันรหัสผ่านใหม่
                </label>
                <input id="cp-confirm" type="password" required autocomplete="new-password"
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                    class="w-full px-3 py-2 form-input rounded-lg border dark:bg-slate-800 dark:border-slate-600">
            </div>

            <div id="cp-error" class="text-sm text-red-500 font-medium hidden"></div>
            <button type="button" id="cp-recheck-btn"
                class="hidden w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                ตรวจสอบสถานะอีกครั้ง
            </button>

            <div class="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                ${forced ? '' : '<button type="button" id="cp-cancel-btn" class="btn btn-secondary px-5">ยกเลิก</button>'}
                <button type="submit" id="cp-submit-btn"
                    class="btn btn-primary px-5">เปลี่ยนรหัสผ่าน</button>
            </div>
        </form>
    `;

    UI.openModal('🔐 เปลี่ยนรหัสผ่าน', html, 'max-w-sm');
    document.getElementById('change-password-form')?.setAttribute('data-forced', forced ? '1' : '0');
    if (forced) document.getElementById('modal-close-btn')?.classList.add('hidden');

    setTimeout(() => {
        document.getElementById('cp-cancel-btn')?.addEventListener('click', UI.closeModal);
        document.getElementById('change-password-form')?.addEventListener('submit', guardSubmitHandler(handleChangePassword));
        document.getElementById('cp-recheck-btn')?.addEventListener('click', recoverPasswordContinuation);
    }, 50);
}

function _cpPwdStrength(pw) {
    const wrap  = document.getElementById('cp-pwd-strength');
    const bar   = document.getElementById('cp-pwd-bar');
    const label = document.getElementById('cp-pwd-label');
    if (!wrap) return;
    if (!pw) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    let score = 0;
    if (pw.length >= 4)          score++;
    if (/[a-z]/.test(pw))        score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    const levels = [
        { width: '20%',  color: '#ef4444', text: 'อ่อนมาก',   textColor: '#ef4444' },
        { width: '40%',  color: '#f97316', text: 'อ่อน',      textColor: '#f97316' },
        { width: '60%',  color: '#eab308', text: 'ปานกลาง',   textColor: '#ca8a04' },
        { width: '80%',  color: '#84cc16', text: 'ดี',         textColor: '#65a30d' },
        { width: '100%', color: '#22c55e', text: 'แข็งแกร่ง', textColor: '#16a34a' },
    ];
    const lvl = levels[Math.min(score - 1, 4)] || levels[0];
    bar.style.width      = lvl.width;
    bar.style.background = lvl.color;
    label.textContent    = lvl.text;
    label.style.color    = lvl.textColor;
}
window._cpPwdStrength = _cpPwdStrength;

async function handleChangePassword(e) {
    e.preventDefault();

    const currentPassword = document.getElementById('cp-current')?.value;
    const newPassword     = document.getElementById('cp-new')?.value;
    const confirmPassword = document.getElementById('cp-confirm')?.value;
    const errorEl         = document.getElementById('cp-error');
    const submitBtn       = document.getElementById('cp-submit-btn');
    const recheckBtn      = document.getElementById('cp-recheck-btn');

    // Validation
    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    };
    errorEl.classList.add('hidden');
    recheckBtn?.classList.add('hidden');

    if (newPassword.length < 4) {
        return showError('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
    }
    if (newPassword !== confirmPassword) {
        return showError('รหัสผ่านใหม่ไม่ตรงกัน กรุณากรอกอีกครั้ง');
    }

    // Submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    try {
        const res = await apiFetch('/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        const forced = e.currentTarget?.dataset?.forced === '1';
        if (!res?.user || !res?.token || !res?.nextAction) {
            const ambiguousError = new TypeError('Password change response was incomplete.');
            ambiguousError.recoveryRequired = true;
            throw ambiguousError;
        }
        TSHSession.setSession(res.user, res.token);
        AppState.currentUser = res.user;
        AppState.isAdmin = (res.user.role === 'Admin' || res.user.Role === 'Admin');
        UI.closeModal();
        UI.showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
        if (forced || res.nextAction === 'SELECT_SAFETY_UNIT') {
            // Let the password modal finish its close animation before the next
            // onboarding surface is rendered, otherwise both overlays briefly stack.
            await new Promise(resolve => setTimeout(resolve, 320));
            await startApp(res.user, res.status || res.onboardingStatus);
        }
    } catch (err) {
        showError(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        const networkOrAmbiguousFailure = err instanceof TypeError
            || err?.recoveryRequired === true
            || err?.code === 'ONBOARDING_STATE_UNAVAILABLE';
        if (networkOrAmbiguousFailure) {
            showError('การตอบกลับขาดหาย กรุณาตรวจสอบสถานะก่อนส่งซ้ำ');
            recheckBtn?.classList.remove('hidden');
            await recoverPasswordContinuation();
            return;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'เปลี่ยนรหัสผ่าน';
    }
}

async function recoverSafetyUnitContinuation() {
    const recheckBtn = document.getElementById('safety-unit-gate-recheck');
    const errorEl = document.getElementById('safety-unit-gate-error');
    if (recheckBtn) {
        recheckBtn.disabled = true;
        recheckBtn.textContent = 'กำลังตรวจสอบ...';
        recheckBtn.classList.remove('hidden');
    }

    const verification = await TSHSession.refreshSession({ preserveOnFailure: true });
    if (!verification) {
        if (errorEl) {
            errorEl.textContent = 'ยังตรวจสอบสถานะไม่ได้ เซสชันเดิมยังถูกเก็บไว้ กรุณาลองอีกครั้ง';
            errorEl.classList.remove('hidden');
        }
        if (recheckBtn) {
            recheckBtn.disabled = false;
            recheckBtn.textContent = 'ตรวจสอบสถานะอีกครั้ง';
        }
        return;
    }

    const status = verification.status || verification.onboardingStatus;
    if (status === 'READY') {
        _safetyUnitGateActive = false;
        document.getElementById('safety-unit-gate-page')?.remove();
        UI.showToast('ยืนยันการบันทึก Safety Unit แล้ว', 'success');
        await startApp(verification.user, status);
        return;
    }
    if (status === 'PASSWORD_CHANGE_REQUIRED') {
        _safetyUnitGateActive = false;
        document.getElementById('safety-unit-gate-page')?.remove();
        await startApp(verification.user, status);
        return;
    }
    if (status === 'SAFETY_UNIT_REQUIRED') {
        AppState.currentUser = verification.user;
        const gate = await getSafetyUnitGateRequirement(status);
        if (gate.required) renderSafetyUnitGate(gate.profile, gate.units);
        const refreshedError = document.getElementById('safety-unit-gate-error');
        if (refreshedError) {
            refreshedError.textContent = 'ระบบยังไม่ได้บันทึก Safety Unit กรุณาเลือกและส่งใหม่';
            refreshedError.classList.remove('hidden');
        }
        return;
    }

    if (errorEl) {
        errorEl.textContent = 'ไม่สามารถยืนยันสถานะ onboarding ได้ กรุณาตรวจสอบอีกครั้ง';
        errorEl.classList.remove('hidden');
    }
    if (recheckBtn) {
        recheckBtn.disabled = false;
        recheckBtn.textContent = 'ตรวจสอบสถานะอีกครั้ง';
    }
}

async function recoverPasswordContinuation() {
    const recheckBtn = document.getElementById('cp-recheck-btn');
    const errorEl = document.getElementById('cp-error');
    if (recheckBtn) {
        recheckBtn.disabled = true;
        recheckBtn.textContent = 'กำลังตรวจสอบ...';
    }
    const verification = await TSHSession.refreshSession({ preserveOnFailure: true });
    if (!verification) {
        if (errorEl) {
            errorEl.textContent = 'ยังตรวจสอบสถานะไม่ได้ เซสชันเดิมยังถูกเก็บไว้ กรุณาลองอีกครั้ง';
            errorEl.classList.remove('hidden');
        }
        if (recheckBtn) {
            recheckBtn.disabled = false;
            recheckBtn.textContent = 'ตรวจสอบสถานะอีกครั้ง';
        }
        return;
    }

    const status = verification.status || verification.onboardingStatus;
    if (status === 'PASSWORD_CHANGE_REQUIRED') {
        if (errorEl) {
            errorEl.textContent = 'ระบบยังไม่ได้บันทึกรหัสผ่าน คุณสามารถตรวจสอบข้อมูลแล้วส่งใหม่ได้';
            errorEl.classList.remove('hidden');
        }
        recheckBtn?.classList.add('hidden');
        return;
    }

    UI.closeModal();
    UI.showToast('ยืนยันการเปลี่ยนรหัสผ่านแล้ว', 'success');
    await startApp(verification.user, status);
}

async function handleLogin(e) {
    e.preventDefault();

    const empId = document.getElementById('login-employee-id').value;
    const pwd = document.getElementById('login-password').value;
    const errorBox = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    errorBox.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังเข้าสู่ระบบ...';

    const ok = await TSHSession.login(empId.trim(), pwd);
    if (!ok) {
        errorBox.textContent = window.__tshLoginError || 'เข้าสู่ระบบไม่สำเร็จ';
        submitBtn.disabled = false;
        submitBtn.textContent = 'เข้าสู่ระบบ';
        return;
    }

    const user = TSHSession.getUser();
    await startApp(user);
}

// ======================================================
// Placeholder Page
// ======================================================
function loadPlaceholderPage(id, title) {
    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <h2 class="text-xl font-semibold">${title}</h2>
            <p class="mt-2">หน้านี้กำลังพัฒนา</p>
        </div>
    `;
}
