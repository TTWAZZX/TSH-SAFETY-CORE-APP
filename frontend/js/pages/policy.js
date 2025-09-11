// js/pages/policy.js

import { apiFetch } from '../api.js';
import { hideLoading, showError, showInfoModal } from '../ui.js';

// ฟังก์ชันหลักสำหรับโหลดและแสดงผลหน้า Policy
export async function loadPolicyPage() {
    const container = document.getElementById('policy-page');
    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">นโยบายความปลอดภัย</h2>
            </div>
        <div id="current-policy-container" class="mb-6"><p>กำลังโหลดนโยบายปัจจุบัน...</p></div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-policy-container" class="space-y-4"><p>กำลังโหลดประวัติ...</p></div>
        </div>
    `;

    try {
        const data = await apiFetch('/api/pagedata/policies');
        renderPolicyCards(data);
    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลนโยบายได้</div>`;
    } finally {
        hideLoading();
    }
}

// ฟังก์ชันสำหรับนำข้อมูลที่ได้มาสร้างเป็นการ์ดแสดงผล
function renderPolicyCards(data) {
    const currentContainer = document.getElementById('current-policy-container');
    const pastContainer = document.getElementById('past-policy-container');

    const { current, past } = data;

    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4">ไม่พบนโยบายปัจจุบัน</div>`;
        pastContainer.innerHTML = '';
        return;
    }

    currentContainer.innerHTML = createPolicyCard(current, true);
    pastContainer.innerHTML = past.length > 0 
        ? past.map(p => createPolicyCard(p, false)).join('') 
        : '<div class="card p-4">ไม่มีประวัติ</div>';

    // เพิ่ม Event Listener ให้กับปุ่ม "รับทราบ" ที่สร้างขึ้นมา
    document.querySelectorAll('.btn-acknowledge-policy').forEach(button => {
        button.addEventListener('click', handleAcknowledge);
    });
}

// ฟังก์ชันสร้าง HTML สำหรับการ์ดนโยบาย 1 ใบ
function createPolicyCard(policy, isCurrent) {
    if (!policy) return '';

    // ข้อมูลการรับทราบ (AcknowledgedBy) ในฐานข้อมูลเป็น TEXT ที่เก็บ JSON string
    let ackList = [];
    try {
        if (policy.AcknowledgedBy) ackList = JSON.parse(policy.AcknowledgedBy);
    } catch (e) {
        console.warn("Could not parse AcknowledgedBy JSON for policy:", policy.rowIndex);
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser')); // ดึงข้อมูลผู้ใช้ปัจจุบัน
    const isAcknowledged = currentUser?.name ? ackList.includes(currentUser.name) : false;

    const effectiveDate = policy.EffectiveDate ? new Date(policy.EffectiveDate).toLocaleDateString('th-TH') : 'N/A';

    return `
    <div class="card p-5">
        ${isCurrent ? '<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">นโยบายปัจจุบัน</div>' : ''}
        <div class="flex justify-between items-start flex-wrap gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-semibold text-blue-600 dark:text-blue-400">${policy.PolicyTitle || 'N/A'}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">วันที่บังคับใช้: ${effectiveDate}</p>
                <p class="whitespace-pre-wrap mb-4">${policy.Description || ''}</p>
                ${policy.DocumentLink ? `<a href="${policy.DocumentLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">เปิดเอกสาร</a>` : ''}
            </div>
            <div class="flex-shrink-0 space-y-3 text-right">
                <div>
                    ${isAcknowledged 
                        ? `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">รับทราบแล้ว</span>` 
                        : `<button data-row-index="${policy.rowIndex}" class="btn btn-primary btn-acknowledge-policy">รับทราบ</button>`
                    }
                </div>
                </div>
        </div>
    </div>
    `;
}

// ฟังก์ชันจัดการเมื่อผู้ใช้กดปุ่ม "รับทราบ"
async function handleAcknowledge(event) {
    const rowIndex = event.target.dataset.rowIndex;
    showLoading('กำลังบันทึกการรับทราบ...');

    try {
        // *** Placeholder for Acknowledge API Call ***
        // เรายังไม่มี API สำหรับการรับทราบ เราจะสร้างมันในขั้นตอนถัดๆ ไป
        // ตอนนี้จะแสดงแค่ข้อความจำลอง
        await new Promise(resolve => setTimeout(resolve, 1000)); // จำลองการรอ

        // หลังจากมี API แล้ว เราจะเรียกใช้และโหลดหน้าใหม่
        // const result = await apiFetch(`/api/policies/acknowledge`, { method: 'POST', body: { rowIndex } });
        // showInfoModal('สำเร็จ', result.message);
        // loadPolicyPage();

        showInfoModal('จำลอง', 'ฟังก์ชัน "รับทราบ" ยังไม่เปิดใช้งาน');

    } catch (error) {
        showError(error);
    } finally {
        hideLoading();
    }
}