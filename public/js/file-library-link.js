import { apiFetch } from './api.js?v=20260917-bbs-qr-login-intent-r1';
import { openModal, closeModal, escHtml, showToast } from './ui.js?v=20260714-phase21-platform-shell';

const INTENT_KEY = 'tsh_file_library_intent';
let activeObjectUrl = null;

export function captureFileLibraryIntent() {
    const match = String(window.location.hash || '').match(/^#file-library=([A-Za-z0-9_-]{43})$/);
    if (!match) return false;
    sessionStorage.setItem(INTENT_KEY, match[1]);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return true;
}

function filenameFrom(response) {
    const disposition = response.headers.get('content-disposition') || '';
    const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf) { try { return decodeURIComponent(utf[1]); } catch (_) {} }
    const plain = disposition.match(/filename="([^"]+)"/i);
    return plain?.[1] || 'download';
}

function releaseObjectUrl() {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
}

export async function consumeFileLibraryIntent() {
    const token = sessionStorage.getItem(INTENT_KEY);
    if (!token) return false;
    try {
        const response = await apiFetch(`/file-library/${encodeURIComponent(token)}`, {
            headers: { Accept: '*/*' }, suppressErrorLog: true, preserveSessionOnAuthError: true,
        });
        if (!(response instanceof Response) || !response.ok) throw new Error(response?.status === 404 ? 'ลิงก์หมดอายุ ถูกยกเลิก หรือไม่พบไฟล์' : 'ไม่สามารถเปิดไฟล์ได้');
        const blob = await response.blob(), type = response.headers.get('content-type') || blob.type;
        const filename = filenameFrom(response);
        releaseObjectUrl();
        activeObjectUrl = URL.createObjectURL(blob);
        const preview = type.startsWith('image/')
            ? `<img src="${activeObjectUrl}" alt="${escHtml(filename)}" class="mx-auto max-h-[60vh] max-w-full rounded-xl object-contain">`
            : type === 'application/pdf'
                ? `<iframe src="${activeObjectUrl}" title="${escHtml(filename)}" class="h-[60vh] w-full rounded-xl border border-slate-200"></iframe>`
                : `<div class="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center"><div class="text-3xl">📄</div><p class="mt-2 text-sm font-bold text-slate-700">${escHtml(filename)}</p><p class="mt-1 text-xs text-slate-500">ไฟล์ประเภทนี้พร้อมดาวน์โหลด</p></div>`;
        openModal('ไฟล์สำหรับสมาชิก', `<div class="space-y-4">${preview}<div class="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">ไฟล์นี้เปิดได้เฉพาะผู้ที่เข้าสู่ระบบ TSH SCA</div><div class="grid grid-cols-2 gap-2"><button type="button" id="file-library-viewer-close" class="min-h-[44px] rounded-xl border border-slate-200 font-bold text-slate-700">ปิด</button><a href="${activeObjectUrl}" download="${escHtml(filename)}" class="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-sm font-black text-white inline-flex items-center justify-center">ดาวน์โหลด</a></div></div>`, 'max-w-4xl');
        const close = () => { closeModal(); setTimeout(releaseObjectUrl, 350); };
        document.getElementById('file-library-viewer-close')?.addEventListener('click', close, { once: true });
        document.getElementById('modal-close-btn')?.addEventListener('click', () => setTimeout(releaseObjectUrl, 350), { once: true });
        sessionStorage.removeItem(INTENT_KEY);
        return true;
    } catch (error) {
        sessionStorage.removeItem(INTENT_KEY);
        showToast(error?.message || 'ไม่สามารถเปิดไฟล์ได้', 'error');
        return false;
    }
}
