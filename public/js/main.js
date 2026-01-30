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
import { loadEmployeePage } from './pages/employee.js';

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

    // แสดง User Info
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        userInfo.innerHTML = `
            <div class="text-right leading-tight">
                <div class="font-semibold">
                    ${user.name}
                    ${AppState.isAdmin
                        ? '<span class="ml-1 text-xs bg-red-100 text-red-600 px-1 rounded">ADMIN</span>'
                        : ''}
                </div>
                <div class="text-xs text-slate-500">ID: ${user.id}</div>
            </div>
        `;
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
async function handleRouting() {
    if (!AppState.currentUser) {
        console.warn('⛔ Routing blocked: not authenticated');
        return;
    }

    const hash = window.location.hash.replace('#', '') || 'dashboard';
    console.log('➡️ Navigate:', hash);

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
            loadEmployeePage();
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
