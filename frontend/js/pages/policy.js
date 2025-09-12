// frontend/js/pages/policy.js

import { apiFetch } from '../api.js';
import { hideLoading, showError, showDocumentModal, showInfoModal, showLoading } from '../ui.js';

// ฟังก์ชันหลักสำหรับโหลดและแสดงผลหน้า Policy
export async function loadPolicyPage() {
    const container = document.getElementById('policy-page');
    // ตั้งค่า HTML เริ่มต้น
    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">นโยบายความปลอดภัย</h2>
        </div>
        <div id="current-policy-container" class="mb-6">
            <div class="card p-4 text-center text-slate-500">กำลังโหลดนโยบายปัจจุบัน...</div>
        </div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-policy-container" class="space-y-4">
                 <div class="card p-4 text-center text-slate-500">กำลังโหลดประวัติ...</div>
            </div>
        </div>
    `;

    try {
        // เรียก API
        const data = await apiFetch('/api/pagedata/policies');
        // ส่งข้อมูลไปแสดงผล
        renderPolicyCards(data);
    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลนโยบายได้</div>`;
    } finally {
        hideLoading();
    }
}

// ฟังก์ชันสำหรับนำข้อมูลไปสร้างเป็น HTML
function renderPolicyCards(data) {
    const currentContainer = document.getElementById('current-policy-container');
    const pastContainer = document.getElementById('past-policy-container');
    
    const { current, past } = data;

    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4 text-center">ไม่พบนโยบายปัจจุบัน</div>`;
        pastContainer.innerHTML = '';
        return;
    }

    // แสดงผลนโยบายปัจจุบัน
    currentContainer.innerHTML = createPolicyCard(current, true);

    // แสดงผลประวัติ
    pastContainer.innerHTML = past && past.length > 0
        ? past.map(p => createPolicyCard(p, false)).join('')
        : `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;
    
    // ทำให้ปุ่ม "เปิดเอกสาร" ทำงานได้
    document.querySelectorAll('.btn-open-doc').forEach(button => {
        button.addEventListener('click', (event) => {
            showDocumentModal(event.currentTarget.dataset.docUrl);
        });
    });
}

// ฟังก์ชันสร้าง HTML สำหรับการ์ด 1 ใบ
function createPolicyCard(policy, isCurrent) {
    if (!policy) return '';

    const effectiveDate = policy.EffectiveDate ? new Date(policy.EffectiveDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
    
    const openDocButtonHtml = policy.DocumentLink 
        ? `<button data-doc-url="${policy.DocumentLink}" class="btn btn-secondary btn-open-doc">เปิดเอกสาร</button>` 
        : '';

    return `
    <div class="card p-5">
        ${isCurrent ? '<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">นโยบายปัจจุบัน</div>' : ''}
        <div class="flex justify-between items-start flex-wrap gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-semibold text-blue-600 dark:text-blue-400">${policy.PolicyTitle || 'N/A'}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">วันที่บังคับใช้: ${effectiveDate}</p>
                <p class="whitespace-pre-wrap mb-4">${policy.Description || ''}</p>
                ${openDocButtonHtml}
            </div>
        </div>
    </div>
    `;
}

// ฟังก์ชันจัดการเมื่อผู้ใช้กดปุ่ม "รับทราบ" (เวอร์ชันใหม่)
async function handleAcknowledge(event) {
    const button = event.target;
    const rowIndex = button.dataset.rowIndex; // rowIndex คือ id ของ policy

    button.disabled = true;
    showLoading('กำลังบันทึกการรับทราบ...');

    try {
        const result = await apiFetch(`/api/policies/${rowIndex}/acknowledge`, { 
            method: 'POST' 
        });

        showInfoModal('ผลการดำเนินการ', result.message);

        // โหลดข้อมูลหน้านโยบายใหม่เพื่ออัปเดตสถานะ "รับทราบแล้ว"
        if (result.status === 'success') {
            loadPolicyPage();
        }

    } catch (error) {
        showError(error);
        button.disabled = false;
    } finally {
        hideLoading();
    }
}