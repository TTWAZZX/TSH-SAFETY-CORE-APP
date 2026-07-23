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
let _modalRestoreFocus = null;
let _modalCloseTimer = null;
let _modalOpenVersion = 0;
let _modalOverlayActive = false;
let _documentViewerOverlayActive = false;

function _hasVisibleModal() {
    const wrapperEl = document.getElementById('modal-wrapper');
    return _modalOverlayActive && !!wrapperEl && !wrapperEl.classList.contains('hidden');
}

function _hasDocumentViewer() {
    return _documentViewerOverlayActive && !!document.getElementById('__dv_overlay');
}

function _hasEditableFocus() {
    const selector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea, [contenteditable="true"]';
    return !!document.activeElement?.matches?.(selector);
}

function _syncMobileOverlayState() {
    const hasModal = _hasVisibleModal();
    const hasDocumentViewer = _hasDocumentViewer();
    document.body.classList.toggle('mobile-modal-open', hasModal);
    document.body.classList.toggle('mobile-document-viewer-open', hasDocumentViewer);
    document.body.dataset.mobileOverlayActive = hasModal || hasDocumentViewer ? '1' : '0';
    if (!_hasEditableFocus()) document.body.classList.remove('mobile-keyboard-open');
    window.dispatchEvent(new CustomEvent('tsh:mobile-overlay-state'));
}

