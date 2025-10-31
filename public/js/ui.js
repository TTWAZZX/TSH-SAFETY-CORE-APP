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
    const container = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const wrapperEl = document.getElementById('modal-wrapper');

    if (container.classList.contains('no-padding')) {
        bodyEl.classList.remove('p-4', 'md:p-6');
    } else if (!bodyEl.classList.contains('p-4')) {
        bodyEl.classList.add('p-4', 'md:p-6');
    }

    if (size.includes('no-padding')) {
        container.classList.add('no-padding');
        bodyEl.classList.remove('p-4', 'md:p-6');
        size = size.replace('no-padding', '').trim();
    } else {
         container.classList.remove('no-padding');
    }
    
    container.className = `relative w-full ${size} max-h-[90vh] flex flex-col card`;
    titleEl.innerHTML = title;
    bodyEl.innerHTML = contentHtml;
    wrapperEl.classList.remove('hidden');
}

/**
 * ปิด Modal
 */
export function closeModal() {
    const wrapperEl = document.getElementById('modal-wrapper');
    if (wrapperEl) {
        wrapperEl.classList.add('hidden');
        document.getElementById('modal-title').innerHTML = '';
        document.getElementById('modal-body').innerHTML = '';
    }
}

/**
 * แสดง Modal สำหรับแจ้งข้อมูลอย่างเดียว
 * @param {string} title - หัวข้อ
 * @param {string} message - ข้อความ
 */
export function showInfoModal(title, message) {
    openModal(title, `<p>${message}</p><div class="text-right mt-6"><button id="modal-info-ok-btn" class="btn btn-primary">ตกลง</button></div>`);
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

/**
 * แสดง Toast Notification ที่มุมจอ
 * @param {string} message - ข้อความที่จะแสดง
 * @param {string} type - ประเภท 'success' (เขียว) หรือ 'error' (แดง)
 */
export function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed top-5 right-5 z-50 space-y-3';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    
    toast.className = `p-4 text-white rounded-lg shadow-lg ${bgColor} transform transition-all duration-300 ease-in-out animate-toast-in`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('animate-toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

/**
 * แสดง Modal สำหรับยืนยันการกระทำ
 * @param {string} title - หัวข้อ
 * @param {string} message - ข้อความคำถาม
 * @returns {Promise<boolean>} - trả về true ถ้าผู้ใช้กดยืนยัน, false ถ้ายกเลิก
 */
export function showConfirmationModal(title, message) {
    return new Promise((resolve) => {
        const contentHtml = `
            <p>${message}</p>
            <div class="text-right mt-6 space-x-2">
                <button id="modal-cancel-btn" class="btn btn-secondary">ยกเลิก</button>
                <button id="modal-confirm-btn" class="btn btn-danger">ยืนยัน</button>
            </div>
        `;
        openModal(title, contentHtml, 'max-w-md');

        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const backdrop = document.getElementById('modal-backdrop');
        const closeBtn = document.getElementById('modal-close-btn');

        const handleResolve = (value) => {
            closeModal();
            resolve(value);
        };
        
        confirmBtn.addEventListener('click', () => handleResolve(true), { once: true });
        cancelBtn.addEventListener('click', () => handleResolve(false), { once: true });
        backdrop.addEventListener('click', () => handleResolve(false), { once: true });
        closeBtn.addEventListener('click', () => handleResolve(false), { once: true });
    });
}

/**
 * แสดงเอกสารใน Modal
 * @param {string} originalUrl - URL ของเอกสาร
 * @param {string} title - หัวข้อของ Modal
 */
export function showDocumentModal(originalUrl, title = 'แสดงเอกสาร') {
    const isImage = originalUrl.includes('cloudinary.com/image/') || 
                  originalUrl.includes('googleusercontent.com') ||
                  originalUrl.match(/\.(jpeg|jpg|gif|png|webp|avif)$/i);
    
    const isPdf = originalUrl.toLowerCase().endsWith('.pdf');

    let contentHtml = '';

    if (isImage) {
        contentHtml = `
            <div class="w-full h-full flex items-center justify-center bg-slate-800/50 p-4">
                <img src="${originalUrl}" class="max-w-full max-h-full object-contain rounded-lg shadow-xl">
            </div>`;
    } else if (isPdf) {
        contentHtml = `<embed src="${originalUrl}" type="application/pdf" width="100%" height="100%">`;
    } else {
        const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(originalUrl)}&embedded=true`;
        contentHtml = `<iframe src="${viewerUrl}" class="w-full h-full" frameborder="0"></iframe>`;
    }

    openModal(title, contentHtml, 'max-w-6xl h-[90vh] no-padding');
}

// เพิ่มฟังก์ชันไว้ท้ายไฟล์ ui.js
export function handleApiError(error) {
  hideLoading();
  console.error('API Error:', error);
  const message =
    (error && error.message) ||
    (typeof error === 'object' ? JSON.stringify(error) : error) ||
    'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
  showToast(`❌ ${message}`, 'error');
}
