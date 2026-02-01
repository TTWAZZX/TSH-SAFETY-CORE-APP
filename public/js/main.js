// public/js/main.js

// เพิ่มบรรทัดนี้ในส่วน Import ด้านบน
import { loadEmployeePage } from './pages/employee.js';
import { loadAdminPage } from './pages/admin.js';
import { apiFetch } from './api.js';
import * as UI from './ui.js';

// --- Import Page Loaders ---
import { loadPolicyPage } from './pages/policy.js';
import { loadCommitteePage } from './pages/committee.js';
import { loadPatrolPage } from './pages/patrol.js';
import { loadCccfPage } from './pages/cccf.js';
import { loadKpiPage } from './pages/kpi.js';
import { loadYokotenPage } from './pages/yokoten.js';

// --- Global State ---
const AppState = {
    isAdmin: false,
    currentUser: null,
    currentPageId: 'dashboard',
    currentYear: new Date().getFullYear(),
};

// --- Page Loaders Mapping ---
// เพิ่ม patrol และ cccf แยกกันใน object นี้
const pageLoaders = {
  'dashboard': () => loadPlaceholderPage('dashboard-page', 'ภาพรวม (Dashboard)'),
  'search': () => loadPlaceholderPage('search-page', 'ค้นหารายบุคคล'),
  'ojt': () => loadPlaceholderPage('ojt-page', 'Stop - Call - Wait'),
  'policy': loadPolicyPage,
  'committee': loadCommitteePage,
  'kpi': loadKpiPage,
  'patrol': loadPatrolPage, // ✅ แยกหน้า Patrol
  'cccf': loadCccfPage,     // ✅ แยกหน้า CCCF
  'machine-safety': () => loadPlaceholderPage('machine-safety-page', 'Machine Device'),
  'training': () => loadPlaceholderPage('training-page', 'Safety Training'),
  'employee': () => loadPlaceholderPage('employee-page', 'จัดการพนักงาน'),
  'accident': () => loadPlaceholderPage('accident-page', 'รายงานอุบัติเหตุ'),
  'yokoten': loadYokotenPage
};

// --- Start Application ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Frontend Application Started");
    setupGlobalEventListeners();
    initializeSession();
});

// --- Session & Login ---
async function initializeSession() {
    const token = localStorage.getItem('jwt');
    if (!token) {
        showLoginScreen();
        return;
    }

    try {
        UI.showLoading('กำลังตรวจสอบเซสชัน...');
        const res = await apiFetch('/session/verify', { method: 'POST' });
        
        if (res.user) {
            startApp(res.user);
        } else {
            throw new Error('Invalid session');
        }
    } catch (err) {
        console.error('Session verify failed:', err);
        handleLogout();
    }
}

// ในไฟล์ public/js/main.js

function startApp(user) {
    AppState.currentUser = user;
    
    // ✅ 1. ตรวจสอบสิทธิ์ Admin (ดูจาก Database ว่า Role = 'Admin' ไหม)
    // หมายเหตุ: เช็คตัวเล็กตัวใหญ่ให้ดี Database คุณเก็บ 'Admin' (A ตัวใหญ่)
    AppState.isAdmin = (user.role === 'Admin' || user.Role === 'Admin'); 

    UI.hideLoading();
    
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('app-container').style.display = 'flex';

    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
        userInfoEl.innerHTML = `
            <div class="text-right leading-tight">
                <p class="font-semibold text-slate-700 dark:text-slate-200">
                    ${user.name} 
                    ${AppState.isAdmin ? '<span class="text-xs bg-red-100 text-red-600 px-1 rounded ml-1">ADMIN</span>' : ''}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">ID: ${user.id}</p>
            </div>
        `;
    }

    // ✅ 2. สั่งเปิด/ปิด เมนูตามสิทธิ์
    toggleAdminFeatures();

    handleRouting();
}

// ✅ 3. เพิ่มฟังก์ชันใหม่นี้ลงไปใน main.js (วางต่อท้าย startApp ก็ได้)
function toggleAdminFeatures() {
    // หา Elements ทั้งหมดที่มีคลาส 'admin-feature'
    const adminElements = document.querySelectorAll('.admin-feature');
    
    adminElements.forEach(el => {
        if (AppState.isAdmin) {
            // ถ้าเป็น Admin -> ลบ class hidden ออก (แสดงผล)
            el.classList.remove('hidden');
        } else {
            // ถ้าไม่ใช่ Admin -> ใส่ class hidden (ซ่อน)
            el.classList.add('hidden');
        }
    });
}