export function openModal(title, contentHtml, size = 'max-w-2xl') {
    const container = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const wrapperEl = document.getElementById('modal-wrapper');

    if (!container || !wrapperEl) return;
    clearTimeout(_modalCloseTimer);
    _modalCloseTimer = null;
    _modalOpenVersion += 1;
    _modalRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

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
    container.className = `relative p-0 w-full ${size} max-h-[90vh] flex flex-col card transform scale-95 transition-transform duration-300 shadow-2xl rounded-xl overflow-hidden`;
    
    // 3. ใส่เนื้อหา
    if (titleEl) titleEl.innerHTML = title;
    if (bodyEl) bodyEl.innerHTML = contentHtml;
    
    // 4. เริ่มแสดงผล (Animation Step)
    // เริ่มต้น: เอา hidden ออก แต่ยังโปร่งใสอยู่ (opacity-0)
    wrapperEl.classList.remove('hidden');
    wrapperEl.classList.add('opacity-0'); 
    _modalOverlayActive = true;
    _syncMobileOverlayState();

    // รอเสี้ยววินาทีเพื่อให้ Browser render class opacity-0 ก่อน แล้วค่อยเปลี่ยนเป็น opacity-100
    setTimeout(() => {
        wrapperEl.classList.remove('opacity-0');
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 20);
}

export function openDetailModal({ title, subtitle = '', meta = [], body = '', footer = '', size = 'max-w-2xl' } = {}) {
    const metaHtml = (meta || []).filter(Boolean).map(item => `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${item.className || 'bg-slate-50 text-slate-600 border-slate-200'}">
            ${item.dot ? `<span class="w-1.5 h-1.5 rounded-full" style="background:${item.dot}"></span>` : ''}
            ${escHtml(item.label || item)}
        </span>
    `).join('');
    const contentHtml = `
        <div class="space-y-4">
            <div class="pb-4 border-b border-slate-100">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                        <h3 class="text-base font-bold text-slate-800">${title || ''}</h3>
                        ${subtitle ? `<p class="text-xs text-slate-500 mt-1">${escHtml(subtitle)}</p>` : ''}
                    </div>
                    ${metaHtml ? `<div class="flex flex-wrap gap-2">${metaHtml}</div>` : ''}
                </div>
            </div>
            ${body || ''}
            ${footer ? `<div class="pt-3 border-t border-slate-100">${footer}</div>` : ''}
        </div>`;
    openModal('รายละเอียด', contentHtml, size);
}

/**
 * ปิด Modal - ปรับปรุง Animation
 */
const STATUS_TONE = {
    draft: 'draft',
    new: 'open',
    open: 'open',
    progress: 'progress',
    'in progress': 'progress',
    temporary: 'progress',
    pending: 'pending',
    review: 'pending',
    reviewed: 'approved',
    waiting: 'pending',
    approved: 'approved',
    pass: 'approved',
    passed: 'approved',
    valid: 'approved',
    low: 'approved',
    medium: 'pending',
    'due-soon': 'pending',
    high: 'overdue',
    critical: 'failed',
    'no-data': 'info',
    closed: 'closed',
    complete: 'closed',
    completed: 'closed',
    cancelled: 'closed',
    overdue: 'overdue',
    failed: 'failed',
    fail: 'failed',
    rejected: 'failed',
    error: 'failed',
};

export function statusTone(status = '') {
    const raw = String(status || '').trim().toLowerCase();
    return STATUS_TONE[raw] || 'info';
}

export function statusBadge(status = '', { label, className = '' } = {}) {
    const text = label || status || '-';
    return `<span class="ds-badge is-${statusTone(status)} ${className}">${escHtml(text)}</span>`;
}

export function metricCard(label, value, hint = '', tone = 'slate') {
    const toneClass = {
        good: 'is-good',
        warn: 'is-warn',
        risk: 'is-risk',
        info: 'is-info',
        emerald: 'is-good',
        amber: 'is-warn',
        rose: 'is-risk',
        sky: 'is-info',
    }[tone] || '';
    return `
        <div class="ds-metric-card ${toneClass}">
            <p class="ds-metric-label">${escHtml(label)}</p>
            <p class="ds-metric-value">${escHtml(value ?? '-')}</p>
            ${hint ? `<p class="ds-metric-hint">${escHtml(hint)}</p>` : ''}
        </div>`;
}

export function emptyState(title = 'No data', message = '') {
    return `
        <div class="ds-empty-state">
            <strong>${escHtml(title)}</strong>
            ${message ? `<span>${escHtml(message)}</span>` : ''}
        </div>`;
}

export function closeModal() {
    const wrapperEl = document.getElementById('modal-wrapper');
    const container = document.getElementById('modal-container');

    if (!wrapperEl) return;
    const closeVersion = _modalOpenVersion;
    clearTimeout(_modalCloseTimer);

    // 1. เริ่ม Animation ปิด (Fade Out & Scale Down)
    _modalOverlayActive = false;
    _syncMobileOverlayState();
    wrapperEl.classList.add('opacity-0');
    if (container) {
        container.classList.remove('scale-100');
        container.classList.add('scale-95');
    }

    // 2. รอให้ Animation จบ (300ms) แล้วค่อยซ่อนจริง
    _modalCloseTimer = setTimeout(() => {
        if (closeVersion !== _modalOpenVersion) return;
        wrapperEl.classList.add('hidden');
        _syncMobileOverlayState();
        
        // ล้างเนื้อหาเพื่อประหยัด Memory และป้องกันข้อมูลเก่าค้าง
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        if (titleEl) titleEl.innerHTML = '';
        if (bodyEl) bodyEl.innerHTML = '';
        if (_modalRestoreFocus?.isConnected) _modalRestoreFocus.focus({ preventScroll: true });
        _modalRestoreFocus = null;
        _syncMobileOverlayState();
        _modalCloseTimer = null;
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

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE DOCUMENT VIEWER — standalone overlay (not using openModal)
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeDocumentUrl(rawUrl) {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';
    const appBasePath = () => {
        const appPath = window.location.pathname || '/';
        const marker = '/index.html';
        let basePath = appPath;
        if (appPath.includes(marker)) {
            basePath = appPath.slice(0, appPath.indexOf(marker));
        } else if (/\/[^/]+\.[^/]+$/.test(appPath)) {
            basePath = appPath.replace(/\/[^/]*$/, '');
        }
        return basePath.replace(/\/+$/, '');
    };
    try {
        const parsed = new URL(raw, window.location.href);
        const host = parsed.hostname.toLowerCase();
        const currentHost = window.location.hostname.toLowerCase();
        const targetIsLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const currentIsLocal = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '::1';
        const uploadIndex = parsed.pathname.indexOf('/uploads/');
        if (uploadIndex < 0) return raw;

        const uploadPath = parsed.pathname.slice(uploadIndex);
        if (currentIsLocal) return raw;

        if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/uploads/')) {
            const base = appBasePath();
            return `${window.location.origin}${base}${uploadPath}${parsed.search}${parsed.hash}`;
        }

        if (targetIsLocal) {
            const base = appBasePath();
            return `${window.location.origin}${base}${uploadPath}${parsed.search}${parsed.hash}`;
        }
    } catch {
        return raw;
    }
    return raw;
}

/**
 * แสดงเอกสารใน Modal
 */
export function showDocumentModal(originalUrl, title = 'เอกสาร') {
    const url = normalizeDocumentUrl(originalUrl);
    const escapeAttr = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const safeUrl = escapeAttr(url);
    const getUrlFilename = () => {
        try {
            const parsed = new URL(url, window.location.href);
            return parsed.searchParams.get('filename') || decodeURIComponent(parsed.pathname.split('/').pop() || '');
        } catch {
            return decodeURIComponent(url.split('/').pop().split('?')[0] || '');
        }
    };
    const isPrivateNetworkUrl = (() => {
        try {
            const parsed = new URL(url, window.location.href);
            const host = parsed.hostname.toLowerCase();
            return (
                parsed.protocol === 'file:' ||
                host === window.location.hostname.toLowerCase() ||
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host === '::1' ||
                /^10\./.test(host) ||
                /^192\.168\./.test(host) ||
                /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
            );
        } catch {
            return true;
        }
    })();

    const cleanPath = (() => {
        try {
            return decodeURIComponent(new URL(url, window.location.href).pathname);
        } catch {
            return decodeURIComponent(url.split('?')[0].split('#')[0] || '');
        }
    })();
    const isUploadWithoutExtension = /\/uploads\/[^/.?#]+$/i.test(cleanPath);

    // ─── File type detection ───
    const isImage  = /\.(jpeg|jpg|gif|png|webp|avif)$/i.test(cleanPath) ||
                     url.includes('googleusercontent.com');
    const isPdf    = /\.pdf$/i.test(cleanPath) || isUploadWithoutExtension;
    const isWord   = /\.docx?$/i.test(cleanPath);
    const isExcel  = /\.xlsx?$/i.test(cleanPath);
    const isPpt    = /\.pptx?$/i.test(cleanPath);
    const isVideo  = /\.(mp4|webm|ogg|mov)$/i.test(cleanPath);
    const isOffice = isWord || isExcel || isPpt;
    const canUseGoogleViewer = isOffice && !isPrivateNetworkUrl;

    // ─── Per-type config ───
    const TYPE_CFG = {
        pdf:   { label: 'PDF',        color: '#dc2626', bg: '#fef2f2', iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
        word:  { label: 'Word',       color: '#2563eb', bg: '#eff6ff', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        excel: { label: 'Excel',      color: '#16a34a', bg: '#f0fdf4', iconPath: 'M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
        ppt:   { label: 'PowerPoint', color: '#ea580c', bg: '#fff7ed', iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
        image: { label: 'รูปภาพ',      color: '#7c3aed', bg: '#faf5ff', iconPath: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
        video: { label: 'วิดีโอ',       color: '#0891b2', bg: '#ecfeff', iconPath: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
        other: { label: 'เอกสาร',      color: '#475569', bg: '#f8fafc', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    };
    const typeKey = isPdf ? 'pdf' : isWord ? 'word' : isExcel ? 'excel' : isPpt ? 'ppt' : isImage ? 'image' : isVideo ? 'video' : 'other';
    const cfg     = TYPE_CFG[typeKey];
    const filename = getUrlFilename() || title || 'เอกสาร';
    const displayTitle = title === 'เอกสาร' ? filename : title;

    // ─── Viewer source ───
    let viewerSrc = url;
    if (canUseGoogleViewer) viewerSrc = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    const safeViewerSrc = escapeAttr(viewerSrc);

    // ─── Remove any existing viewer ───
    _documentViewerOverlayActive = false;
    document.getElementById('__dv_overlay')?.remove();
    _syncMobileOverlayState();

    // ─── Shared inline-style helpers (safe outside Tailwind CDN scope) ───
    const S = {
        overlay:  'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:rgba(2,6,23,0.96);opacity:0;transition:opacity 0.2s ease',
        toolbar:  'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#ffffff;border-bottom:1px solid #e2e8f0;flex-shrink:0;gap:12px',
        filebox:  `width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${cfg.bg}`,
        content:  'flex:1;position:relative;overflow:hidden',
        loader:   'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(2,6,23,0.9);z-index:10;gap:14px',
        spinner:  'width:44px;height:44px;border-radius:50%;border:4px solid #059669;border-top-color:transparent;animation:__dv_spin 0.8s linear infinite',
        btnBase:  'display:inline-flex;align-items:center;gap:5px;padding:6px 12px;font-size:12px;font-weight:600;border-radius:8px;text-decoration:none;border:none;cursor:pointer;font-family:Kanit,sans-serif;transition:background 0.15s',
        zoomWrap: 'display:flex;align-items:center;gap:2px;background:#f1f5f9;border-radius:8px;padding:2px',
        zoomBtn:  'padding:6px 8px;border:none;background:transparent;cursor:pointer;border-radius:6px;color:#475569;line-height:1;transition:background 0.15s',
    };

    const zoomControls = isImage ? `
        <div style="${S.zoomWrap}">
            <button id="__dv_zout" title="ซูมออก" style="${S.zoomBtn}">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"/></svg>
            </button>
            <span id="__dv_pct" style="font-size:12px;font-weight:700;color:#475569;min-width:38px;text-align:center;font-family:Kanit,sans-serif">100%</span>
            <button id="__dv_zin" title="ซูมเข้า" style="${S.zoomBtn}">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
            </button>
            <button id="__dv_zfit" title="พอดีหน้าจอ (1:1)" style="${S.zoomBtn}">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
            </button>
        </div>` : '';

    const fallbackContent = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:24px;background:#0f172a">
            <div style="max-width:520px;text-align:center;background:#ffffff;border-radius:12px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.25);font-family:Kanit,sans-serif">
                <div style="${S.filebox};margin:0 auto 16px auto;width:56px;height:56px">
                    <svg width="28" height="28" fill="none" stroke="${cfg.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="${cfg.iconPath}"/></svg>
                </div>
                <h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">ไม่สามารถแสดงตัวอย่างไฟล์นี้ในระบบได้</h3>
                <p style="font-size:13px;color:#64748b;line-height:1.7;margin-bottom:18px">ไฟล์ Office หรือไฟล์บางชนิดบน server ภายในบริษัทอาจเปิด preview ใน browser ไม่ได้ ให้เปิดในแท็บใหม่หรือดาวน์โหลดแทน</p>
                <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">
                    <a href="${safeUrl}" target="_blank" rel="noopener" style="${S.btnBase}background:#f1f5f9;color:#475569">เปิดในแท็บใหม่</a>
                    <a href="${safeUrl}" download="${escapeAttr(filename)}" style="${S.btnBase}background:#ecfdf5;color:#059669">ดาวน์โหลด</a>
                </div>
            </div>
        </div>`;

    const localExcelPreview = isExcel && !canUseGoogleViewer;
    const viewerContent = isImage
        ? `<div id="__dv_wrap" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;user-select:none">
               <img id="__dv_img" src="${safeUrl}" alt="${escapeAttr(displayTitle)}" draggable="false"
                    style="max-width:100%;max-height:100%;object-fit:contain;transform-origin:center center;transform:scale(1) translate(0px,0px);will-change:transform;user-select:none;pointer-events:none"
                    onload="document.getElementById('__dv_loader').style.display='none'"
                    onerror="document.getElementById('__dv_loader').innerHTML='<p style=\\'color:#f87171;font-size:14px;font-family:Kanit,sans-serif\\'>โหลดรูปภาพไม่ได้</p><a href=\\'${safeUrl}\\' target=\\'_blank\\' style=\\'color:#34d399;font-size:13px;margin-top:8px;display:block\\'>เปิดในแท็บใหม่</a>'">
           </div>`
        : isVideo
        ? `<video src="${safeUrl}" controls style="width:100%;height:100%;background:#020617;object-fit:contain" onloadeddata="document.getElementById('__dv_loader').style.display='none'" onerror="document.getElementById('__dv_loader').innerHTML='<p style=\\'color:#f87171;font-size:14px;font-family:Kanit,sans-serif\\'>โหลดวิดีโอไม่ได้</p><a href=\\'${safeUrl}\\' target=\\'_blank\\' style=\\'color:#34d399;font-size:13px;margin-top:8px;display:block\\'>เปิดในแท็บใหม่</a>'"></video>`
        : (isPdf || canUseGoogleViewer)
        ? `<iframe src="${safeViewerSrc}" style="width:100%;height:100%;border:0;background:#f8fafc"
                   onload="document.getElementById('__dv_loader').style.display='none'"
                   onerror="document.getElementById('__dv_loader').innerHTML='<p style=\\'color:#f87171;font-size:14px;font-family:Kanit,sans-serif\\'>โหลดเอกสารไม่ได้</p><a href=\\'${safeUrl}\\' target=\\'_blank\\' style=\\'color:#34d399;font-size:13px;margin-top:8px;display:block\\'>เปิดในแท็บใหม่แทน</a>'">
           </iframe>`
        : localExcelPreview
        ? `<div id="__dv_excel_preview" style="width:100%;height:100%;overflow:auto;background:#f8fafc;padding:18px;font-family:Kanit,sans-serif"></div>`
        : fallbackContent;

    const showInlineLoader = isImage || isVideo || isPdf || canUseGoogleViewer || localExcelPreview;
    const loaderStyle = showInlineLoader ? S.loader : `${S.loader};display:none`;

    const overlay = document.createElement('div');
    overlay.id = '__dv_overlay';
    overlay.className = 'document-viewer-overlay';
    overlay.style.cssText = S.overlay;
    overlay.innerHTML = `
        <style>@keyframes __dv_spin{to{transform:rotate(360deg)}}</style>

        <!-- Toolbar -->
        <div style="${S.toolbar}">

            <!-- Left: file info -->
            <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
                <div style="${S.filebox}">
                    <svg width="20" height="20" fill="none" stroke="${cfg.color}" stroke-width="1.8"
                         stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                        <path d="${cfg.iconPath}"/>
                    </svg>
                </div>
                <div style="min-width:0">
                    <p style="font-size:14px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(420px,45vw);font-family:Kanit,sans-serif">${escapeAttr(displayTitle || filename)}</p>
                    <p style="font-size:11px;color:#94a3b8;margin-top:1px;font-family:Kanit,sans-serif">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-weight:700;font-size:10px;background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
                        &nbsp;${filename}
                    </p>
                </div>
            </div>

            <!-- Right: actions -->
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">

                ${zoomControls}

                <!-- Open in new tab -->
                <a href="${safeUrl}" target="_blank" rel="noopener"
                   style="${S.btnBase}background:#f1f5f9;color:#475569"
                   onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    เปิดในแท็บใหม่
                </a>

                <!-- Download -->
                <button id="__dv_dl"
                        style="${S.btnBase}background:#ecfdf5;color:#059669"
                        onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='#ecfdf5'">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    ดาวน์โหลด
                </button>

                <!-- Close -->
                <button id="__dv_close" title="ปิด (Esc)"
                        style="padding:8px;border:none;background:transparent;cursor:pointer;border-radius:8px;color:#64748b;margin-left:4px;transition:all 0.15s"
                        onmouseover="this.style.background='#fee2e2';this.style.color='#dc2626'"
                        onmouseout="this.style.background='transparent';this.style.color='#64748b'">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Viewer -->
        <div style="${S.content}">
            <div id="__dv_loader" style="${loaderStyle}">
                <div style="${S.spinner}"></div>
                <p style="color:#94a3b8;font-size:14px;font-family:Kanit,sans-serif">กำลังโหลด ${cfg.label}...</p>
                <p style="color:#475569;font-size:12px;font-family:Kanit,sans-serif">อาจใช้เวลาสักครู่</p>
            </div>
            ${viewerContent}
        </div>
    `;

    document.body.appendChild(overlay);
    _documentViewerOverlayActive = true;
    _syncMobileOverlayState();
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    // ─── Close logic ───
    let _onMouseMove = null;
    let _onMouseUp = null;
    let viewerClosing = false;

    const closeViewer = () => {
        if (viewerClosing) return;
        viewerClosing = true;
        _documentViewerOverlayActive = false;
        _syncMobileOverlayState();
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            _syncMobileOverlayState();
            document.removeEventListener('keydown', _keyHandler);
            if (_onMouseMove) document.removeEventListener('mousemove', _onMouseMove);
            if (_onMouseUp) document.removeEventListener('mouseup', _onMouseUp);
        }, 200);
    };
    const _keyHandler = (e) => { if (e.key === 'Escape') closeViewer(); };
    document.getElementById('__dv_close').addEventListener('click', closeViewer);
    document.addEventListener('keydown', _keyHandler);

    // ─── Download (fetch-blob for cross-origin support) ───
    document.getElementById('__dv_dl').addEventListener('click', async () => {
        try {
            const res  = await fetch(url, { mode: 'cors' });
            if (!res.ok) throw new Error('fetch failed');
            const blob = await res.blob();
            const burl = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = burl; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(burl), 5000);
        } catch {
            // Fallback: open in new tab (browser will handle download)
            window.open(url, '_blank', 'noopener');
        }
    });

    // ─── Image zoom & pan ───
    const renderExcelPreview = async () => {
        if (!localExcelPreview) return;
        const host = document.getElementById('__dv_excel_preview');
        const loader = document.getElementById('__dv_loader');
        if (!host) return;
        try {
            if (!window.XLSX) throw new Error('SheetJS library is not loaded');
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buffer = await res.arrayBuffer();
            const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) throw new Error('No worksheet found');
            const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                header: 1,
                raw: false,
                defval: '',
                blankrows: false,
            }).slice(0, 80);
            const maxCols = Math.min(16, rows.reduce((max, row) => Math.max(max, row.length), 0));
            const tableRows = rows.map((row, rowIndex) => `
                <tr>
                    ${Array.from({ length: maxCols }).map((_, colIndex) => {
                        const value = row[colIndex] ?? '';
                        const tag = rowIndex === 0 ? 'th' : 'td';
                        const headStyle = rowIndex === 0 ? 'font-weight:800;background:#ecfdf5;color:#065f46;position:sticky;top:0;z-index:1;' : '';
                        return `<${tag} style="border:1px solid #e2e8f0;padding:8px 10px;min-width:120px;max-width:260px;white-space:pre-wrap;vertical-align:top;${headStyle}">${escHtml(String(value)) || '&nbsp;'}</${tag}>`;
                    }).join('')}
                </tr>
            `).join('');
            host.innerHTML = `
                <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 30px rgba(15,23,42,0.08);overflow:hidden">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#ffffff">
                        <div style="min-width:0">
                            <p style="font-size:14px;font-weight:800;color:#0f172a;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(sheetName)}</p>
                            <p style="font-size:11px;color:#64748b;margin:2px 0 0">Preview ${rows.length} rows - ${maxCols} columns</p>
                        </div>
                        <span style="font-size:11px;font-weight:800;color:#047857;background:#d1fae5;border-radius:999px;padding:4px 9px">Excel Preview</span>
                    </div>
                    <div style="overflow:auto;max-height:calc(100vh - 150px)">
                        <table style="border-collapse:collapse;width:max-content;min-width:100%;font-size:12px;color:#334155">
                            <tbody>${tableRows || `<tr><td style="padding:20px;color:#64748b">No data</td></tr>`}</tbody>
                        </table>
                    </div>
                </div>`;
            if (loader) loader.style.display = 'none';
        } catch (err) {
            if (loader) loader.style.display = 'none';
            host.innerHTML = fallbackContent;
            console.warn('[document-preview] Excel preview failed:', err.message);
        }
    };
    renderExcelPreview();

    if (!isImage) return;

    let _scale = 1, _tx = 0, _ty = 0;
    let _drag = false, _sx = 0, _sy = 0, _stx = 0, _sty = 0;

    const img   = document.getElementById('__dv_img');
    const wrap  = document.getElementById('__dv_wrap');
    const pctEl = document.getElementById('__dv_pct');
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const applyTransform = () => {
        img.style.transform = `scale(${_scale}) translate(${_tx}px,${_ty}px)`;
        if (pctEl) pctEl.textContent = `${Math.round(_scale * 100)}%`;
        wrap.style.cursor = _scale > 1 ? (_drag ? 'grabbing' : 'grab') : 'default';
    };

    const zoom = (factor, min = 0.1, max = 10) => {
        _scale = clamp(_scale * factor, min, max);
        if (_scale <= 1) { _tx = 0; _ty = 0; }
        applyTransform();
    };

    document.getElementById('__dv_zin') .addEventListener('click', () => zoom(1.25));
    document.getElementById('__dv_zout').addEventListener('click', () => zoom(0.8));
    document.getElementById('__dv_zfit').addEventListener('click', () => { _scale = 1; _tx = 0; _ty = 0; applyTransform(); });

    // Mouse-wheel zoom (centered on cursor)
    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 0.91);
    }, { passive: false });

    // Drag to pan
    wrap.addEventListener('mousedown', (e) => {
        if (_scale <= 1) return;
        _drag = true; _sx = e.clientX; _sy = e.clientY; _stx = _tx; _sty = _ty;
        wrap.style.cursor = 'grabbing';
    });

    _onMouseMove = (e) => {
        if (!_drag) return;
        _tx = _stx + (e.clientX - _sx) / _scale;
        _ty = _sty + (e.clientY - _sy) / _scale;
        applyTransform();
    };
    _onMouseUp = () => {
        if (!_drag) return;
        _drag = false;
        wrap.style.cursor = _scale > 1 ? 'grab' : 'default';
    };

    // Touch pinch-zoom
    let _lastDist = 0;
    wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            _lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (_lastDist > 0) zoom(dist / _lastDist);
            _lastDist = dist;
        }
    }, { passive: false });

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup', _onMouseUp);
}

/** Escape HTML entities — ใช้ก่อน inject ค่าจาก API/user เข้า innerHTML */
export function escHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
                <p class="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-emerald-600 transition-colors">${user.name || user.EmployeeName}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">ID: ${user.id || user.EmployeeID}</p>
            </div>
        `;
    }
}
