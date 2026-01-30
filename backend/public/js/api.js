// ถ้าอยู่บน Vercel หรือ Production ให้ใช้ path เริ่มต้นเป็น /api
// ถ้าอยู่ Local ให้ใช้ http://localhost:5000/api
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api';

function buildOptions(options = {}) {
    const opts = { ...options };
    opts.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

    const token = localStorage.getItem('jwt');
    if (token) opts.headers.Authorization = `Bearer ${token}`;

    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
        opts.body = JSON.stringify(opts.body);
    }
    return opts;
}

export async function apiFetch(endpoint, options = {}) {
    // 1. จัดการ Endpoint ให้สะอาด (ลบ /api ข้างหน้าออกถ้ามี เพื่อป้องกันการซ้ำ)
    // เพราะ BASE_URL เรามี /api เตรียมไว้ให้อยู่แล้ว
    let cleanPath = endpoint || '';
    if (cleanPath.startsWith('/api/')) {
        cleanPath = cleanPath.replace('/api/', '/');
    }
    if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }

    // 2. รวม URL: BASE_URL + cleanPath
    // ตัวอย่าง: "http://localhost:5000/api" + "/login"
    const fullUrl = BASE_URL + cleanPath; 
    
    console.log(`Fetching: ${fullUrl}`); // Debug ดู URL จริง

    const res = await fetch(fullUrl, buildOptions(options));

    if (res.status === 204 || res.headers.get('content-length') === '0') return { success: true };
    
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { 
            const err = await res.json(); 
            msg = err.message || msg; 
        } catch {}
        throw new Error(msg);
    }
    
    return await res.json();
}

export async function login(employeeId, password) {
    // เรียกใช้ได้เลย ไม่ต้องใส่ /api ข้างหน้าแล้ว เพราะ apiFetch จัดการให้
    const data = await apiFetch('/login', { method: 'POST', body: { employeeId, password } });
    if (data?.token) localStorage.setItem('jwt', data.token);
    return data;
}

export function logout() { 
    localStorage.removeItem('jwt'); 
    // อาจจะเพิ่ม logic ให้ redirect ไปหน้า login ด้วยก็ได้
    window.location.reload();
}