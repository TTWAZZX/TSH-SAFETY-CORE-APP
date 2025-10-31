// public/js/api.js
// ป้องกันการเติม /api ซ้ำ และแนบ JWT ให้เอง

const API_PREFIX = ''; // same-origin

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
  // รองรับทั้ง '/login' หรือ '/api/login' โดยไม่ซ้ำ '/api'
  let path = endpoint || '';
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.startsWith('/api/')) path = '/api' + path;

  const res = await fetch(path, buildOptions(options));
  if (res.status === 204 || res.headers.get('content-length') === '0') return { success: true };
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.message || msg; } catch {}
    throw new Error(msg);
  }
  return await res.json();
}

export async function login(employeeId, password) {
  const data = await apiFetch('/login', { method: 'POST', body: { employeeId, password } });
  if (data?.token) localStorage.setItem('jwt', data.token);
  return data;
}

export function logout() { localStorage.removeItem('jwt'); }
