// public/js/api.js
// ===============================
// Central API Wrapper
// ===============================

function resolveApiBase() {
    if (import.meta?.env?.VITE_API_BASE) return import.meta.env.VITE_API_BASE.replace(/\/+$/, '');
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

export async function apiFetch(endpoint, options = {}) {
    const token = TSHSession.getToken();
    const body = options.body;

    const headers = {
        ...(options.headers || {})
    };

    // ✅ ใส่ Content-Type เฉพาะตอนที่ body เป็น JSON
    if (body instanceof FormData) {
        delete headers['Content-Type'];
        delete headers['content-type'];
    } else if (!headers['Content-Type'] && !headers['content-type']) {
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

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (res.status === 401) {
                console.warn('Session expired. Logging out...');
                TSHSession.logout();
                throw new Error('Session expired');
            }
            return res;
        }

        const data = await res.json();
        if (res.status === 401 || (res.status === 403 && data?.message === 'Token is not valid')) {
            console.warn('Session expired. Logging out...');
            TSHSession.logout();
            throw new Error('Session expired');
        }
        if (!res.ok) throw data;

        return data;

    } catch (err) {
        console.error('API Error:', err);
        throw err;
    }
}

export const API = {
    get: (url, options = {}) => apiFetch(url, options),
    post: (url, body, options = {}) =>
        apiFetch(url, {
            ...options,
            method: 'POST',
            body: body instanceof FormData ? body : JSON.stringify(body)
        }),
    put: (url, body, options = {}) =>
        apiFetch(url, {
            ...options,
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body)
        }),
    delete: (url, options = {}) =>
        apiFetch(url, {
            ...options,
            method: 'DELETE'
        }),
    patch: (url, body, options = {}) =>
        apiFetch(url, {
            ...options,
            method: 'PATCH',
            body: body instanceof FormData ? body : (body !== undefined ? JSON.stringify(body) : undefined)
        })
};
