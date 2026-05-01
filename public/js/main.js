// public/js/main.js
// ======================================================
// TSH Safety Core - Frontend Main Controller (FINAL)
// ======================================================

import * as UI from './ui.js';
import { apiFetch } from './api.js';

// --- Page Loaders ---
import { loadPolicyPage } from './pages/policy.js';
import { loadCommitteePage } from './pages/committee.js';
import { loadPatrolPage } from './pages/patrol.js';
import { loadCccfPage } from './pages/cccf.js';
import { loadKpiPage } from './pages/kpi.js';
import { loadYokotenPage } from './pages/yokoten.js';
import { loadAdminPage } from './pages/admin.js';
import { loadMachineSafetyPage } from './pages/machine-safety.js';
import { loadOjtPage } from './pages/ojt.js';
import { loadTrainingPage } from './pages/training.js';
import { loadAccidentPage } from './pages/accident.js';
import { loadSafetyCulturePage } from './pages/safety-culture.js';
import { loadContractorPage } from './pages/contractor.js';
import { loadHiyariPage } from './pages/hiyari.js';
import { loadKyPage } from './pages/ky.js';
import { loadFourmPage } from './pages/fourm.js';
import { openProfileDrawer, closeProfileDrawer } from './pages/profile.js';
import { loadDashboardPage } from './pages/dashboard.js';
import { loadSearchPage } from './pages/search.js';

window.openProfileDrawer  = openProfileDrawer;
window.closeProfileDrawer = closeProfileDrawer;

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

// ======================================================
// App Bootstrap
// ======================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Frontend Application Started');

    setupGlobalEventListeners();

    // 🔒 รอ session ให้จบก่อนทำอย่างอื่น
    await initializeSession();
});

// ======================================================
// Session Handling
// ======================================================
async function initializeSession() {
    UI.showLoading('กำลังตรวจสอบเซสชัน...');

    const ok = await TSHSession.verifySession();

    if (!ok) {
        showLoginScreen();
        return;
    }

    const user = TSHSession.getUser();
    startApp(user);
}

function startApp(user) {
    AppState.currentUser = user;
    AppState.isAdmin = (user.role === 'Admin' || user.Role === 'Admin');

    UI.hideLoading();

    // แสดง App / ซ่อน Login
    document.getElementById('login-overlay')?.classList.add('hidden');
    const app = document.getElementById('app-container');
    app.classList.remove('hidden');
    app.style.display = 'flex';

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

    // เริ่ม routing หลัง login สำเร็จเท่านั้น
    handleRouting();
}

function showLoginScreen() {
    UI.hideLoading();
    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('login-overlay')?.classList.remove('hidden');
}

function handleLogout() {
    TSHSession.logout();
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

// ======================================================
// Routing (Hash-based)
// ======================================================
// ─── Page Title Map ────────────────────────────────────────────────────────────
const PAGE_TITLES = {
    'dashboard':     'ภาพรวม',
    'search':        'ค้นหารายบุคคล',
    'policy':        'นโยบายความปลอดภัย',
    'committee':     'คณะกรรมการความปลอดภัย',
    'kpi':           'KPI & Metrics',
    'patrol':        'Safety Patrol',
    'cccf':          'CCCF Activity',
    'machine-safety':'Machine & Device Safety',
    'ojt':           'Stop-Call-Wait (SCW)',
    'training':      'Safety Training',
    'accident':      'รายงานอุบัติเหตุ',
    'safety-culture':'Safety Culture',
    'contractor':    'Contractor Safety',
    'hiyari':        'Hiyari (Near-Miss)',
    'ky':            'KY Activity',
    'yokoten':       'Yokoten',
    'fourm':         '4M Change Management',
    'admin':         'System Console',
    'employee':      'ข้อมูลพนักงาน',
};

async function handleRouting() {
    if (!AppState.currentUser) {
        console.warn('⛔ Routing blocked: not authenticated');
        return;
    }

    const hash = window.location.hash.replace('#', '') || 'dashboard';
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
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    // Hash change
    window.addEventListener('hashchange', handleRouting);

    // Global click handler
    document.body.addEventListener('click', (e) => {
        const el = e.target.closest('button, a');
        if (!el) return;

        if (el.id === 'user-logout-btn') {
            handleLogout();
            return;
        }

        if (el.id === 'modal-close-btn' || el.id === 'modal-backdrop') {
            UI.closeModal();
        }
    });
}

// ======================================================
// Change Password Modal
// ======================================================
function openChangePasswordModal() {
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
                    placeholder="อย่างน้อย 8 ตัวอักษร"
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

            <div class="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                <button type="button" id="cp-cancel-btn"
                    class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" id="cp-submit-btn"
                    class="btn btn-primary px-5">เปลี่ยนรหัสผ่าน</button>
            </div>
        </form>
    `;

    UI.openModal('🔐 เปลี่ยนรหัสผ่าน', html, 'max-w-sm');

    setTimeout(() => {
        document.getElementById('cp-cancel-btn')?.addEventListener('click', UI.closeModal);
        document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
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
    if (pw.length >= 8)          score++;
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

    // Validation
    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    };
    errorEl.classList.add('hidden');

    if (newPassword.length < 8) {
        return showError('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    }
    if (newPassword !== confirmPassword) {
        return showError('รหัสผ่านใหม่ไม่ตรงกัน กรุณากรอกอีกครั้ง');
    }

    // Submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    try {
        await apiFetch('/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        UI.closeModal();
        UI.showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
    } catch (err) {
        showError(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        submitBtn.disabled = false;
        submitBtn.textContent = 'เปลี่ยนรหัสผ่าน';
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const empId = document.getElementById('login-employee-id').value;
    const pwd = document.getElementById('login-password').value;
    const errorBox = document.getElementById('login-error');
    errorBox.textContent = '';

    const ok = await TSHSession.login(empId, pwd);
    if (!ok) {
        errorBox.textContent = 'เข้าสู่ระบบไม่สำเร็จ';
        return;
    }

    const user = TSHSession.getUser();
    startApp(user);
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
