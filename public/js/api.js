// public/js/api.js
// เรียก API แบบ relative path: /api/xxx  (ไม่ผูกกับ Render/Vercel ใดๆ)
// ใช้ได้ทั้งหน้าเว็บบน Vercel และการเทสในเครื่อง

const API_PREFIX = ''; // ให้เว้นว่างไว้ เพื่อใช้เส้นทางแบบ /api/...

// ตัวช่วย: แปลง body เป็น JSON และเติม header ให้ครบ
function buildOptions(options = {}) {
  const opts = { ...options };
  opts.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  // แนบ Bearer token อัตโนมัติ ถ้ามีเก็บไว้ใน localStorage
  const token = localStorage.getItem('jwt');
  if (token) opts.headers.Authorization = `Bearer ${token}`;

  // แปลง object เป็น JSON string ให้เองถ้าเป็น body แบบ object
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
  }
  return opts;
}

// ฟังก์ชันหลักไว้เรียก API ทุก endpoint
export async function apiFetch(endpoint, options = {}) {
  const url = `${API_PREFIX}/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  try {
    const res = await fetch(url, buildOptions(options));
    // รองรับ 204/empty body
    if (res.status === 204 || res.headers.get('content-length') === '0') return { success: true };
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.message || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return await res.json();
  } catch (err) {
    console.error('API Fetch Error:', err);
    throw err;
  }
}

// ตัวช่วย login / logout ตัวอย่าง
export async function login(employeeId, password) {
  const data = await apiFetch('/login', { method: 'POST', body: { employeeId, password } });
  if (data?.token) localStorage.setItem('jwt', data.token);
  return data;
}
export function logout() { localStorage.removeItem('jwt'); }

// ตัวอย่างดึงนโยบาย
export function getPolicies() {
  return apiFetch('/pagedata/policies', { method: 'GET' });
}

// อัปโหลดเอกสาร (Admin) — ส่งเป็น FormData
export async function uploadDocument(file) {
  const form = new FormData();
  form.append('document', file);
  // อย่าตั้ง Content-Type เอง ปล่อยให้ browser ใส่ boundary
  const token = localStorage.getItem('jwt');
  const res = await fetch('/api/upload/document', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
