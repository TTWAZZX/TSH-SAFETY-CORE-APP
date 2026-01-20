// public/js/ui.js

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
 * แสดง Modal (หน้าต่าง Pop-up) - ปรับปรุง Animation ไม่ให้ล่องหน
 * @param {string} title - หัวข้อของ Modal
 * @param {string} contentHtml - โค้ด HTML ที่จะแสดงใน Modal
 * @param {string} size - ขนาดของ Modal (e.g., 'max-w-4xl')
 */
export function openModal(title, contentHtml, size = 'max-w-2xl') {
    const container = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const wrapperEl = document.getElementById('modal-wrapper');

    if (!container || !wrapperEl) return;

    // 1. จัดการ Padding ของ Body
    if (container.classList.contains('no-padding')) {
        bodyEl.classList.remove('p-4', 'md:p-6');
    } else if (!bodyEl.classList.contains('p-4')) {
        bodyEl.classList.add('p-4', 'md:p-6');
    }

    // 2. จัดการขนาดและ Padding ของ Container
    if (size.includes('no-padding')) {
        container.classList.add('no-padding');
        bodyEl.classList.remove('p-4', 'md:p-6');
        size = size.replace('no-padding', '').trim();
    } else {
         container.classList.remove('no-padding');
    }
    
    // ตั้งค่า Class พื้นฐาน (เริ่มด้วย scale-95 เพื่อรอ Animation)
    container.className = `relative w-full ${size} max-h-[90vh] flex flex-col card transform scale-95 transition-transform duration-300`;
    
    // 3. ใส่เนื้อหา
    if (titleEl) titleEl.innerHTML = title;
    if (bodyEl) bodyEl.innerHTML = contentHtml;
    
    // 4. เริ่มแสดงผล (Animation Step)
    // เริ่มต้น: เอา hidden ออก แต่ยังโปร่งใสอยู่ (opacity-0)
    wrapperEl.classList.remove('hidden');
    wrapperEl.classList.add('opacity-0'); 

    // รอเสี้ยววินาทีเพื่อให้ Browser render class opacity-0 ก่อน แล้วค่อยเปลี่ยนเป็น opacity-100
    setTimeout(() => {
        wrapperEl.classList.remove('opacity-0');
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 20);
}

/**
 * ปิด Modal - ปรับปรุง Animation
 */
export function closeModal() {
    const wrapperEl = document.getElementById('modal-wrapper');
    const container = document.getElementById('modal-container');

    if (!wrapperEl) return;

    // 1. เริ่ม Animation ปิด (Fade Out & Scale Down)
    wrapperEl.classList.add('opacity-0');
    if (container) {
        container.classList.remove('scale-100');
        container.classList.add('scale-95');
    }

    // 2. รอให้ Animation จบ (300ms) แล้วค่อยซ่อนจริง
    setTimeout(() => {
        wrapperEl.classList.add('hidden');
        
        // ล้างเนื้อหาเพื่อประหยัด Memory และป้องกันข้อมูลเก่าค้าง
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        if (titleEl) titleEl.innerHTML = '';
        if (bodyEl) bodyEl.innerHTML = '';
    }, 300);
}

/**
 * แสดง Modal สำหรับแจ้งข้อมูลอย่างเดียว
 */
export function showInfoModal(title, message) {
    openModal(title, `<p class="text-slate-700 dark:text-slate-300 text-lg text-center my-4">${message}</p><div class="text-center mt-6"><button id="modal-info-ok-btn" class="btn btn-primary px-6">ตกลง</button></div>`, 'max-w-sm');
    
    // ใช้ setTimeout เพื่อให้แน่ใจว่าปุ่มถูกสร้างแล้ว
    setTimeout(() => {
        const btn = document.getElementById('modal-info-ok-btn');
        if(btn) btn.addEventListener('click', closeModal);
    }, 50);
}

/**
 * แสดง Error Modal
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
 */
export function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed top-20 right-5 z-50 space-y-3 pointer-events-none'; // top-20 เพื่อหลบ Header
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    const icon = type === 'success' ? '✅' : '❌';
    
    // เพิ่ม shadow-lg และ animate-bounce เล็กน้อย
    toast.className = `p-4 text-white rounded-lg shadow-xl ${bgColor} flex items-center gap-3 transform transition-all duration-300 ease-in-out opacity-0 translate-x-4 pointer-events-auto min-w-[300px]`;
    toast.innerHTML = `<span class="text-xl">${icon}</span> <span class="font-medium">${message}</span>`;

    toastContainer.appendChild(toast);

    // Animation เข้า
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-x-4');
    });

    // Animation ออกและลบ
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-4');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

