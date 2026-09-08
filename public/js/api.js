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
    const { suppressErrorLog = false, ...fetchOptions } = options;
    const token = TSHSession.getToken();
    const body = fetchOptions.body;

    const headers = {
        ...(fetchOptions.headers || {})
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
            ...fetchOptions,
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
        const isCurrentPasswordFailure = endpoint === '/change-password'
            && res.status === 401
            && data?.code === 'CURRENT_PASSWORD_INVALID';
        if ((res.status === 401 && !isCurrentPasswordFailure)
            || (res.status === 403 && data?.message === 'Token is not valid')) {
            console.warn('Session expired. Logging out...');
            TSHSession.logout();
            throw new Error('Session expired');
        }
        if (!res.ok) throw data;

        return data;

    } catch (err) {
        if (!suppressErrorLog) console.error('API Error:', err);
        throw err;
    }
}

// Multipart upload helper with progress reporting. Keep normal reads and JSON
// writes on fetch; XHR is used only when the caller needs upload progress.
export function apiUpload(endpoint, body, { method = 'POST', onProgress = null, suppressErrorLog = false } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, `${API_BASE}${endpoint}`);
        xhr.responseType = 'text';
        const token = TSHSession.getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.upload.addEventListener('progress', event => {
            if (!event.lengthComputable || typeof onProgress !== 'function') return;
            onProgress(Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100))), event);
        });
        xhr.addEventListener('load', () => {
            let data = null;
            try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}
            if (xhr.status === 401 || (xhr.status === 403 && data?.message === 'Token is not valid')) {
                console.warn('Session expired. Logging out...');
                TSHSession.logout();
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                if (data === null) {
                    const error = new Error('รูปแบบข้อมูลตอบกลับจากระบบอัปโหลดไม่ถูกต้อง');
                    if (!suppressErrorLog) console.error('API Upload Error:', error);
                    reject(error);
                    return;
                }
                resolve(data);
                return;
            }
            const error = data || new Error(`Upload failed (${xhr.status || 'network'})`);
            if (!suppressErrorLog) console.error('API Upload Error:', error);
            reject(error);
        });
        xhr.addEventListener('error', () => {
            const error = new Error('ไม่สามารถเชื่อมต่อเพื่ออัปโหลดไฟล์ได้');
            if (!suppressErrorLog) console.error('API Upload Error:', error);
            reject(error);
        });
        xhr.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
        xhr.send(body);
    });
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
        }),
    upload: (url, body, options = {}) => apiUpload(url, body, options)
};
