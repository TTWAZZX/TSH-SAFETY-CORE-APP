import { API } from '../api.js';
import { hideLoading, showError, showLoading, openModal, closeModal, showDocumentModal, showToast, showConfirmationModal } from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';


// --- Global State ---
let allPolicies = [];
let policyEventListenersInitialized = false;

// --- Main Page Loader ---
export async function loadPolicyPage() {
    console.log("📄 Loading Policy Page...");
    const container = document.getElementById('policy-page');
    
    // Initialize Listeners Once
    if (!policyEventListenersInitialized) {
        setupPolicyPageEventListeners();
        policyEventListenersInitialized = true;
    }

    // ✅ 1. ตรวจสอบข้อมูลผู้ใช้และสิทธิ์ Admin
    const userStr = localStorage.getItem('currentUser');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    // เช็คสิทธิ์แบบละเอียด (รองรับทั้งตัวเล็ก/ตัวใหญ่)
    const isAdmin = currentUser && (
        (currentUser.role && currentUser.role.toLowerCase() === 'admin') || 
        (currentUser.Role && currentUser.Role.toLowerCase() === 'admin') ||
        (currentUser.id === 'admin') // Hardcode เผื่อฉุกเฉิน
    );

    // Debug: ดูว่าระบบมองว่าเป็น Admin หรือไม่
    console.log(`Current User: ${currentUser?.name}, Role: ${currentUser?.role}, IsAdmin: ${isAdmin}`);

    // 1. Setup Layout Structure
    container.innerHTML = `
        <div class="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
            
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        นโยบายความปลอดภัย (Safety Policy)
                    </h1>
                    <p class="text-sm text-slate-500 mt-1">ข้อกำหนดและแนวทางปฏิบัติด้านความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน</p>
                </div>
                
                ${isAdmin ? `
                <button id="btn-add-policy" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    เพิ่มนโยบายใหม่
                </button>` : ''}
            </div>

            <div id="current-policy-container">
                <div class="py-12 text-center text-slate-400">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3"></div>
                    <p>กำลังโหลดข้อมูล...</p>
                </div>
            </div>

            <div>
                <h3 class="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2 border-l-4 border-slate-300 pl-3">
                    <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    ประวัติย้อนหลัง (History)
                </h3>
                <div id="past-policy-container" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
            </div>
        </div>
    `;

    // 2. Fetch Data
    try {
        const raw = await API.get('/pagedata/policies');
        const data = normalizeApiObject(raw);

        let current = null;
        let past = [];

        // case 1: API ส่ง current / past มาแยก
        if (data.current || data.past) {
            current = normalizeApiObject(data.current);
            past = normalizeApiArray(data.past);
        }
        // case 2: API ส่งมาเป็น array รวม
        else {
            const list = normalizeApiArray(data);
            current = list.find(p => p.IsCurrent == 1) || list[0] || null;
            past = list.filter(p => String(p.id) !== String(current?.id));
        }

        allPolicies = [current, ...past].filter(Boolean);

        renderCurrentPolicy(current, isAdmin);
        renderPastPolicies(past, isAdmin);

    } catch (error) {
        console.error("Error loading policies:", error);
        document.getElementById('current-policy-container').innerHTML = `
            <div class="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-center">
                เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}
            </div>`;
    }
}

