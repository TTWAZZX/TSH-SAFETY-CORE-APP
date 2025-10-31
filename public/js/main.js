// js/main.js

// Import ฟังก์ชันจากไฟล์อื่นๆ ที่เราสร้างไว้
import { apiFetch } from './api.js';
import { showLoading, hideLoading, closeModal, showError } from './ui.js';

// --- Import Page Loaders ---
// ส่วนนี้คือส่วนที่ขาดไปครับ เราต้อง Import ทุกหน้าที่เราจะใช้
import { loadPolicyPage } from './pages/policy.js';
import { loadCommitteePage } from './pages/committee.js';
import { loadPatrolCccfPage } from './pages/patrol.js';
import { loadKpiPage } from './pages/kpi.js';
// import { loadYokotenPage } from './pages/yokoten.js'; // <--- คอมเมนต์บรรทัดนี้
import { loadYokotenPage } from './pages/yokoten.js';


// --- Global State ---
const AppState = {
    isAdmin: false,
    currentUser: null,
    currentPageId: 'dashboard',
    sessionToken: null,
};

// --- Page Loaders ---
const pageLoaders = {
  'dashboard': () => loadPlaceholderPage('dashboard-page', 'ภาพรวม (Dashboard)'),
  'search': () => loadPlaceholderPage('search-page', 'ค้นหารายบุคคล'),
  'ojt': () => loadPlaceholderPage('ojt-page', 'Stop - Call - Wait'),
  'policy': loadPolicyPage,
  'committee': loadCommitteePage,
  'kpi': loadKpiPage,
  'patrol-cccf': loadPatrolCccfPage,
  'machine-safety': () => loadPlaceholderPage('machine-safety-page', 'Machine Device'),
  'training': () => loadPlaceholderPage('training-page', 'Safety Training'),
  'employee': () => loadPlaceholderPage('employee-page', 'จัดการพนักงาน'),
};

// --- Navigation ---
// js/main.js

function navigateTo(pageId) {
    if (!pageLoaders[pageId]) {
        pageId = 'dashboard';
    }

    AppState.currentPageId = pageId;
    window.location.hash = pageId;
    showLoading(`กำลังโหลดหน้า ${pageId}...`);

    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${pageId}`));
    
    const targetPage = document.getElementById(`${pageId}-page`);
    const pageLink = document.querySelector(`a[href="#${pageId}"] span`);
    document.getElementById('page-title').textContent = pageLink ? pageLink.textContent.trim() : 'Dashboard';

    if (targetPage && pageLoaders[pageId]) {
        pageLoaders[pageId]();
    }

    // --- เพิ่มบรรทัดนี้เข้าไปครับ ---
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

// --- Authentication ---
async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mx-auto"></div>';
  document.getElementById('login-error').textContent = '';

  const employeeId = document.getElementById('login-employee-id').value;
  const password   = document.getElementById('login-password').value;

  try {
    const res = await apiFetch('/login', {   // <<< เปลี่ยนจาก '/api/login'
      method: 'POST',
      body: { employeeId, password }
    });

    if (res.success) {
      // ให้ชื่อ key ตรงกับที่ api.js อ่านอยู่ (jwt)
      localStorage.setItem('jwt', res.token);
      startApp(res.user);
    } else {
      document.getElementById('login-error').textContent = res.message || 'Login failed.';
    }
  } catch (error) {
    document.getElementById('login-error').textContent = error.message || 'Login failed.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';
  }
}

function handleLogout() {
  showLoading('กำลังออกจากระบบ...');
  localStorage.removeItem('jwt');    // <<< แทน sessionToken
  localStorage.removeItem('currentUser');
  AppState.currentUser = null;
  AppState.isAdmin = false;

  document.getElementById('app-container').style.display = 'none';
  document.getElementById('login-overlay').classList.remove('hidden');
  hideLoading();
}

function startApp(user) {
    AppState.currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
    hideLoading();
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-container').style.display = 'flex';
    document.getElementById('user-info').innerHTML = `<p class="font-semibold text-slate-700 dark:text-slate-200">${AppState.currentUser.name}</p><p class="text-xs text-slate-500 dark:text-slate-400">${AppState.currentUser.id}</p>`;
    
    const initialPage = window.location.hash.substring(1) || 'dashboard';
    navigateTo(pageLoaders[initialPage] ? initialPage : 'dashboard');
}

async function initializeSession() {
  const token = localStorage.getItem('jwt');   // <<< เปลี่ยนจาก sessionToken
  if (token) {
    showLoading('กำลังตรวจสอบเซสชัน...');
    try {
      const result = await apiFetch('/session/verify', {   // <<< เปลี่ยนจาก '/api/session/verify'
        method: 'POST',
        body: { token }
      });

      if (result && result.success) {
        // เก็บ token (ถ้า API ออก token ใหม่)
        if (result.token) localStorage.setItem('jwt', result.token);
        startApp(result.user);
      } else {
        handleLogout();
      }
    } catch (error) {
      handleLogout();
    }
  } else {
    document.getElementById('login-overlay').classList.remove('hidden');
    hideLoading();
  }
}

// --- Placeholder for pages ---
function loadPlaceholderPage(id, title) {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = `<div class="card p-6"><h2 class="text-xl font-semibold">${title}</h2><p class="mt-4 text-slate-500">หน้านี้กำลังอยู่ระหว่างการพัฒนา</p></div>`;
    }
    hideLoading();
}

// --- Event Listeners ---
function setupEventListeners() {
    document.getElementById('main-nav').addEventListener('click', e => {
        const link = e.target.closest('a.nav-link[data-action="navigate"]');
        if (link) {
            e.preventDefault();
            navigateTo(link.getAttribute('href').substring(1));
            if (window.innerWidth < 768) document.getElementById('sidebar').classList.add('-translate-x-full');
        }
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('-translate-x-full'));
    document.getElementById('user-logout-btn').addEventListener('click', handleLogout);
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

// --- App Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("แอปพลิเคชัน Frontend เริ่มทำงาน");
    setupEventListeners();
    initializeSession();
});