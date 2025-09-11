// js/api.js

// ตั้งค่า URL ของ Backend Server
// ตอนทดสอบบนเครื่องจะใช้ 'http://localhost:3001'
// ตอนนำขึ้นระบบจริง เราจะเปลี่ยนเป็น URL ของ Render.com
const API_BASE_URL = 'http://localhost:5000';

/**
 * ฟังก์ชันกลางสำหรับเรียกใช้ API ทั้งหมด
 * @param {string} endpoint - The API endpoint to call (e.g., '/api/employees')
 * @param {object} options - Configuration for the fetch request (method, body, etc.)
 * @returns {Promise<any>} - The JSON response from the server
 */
export async function apiFetch(endpoint, options = {}) {
    const { body, ...customOptions } = options;
    const headers = {
        'Content-Type': 'application/json',
    };

    // ดึง Token ที่บันทึกไว้มาใส่ใน Header เพื่อยืนยันตัวตน
    const token = localStorage.getItem('sessionToken');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...customOptions,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Error ${response.status}`);
        }
        
        // สำหรับ request ที่ไม่มี content ตอบกลับ (เช่น DELETE)
        if (response.status === 204 || response.headers.get("content-length") === "0") {
            return { success: true };
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Fetch Error:', error);
        // ในอนาคตเราจะ import showError จาก ui.js มาใช้ตรงนี้
        alert(`API Error: ${error.message}`); 
        throw error;
    }
}