// --- Render Functions ---
function renderCurrentPolicy(rawPolicy, isAdmin) {
    const container = document.getElementById('current-policy-container');
    const policy = normalizeApiObject(rawPolicy);

    
    if (!policy) {
        container.innerHTML = `
            <div class="p-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <svg class="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <p class="text-slate-500">ยังไม่มีการประกาศนโยบายปัจจุบัน</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative group transition-all hover:shadow-xl">
            <div class="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
            
            <div class="p-6 md:p-8">
                <div class="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                    <div>
                        <div class="flex items-center gap-2 mb-3">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                                ฉบับปัจจุบัน (Active)
                            </span>
                            <span class="text-xs text-slate-400 font-mono">ID: ${policy.id}</span>
                        </div>
                        <h2 class="text-2xl md:text-3xl font-bold text-slate-800 leading-tight">
                            ${policy.PolicyTitle}
                        </h2>
                        <div class="flex items-center gap-2 mt-2 text-sm text-slate-500">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            วันที่มีผลบังคับใช้: <span class="font-semibold text-slate-700">${formatDate(policy.EffectiveDate)}</span>
                        </div>
                    </div>

                    ${isAdmin ? `
                    <div class="flex gap-2">
                        <button class="btn-edit-policy p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" data-id="${policy.id || policy.PolicyID}" title="แก้ไข">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                    </div>` : ''}
                </div>

                <div class="prose prose-slate max-w-none bg-slate-50/80 p-6 rounded-lg border border-slate-100 text-slate-700">
                    <p class="whitespace-pre-wrap leading-relaxed">${policy.Description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                </div>

                ${policy.DocumentLink ? `
                <div class="mt-6 pt-4 border-t border-slate-100">
                    <a href="${policy.DocumentLink}" data-action="view-doc" class="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-colors shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        เปิดดูเอกสารแนบ (View Document)
                    </a>
                </div>` : ''}
            </div>
        </div>
    `;
}

function renderPastPolicies(rawPolicies, isAdmin) {
    const container = document.getElementById('past-policy-container');
    const list = normalizeApiArray(rawPolicies);

    if (!list.length) {
        container.innerHTML = `
            <p class="text-slate-400 text-sm col-span-full italic">
                ไม่มีประวัติย้อนหลัง
            </p>`;
        return;
    }

    container.innerHTML = list.map(raw => {
        const p = normalizeApiObject(raw); // ✅ normalize ต่อ 1 item

        return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-all shadow-sm group flex justify-between items-start">
                <div>
                    <h4 class="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                        ${p.PolicyTitle || '-'}
                    </h4>

                    <div class="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        <span class="bg-slate-100 px-2 py-0.5 rounded">
                            ปี ${p.EffectiveDate ? new Date(p.EffectiveDate).getFullYear() + 543 : '-'}
                        </span>
                        <span>${formatDate(p.EffectiveDate)}</span>
                    </div>

                    ${p.DocumentLink ? `
                        <a href="${p.DocumentLink}"
                           data-action="view-doc"
                           class="text-xs text-blue-500 hover:underline mt-2 inline-flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                            </svg>
                            เอกสารแนบ
                        </a>
                    ` : ''}
                </div>

                ${isAdmin ? `
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-edit-policy p-1.5 text-slate-400 hover:text-blue-600 rounded"
                                data-id="${p.id}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M15.232 5.232l3.536 3.536m-2.036-5.036
                                         a2.5 2.5 0 113.536 3.536
                                         L6.5 21.036H3v-3.572L16.732 3.732z"/>
                            </svg>
                        </button>

                        <button class="btn-delete-policy p-1.5 text-slate-400 hover:text-red-600 rounded"
                                data-id="${p.id}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21
                                         H7.862a2 2 0 01-1.995-1.858
                                         L5 7m5 4v6m4-6v6
                                         m1-10V4a1 1 0 00-1-1h-4
                                         a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}


// --- Event Handling ---
function setupPolicyPageEventListeners() {
    document.addEventListener('click', async (event) => {
        if (!event.target.closest('#policy-page')) return;
        
        const target = event.target;

        if (target.closest('#btn-add-policy')) {
            showPolicyForm();
            return;
        }

        const editBtn = target.closest('.btn-edit-policy');
        if (editBtn) {
            const policyId = editBtn.dataset.id;
            const policyToEdit = allPolicies.find(
                p => String(p.id) === String(policyId)
            );

            if (policyToEdit) showPolicyForm(policyToEdit);
            return;
        }

        const deleteBtn = target.closest('.btn-delete-policy');
        if (deleteBtn) {
            const policyId = deleteBtn.dataset.id;
            const confirmed = await showConfirmationModal('ยืนยันการลบ', 'คุณต้องการลบนโยบายนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้');
            
            if (confirmed) {
                showLoading('กำลังลบข้อมูล...');
                try {
                    await API.delete(`/policies/${policyId}`);
                    await loadPolicyPage(); 
                    showToast('ลบข้อมูลเรียบร้อยแล้ว', 'success');
                } catch (error) {
                    showError(error);
                } finally {
                    hideLoading();
                }
            }
            return;
        }

        const viewDocBtn = target.closest('[data-action="view-doc"]');
        if (viewDocBtn) {
            event.preventDefault();
            showDocumentModal(viewDocBtn.href, 'เอกสารแนบ');
            return;
        }
    });
}

// --- Form & Modal Logic ---
function showPolicyForm(rawPolicy = null) {
    const policy = normalizeApiObject(rawPolicy);

    const isEditing = policy !== null;
    const title = isEditing ? 'แก้ไขนโยบาย' : 'เพิ่มนโยบายใหม่';
    
    const html = `
        <form id="policy-form" class="space-y-5 px-1">
            <input type="hidden" name="id" value="${policy?.id || ''}">
            
            <div class="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm border border-blue-100 flex gap-2">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>กรุณาใส่ลิงก์เอกสารจากแหล่งที่เชื่อถือได้ (เช่น SharePoint, Google Drive)</span>
            </div>

            <div>
                <label class="block text-sm font-bold text-slate-700 mb-1">หัวข้อนโยบาย <span class="text-red-500">*</span></label>
                <div class="relative">
                    <input type="text" name="PolicyTitle" class="form-input w-full rounded-lg" 
                           value="${policy?.PolicyTitle || ''}" required placeholder="ระบุชื่อนโยบาย (เช่น นโยบายความปลอดภัย ปี 2567)">
                </div>
            </div>

            <div>
                <label class="block text-sm font-bold text-slate-700 mb-1">รายละเอียด (Description)</label>
                <textarea name="Description" class="form-textarea w-full rounded-lg h-24 resize-none" 
                          placeholder="รายละเอียดเพิ่มเติม...">${policy?.Description || ''}</textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">วันที่บังคับใช้ <span class="text-red-500">*</span></label>
                    <input type="text" id="EffectiveDate" name="EffectiveDate" class="form-input w-full rounded-lg bg-white" 
                           value="${policy?.EffectiveDate ? new Date(policy.EffectiveDate).toISOString().split('T')[0] : ''}" required>
                </div>
                <div class="grid grid-cols-1 gap-3">
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">ลิงก์เอกสาร (URL)</label>
                    <input type="text"
                        name="DocumentLink"
                        class="form-input w-full rounded-lg"
                        value="${policy?.DocumentLink || ''}"
                        placeholder="https://...">
                </div>

                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">
                    หรืออัปโหลดไฟล์ (PDF / DOCX)
                    </label>
                    <input type="file"
                        name="PolicyFile"
                        accept=".pdf,.doc,.docx"
                        class="block w-full text-sm text-slate-600
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-lg file:border-0
                                file:text-sm file:font-semibold
                                file:bg-slate-100 file:text-slate-700
                                hover:file:bg-slate-200">
                    <p class="text-xs text-slate-400 mt-1">
                    * ถ้าเลือกไฟล์ ระบบจะใช้ไฟล์แทนลิงก์
                    </p>
                </div>
                </div>

            </div>

            <div class="flex items-center gap-2 py-2">
                <input type="checkbox" id="IsCurrent" name="IsCurrent" class="rounded text-blue-600 w-4 h-4 focus:ring-blue-500" 
                       ${policy?.IsCurrent ? 'checked' : ''}>
                <label for="IsCurrent" class="text-sm font-medium text-slate-700 cursor-pointer select-none">ตั้งเป็นนโยบายฉบับปัจจุบัน (Active)</label>
            </div>

            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button type="button" class="px-5 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors" onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                <button type="submit" class="px-6 py-2.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-sm font-bold shadow-md transition-colors">บันทึกข้อมูล</button>
            </div>
        </form>
    `;

    openModal(title, html, 'max-w-2xl');

    flatpickr("#EffectiveDate", { 
        locale: "th", 
        dateFormat: "Y-m-d",
        defaultDate: policy?.EffectiveDate || "today"
    });

    document.getElementById('policy-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formEl = e.target;
        const submitBtn = formEl.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML =
            '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังบันทึก...';

        const formData = new FormData(formEl);

        try {
            showLoading('กำลังบันทึก...');

            // ----------------------------
            // 1) ถ้ามีไฟล์ → upload ก่อน
            // ----------------------------
            const file = formData.get('PolicyFile');

            if (file && file.size > 0) {
            const uploadData = new FormData();
            uploadData.append('file', file);

            const uploadRes = await API.post('/files/upload', uploadData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (!uploadRes?.url) {
                throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
            }

            // ใช้ URL จากไฟล์แทน
            formData.set('DocumentLink', uploadRes.url);
            }

            // ไม่ต้องส่งไฟล์ไปที่ /policies
            formData.delete('PolicyFile');

            // ----------------------------
            // 2) แปลง FormData → Object
            // ----------------------------
            const data = Object.fromEntries(formData.entries());
            data.IsCurrent = formEl.querySelector('#IsCurrent').checked ? 1 : 0;

            // ----------------------------
            // 3) Save policy
            // ----------------------------
            if (data.id) {
            await API.put(`/policies/${data.id}`, data);
            } else {
            await API.post('/policies', data);
            }

            closeModal();
            showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
            await loadPolicyPage();

        } catch (error) {
            showError(error);
        } finally {
            hideLoading();
            submitBtn.disabled = false;
            submitBtn.textContent = 'บันทึกข้อมูล';
        }
    });

}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}