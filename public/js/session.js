// =================================================================
// TSH Safety Core - Session Management (Frontend)
// STEP A - FINAL (Stable)
// =================================================================

const API_BASE = 'http://localhost:5000/api';

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

        const data = await res.json();

        if (!res.ok || !data.success) {
            alert(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
            return false;
        }

        saveSession(data.user, data.token);
        return true;

    } catch (err) {
        console.error('Login error:', err);
        alert('ไม่สามารถเชื่อมต่อระบบได้');
        return false;
    }
}

/**
 * =========================
 * Session Verify (สำคัญมาก)
 * ใช้ตอนเปิดเว็บทุกครั้ง
 * =========================
 */
async function verifySession() {
    const token = getToken();
    if (!token) return false;

    try {
        const res = await fetch(`${API_BASE}/session/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        // ❗ ถ้า backend ตอบ non-200 → ถือว่า session พัง
        if (!res.ok) throw new Error('Invalid session');

        const data = await res.json();

        if (!data.success || !data.user || !data.token) {
            throw new Error('Session expired');
        }

        // ✅ refresh user + token ทุกครั้ง
        saveSession(data.user, data.token);
        return true;

    } catch (err) {
        console.warn('Session verify failed:', err.message);
        clearSession();
        return false;
    }
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
    verifySession,
    requireAuth,
    getUser,
    getToken
};
