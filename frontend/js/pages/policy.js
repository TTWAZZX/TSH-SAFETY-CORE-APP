// js/pages/policy.js

import { apiFetch } from '../api.js';
import { hideLoading, showError, showLoading, showInfoModal, openModal, closeModal } from '../ui.js';

// Global variable for this page to store data
let allPolicies = [];
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
const isAdmin = currentUser?.role === 'Admin';

// --- Event Listener หลักของหน้า ---
function setupPolicyPageEventListeners() {
    const container = document.getElementById('policy-page');
    
    // ใช้ event listener ตัวเดียวจัดการทุกคลิกในหน้านี้
    container.addEventListener('click', async (event) => {
        const target = event.target;

        // ปุ่ม "เพิ่มนโยบายใหม่"
        if (target.closest('#btn-add-policy')) {
            showPolicyForm();
        }
        // ปุ่ม "แก้ไข"
        if (target.closest('.btn-edit-policy')) {
            const policyId = target.closest('.btn-edit-policy').dataset.id;
            const policyToEdit = allPolicies.find(p => p.id == policyId);
            if (policyToEdit) showPolicyForm(policyToEdit);
        }
        // ปุ่ม "ลบ"
        if (target.closest('.btn-delete-policy')) {
            const policyId = target.closest('.btn-delete-policy').dataset.id;
            const policyTitle = allPolicies.find(p => p.id == policyId)?.PolicyTitle || 'รายการนี้';
            
            if (confirm(`คุณต้องการลบนโยบาย "${policyTitle}" ใช่หรือไม่?`)) {
                showLoading('กำลังลบข้อมูล...');
                try {
                    await apiFetch(`/api/policies/${policyId}`, { method: 'DELETE' });
                    showInfoModal('สำเร็จ', 'ลบนโยบายเรียบร้อยแล้ว');
                    loadPolicyPage(); // โหลดหน้าใหม่
                } catch (error) {
                    showError(error);
                } finally {
                    hideLoading();
                }
            }
        }
        // ปุ่ม "รับทราบ"
        if (target.closest('.btn-acknowledge-policy')) {
            const button = target.closest('.btn-acknowledge-policy');
            await handleAcknowledge(button);
        }
    });
}

// เรียกใช้ Event Listener แค่ครั้งเดียว
setupPolicyPageEventListeners();


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
        <div id="current-policy-container" class="mb-6"><p class="card p-4">กำลังโหลดนโยบายปัจจุบัน...</p></div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-policy-container" class="space-y-4"><p class="card p-4">กำลังโหลดประวัติ...</p></div>
        </div>
    `;

    try {
        const data = await apiFetch('/api/pagedata/policies');
        // เก็บข้อมูลทั้งหมดไว้ในตัวแปร global
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

function createPolicyCard(policy, isCurrent) {
    if (!policy) return '';
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
    
    return `
    <div class="card p-5">
        ${isCurrent ? '<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">นโยบายปัจจุบัน</div>' : ''}
        <div class="flex justify-between items-start flex-wrap gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-semibold text-blue-600 dark:text-blue-400">${policy.PolicyTitle || 'N/A'}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">วันที่บังคับใช้: ${displayDate}</p>
                <p class="whitespace-pre-wrap mb-4">${policy.Description || ''}</p>
                ${policy.DocumentLink ? `<a href="${policy.DocumentLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">เปิดเอกสาร</a>` : ''}
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
}

// --- ฟังก์ชันสำหรับฟอร์ม (สร้าง/แก้ไข) ---
function showPolicyForm(policy = null) {
    const isEditing = policy !== null;
    const title = isEditing ? 'แก้ไขนโยบาย' : 'สร้างนโยบายใหม่';
    const effectiveDate = policy?.EffectiveDate ? new Date(policy.EffectiveDate).toISOString().split('T')[0] : '';

    const formHtml = `
        <form id="policy-form" class="space-y-4">
            <input type="hidden" name="id" value="${policy?.id || ''}">
            <div>
                <label for="PolicyTitle" class="form-label">หัวข้อนโยบาย</label>
                <input type="text" id="PolicyTitle" name="PolicyTitle" class="form-input" value="${policy?.PolicyTitle || ''}" required>
            </div>
            <div>
                <label for="Description" class="form-label">รายละเอียด</label>
                <textarea id="Description" name="Description" class="form-input" rows="4">${policy?.Description || ''}</textarea>
            </div>
            <div>
                <label for="EffectiveDate" class="form-label">วันที่บังคับใช้</label>
                <input type="date" id="EffectiveDate" name="EffectiveDate" class="form-input" value="${effectiveDate}" required>
            </div>
            <div>
                <label for="DocumentLink" class="form-label">ลิงก์เอกสาร (ถ้ามี)</label>
                <input type="url" id="DocumentLink" name="DocumentLink" class="form-input" value="${policy?.DocumentLink || ''}">
            </div>
            <div class="flex items-center">
                <input type="checkbox" id="IsCurrent" name="IsCurrent" class="form-checkbox" ${policy?.IsCurrent ? 'checked' : ''}>
                <label for="IsCurrent" class="ml-2">ตั้งเป็นนโยบายปัจจุบัน</label>
            </div>
            <div class="text-right mt-6">
                <button type="button" class="btn btn-secondary mr-2" onclick="closeModal()">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">${isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างนโยบาย'}</button>
            </div>
        </form>
    `;
    
    openModal(title, formHtml);

    // Add event listener for the form submission
    document.getElementById('policy-form').addEventListener('submit', handlePolicyFormSubmit);
}

async function handlePolicyFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.IsCurrent = form.querySelector('#IsCurrent').checked; // Handle checkbox

    const method = data.id ? 'PUT' : 'POST';
    const endpoint = data.id ? `/api/policies/${data.id}` : '/api/policies';

    showLoading('กำลังบันทึกข้อมูล...');
    try {
        const result = await apiFetch(endpoint, {
            method: method,
            body: data
        });
        closeModal();
        showInfoModal('สำเร็จ', result.message);
        loadPolicyPage(); // Reload the page to see changes
    } catch (error) {
        showError(error);
    } finally {
        hideLoading();
    }
}

// --- ฟังก์ชันสำหรับปุ่มรับทราบ ---
async function handleAcknowledge(button) {
    const rowIndex = button.dataset.rowIndex;

    button.disabled = true;
    showLoading('กำลังบันทึกการรับทราบ...');

    try {
        const result = await apiFetch(`/api/policies/${rowIndex}/acknowledge`, { 
            method: 'POST' 
        });

        // ไม่ต้องใช้ showInfoModal เพราะจะโหลดหน้าใหม่เลย
        if (result.status === 'success') {
            loadPolicyPage();
        } else {
            showInfoModal('ผิดพลาด', result.message);
        }

    } catch (error) {
        showError(error);
        button.disabled = false;
    } finally {
        hideLoading();
    }
}