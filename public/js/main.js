// public/js/main.js
// ======================================================
// TSH Safety Core - Frontend Main Controller (FINAL)
// ======================================================

import * as UI from './ui.js?v=20260714-phase21-platform-shell';
import { API, apiFetch } from './api.js?v=20260917-bbs-qr-login-intent-r1';
import { guardSubmitHandler } from './utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';

// Route modules are loaded only after authentication and only when requested.
// Keeping them out of the Login dependency graph avoids parsing every workspace before sign-in.
const lazyPage = (modulePath, exportName) => async (...args) => {
    const module = await import(modulePath);
    return module[exportName](...args);
};
const loadPolicyPage = lazyPage('./pages/policy.js?v=20261011-design-system-a11y-r1', 'loadPolicyPage');
const loadCommitteePage = lazyPage('./pages/committee.js?v=20260715-phase32d-remaining-async-ux', 'loadCommitteePage');
const loadPatrolPage = lazyPage('./pages/patrol.js?v=20261026-patrol-mode-state-r1', 'loadPatrolPage');
const loadCccfPage = lazyPage('./pages/cccf.js?v=20260907-cccf-permanent-pdf-layout-r2', 'loadCccfPage');
const loadKpiPage = lazyPage('./pages/kpi.js?v=20261011-design-system-a11y-r1', 'loadKpiPage');
const loadYokotenPage = lazyPage('./pages/yokoten.js?v=20260825-yokoten-department-relevance-r1', 'loadYokotenPage');
const loadAdminPage = lazyPage('./pages/admin.js?v=20261029-safety-vote-eligibility-freeze-race-r1', 'loadAdminPage');
const loadMachineSafetyPage = lazyPage('./pages/machine-safety.js?v=20261011-design-system-a11y-r1', 'loadMachineSafetyPage');
const loadForkliftPage = lazyPage('./pages/forklift.js?v=20261011-design-system-a11y-r1', 'loadForkliftPage');
const loadOjtPage = lazyPage('./pages/ojt.js?v=20260820-card-image-phase2d', 'loadOjtPage');
const loadTrainingPage = lazyPage('./pages/training.js?v=20260820-card-image-phase2d-rollout-r2', 'loadTrainingPage');
const loadAccidentPage = lazyPage('./pages/accident.js?v=20261002-accident-accessibility-r3', 'loadAccidentPage');
const loadSafetyCulturePage = lazyPage('./pages/safety-culture.js?v=20261011-design-system-a11y-r1', 'loadSafetyCulturePage');
const loadBbsSmartCardPage = lazyPage('./pages/bbs-smart-card.js?v=20261019-local-production-css-r1', 'loadBbsSmartCardPage');
const loadContractorPage = lazyPage('./pages/contractor.js?v=20260715-phase32d-remaining-async-ux', 'loadContractorPage');
const loadHiyariPage = lazyPage('./pages/hiyari.js?v=20260907-hiyari-pdf-summary-r2', 'loadHiyariPage');
const loadKyPage = lazyPage('./pages/ky.js?v=20261015-ky-video-manager-r4', 'loadKyPage');
const loadFourmPage = lazyPage('./pages/fourm.js?v=20261011-fourm-chart-containment-r1', 'loadFourmPage');
const loadJohnnyAiPage = lazyPage('./pages/johnny-ai.js?v=20261011-johnny-admin-workspace-r1', 'loadJohnnyAiPage');
const loadSafetyVotePage = lazyPage('./pages/safety-vote-page-ux1.js?v=20261029-safety-vote-jury-revocation-r1', 'loadSafetyVotePage');
import { initJohnnyDrawer, syncJohnnyDrawerRoute, destroyJohnnyDrawer } from './johnny-drawer.js?v=20261010-johnny-draggable-launcher-r1';
import { openProfileDrawer, closeProfileDrawer } from './pages/profile.js?v=20260924-company-email-self-service-r1';
const loadDashboardPage = lazyPage('./pages/dashboard.js?v=20260822-cccf-shared-target-r4', 'loadDashboardPage');
const loadSearchPage = lazyPage('./pages/search.js?v=20261005-safety360-data-integrity-r1', 'loadSearchPage');
import { initLoginModuleGuides } from './login-guides.js?v=20261011-login-branding-background-r2';
import { loadVendorsForPage } from './utils/vendor-loader.js?v=20261019-route-vendors-r1';
import { MODULE_ORDER, moduleTitleMap } from './module-meta.js?v=20260825-bbs-phase4-r1';
import { BBS_QR_INTENT_KEY, BBS_QR_PENDING_KEY, shouldDiscardBbsQrIntent, isBbsRolloutBlockedError, normalizeBbsQrRoute } from './utils/bbs-qr-intent.js?v=20260917-bbs-qr-login-intent-r1';
import { captureFileLibraryIntent, consumeFileLibraryIntent } from './file-library-link.js?v=20261012-file-library-access-r2';

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
const FIRST_LOGIN_REENTRY_KEY = 'tsh_first_login_reentry';
let _companyEmailVerificationResult = null;
let _passwordResetToken = null;
const APP_BOOTSTRAP_TIMEOUTS = Object.freeze({ branding: 4000, session: 8000 });

