// js/pages/committee.js

import { apiFetch } from '../api.js';
import { hideLoading, showError } from '../ui.js';

export async function loadCommitteePage() {
    const container = document.getElementById('committee-page');
    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">คณะกรรมการความปลอดภัย</h2>
        </div>
        <div id="current-committee-container" class="mb-6"><p>กำลังโหลดข้อมูลปัจจุบัน...</p></div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-committee-container" class="space-y-4"><p>กำลังโหลดประวัติ...</p></div>
        </div>
    `;

    try {
        const data = await apiFetch('/api/pagedata/committees');
        renderCommitteeCards(data);
    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลคณะกรรมการได้</div>`;
    } finally {
        hideLoading();
    }
}

function renderCommitteeCards(data) {
    const currentContainer = document.getElementById('current-committee-container');
    const pastContainer = document.getElementById('past-committee-container');
    
    const { current, past } = data;

    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4">ไม่พบคณะกรรมการชุดปัจจุบัน</div>`;
        pastContainer.innerHTML = '';
        return;
    }

    currentContainer.innerHTML = createCommitteeCard(current, true);
    pastContainer.innerHTML = past.length > 0
        ? past.map(c => createCommitteeCard(c, false)).join('')
        : '<div class="card p-4">ไม่มีประวัติ</div>';
}

function createCommitteeCard(committee, isCurrent) {
    if (!committee) return '';

    const termStart = committee.TermStartDate ? new Date(committee.TermStartDate).toLocaleDateString('th-TH') : '?';
    const termEnd = committee.TermEndDate ? new Date(committee.TermEndDate).toLocaleDateString('th-TH') : '?';

    return `
    <div class="card p-5">
        ${isCurrent ? '<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">ชุดปัจจุบัน</div>' : ''}
        <div class="flex justify-between items-start flex-wrap gap-4">
            <div class="flex-grow">
                <span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full bg-blue-200 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">${committee.CommitteeType || 'ทั่วไป'}</span>
                <h3 class="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-2">${committee.CommitteeTitle || 'N/A'}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">วาระ: ${termStart} ถึง ${termEnd}</p>
                <p class="whitespace-pre-wrap mb-4">${committee.Members || ''}</p>
                <div class="flex flex-col sm:flex-row">
                    ${committee.MainOrgChartLink ? `<a href="${committee.MainOrgChartLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary mb-2">ผังองค์กรหลัก</a>` : ''}
                    ${committee.SubOrgChartLink ? `<a href="${committee.SubOrgChartLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary ml-0 sm:ml-2 mb-2">ผังคณะอนุกรรมการ</a>` : ''}
                </div>
            </div>
            </div>
    </div>
    `;
}