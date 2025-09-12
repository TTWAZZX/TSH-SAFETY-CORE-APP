// js/pages/policy.js

import { apiFetch } from '../api.js';
import { hideLoading, showError, showLoading, showInfoModal, openModal, closeModal, showDocumentModal, showToast } from '../ui.js';

// Global variables for this page
let allPolicies = [];
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
const isAdmin = currentUser?.role === 'Admin';
let policyEventListenersInitialized = false; // **ตัวแปร Flag ที่เพิ่มเข้ามา**

// --- SVG Icons สำหรับใส่ใน Input ---
    const titleIcon = `<svg class="w-5 h-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>`;
    const dateIcon = `<svg class="w-5 h-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c0-.414.336-.75.75-.75h10.5a.75.75 0 010 1.5H5.5a.75.75 0 01-.75-.75z" clip-rule="evenodd" /></svg>`;
    const linkIcon = `<svg class="w-5 h-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.665l3-3z" /><path d="M8.603 14.397a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 005.656 5.656l3-3a4 4 0 00-.225-5.865.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.665l-3 3z" /></svg>`;


// --- Event Listener หลักของหน้า (เวอร์ชันปรับปรุง) ---
function setupPolicyPageEventListeners() {
    const container = document.getElementById('policy-page');
    if (!container) return; // ป้องกัน Error ถ้าไม่มี container

    container.addEventListener('click', async (event) => {
        const target = event.target;

        // --- จัดการปุ่มต่างๆ ด้วย if ... else if ---
        const addBtn = target.closest('#btn-add-policy');
        const editBtn = target.closest('.btn-edit-policy');
        const deleteBtn = target.closest('.btn-delete-policy');
        const ackBtn = target.closest('.btn-acknowledge-policy');
        const viewDocBtn = target.closest('[data-action="view-doc"]');

        if (addBtn) {
            showPolicyForm();

        } else if (editBtn) {
            const policyId = editBtn.dataset.id;
            const policyToEdit = allPolicies.find(p => p.id == policyId);
            if (policyToEdit) showPolicyForm(policyToEdit);

        } else if (deleteBtn) {
            const policyId = deleteBtn.dataset.id;
            const policyTitle = allPolicies.find(p => p.id == policyId)?.PolicyTitle || 'รายการนี้';
            
            if (confirm(`คุณต้องการลบนโยบาย "${policyTitle}" ใช่หรือไม่?`)) {
                showLoading('กำลังลบข้อมูล...');
                try {
                    await apiFetch(`/api/policies/${policyId}`, { method: 'DELETE' });
                    closeModal(); // ปิด Modal เผื่อมีเปิดค้าง
                    await loadPolicyPage(); // โหลดหน้าใหม่
                    showInfoModal('สำเร็จ', 'ลบนโยบายเรียบร้อยแล้ว');
                } catch (error) {
                    showError(error);
                } finally {
                    hideLoading();
                }
            }
        } else if (ackBtn) {
            await handleAcknowledge(ackBtn);
            
        } else if (viewDocBtn) {
            event.preventDefault(); // หยุดไม่ให้ลิงก์ทำงานปกติ
            const url = viewDocBtn.href;
            const title = viewDocBtn.closest('.card').querySelector('h3').textContent;
            showDocumentModal(url, `เอกสาร: ${title}`);
        }
    });
}

export async function loadPolicyPage() {
    const container = document.getElementById('policy-page');
    const adminButtonHtml = isAdmin ? `
        <button id="btn-add-policy" class="btn btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            เพิ่มนโยบายใหม่
        </button>` : '';

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 class="text-2xl font-bold">นโยบายความปลอดภัย</h2>
            ${adminButtonHtml}
        </div>
        <div id="current-policy-container" class="mb-6"><div class="card p-4">กำลังโหลดนโยบายปัจจุบัน...</div></div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-policy-container" class="space-y-4"><div class="card p-4">กำลังโหลดประวัติ...</div></div>
        </div>
    `;

    // --- **ส่วนที่แก้ไข** ---
    // ย้ายการเรียกใช้ Event Listener มาไว้ตรงนี้ และเรียกแค่ครั้งแรกครั้งเดียว
    if (!policyEventListenersInitialized) {
        setupPolicyPageEventListeners();
        policyEventListenersInitialized = true;
    }
    // --- **สิ้นสุดส่วนที่แก้ไข** ---

    try {
        const data = await apiFetch('/api/pagedata/policies'); // <--- แก้เป็น pagedata
        console.log("1. Data received from API:", data); // <--- เพิ่มบรรทัดนี้
        allPolicies = [data.current, ...data.past].filter(Boolean);
        renderPolicyCards(data);
    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลนโยบายได้</div>`;
    } finally {
        hideLoading();
    }
}

