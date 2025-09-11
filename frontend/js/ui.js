// js/ui.js

/**
 * แสดงตัว Loading แบบเต็มหน้าจอ
 * @param {string} message - ข้อความที่จะให้แสดง
 */
export function showLoading(message = 'กำลังโหลดข้อมูล...') {
    const indicator = document.getElementById('session-loader');
    const messageEl = document.getElementById('loading-message');
    if (indicator && messageEl) {
        messageEl.textContent = message;
        indicator.classList.remove('hidden');
    }
}

/**
 * ซ่อนตัว Loading แบบเต็มหน้าจอ
 */
export function hideLoading() {
    const indicator = document.getElementById('session-loader');
    if(indicator) {
        indicator.classList.add('hidden');
    }
}

/**
 * แสดง Modal (หน้าต่าง Pop-up)
 * @param {string} title - หัวข้อของ Modal
 * @param {string} contentHtml - โค้ด HTML ที่จะแสดงใน Modal
 * @param {string} size - ขนาดของ Modal (e.g., 'max-w-4xl')
 */
export function openModal(title, contentHtml, size = 'max-w-2xl') {
    document.getElementById('modal-container').className = `relative p-4 md:p-6 w-full ${size} max-h-[90vh] flex flex-col card`;
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = contentHtml;
    document.getElementById('modal-wrapper').classList.remove('hidden');
}

/**
 * ปิด Modal
 */
export function closeModal() {
    document.getElementById('modal-wrapper').classList.add('hidden');
    document.getElementById('modal-title').innerHTML = '';
    document.getElementById('modal-body').innerHTML = '';
}

/**
 * แสดง Modal สำหรับแจ้งข้อมูลอย่างเดียว
 * @param {string} title - หัวข้อ
 * @param {string} message - ข้อความ
 */
export function showInfoModal(title, message) {
    openModal(title, `<p>${message}</p><div class="text-right mt-6"><button id="modal-info-ok-btn" class="btn btn-primary">ตกลง</button></div>`);
    // ต้อง add event listener ใหม่ทุกครั้ง เพราะปุ่มถูกสร้างขึ้นมาใหม่
    document.getElementById('modal-info-ok-btn').addEventListener('click', closeModal);
}

/**
 * แสดง Error Modal
 * @param {Error} error - The error object
 */
export function showError(error) {
    hideLoading();
    console.error('An error occurred:', error);
    const errorMessage = (error && error.message) ?
        error.message :
        (typeof error === 'object' ? JSON.stringify(error) : error);

    showInfoModal('เกิดข้อผิดพลาด', `ไม่สามารถทำรายการได้: ${errorMessage || 'กรุณาลองใหม่อีกครั้ง'}`);
}