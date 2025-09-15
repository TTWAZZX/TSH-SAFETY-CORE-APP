// js/api.js (เวอร์ชันแก้ไขแล้ว)

import { showError } from './ui.js';

// --- API Configuration (Automatic) ---

let API_BASE_URL;

if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    // ถ้าเรารันอยู่ในเครื่อง
    API_BASE_URL = 'http://localhost:5000';
    console.log('Running in DEVELOPMENT mode. API is at:', API_BASE_URL);
} else {
    // ถ้าเรารันอยู่ที่อื่น (เช่น onrender.com)
    API_BASE_URL = 'https://tsh-safety-backend.onrender.com';
    console.log('Running in PRODUCTION mode. API is at:', API_BASE_URL);
}

// export default API_BASE_URL; // ถ้าคุณใช้ export default

export async function apiFetch(endpoint, options = {}) {
    const { body, ...customOptions } = options;

    const headers = {};
    const token = localStorage.getItem('sessionToken');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...customOptions,
        headers,
    };

    if (body) {
        if (body instanceof FormData) {
            config.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            config.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        if (!response.ok) {
            // --- ▼▼▼ ส่วนที่แก้ไขทั้งหมด ▼▼▼ ---
            const resClone = response.clone(); // 1. "ถ่ายเอกสาร" Response เก็บไว้
            let errorData;
            try {
                errorData = await response.json(); // 2. พยายามใช้ "คูปองตัวจริง" อ่านเป็น JSON
            } catch (e) {
                // 3. ถ้าตัวจริงอ่านเป็น JSON ไม่ได้ ให้ใช้ "คูปองสำเนา" อ่านเป็น Text แทน
                errorData = { message: await resClone.text() };
            }
            throw new Error(errorData.message || `Error ${response.status}`);
            // --- ▲▲▲ สิ้นสุดส่วนที่แก้ไข ▲▲▲ ---
        }
        
        if (response.status === 204 || response.headers.get("content-length") === "0") {
            return { success: true };
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Fetch Error:', error);
        showError(error);
        throw error;
    }
}