/* public/js/api.js
 * Centralized API helper
 * - Production: ใช้ path เดียวกันกับเว็บ (เช่น /api/...)
 * - Development (localhost): ชี้ไปที่ backend local (http://localhost:5000)
 * - แนวคิด: เลิก hardcode https://tsh-safety-backend.onrender.com
 */

import { showError } from './ui.js';

const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/** ใน Production ให้เว้นว่าง เพื่อให้ fetch('/api/...') ยิงโดเมนเดียวกับเว็บ */
let API_BASE_URL = '';

/** Development: ใช้ backend local ได้ตามต้องการ */
if (DEV_HOSTNAMES.has(location.hostname)) {
  // เปลี่ยนพอร์ตได้ตามที่คุณใช้รัน backend ในเครื่อง
  API_BASE_URL = 'http://localhost:5000';
}

/** (ถ้าจำเป็น) ให้ไฟล์อื่นอ่านค่าได้ */
export function getApiBaseUrl() {
  return API_BASE_URL;
}

/**
 * apiFetch — ตัวช่วยเรียก API กลาง
 * รองรับ:
 *  - แนบ JWT จาก localStorage (key: sessionToken)
 *  - Body ได้ทั้ง JSON และ FormData (เช่น อัปโหลดไฟล์)
 *  - โยน Error พร้อมข้อความจากเซิร์ฟเวอร์ (JSON หรือ text)
 *  - รองรับ 204 No Content
 *
 * @param {string} endpoint เช่น '/api/login' หรือ '/api/pagedata/policies'
 * @param {RequestInit & { body?: any }} options
 * @returns {Promise<any>}
 */
export async function apiFetch(endpoint, options = {}) {
  const { body, headers: customHeaders, ...rest } = options;

  // แนบ token ถ้ามี
  const headers = new Headers(customHeaders || {});
  const token = localStorage.getItem('sessionToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  // จัดรูปแบบ body อัตโนมัติ
  const init = { ...rest, headers };

  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      // FormData ไม่ต้อง set Content-Type (ให้ browser ใส่ boundary เอง)
      init.body = body;
    } else {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(body);
    }
  }

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, init);

    if (!response.ok) {
      // พยายามอ่าน error จาก JSON ก่อน
      const resClone = response.clone();
      let errorData = { message: `HTTP ${response.status}` };

      try {
        errorData = await response.json();
      } catch {
        // ถ้าไม่ใช่ JSON ให้ลองอ่านเป็น text
        try {
          errorData = { message: await resClone.text() };
        } catch {
          // ใช้ค่าเริ่มต้น
        }
      }

      const message = errorData?.message || `Error ${response.status}`;
      throw new Error(message);
    }

    // กรณีพวก 204 หรือไม่มีเนื้อหา
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { success: true };
    }

    // ปกติ: อ่านเป็น JSON
    return await response.json();
  } catch (error) {
    // โชว์ error แบบรวมศูนย์
    console.error('API Fetch Error:', error);
    showError?.(error);
    throw error;
  }
}
