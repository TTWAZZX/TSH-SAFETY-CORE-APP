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

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE DOCUMENT VIEWER — standalone overlay (not using openModal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * แสดงเอกสารใน Modal
 */
export function showDocumentModal(originalUrl, title = 'เอกสาร') {
    const url = (originalUrl || '').trim();

    // ─── File type detection ───
    const isImage  = /\.(jpeg|jpg|gif|png|webp|avif)$/i.test(url) ||
                     url.includes('googleusercontent.com') ||
                     (url.includes('cloudinary.com') && /\/image\//.test(url) && !/\.pdf/i.test(url));
    const isPdf    = /\.pdf$/i.test(url) || (url.includes('cloudinary.com') && /\.pdf/i.test(url));
    const isWord   = /\.docx?$/i.test(url);
    const isExcel  = /\.xlsx?$/i.test(url);
    const isPpt    = /\.pptx?$/i.test(url);
    const isOffice = isWord || isExcel || isPpt;

    // ─── Per-type config ───
    const TYPE_CFG = {
        pdf:   { label: 'PDF',        color: '#dc2626', bg: '#fef2f2', iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
        word:  { label: 'Word',       color: '#2563eb', bg: '#eff6ff', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        excel: { label: 'Excel',      color: '#16a34a', bg: '#f0fdf4', iconPath: 'M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
        ppt:   { label: 'PowerPoint', color: '#ea580c', bg: '#fff7ed', iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
        image: { label: 'รูปภาพ',      color: '#7c3aed', bg: '#faf5ff', iconPath: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
        other: { label: 'เอกสาร',      color: '#475569', bg: '#f8fafc', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    };
    const typeKey = isPdf ? 'pdf' : isWord ? 'word' : isExcel ? 'excel' : isPpt ? 'ppt' : isImage ? 'image' : 'other';
    const cfg     = TYPE_CFG[typeKey];
    const filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || title || 'เอกสาร';

    // ─── Viewer source ───
    let viewerSrc = url;
    if (isPdf)         viewerSrc = `https://drive.google.com/viewerng/viewer?embedded=true&url=${encodeURIComponent(url)}`;
    else if (isOffice) viewerSrc = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

    // ─── Remove any existing viewer ───
    document.getElementById('__dv_overlay')?.remove();

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

    const viewerContent = isImage
        ? `<div id="__dv_wrap" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;user-select:none">
               <img id="__dv_img" src="${url}" alt="${title}" draggable="false"
                    style="max-width:100%;max-height:100%;object-fit:contain;transform-origin:center center;transform:scale(1) translate(0px,0px);will-change:transform;user-select:none;pointer-events:none"
                    onload="document.getElementById('__dv_loader').style.display='none'"
                    onerror="document.getElementById('__dv_loader').innerHTML='<p style=\\'color:#f87171;font-size:14px;font-family:Kanit,sans-serif\\'>โหลดรูปภาพไม่ได้</p><a href=\\'${url}\\' target=\\'_blank\\' style=\\'color:#34d399;font-size:13px;margin-top:8px;display:block\\'>เปิดในแท็บใหม่</a>'">
           </div>`
        : `<iframe src="${viewerSrc}" style="width:100%;height:100%;border:0;background:#f8fafc"
                   onload="document.getElementById('__dv_loader').style.display='none'"
                   onerror="document.getElementById('__dv_loader').innerHTML='<p style=\\'color:#f87171;font-size:14px;font-family:Kanit,sans-serif\\'>โหลดเอกสารไม่ได้</p><a href=\\'${url}\\' target=\\'_blank\\' style=\\'color:#34d399;font-size:13px;margin-top:8px;display:block\\'>เปิดในแท็บใหม่แทน</a>'">
           </iframe>`;

    const overlay = document.createElement('div');
    overlay.id = '__dv_overlay';
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
                    <p style="font-size:14px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(420px,45vw);font-family:Kanit,sans-serif">${title || filename}</p>
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
                <a href="${url}" target="_blank" rel="noopener"
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
            <div id="__dv_loader" style="${S.loader}">
                <div style="${S.spinner}"></div>
                <p style="color:#94a3b8;font-size:14px;font-family:Kanit,sans-serif">กำลังโหลด ${cfg.label}...</p>
                <p style="color:#475569;font-size:12px;font-family:Kanit,sans-serif">อาจใช้เวลาสักครู่</p>
            </div>
            ${viewerContent}
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    // ─── Close logic ───
    const closeViewer = () => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            document.removeEventListener('keydown', _keyHandler);
            document.removeEventListener('mousemove', _onMouseMove);
            document.removeEventListener('mouseup', _onMouseUp);
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

    const _onMouseMove = (e) => {
        if (!_drag) return;
        _tx = _stx + (e.clientX - _sx) / _scale;
        _ty = _sty + (e.clientY - _sy) / _scale;
        applyTransform();
    };
    const _onMouseUp = () => {
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