function showLoginScreen() {
    UI.hideLoading();
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-overlay').classList.remove('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>';
    document.getElementById('login-error').textContent = '';

    const employeeId = document.getElementById('login-employee-id').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await apiFetch('/login', {
            method: 'POST',
            body: { employeeId, password }
        });

        if (res.token) {
            localStorage.setItem('jwt', res.token);
            startApp(res.user);
        } else {
            throw new Error(res.message || 'เข้าสู่ระบบไม่สำเร็จ');
        }
    } catch (error) {
        document.getElementById('login-error').textContent = error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function handleLogout() {
    localStorage.removeItem('jwt');
    AppState.currentUser = null;
    window.location.hash = '';
    showLoginScreen();
}

// ค้นหาฟังก์ชัน handleRouting แล้วแทนที่ด้วยโค้ดนี้ทั้งหมด
async function handleRouting() {
    const hash = window.location.hash.substring(1) || 'dashboard';
    console.log(`Navigating to: ${hash}`);

    // 1. ซ่อนทุกหน้าก่อน (Force Hide)
    const allPages = document.querySelectorAll('.page-content');
    allPages.forEach(page => {
        page.classList.add('hidden'); // ใส่ class hidden
        page.style.display = 'none';  // 🔒 บังคับซ่อนด้วย Inline Style
    });

    // 2. ระบุหน้าที่จะไป
    // แก้ไข: กรณีหน้าย่อยของ patrol ให้ชี้ไปที่ container หลัก
    let targetId = `${hash}-page`;
    
    // (Optional) ถ้าคุณมี Logic พิเศษสำหรับ submenu แก้ตรงนี้ได้ แต่ตาม index.html ล่าสุด ID ตรงตัวแล้ว
    
    const targetPage = document.getElementById(targetId);

    // 3. แสดงหน้าที่ต้องการ (Force Show)
    if (targetPage) {
        targetPage.classList.remove('hidden'); // เอา class hidden ออก
        targetPage.style.display = 'block';    // 🔓 บังคับแสดงผลด้วย Inline Style ทันที!
        
        // Scroll ขึ้นบนสุด
        window.scrollTo(0, 0);

        // 4. โหลดข้อมูลของหน้านั้นๆ
        switch (hash) {
            case 'dashboard':
                if (window.loadDashboard) window.loadDashboard();
                break;
            case 'policy':
                const { loadPolicyPage } = await import('./pages/policy.js');
                await loadPolicyPage();
                break;
            case 'committee':
                const { loadCommitteePage } = await import('./pages/committee.js');
                await loadCommitteePage();
                break;
            case 'kpi':
                const { loadKpiPage } = await import('./pages/kpi.js');
                await loadKpiPage();
                break;
            case 'patrol':
                const { loadPatrolPage } = await import('./pages/patrol.js');
                await loadPatrolPage();
                break;
            case 'cccf':
                const { loadCccfPage } = await import('./pages/cccf.js');
                await loadCccfPage();
                break;
            // เพิ่ม case อื่นๆ ตามต้องการ
            case 'search':
                // logic หน้า search
                break;
            case 'admin':
                loadAdminPage(); // เรียกฟังก์ชันที่เรา import มาไว้บนสุดแล้ว
                break;
            case 'employee':
                loadEmployeePage();
                break;    
            default:
                console.warn(`No loader defined for ${hash}`);
        }
    } else {
        console.error(`❌ Page Not Found: ID "${targetId}" ไม่มีอยู่จริงใน index.html`);
        // ถ้าหาหน้าไม่เจอ ให้เด้งกลับไป dashboard หรือแสดง 404
        if(hash !== 'dashboard') window.location.hash = 'dashboard';
    }
}

// --- Global Event Listeners ---
function setupGlobalEventListeners() {
    
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    window.addEventListener('hashchange', handleRouting);

    document.body.addEventListener('click', async (e) => {
        const target = e.target.closest('button, a, .clickable'); 
        if (!target) return;

        if (target.id === 'sidebar-toggle') {
            document.getElementById('sidebar').classList.toggle('-translate-x-full');
            return;
        }

        if (target.id === 'user-logout-btn') {
            handleLogout();
            return;
        }

        if (target.id === 'modal-close-btn' || target.id === 'modal-backdrop') {
            UI.closeModal();
            return;
        }

        if (target.closest('#dark-mode-toggle')) {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            return;
        }
        
        // Navigation Intercept (สำหรับลิงก์ที่มี data-action="navigate")
        if (target.dataset.action === 'navigate') {
            // ปล่อยให้ hashchange ทำงานเอง แต่ถ้าต้องการ logic พิเศษใส่ตรงนี้ได้
        }
    });
}

// --- Placeholder Helper ---
function loadPlaceholderPage(id, title) {
    UI.hideLoading();
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-slate-400">
                <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                <h2 class="text-xl font-semibold">${title}</h2>
                <p class="mt-2">หน้านี้กำลังอยู่ระหว่างการพัฒนา</p>
            </div>
        `;
    }
}