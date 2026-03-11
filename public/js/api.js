// public/js/api.js
// ===============================
// Central API Wrapper (Vercel-ready)
// ===============================

// FIX: was falling back to hardcoded localhost — breaks in production (Vercel)
const API_BASE =
    import.meta?.env?.VITE_API_BASE ||
    window.API_BASE ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname)
        ? 'http://localhost:5000/api'
        : '/api');

export async function apiFetch(endpoint, options = {}) {
    const token = TSHSession.getToken();

    const headers = {
        ...(options.headers || {})
    };

    // ✅ ใส่ Content-Type เฉพาะตอนที่ body เป็น JSON
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        if (res.status === 401 || res.status === 403) {
            console.warn('Session expired. Logging out...');
            TSHSession.logout();
            throw new Error('Session expired');
        }

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return res;
        }

        const data = await res.json();
        if (!res.ok) throw data;

        return data;

    } catch (err) {
        console.error('API Error:', err);
        throw err;
    }
}

export const API = {
    get: (url) => apiFetch(url),
    post: (url, body) =>
        apiFetch(url, {
            method: 'POST',
            body: body instanceof FormData ? body : JSON.stringify(body)
        }),
    put: (url, body) =>
        apiFetch(url, {
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body)
        }),
    delete: (url) =>
        apiFetch(url, {
            method: 'DELETE'
        })
};
