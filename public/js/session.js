// =================================================================
// TSH Safety Core - Session Management (Frontend)
// STEP A - FINAL (Stable)
// =================================================================

function resolveApiBase() {
    if (window.API_BASE) return String(window.API_BASE).replace(/\/+$/, '');

    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || !h) return 'http://localhost:5000/api';

    const path = window.location.pathname || '/';
    const marker = '/index.html';
    const appPath = path.includes(marker) ? path.slice(0, path.indexOf(marker) + 1) : path;
    return `${appPath.replace(/\/+$/, '')}/api`;
}

// Uses localhost for local testing and current app subfolder for hosted deployments.
const API_BASE = resolveApiBase();

/**
 * =========================
 * LocalStorage Helpers
 * =========================
 */
function saveSession(user, token) {
    localStorage.setItem('tsh_user', JSON.stringify(user));
    localStorage.setItem('tsh_token', token);
}

function clearSession() {
    localStorage.removeItem('tsh_user');
    localStorage.removeItem('tsh_token');
}

function getToken() {
    return localStorage.getItem('tsh_token');
}

function getUser() {
    const user = localStorage.getItem('tsh_user');
    return user ? JSON.parse(user) : null;
}

/**
 * =========================
 * Auth Actions
 * =========================
 */

/**
 * Login
 */
async function login(employeeId, password) {
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId, password })
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`API endpoint not available (${res.status})`);
        }
        const data = await res.json();

        if (!res.ok || !data.success) {
            window.__tshLoginError = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
            return false;
        }

        saveSession(data.user, data.token);
        return true;

    } catch (err) {
        console.error('Login error:', err);
        window.__tshLoginError = 'ไม่สามารถเชื่อมต่อระบบได้';
        return false;
    }
}

/**
 * =========================
 * Session Verify (สำคัญมาก)
 * ใช้ตอนเปิดเว็บทุกครั้ง
 * =========================
 */
async function refreshSession(options = {}) {
    const preserveOnFailure = options?.preserveOnFailure === true;
    const token = getToken();
    if (!token) return null;

    try {
        const res = await fetch(`${API_BASE}/session/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            const error = new Error('Invalid session');
            error.invalidSession = res.status === 401 || res.status === 403;
            throw error;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`API endpoint not available (${res.status})`);
        }
        const data = await res.json();

        if (!data.success || !data.user || !data.token) {
            throw new Error('Session expired');
        }

        // ✅ refresh user + token ทุกครั้ง
        saveSession(data.user, data.token);
        return data;

    } catch (err) {
        console.warn('Session verify failed:', err.message);
        if (!preserveOnFailure || err?.invalidSession) clearSession();
        return null;
    }
}

async function verifySession(options = {}) {
    return Boolean(await refreshSession(options));
}

/**
 * =========================
 * Page Guard
 * =========================
 */
async function requireAuth(redirectTo = 'index.html') {
    const ok = await verifySession();
    if (!ok) {
        window.location.replace(redirectTo);
    }
}

/**
 * =========================
 * Logout
 * =========================
 */
function logout(redirectTo = 'index.html') {
    clearSession();
    window.location.replace(redirectTo);
}

/**
 * =========================
 * Global Export
 * =========================
 */
window.TSHSession = {
    login,
    logout,
    refreshSession,
    verifySession,
    requireAuth,
    setSession: saveSession,
    getUser,
    getToken
};
