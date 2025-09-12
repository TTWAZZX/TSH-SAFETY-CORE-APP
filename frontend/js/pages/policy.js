// js/pages/policy.js

import { apiFetch } from '../api.js';
import { hideLoading, showError, showLoading, showInfoModal, showDocumentModal } from '../ui.js';

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
        console.log('[Policy Debug] 1. กำลังเรียก API...');
        const data = await apiFetch('/api/pagedata/policies');
        console.log('[Policy Debug] 2. ได้รับข้อมูลจาก API:', data);

        renderPolicyCards(data);

    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลนโยบายได้</div>`;
    } finally {
        hideLoading();
    }
}

function renderPolicyCards(data) {
    const container = document.getElementById('policy-page'); // <-- เพิ่มบรรทัดนี้
    const currentContainer = document.getElementById('current-policy-container');
    const pastContainer = document.getElementById('past-policy-container');
    
    const { current, past } = data;

    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4">ไม่พบนโยบายปัจจุบัน</div>`;
        pastContainer.innerHTML = `<div class="card p-4">ไม่มีประวัติ</div>`;
        return;
    }

    const currentCardHtml = createPolicyCard(current, true);
    const pastCardsHtml = past && past.length > 0
        ? past.map(p => createPolicyCard(p, false)).join('')
        : `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;

    currentContainer.innerHTML = currentCardHtml;
    pastContainer.innerHTML = pastCardsHtml;
    
    // --- บรรทัดแก้ไขปัญหา ---
    // เทคนิคนี้เป็นการบังคับให้ Browser วาดหน้าจอใหม่ทั้งหมด
    container.style.display = 'none';
    container.offsetHeight; // คำสั่งนี้จะบังคับให้ browser คำนวณ layout ใหม่
    container.style.display = 'block';
}

function createPolicyCard(policy, isCurrent) {
    // ฟังก์ชันนี้เหมือนเดิม ไม่ต้องแก้ไข
    if (!policy) return '';
    let ackList = [];
    try { if (policy.AcknowledgedBy) ackList = JSON.parse(policy.AcknowledgedBy); } catch (e) {}
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isAcknowledged = currentUser?.name ? ackList.includes(currentUser.name) : false;
    const effectiveDate = policy.EffectiveDate ? new Date(policy.EffectiveDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
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
                    ${isAcknowledged ? `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">รับทราบแล้ว</span>` : `<button data-row-index="${policy.rowIndex}" class="btn btn-primary btn-acknowledge-policy">รับทราบ</button>`}
                </div>
            </div>
        </div>
    </div>`;
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