const DEFAULT_BRANDING = {
    appName: 'TSH Safety Core',
    tagline: 'Activity System',
    loginHeroTitle: '',
    loginHeroSubtitle: '',
    logoUrl: '',
    loginBackgroundUrl: '',
    loginBackgroundFit: 'cover',
    loginBackgroundFocusX: 50,
    loginBackgroundFocusY: 50,
    loginAnnouncementEnabled: false,
    loginAnnouncementTone: 'info',
    loginAnnouncementTitle: '',
    loginAnnouncementMessage: '',
    loginAnnouncementStartAt: '',
    loginAnnouncementEndAt: '',
    loginAnnouncementLinkLabel: '',
    loginAnnouncementUrl: '',
    supportTitle: 'ต้องการความช่วยเหลือ?',
    supportEmail: '',
    supportPhone: '',
    supportHours: '',
    supportLinkLabel: '',
    supportUrl: ''
};
let _currentBranding = { ...DEFAULT_BRANDING };
const _loginBrandMediaQuery = window.matchMedia('(min-width: 768px)');

function _normalizeBranding(raw = {}) {
    const normalizeFocus = value => {
        const numeric = Number(value ?? 50);
        return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 50;
    };
    const appName = String(raw.appName || DEFAULT_BRANDING.appName).trim().slice(0, 80) || DEFAULT_BRANDING.appName;
    const tagline = String(raw.tagline || DEFAULT_BRANDING.tagline).trim().slice(0, 80) || DEFAULT_BRANDING.tagline;
    const loginHeroTitle = String(raw.loginHeroTitle || '').trim().slice(0, 140);
    const loginHeroSubtitle = String(raw.loginHeroSubtitle || '').trim().slice(0, 180);
    const safeUrl = value => {
        const url = String(value || '').trim().slice(0, 1024);
        return url === '' || url.startsWith('/') || /^https:\/\//i.test(url) ? url : '';
    };
    const announcementTone = ['info', 'warning', 'critical'].includes(String(raw.loginAnnouncementTone))
        ? String(raw.loginAnnouncementTone)
        : 'info';
    return {
        appName,
        tagline,
        loginHeroTitle,
        loginHeroSubtitle,
        logoUrl: String(raw.logoUrl || '').trim().slice(0, 1024),
        loginBackgroundUrl: String(raw.loginBackgroundUrl || '').trim().slice(0, 1024),
        loginBackgroundFit: String(raw.loginBackgroundFit) === 'contain' ? 'contain' : 'cover',
        loginBackgroundFocusX: normalizeFocus(raw.loginBackgroundFocusX),
        loginBackgroundFocusY: normalizeFocus(raw.loginBackgroundFocusY),
        loginAnnouncementEnabled: raw.loginAnnouncementEnabled === true || raw.loginAnnouncementEnabled === 1 || raw.loginAnnouncementEnabled === '1',
        loginAnnouncementTone: announcementTone,
        loginAnnouncementTitle: String(raw.loginAnnouncementTitle || '').trim().slice(0, 100),
        loginAnnouncementMessage: String(raw.loginAnnouncementMessage || '').trim().slice(0, 300),
        loginAnnouncementStartAt: String(raw.loginAnnouncementStartAt || '').trim().slice(0, 40),
        loginAnnouncementEndAt: String(raw.loginAnnouncementEndAt || '').trim().slice(0, 40),
        loginAnnouncementLinkLabel: String(raw.loginAnnouncementLinkLabel || '').trim().slice(0, 60),
        loginAnnouncementUrl: safeUrl(raw.loginAnnouncementUrl),
        supportTitle: String(raw.supportTitle || DEFAULT_BRANDING.supportTitle).trim().slice(0, 80) || DEFAULT_BRANDING.supportTitle,
        supportEmail: String(raw.supportEmail || '').trim().slice(0, 160),
        supportPhone: String(raw.supportPhone || '').trim().slice(0, 40),
        supportHours: String(raw.supportHours || '').trim().slice(0, 120),
        supportLinkLabel: String(raw.supportLinkLabel || '').trim().slice(0, 60),
        supportUrl: safeUrl(raw.supportUrl)
    };
}

function _resolveBrandAssetUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw, window.location.href);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        if (raw.startsWith('/') && parsed.pathname.includes('/uploads/')) {
            const storedName = parsed.pathname.split('/').pop();
            if (!storedName) return '';
            const localAsset = new URL(`uploads/${storedName}`, document.baseURI);
            localAsset.search = parsed.search;
            return localAsset.href;
        }
        return parsed.href;
    } catch (_) {
        return '';
    }
}