/**
 * แสดง Modal สำหรับยืนยันการกระทำ (Promise Base)
 */
export function showConfirmationModal(title, message) {
    return new Promise((resolve) => {
        const contentHtml = `
            <p class="text-slate-600 dark:text-slate-300 text-lg mb-6">${message}</p>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-slate-700">
                <button id="modal-cancel-btn" class="btn btn-secondary px-4">ยกเลิก</button>
                <button id="modal-confirm-btn" class="btn btn-danger px-4">ยืนยัน</button>
            </div>
        `;
        openModal(title, contentHtml, 'max-w-md');

        const handleResolve = (value) => {
            closeModal();
            resolve(value);
            // ลบ Event Listener ออกเพื่อไม่ให้ค้าง (Clean up)
            cleanup();
        };

        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const backdrop = document.getElementById('modal-backdrop');
        const closeBtn = document.getElementById('modal-close-btn');

        function cleanup() {
             // การใช้ { once: true } ช่วยได้ระดับหนึ่ง แต่ถ้า element ถูกลบไปแล้วก็ไม่มีปัญหา
        }
        
        // ใช้ setTimeout เล็กน้อยเพื่อให้ DOM render เสร็จก่อนจับ Element
        setTimeout(() => {
             if(confirmBtn) confirmBtn.addEventListener('click', () => handleResolve(true), { once: true });
             if(cancelBtn) cancelBtn.addEventListener('click', () => handleResolve(false), { once: true });
             if(backdrop) backdrop.addEventListener('click', () => handleResolve(false), { once: true });
             if(closeBtn) closeBtn.addEventListener('click', () => handleResolve(false), { once: true });
        }, 50);
    });
}

/**
 * แสดงเอกสารใน Modal
 */
export function showDocumentModal(originalUrl, title = 'แสดงเอกสาร') {
    const isImage = originalUrl.includes('cloudinary.com/image/') || 
                   originalUrl.includes('googleusercontent.com') ||
                   originalUrl.match(/\.(jpeg|jpg|gif|png|webp|avif)$/i);
    
    const isPdf = originalUrl.toLowerCase().endsWith('.pdf');

    let contentHtml = '';

    if (isImage) {
        contentHtml = `
            <div class="w-full h-full flex items-center justify-center bg-slate-900/90 p-4 min-h-[50vh]">
                <img src="${originalUrl}" class="max-w-full max-h-[80vh] object-contain rounded shadow-2xl">
            </div>`;
    } else if (isPdf) {
        contentHtml = `<embed src="${originalUrl}" type="application/pdf" width="100%" height="600px" class="rounded-b-lg">`;
    } else {
        // ใช้ Google Docs Viewer สำหรับไฟล์ Office
        const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(originalUrl)}&embedded=true`;
        contentHtml = `<iframe src="${viewerUrl}" class="w-full h-[80vh]" frameborder="0"></iframe>`;
    }

    openModal(title, contentHtml, 'max-w-5xl no-padding');
}

export function handleApiError(error) {
    hideLoading();
    console.error('API Error:', error);
    const message =
        (error && error.message) ||
        (typeof error === 'object' ? JSON.stringify(error) : error) ||
        'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
    showToast(`❌ ${message}`, 'error');
}

// เพิ่มฟังก์ชันอัปเดตข้อมูลผู้ใช้ (สำหรับ Header)
export function updateUserInfo(user) {
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl && user) {
        userInfoEl.innerHTML = `
            <div class="text-right leading-tight cursor-pointer group">
                <p class="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">${user.name || user.EmployeeName}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">ID: ${user.id || user.EmployeeID}</p>
            </div>
        `;
    }
}