function renderPolicyCards(data) {
    console.log("2. renderPolicyCards called with:", data); // <--- เพิ่มบรรทัดนี้
    const currentContainer = document.getElementById('current-policy-container');
    const pastContainer = document.getElementById('past-policy-container');
    const { current, past } = data;

    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4">ไม่พบนโยบายปัจจุบัน</div>`;
    } else {
        currentContainer.innerHTML = createPolicyCard(current, true);
    }
    pastContainer.innerHTML = past && past.length > 0
        ? past.map(p => createPolicyCard(p, false)).join('')
        : `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;
}

// js/pages/policy.js

function createPolicyCard(policy, isCurrent) {
    if (!policy) return '';

    // --- ส่วนนี้คือโค้ดเดิม ไม่ต้องแก้ไข ---
    let ackList = [];
    try { if (policy.AcknowledgedBy) ackList = JSON.parse(policy.AcknowledgedBy); } catch (e) {}
    
    const isAcknowledged = currentUser?.name ? ackList.includes(currentUser.name) : false;
    const effectiveDate = policy.EffectiveDate ? new Date(policy.EffectiveDate).toISOString().split('T')[0] : '';
    const displayDate = effectiveDate ? new Date(effectiveDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

    const adminButtons = isAdmin ? `
        <div class="mt-4 pt-4 border-t dark:border-slate-700 flex items-center gap-3">
            <button data-id="${policy.id}" class="btn btn-secondary btn-sm btn-edit-policy">แก้ไข</button>
            <button data-id="${policy.id}" class="btn btn-danger btn-sm btn-delete-policy">ลบ</button>
        </div>
    ` : '';
    
    // --- จุดที่แก้ไข ---
    // เราต้องประกาศตัวแปร const cardHtml = ก่อน แล้วตามด้วย ` (backtick)
    const cardHtml = `
    <div class="card p-5" id="policy-card-${policy.id}">
        ${isCurrent ? '<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">นโยบายปัจจุบัน</div>' : ''}
        <div class="flex justify-between items-start flex-wrap gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-semibold text-blue-600 dark:text-blue-400">${policy.PolicyTitle || 'N/A'}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">วันที่บังคับใช้: ${displayDate}</p>
                <p class="whitespace-pre-wrap mb-4">${policy.Description || ''}</p>
                ${policy.DocumentLink ? `<a href="${policy.DocumentLink}" data-action="view-doc" class="btn btn-secondary">เปิดเอกสาร</a>` : ''}
            </div>
            <div class="flex-shrink-0 space-y-3 text-right">
                <div>
                    ${isAcknowledged ? 
                        `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">รับทราบแล้ว</span>` : 
                        `<button data-row-index="${policy.id}" class="btn btn-primary btn-acknowledge-policy">รับทราบ</button>`
                    }
                </div>
            </div>
        </div>
        ${adminButtons}
    </div>`;

    // console.log ของเรายังอยู่เหมือนเดิม
    console.log(`3. HTML generated for policy ID ${policy.id}:`, cardHtml);
    
    // และ return ตัวแปรที่เพิ่งสร้าง
    return cardHtml;
}

function updateFileUploadUI(fileUrl) {
    const container = document.getElementById('file-upload-area');
    if (!container) return;

    if (fileUrl) {
        // UI กรณีมีไฟล์อยู่แล้ว (ตอนแก้ไข หรือหลังอัปโหลดสำเร็จ)
        container.innerHTML = `
            <div class="flex items-center justify-between p-3 border rounded-lg bg-slate-50 dark:bg-slate-700 dark:border-slate-600">
                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline truncate text-sm">
                    ดูไฟล์ปัจจุบัน
                </a>
                <button type="button" id="btn-remove-file" class="btn btn-secondary btn-sm">เปลี่ยนไฟล์</button>
            </div>
        `;
        document.getElementById('btn-remove-file').addEventListener('click', () => {
            document.getElementById('DocumentLink').value = '';
            updateFileUploadUI(null);
        });
    } else {
        // UI กรณีที่ยังไม่มีไฟล์ หรือต้องการอัปโหลดใหม่
        container.innerHTML = `
            <input type="file" id="file-input" class="form-input text-sm" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png">
            <div id="upload-progress" class="hidden mt-2 text-sm text-slate-500">
                <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 inline-block mr-2"></div>
                กำลังอัปโหลด...
            </div>
        `;
        document.getElementById('file-input').addEventListener('change', handleFileUpload);
    }
}

async function handleFileUpload(event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const progressEl = document.getElementById('upload-progress');
    progressEl.classList.remove('hidden');
    fileInput.disabled = true;

    const formData = new FormData();
    formData.append('document', file); // 'document' ต้องตรงกับชื่อใน `upload.single()` ที่ backend

    try {
        const result = await apiFetch('/api/upload/document', {
            method: 'POST',
            body: formData,
        });

        if (result.success) {
            document.getElementById('DocumentLink').value = result.url;
            updateFileUploadUI(result.url); // อัปเดต UI ให้แสดงว่าอัปโหลดสำเร็จ
            showToast('อัปโหลดไฟล์สำเร็จ');
        }
    } catch (error) {
        // showError(error) ถูกเรียกจาก apiFetch แล้ว
        updateFileUploadUI(null); // กลับไปหน้าอัปโหลดใหม่
    }
}

function createPolicyFormHtml(policy, effectiveDate) {
    const isEditing = policy !== null;
    
    // *** ผมได้แก้ไขโครงสร้าง HTML ที่ซ้อนกันผิดพลาดให้ในนี้แล้ว ***
    return `
      <form id="policy-form" class="space-y-4" novalidate>
        <div id="modal-content-body" class="p-6 space-y-6">
            <input type="hidden" name="id" value="${policy?.id || ''}">
            
            <div class="form-group">
                <input type="text" id="PolicyTitle" name="PolicyTitle" class="form-field w-full rounded-lg p-3" value="${policy?.PolicyTitle || ''}" required placeholder=" ">
                <label for="PolicyTitle" class="form-label-floating">หัวข้อนโยบาย *</label>
                <div class="error-message hidden mt-1 text-sm text-red-500">กรุณากรอกหัวข้อ</div>
            </div>

            <div class="form-group">
                <textarea id="Description" name="Description" class="form-field w-full rounded-lg p-3" rows="5" placeholder=" ">${policy?.Description || ''}</textarea>
                <label for="Description" class="form-label-floating">รายละเอียด</label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="form-group">
                    <input type="text" id="EffectiveDate" name="EffectiveDate" class="form-field w-full rounded-lg p-3" value="${effectiveDate}" required placeholder=" ">
                    <label for="EffectiveDate" class="form-label-floating">วันที่บังคับใช้ *</label>
                    <div class="error-message hidden mt-1 text-sm text-red-500">กรุณาเลือกวันที่</div>
                </div>
                <div class="form-group">
                    <label class="form-label block mb-1 text-sm text-slate-700 dark:text-slate-300">เอกสารแนบ</label>
                    <div id="file-upload-area"></div>
                    <input type="hidden" id="DocumentLink" name="DocumentLink" value="${policy?.DocumentLink || ''}">
                </div>
            </div>

            <div class="rounded-lg border dark:border-slate-700 p-4 flex items-center justify-between">
                <span class="text-slate-800 dark:text-slate-200 font-medium">ตั้งเป็นนโยบายปัจจุบัน</span>
                <label for="IsCurrent" class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="IsCurrent" name="IsCurrent" class="sr-only peer" ${policy?.IsCurrent ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-500 peer-checked:bg-blue-600"></div>
                </label>
            </div>
        </div>
        <div id="modal-content-footer" class="flex justify-end items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border-t dark:border-slate-700 rounded-b-xl">
            <button type="button" class="btn btn-secondary" id="btn-cancel-modal">ยกเลิก</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-policy">
                <span>${isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างนโยบาย'}</span>
                <div class="loader hidden animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            </button>
        </div>
      </form>
    `;
}

function initializeFormLogic(policy) {
    updateFileUploadUI(policy?.DocumentLink || null);

    flatpickr("#EffectiveDate", {
        altInput: true,
        altFormat: "j F Y",
        dateFormat: "Y-m-d",
        locale: "th",
    });

    const form = document.getElementById('policy-form');
    form.querySelectorAll('[required]').forEach(input => {
        input.addEventListener('blur', () => validateInput(input));
        input.addEventListener('input', () => {
            if (input.classList.contains('is-invalid')) validateInput(input);
        });
    });

    form.addEventListener('submit', handlePolicyFormSubmit);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
}

function showPolicyForm(policy = null) {
    const isEditing = policy !== null;
    const title = isEditing ? 'แก้ไขนโยบาย' : 'สร้างนโยบายใหม่';
    const effectiveDate = policy?.EffectiveDate ? new Date(policy.EffectiveDate).toISOString().split('T')[0] : '';

    // 1. สร้าง HTML จากฟังก์ชันที่แยกไว้
    const formHtml = createPolicyFormHtml(policy, effectiveDate);
    
    // 2. เปิด Modal
    openModal(title, formHtml, 'max-w-3xl no-padding');
    
    // 3. เรียกใช้ Logic เพื่อทำให้ฟอร์มทำงาน
    initializeFormLogic(policy);
}

// --- เพิ่มฟังก์ชันสำหรับ Validate Input ---
function validateInput(input) {
    const errorMessage = input.parentElement.querySelector('.error-message');
    if (!input.checkValidity()) {
        input.classList.add('is-invalid');
        errorMessage.classList.remove('hidden');
        return false;
    } else {
        input.classList.remove('is-invalid');
        errorMessage.classList.add('hidden');
        return true;
    }
}

// --- แก้ไข handlePolicyFormSubmit ให้มีการ Validate ก่อนส่ง ---
async function handlePolicyFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    let isFormValid = true;
    form.querySelectorAll('[required]').forEach(input => {
        if (!validateInput(input)) {
            isFormValid = false;
        }
    });

    if (!isFormValid) {
        showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
        return;
    }
    
    // ... โค้ดส่วนที่เหลือของ handlePolicyFormSubmit เหมือนเดิม ...
    const submitBtn = document.getElementById('btn-submit-policy');
    const btnText = submitBtn.querySelector('span');
    const btnLoader = submitBtn.querySelector('.loader');

    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.IsCurrent = form.querySelector('#IsCurrent').checked;

    const method = data.id ? 'PUT' : 'POST';
    const endpoint = data.id ? `/api/policies/${data.id}` : '/api/policies';

    try {
        const result = await apiFetch(endpoint, { method: method, body: data });
        closeModal();
        await loadPolicyPage();
        showToast(result.message);
    } catch (error) {
        showError(error);
    } finally {
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

async function handleAcknowledge(button) {
    const rowIndex = button.dataset.rowIndex;
    button.disabled = true;
    showLoading('กำลังบันทึกการรับทราบ...');
    try {
        const result = await apiFetch(`/api/policies/${rowIndex}/acknowledge`, { method: 'POST' });
        if (result.status === 'success') {
            await loadPolicyPage();
        } else {
            showInfoModal('ผิดพลาด', result.message);
            button.disabled = false;
        }
    } catch (error) {
        showError(error);
        button.disabled = false;
    } finally {
        hideLoading();
    }
}