function _loginAnnouncementIsActive(branding, now = Date.now()) {
    if (!branding.loginAnnouncementEnabled) return false;
    if (!branding.loginAnnouncementTitle && !branding.loginAnnouncementMessage) return false;
    const start = Date.parse(branding.loginAnnouncementStartAt || '');
    const end = Date.parse(branding.loginAnnouncementEndAt || '');
    if (Number.isFinite(start) && now < start) return false;
    if (Number.isFinite(end) && now > end) return false;
    return true;
}

function _renderLoginCommunications(root = document, branding = _currentBranding) {
    root.querySelectorAll('[data-login-system-announcement]').forEach(announcement => {
        const active = _loginAnnouncementIsActive(branding);
        const brandSurface = announcement.dataset.loginAnnouncementSurface === 'brand';
        const tones = {
            info: ['border-sky-200 bg-sky-50 text-sky-900', 'bg-sky-100 text-sky-700', 'i'],
            warning: ['border-amber-200 bg-amber-50 text-amber-950', 'bg-amber-100 text-amber-700', '!'],
            critical: ['border-rose-200 bg-rose-50 text-rose-950', 'bg-rose-100 text-rose-700', '!']
        };
        const tone = tones[branding.loginAnnouncementTone] || tones.info;
        announcement.setAttribute('role', branding.loginAnnouncementTone === 'critical' ? 'alert' : 'status');
        announcement.setAttribute('aria-live', branding.loginAnnouncementTone === 'critical' ? 'assertive' : 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = `${active ? '' : 'hidden '}${brandSurface ? 'border-white/20 bg-emerald-950/60 text-white backdrop-blur-sm' : `md:hidden ${tone[0]}`} mb-5 rounded-xl border px-3.5 py-3`;
        const icon = announcement.querySelector('[data-login-announcement-icon]');
        if (icon) { icon.className = `mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${tone[1]}`; icon.textContent = tone[2]; }
        const title = announcement.querySelector('[data-login-announcement-title]');
        const message = announcement.querySelector('[data-login-announcement-message]');
        if (title) title.textContent = branding.loginAnnouncementTitle || 'ประกาศจากระบบ';
        if (message) message.textContent = branding.loginAnnouncementMessage;
        const link = announcement.querySelector('[data-login-announcement-link]');
        if (link) {
            const visible = Boolean(branding.loginAnnouncementUrl && branding.loginAnnouncementLinkLabel);
            link.classList.toggle('hidden', !visible);
            link.classList.toggle('inline-flex', visible);
            if (visible) { link.href = branding.loginAnnouncementUrl; link.textContent = `${branding.loginAnnouncementLinkLabel} →`; }
            else { link.removeAttribute('href'); link.textContent = ''; }
        }
    });

    const supportTitle = root.querySelector('#login-support-title');
    const supportHours = root.querySelector('#login-support-hours');
    const supportLinks = root.querySelector('#login-support-links');
    const fallback = root.querySelector('#login-support-fallback');
    if (supportTitle) supportTitle.textContent = branding.supportTitle || DEFAULT_BRANDING.supportTitle;
    if (supportHours) { supportHours.textContent = branding.supportHours; supportHours.classList.toggle('hidden', !branding.supportHours); }
    if (supportLinks) {
        supportLinks.replaceChildren();
        const addLink = (label, href, external = false) => {
            if (!label || !href) return;
            const link = root.createElement ? root.createElement('a') : document.createElement('a');
            link.className = 'inline-flex min-h-11 items-center text-xs font-bold text-emerald-700 underline-offset-2 hover:underline';
            link.textContent = label;
            link.href = href;
            if (external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
            supportLinks.appendChild(link);
        };
        const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(branding.supportEmail) ? branding.supportEmail : '';
        const phoneHref = branding.supportPhone.replace(/[^+\d]/g, '');
        addLink(email ? 'อีเมล' : '', email ? `mailto:${email}` : '');
        addLink(branding.supportPhone, phoneHref.length >= 3 ? `tel:${phoneHref}` : '');
        addLink(branding.supportLinkLabel || (branding.supportUrl ? 'ศูนย์ช่วยเหลือ' : ''), branding.supportUrl, true);
        if (fallback) fallback.classList.toggle('hidden', supportLinks.childElementCount > 0 || Boolean(branding.supportHours));
    }
}

function applyAppBranding(branding = {}) {
    _currentBranding = _normalizeBranding(branding);
    const logoUrl = _resolveBrandAssetUrl(_currentBranding.logoUrl);
    const loginBackgroundUrl = _resolveBrandAssetUrl(_currentBranding.loginBackgroundUrl);

    document.querySelectorAll('[data-brand-logo]').forEach(el => {
        if (!el.dataset.defaultLogo) el.dataset.defaultLogo = el.innerHTML;
        el.classList.toggle('has-custom-logo', Boolean(logoUrl));
        const size = Math.max(24, Math.min(64, Number.parseInt(el.dataset.brandSize || '32', 10) || 32));
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.maxWidth = `${size}px`;
        el.style.maxHeight = `${size}px`;
        el.style.overflow = 'hidden';
        if (!logoUrl) {
            el.innerHTML = el.dataset.defaultLogo;
            return;
        }
        el.innerHTML = '';
        const img = document.createElement('img');
        img.src = logoUrl;
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
    const loginBrandPanel = document.getElementById('login-brand-panel');
    if (loginBrandPanel) {
        const backgroundUrl = loginBackgroundUrl;
        const baseGradient = 'linear-gradient(160deg, rgba(2,44,34,.94) 0%, rgba(6,78,59,.88) 42%, rgba(6,95,70,.82) 75%, rgba(13,148,136,.76) 100%)';
        const shouldLoadBackground = Boolean(backgroundUrl && _loginBrandMediaQuery.matches);
        loginBrandPanel.classList.toggle('has-custom-background', shouldLoadBackground);
        loginBrandPanel.style.backgroundImage = shouldLoadBackground
            ? `${baseGradient}, url(${JSON.stringify(backgroundUrl)})`
            : 'linear-gradient(160deg, #022c22 0%, #064e3b 40%, #065f46 75%, #0d9488 100%)';
        const backgroundFit = _currentBranding.loginBackgroundFit === 'contain' ? 'contain' : 'cover';
        loginBrandPanel.style.backgroundSize = shouldLoadBackground ? `cover, ${backgroundFit}` : 'cover';
        loginBrandPanel.style.backgroundPosition = shouldLoadBackground
            ? `center, ${_currentBranding.loginBackgroundFocusX}% ${_currentBranding.loginBackgroundFocusY}%`
            : 'center';
        loginBrandPanel.style.backgroundRepeat = 'no-repeat';
    }
    _renderLoginCommunications(document, _currentBranding);
    document.title = _currentBranding.appName;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', _currentBranding.appName);

    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && logoUrl) favicon.href = logoUrl;
}

async function loadAppBranding({ timeoutMs = APP_BOOTSTRAP_TIMEOUTS.branding } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        const res = await apiFetch('/public/branding', {
            signal: controller.signal,
            suppressErrorLog: true,
            preserveSessionOnAuthError: true,
        });
        applyAppBranding(res?.data || {});
        return { source: 'remote', timedOut: false };
    } catch (err) {
        applyAppBranding(DEFAULT_BRANDING);
        return { source: 'default', timedOut: timedOut || err?.name === 'AbortError' };
    } finally {
        window.clearTimeout(timeout);
    }
}

window._refreshAppBranding = loadAppBranding;
_loginBrandMediaQuery.addEventListener?.('change', () => applyAppBranding(_currentBranding));

// ======================================================
// App Bootstrap
// ======================================================
async function bootstrapFrontend() {
    try {
        document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
        document.querySelectorAll('[data-module-count]').forEach(el => { el.textContent = String(MODULE_ORDER.length); });
        console.log('🚀 Frontend Application Started');

        window.__TSH_APP_BOOTSTRAP__?.setMessage('กำลังโหลดการตั้งค่าองค์กร…');
        const brandingTask = loadAppBranding().then(result => {
            initLoginModuleGuides();
            return result;
        });
        setupGlobalEventListeners();
        setupMobileViewportBehavior();

        await captureCompanyEmailVerification();
        capturePasswordResetLink();
        captureFileLibraryIntent();
        await captureBbsQrIntent();

        window.__TSH_APP_BOOTSTRAP__?.setMessage('กำลังตรวจสอบการเข้าสู่ระบบ…');
        // 🔒 รอ session ให้จบก่อนทำอย่างอื่น
        await Promise.all([brandingTask, initializeSession()]);
        showCompanyEmailVerificationResult();
        showPasswordResetFromLink();
        window.__TSH_APP_BOOTSTRAP__?.complete();
    } catch (error) {
        console.error('Frontend bootstrap failed:', error);
        const message = error?.code === 'SESSION_VERIFY_TIMEOUT'
            ? 'การตรวจสอบการเข้าสู่ระบบใช้เวลานานเกินไป กรุณาตรวจสอบเครือข่ายแล้วลองใหม่'
            : 'ไม่สามารถเชื่อมต่อเพื่อตรวจสอบการเข้าสู่ระบบได้ กรุณาลองใหม่';
        window.__TSH_APP_BOOTSTRAP__?.fail(message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void bootstrapFrontend(); }, { once: true });
} else {
    void bootstrapFrontend();
}

function capturePasswordResetLink() {
    const match = String(window.location.hash || '').match(/^#reset-password=([A-Za-z0-9_-]{43})$/);
    if (!match) return false;
    _passwordResetToken = match[1];
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return true;
}

function passwordResetFormHtml() {
    return `<form id="password-reset-complete-form" class="space-y-4">
        <p class="text-sm leading-6 text-slate-600">ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ 30 นาที</p>
        <div>
            <label class="mb-1.5 block text-xs font-bold text-slate-600">รหัสผ่านใหม่</label>
            <input id="password-reset-new" type="password" required minlength="4" maxlength="128" autocomplete="new-password"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
        </div>
        <div>
            <label class="mb-1.5 block text-xs font-bold text-slate-600">ยืนยันรหัสผ่านใหม่</label>
            <input id="password-reset-confirm" type="password" required minlength="4" maxlength="128" autocomplete="new-password"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
        </div>
        <div id="password-reset-complete-error" class="hidden rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"></div>
        <button id="password-reset-complete-submit" type="submit" class="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">ตั้งรหัสผ่านใหม่</button>
    </form>`;
}

function showPasswordResetFromLink() {
    if (!_passwordResetToken) return;
    UI.openModal('ตั้งรหัสผ่านใหม่', passwordResetFormHtml(), 'max-w-md');
    document.getElementById('password-reset-complete-form')?.addEventListener('submit', guardSubmitHandler(handlePasswordResetComplete));
    document.getElementById('password-reset-new')?.focus();
}

function openForgotPasswordModal() {
    const currentEmployeeId = String(document.getElementById('login-employee-id')?.value || '').trim();
    UI.openModal('ลืมรหัสผ่าน', `<form id="forgot-password-form" class="space-y-4">
        <p class="text-sm leading-6 text-slate-600">กรอกรหัสพนักงาน ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลที่บันทึกไว้</p>
        <div>
            <label class="mb-1.5 block text-xs font-bold text-slate-600">รหัสพนักงาน</label>
            <input id="forgot-password-employee-id" type="text" required maxlength="50" autocomplete="username" value="${UI.escHtml(currentEmployeeId)}"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
        </div>
        <div id="forgot-password-error" class="hidden rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"></div>
        <button id="forgot-password-submit" type="submit" class="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
    </form>`, 'max-w-md');
    document.getElementById('forgot-password-form')?.addEventListener('submit', guardSubmitHandler(handleForgotPasswordRequest));
    document.getElementById('forgot-password-employee-id')?.focus();
}

async function handleForgotPasswordRequest(event) {
    event.preventDefault();
    const employeeId = String(document.getElementById('forgot-password-employee-id')?.value || '').trim();
    const errorElement = document.getElementById('forgot-password-error');
    const button = document.getElementById('forgot-password-submit');
    errorElement?.classList.add('hidden');
    if (!employeeId) {
        if (errorElement) {
            errorElement.textContent = 'กรุณากรอกรหัสพนักงาน';
            errorElement.classList.remove('hidden');
        }
        return;
    }
    if (button) {
        button.disabled = true;
        button.textContent = 'กำลังดำเนินการ...';
    }
    try {
        const result = await apiFetch('/password-reset/request', {
            method: 'POST', body: JSON.stringify({ employeeId }), suppressErrorLog: true, preserveSessionOnAuthError: true,
        });
        UI.openModal('ตรวจสอบอีเมลของคุณ', `<div class="space-y-4 text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
            <p class="text-sm leading-6 text-slate-600">${UI.escHtml(result?.message || 'หากบัญชีนี้มีอีเมลที่พร้อมใช้งาน ระบบจะส่งลิงก์ให้')}</p>
            <p class="text-xs text-slate-400">ข้อความนี้เหมือนกันทุกบัญชีเพื่อความปลอดภัย</p>
            <button type="button" id="forgot-password-done" class="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">กลับไปเข้าสู่ระบบ</button>
        </div>`, 'max-w-md');
        document.getElementById('forgot-password-done')?.addEventListener('click', UI.closeModal);
    } catch (error) {
        if (errorElement) {
            errorElement.textContent = error?.message || 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่ภายหลัง';
            errorElement.classList.remove('hidden');
        }
    } finally {
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = 'ส่งลิงก์ตั้งรหัสผ่านใหม่';
        }
    }
}

async function handlePasswordResetComplete(event) {
    event.preventDefault();
    const newPassword = String(document.getElementById('password-reset-new')?.value || '');
    const confirmPassword = String(document.getElementById('password-reset-confirm')?.value || '');
    const errorElement = document.getElementById('password-reset-complete-error');
    const button = document.getElementById('password-reset-complete-submit');
    errorElement?.classList.add('hidden');
    const passwordLength = Array.from(newPassword).length;
    if (passwordLength < 4 || passwordLength > 128) {
        if (errorElement) {
            errorElement.textContent = 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษรและไม่เกิน 128 ตัวอักษร';
            errorElement.classList.remove('hidden');
        }
        return;
    }
    if (newPassword !== confirmPassword) {
        if (errorElement) {
            errorElement.textContent = 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน';
            errorElement.classList.remove('hidden');
        }
        return;
    }
    if (button) {
        button.disabled = true;
        button.textContent = 'กำลังตั้งรหัสผ่าน...';
    }
    try {
        await apiFetch('/password-reset/complete', {
            method: 'POST', body: JSON.stringify({ token: _passwordResetToken, newPassword, confirmPassword }),
            suppressErrorLog: true, preserveSessionOnAuthError: true,
        });
        _passwordResetToken = null;
        localStorage.removeItem('tsh_token');
        localStorage.removeItem('tsh_user');
        UI.openModal('ตั้งรหัสผ่านใหม่สำเร็จ', `<div class="space-y-4 text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
            <p class="text-sm leading-6 text-slate-600">กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</p>
            <button type="button" id="password-reset-login" class="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">ไปหน้าเข้าสู่ระบบ</button>
        </div>`, 'max-w-md');
        document.getElementById('password-reset-login')?.addEventListener('click', () => window.location.reload());
    } catch (error) {
        if (errorElement) {
            errorElement.textContent = error?.message || 'ไม่สามารถตั้งรหัสผ่านใหม่ได้';
            errorElement.classList.remove('hidden');
        }
    } finally {
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = 'ตั้งรหัสผ่านใหม่';
        }
    }
}

async function captureCompanyEmailVerification() {
    const match = String(window.location.hash || '').match(/^#verify-company-email=([A-Za-z0-9_-]{43})$/);
    if (!match) return false;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    try {
        const result = await apiFetch('/profile/company-email/verify', {
            method: 'POST',
            body: JSON.stringify({ token: match[1] }),
            suppressErrorLog: true,
            preserveSessionOnAuthError: true,
        });
        _companyEmailVerificationResult = { success: true, email: result?.data?.companyEmail || '' };
    } catch (error) {
        _companyEmailVerificationResult = {
            success: false,
            message: error?.message || 'ไม่สามารถยืนยันอีเมลได้',
        };
    }
    return true;
}

function showCompanyEmailVerificationResult() {
    if (!_companyEmailVerificationResult) return;
    const result = _companyEmailVerificationResult;
    _companyEmailVerificationResult = null;
    const icon = result.success
        ? '<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>'
        : '<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">!</div>';
    UI.openModal(
        result.success ? 'ยืนยันอีเมลสำเร็จ' : 'ยืนยันอีเมลไม่สำเร็จ',
        `<div class="space-y-4 py-2 text-center">${icon}<p class="text-sm leading-6 text-slate-600">${result.success
            ? `อีเมล <strong class="break-all text-slate-800">${UI.escHtml(result.email)}</strong> พร้อมใช้สำหรับการกู้คืนบัญชีในขั้นตอนถัดไป`
            : UI.escHtml(result.message)}</p><button type="button" onclick="document.getElementById('modal-close-btn')?.click()" class="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">ตกลง</button></div>`,
        'max-w-md'
    );
}

// ======================================================
// Session Handling
// ======================================================
async function initializeSession({ timeoutMs = APP_BOOTSTRAP_TIMEOUTS.session } = {}) {
    UI.showLoading('กำลังตรวจสอบเซสชัน...');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    let verification = null;
    try {
        verification = await TSHSession.refreshSession({
            preserveOnFailure: true,
            throwOnFailure: true,
            signal: controller.signal,
        });
    } catch (error) {
        if (timedOut || error?.name === 'AbortError') {
            const timeoutError = new Error('Session verification timed out');
            timeoutError.code = 'SESSION_VERIFY_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        window.clearTimeout(timeout);
    }

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
    const loginOverlay = document.getElementById('login-overlay');
    loginOverlay?.classList.add('hidden');
    loginOverlay?.setAttribute('aria-hidden', 'true');
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
    await refreshSafetyVoteNavigation();

    // เริ่ม routing หลัง login สำเร็จเท่านั้น
    const gate = await getSafetyUnitGateRequirement(onboardingStatus);
    if (gate.required) {
        renderSafetyUnitGate(gate.profile, gate.units);
        return;
    }

    initJohnnyDrawer({
        userId: user.id || user.EmployeeID || '',
        userName: user.name || user.EmployeeName || '',
    });

    if (await consumeBbsQrIntent()) return;
    consumePendingGuideRoute();
    await handleRouting();
    await consumeFileLibraryIntent();
}

async function captureBbsQrIntent() {
    const match = String(window.location.hash || '').match(/^#bbs-qr=([A-Za-z0-9_-]{43})$/);
    if (!match) return false;
    const token = match[1];
    sessionStorage.removeItem('bbs_qr_verification');
    sessionStorage.removeItem('bbs_qr_observed_employee');
    sessionStorage.removeItem('bbs_qr_open_inspection');
    sessionStorage.removeItem('bbs_community_department_id');
    sessionStorage.removeItem('bbs_community_department_name');
    sessionStorage.removeItem(BBS_QR_PENDING_KEY);
    sessionStorage.setItem(BBS_QR_INTENT_KEY, token);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    try {
        await API.post('/bbs/qr/resolve', { token }, { suppressErrorLog:true, preserveSessionOnAuthError:true });
        return true;
    } catch (error) {
        if(!shouldDiscardBbsQrIntent(error)){
            sessionStorage.setItem(BBS_QR_PENDING_KEY,JSON.stringify({stage:'resolve',code:error?.code||null,savedAt:new Date().toISOString()}));
            return true;
        }
        sessionStorage.removeItem(BBS_QR_INTENT_KEY);
        window.__bbsQrError = error?.message || 'QR นี้ไม่พร้อมใช้งาน';
        return false;
    }
}

async function consumeBbsQrIntent() {
    const token = sessionStorage.getItem(BBS_QR_INTENT_KEY);
    if (!token || !AppState.currentUser) {
        if (window.__bbsQrError) { UI.showToast(window.__bbsQrError, 'error'); delete window.__bbsQrError; }
        return false;
    }
    try {
        const result = await API.post('/bbs/qr/claim', { token, returnRoute:'#bbs-smart-card' });
        sessionStorage.removeItem(BBS_QR_INTENT_KEY);
        sessionStorage.removeItem(BBS_QR_PENDING_KEY);
        if (result.data?.mode === 'observation' && result.data?.employee?.EmployeeID) {
            sessionStorage.setItem('bbs_qr_observed_employee', String(result.data.employee.EmployeeID));
        }
        if (result.data?.mode === 'inspection') {
            sessionStorage.setItem('bbs_qr_open_inspection', '1');
        }
        if (result.data?.mode === 'community' && result.data?.departmentId) {
            sessionStorage.setItem('bbs_community_department_id', String(result.data.departmentId));
            sessionStorage.setItem('bbs_community_department_name', String(result.data.departmentName || ''));
        }
        if (!['observation','inspection'].includes(result.data?.mode) && result.data?.verification?.kind === 'Personal' && result.data?.verification?.active === true) {
            sessionStorage.setItem('bbs_qr_verification', JSON.stringify(result.data.verification));
        } else {
            sessionStorage.removeItem('bbs_qr_verification');
        }
        await openBbsQrDestination(result.data?.route);
        return true;
    } catch (error) {
        if(!shouldDiscardBbsQrIntent(error)){
            const rolloutBlocked=isBbsRolloutBlockedError(error);
            sessionStorage.setItem(BBS_QR_PENDING_KEY,JSON.stringify({stage:'claim',code:error?.code||null,savedAt:new Date().toISOString()}));
            UI.showToast(rolloutBlocked?'บันทึก QR ไว้แล้ว แต่บัญชีนี้ยังไม่อยู่ในขอบเขตเปิดใช้ BBS':'บันทึก QR ไว้แล้ว ระบบจะตรวจสอบอีกครั้งหลังเข้าสู่ระบบสำเร็จ',rolloutBlocked?'warning':'info');
            return false;
        }
        sessionStorage.removeItem(BBS_QR_INTENT_KEY);
        sessionStorage.removeItem(BBS_QR_PENDING_KEY);
        UI.showToast(error?.message || 'ไม่สามารถเปิด BBS Workspace จาก QR นี้ได้', 'error');
        await openBbsQrDestination('#bbs-smart-card');
        return true;
    }
}

async function openBbsQrDestination(route) {
    const safeRoute = normalizeBbsQrRoute(route);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${safeRoute}`);
    await handleRouting();
}

function consumePendingGuideRoute() {
    const route = String(window.__tshPendingGuideRoute || '').trim();
    delete window.__tshPendingGuideRoute;
    if (!AppState.currentUser || !MODULE_ORDER.includes(route)) return;
    window.location.hash = route;
}

function showLoginScreen() {
    UI.hideLoading();
    destroyJohnnyDrawer();
    document.getElementById('app-container')?.classList.add('hidden');
    const loginOverlay = document.getElementById('login-overlay');
    loginOverlay?.classList.remove('hidden');
    loginOverlay?.setAttribute('aria-hidden', 'false');
    showFirstLoginReentryNotice();
    if (!document.getElementById('login-success-message')?.classList.contains('hidden')) return;
    setTimeout(() => document.getElementById('login-employee-id')?.focus(), 50);
}

function rememberFirstLoginReentry(user) {
    try {
        sessionStorage.setItem(FIRST_LOGIN_REENTRY_KEY, JSON.stringify({
            employeeId: String(user?.id || user?.EmployeeID || '').trim(),
        }));
    } catch (_) {}
}

function showFirstLoginReentryNotice() {
    let state = null;
    try {
        state = JSON.parse(sessionStorage.getItem(FIRST_LOGIN_REENTRY_KEY) || 'null');
        sessionStorage.removeItem(FIRST_LOGIN_REENTRY_KEY);
    } catch (_) {
        try { sessionStorage.removeItem(FIRST_LOGIN_REENTRY_KEY); } catch (_) {}
    }
    if (!state) return;

    const employeeInput = document.getElementById('login-employee-id');
    const passwordInput = document.getElementById('login-password');
    const notice = document.getElementById('login-success-message');
    if (employeeInput && state.employeeId) employeeInput.value = state.employeeId;
    if (passwordInput) passwordInput.value = '';
    if (notice) {
        notice.textContent = 'ตั้งค่าบัญชีสำเร็จแล้ว กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่ เพื่อโหลดสิทธิ์และเมนูล่าสุด';
        notice.classList.remove('hidden');
    }
    setTimeout(() => passwordInput?.focus(), 50);
}

function showFirstLoginCompletion(user, { safetyUnitSelected = false } = {}) {
    const detail = safetyUnitSelected
        ? 'ระบบบันทึกรหัสผ่านใหม่และ Safety Unit ของคุณเรียบร้อยแล้ว'
        : 'ระบบบันทึกรหัสผ่านใหม่ของคุณเรียบร้อยแล้ว';
    UI.openModal('ตั้งค่าบัญชีสำเร็จ', `
        <div class="space-y-4 py-1 text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700" aria-hidden="true">✓</div>
            <div class="space-y-2">
                <p class="text-sm font-bold text-slate-800">${detail}</p>
                <p class="text-sm leading-6 text-slate-600">กรุณาออกจากระบบและเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่ เพื่อโหลดสิทธิ์และเมนูล่าสุด</p>
            </div>
            <button type="button" id="onboarding-complete-relogin"
                class="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200">
                ออกจากระบบเพื่อเข้าสู่ระบบใหม่
            </button>
        </div>`, 'max-w-md');

    const closeButton = document.getElementById('modal-close-btn');
    closeButton?.classList.add('hidden');
    closeButton?.setAttribute('aria-hidden', 'true');
    if (closeButton) closeButton.disabled = true;
    document.getElementById('onboarding-complete-relogin')?.addEventListener('click', () => {
        rememberFirstLoginReentry(user);
        TSHSession.logout();
    }, { once: true });
}

function handleLogout() {
    destroyJohnnyDrawer();
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
        const response = await apiFetch('/bbs/access', { suppressErrorLog: true });
        if (response?.data?.available) nav.classList.remove('hidden');
    } catch (_) {}
}

async function refreshSafetyVoteNavigation() {
    const nav = document.getElementById('safety-vote-nav-item');
    if (!nav) return;
    nav.classList.add('hidden');

    try {
        if (AppState.isAdmin) {
            const health = await apiFetch('/safety-vote/admin/health', { suppressErrorLog: true });
            if (health?.data?.ready && health?.data?.moduleEnabled) nav.classList.remove('hidden');
            return;
        }

        // Member discovery is the correct permission boundary for non-Admins.
        // The former Admin health probe produced an avoidable 403 on every Viewer bootstrap.
        await apiFetch('/safety-vote/me/campaigns', { suppressErrorLog: true });
        nav.classList.remove('hidden');
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
                <p class="text-[10px] font-black uppercase tracking-widest text-emerald-700">ตั้งค่าบัญชีครั้งแรก</p>
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
                    <button type="submit" id="safety-unit-gate-save" class="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">บันทึกและดำเนินการต่อ</button>
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
        showFirstLoginCompletion(res.user, { safetyUnitSelected: true });
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
            btn.textContent = 'บันทึกและดำเนินการต่อ';
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

    const rawHash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
    const safetyVoteShare = /^safety-vote=([A-Za-z0-9-]{1,40})$/.test(rawHash);
    const hash = safetyVoteShare ? 'safety-vote' : rawHash;
    document.body.dataset.activePage = hash;
    syncJohnnyDrawerRoute(hash);
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

    try {
        await loadVendorsForPage(hash);
    } catch (error) {
        console.error(`Unable to load optional libraries for ${hash}:`, error);
    }

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
        case 'safety-vote':
            await loadSafetyVotePage();
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
    document.getElementById('forgot-password-btn')?.addEventListener('click', openForgotPasswordModal);
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

    // Capture the form state before the first await. DOM Event.currentTarget is
    // reset after the synchronous event callback finishes, so reading it after
    // apiFetch() incorrectly treated forced first-login changes as optional.
    const forced = e.currentTarget?.dataset?.forced === '1';
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
            const status = res.status || res.onboardingStatus;
            if (forced && status === 'READY' && res.nextAction === 'ENTER_APP') {
                showFirstLoginCompletion(res.user);
                return;
            }
            await startApp(res.user, status);
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
        showFirstLoginCompletion(verification.user, { safetyUnitSelected: true });
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
    const forced = document.getElementById('change-password-form')?.dataset?.forced === '1';
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
    if (forced && status === 'READY') {
        await new Promise(resolve => setTimeout(resolve, 320));
        showFirstLoginCompletion(verification.user);
        return;
    }
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
