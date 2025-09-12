// js/pages/policy.js

import { apiFetch } from '../api.js';
import { hideLoading, showError, showLoading, showInfoModal, showDocumentModal } from '../ui.js'; // <-- แก้ไขแล้ว

export async function loadPolicyPage() {
    const container = document.getElementById('policy-page');
    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">นโยบายความปลอดภัย</h2>
        </div>
        <div id="current-policy-container" class="mb-6"><p class="card p-4">กำลังโหลดนโยบายปัจจุบัน...</p></div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-policy-container" class="space-y-4"><p class="card p-4">กำลังโหลดประวัติ...</p></div>
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

function renderPolicyCards(data) {
    const currentContainer = document.getElementById('current-policy-container');
    const pastContainer = document.getElementById('past-policy-container');
    const { current, past } = data;

    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4">ไม่พบนโยบายปัจจุบัน</div>`;
        pastContainer.innerHTML = `<div class="card p-4">ไม่มีประวัติ</div>`;
        return;
    }

    currentContainer.innerHTML = createPolicyCard(current, true);
    pastContainer.innerHTML = past && past.length > 0
        ? past.map(p => createPolicyCard(p, false)).join('')
        : `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;
    
    // เพิ่ม Event Listener ให้กับปุ่มทั้งหมดที่ถูกสร้างขึ้นมาใหม่
    document.querySelectorAll('.btn-acknowledge-policy').forEach(button => {
        button.addEventListener('click', handleAcknowledge);
    });
    document.querySelectorAll('.btn-open-doc').forEach(button => {
        button.addEventListener('click', (event) => {
            showDocumentModal(event.currentTarget.dataset.docUrl);
        });
    });
}

function createPolicyCard(policy, isCurrent) {
    if (!policy) return '';

    let ackList = [];
    try { if (policy.AcknowledgedBy) ackList = JSON.parse(policy.AcknowledgedBy); } catch (e) {}
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isAcknowledged = currentUser?.name ? ackList.includes(currentUser.name) : false;
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

async function handleAcknowledge(event) {
    const button = event.currentTarget;
    const rowIndex = button.dataset.rowIndex;
    
    button.disabled = true;
    showLoading('กำลังบันทึกการรับทราบ...');

    try {
        const result = await apiFetch(`/api/policies/${rowIndex}/acknowledge`, { 
            method: 'POST' 
        });

        showInfoModal('ผลการดำเนินการ', result.message);
        
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