// js/pages/committee.js (เวอร์ชันแก้ไขสมบูรณ์)

import { apiFetch } from '../api.js';
import { hideLoading, showError, showToast, openModal, closeModal, showConfirmationModal, showDocumentModal } from '../ui.js';

// --- Global Variables ---
let activeCommitteeDataInModal = null; 
let allCommittees = [];
let committeeEventListenersInitialized = false;

// --- Main Page Flow ---
// js/pages/committee.js

export async function loadCommitteePage() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isAdmin = currentUser?.role === 'Admin';
    const container = document.getElementById('committee-page');
    
    const adminButtonHtml = isAdmin ? `<button id="btn-add-committee" ...>เพิ่มคณะกรรมการชุดใหญ่</button>` : '';

    // --- ▼▼▼ แก้ไข HTML ตรงนี้ เพิ่มโซนแสดงผลใหม่ ▼▼▼ ---
    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 class="text-2xl font-bold">คณะกรรมการความปลอดภัย</h2>
            ${adminButtonHtml}
        </div>

        <div id="main-org-chart-display" class="mb-6"></div>

        <div id="current-committee-container" class="mb-6"></div>
        <div>
            <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
            <div id="past-committee-container" class="space-y-4"></div>
        </div>
    `;

    if (!committeeEventListenersInitialized) {
        setupCommitteeEventListeners();
        committeeEventListenersInitialized = true;
    }

    try {
        const data = await apiFetch('/api/pagedata/committees');
        allCommittees = [data.current, ...data.past].filter(Boolean);
        
        // --- ▼▼▼ เพิ่มการเรียกใช้ฟังก์ชันใหม่ตรงนี้ ▼▼▼ ---
        renderMainOrgChart(data.current); // สั่งให้วาดผังหลัก
        
        renderCommitteeCards(data);
    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</div>`;
    } finally {
        hideLoading();
    }
}

/**
 * ฟังก์ชันสำหรับวาดผังองค์กรหลักของชุดปัจจุบันโดยเฉพาะ
 */
function renderMainOrgChart(currentCommittee) {
    const displayContainer = document.getElementById('main-org-chart-display');
    
    // ถ้าไม่มีชุดปัจจุบัน หรือชุดปัจจุบันไม่มีลิงก์ผังหลัก ก็ไม่ต้องทำอะไร
    if (!displayContainer || !currentCommittee || !currentCommittee.MainOrgChartLink) {
        if (displayContainer) displayContainer.innerHTML = ''; // เคลียร์พื้นที่ว่าง
        return;
    }

    const url = currentCommittee.MainOrgChartLink;
    const title = `ผังองค์กรหลัก: ${currentCommittee.CommitteeTitle || ''}`;

    const isImage = url.includes('cloudinary.com/image/') || url.match(/\.(jpeg|jpg|gif|png|webp|avif)$/i);
    const isPdf = url.toLowerCase().endsWith('.pdf');

    let chartHtml = '';

    // สร้างกรอบที่รักษาสัดส่วน 16:9
    const containerStyle = `position: relative; width: 100%; padding-top: 56.25%; background-color: #f1f5f9; border-radius: 0.5rem; overflow: hidden;`;
    const contentStyle = `position: absolute; top: 0; left: 0; bottom: 0; right: 0; width: 100%; height: 100%; border: 0;`;

    if (isImage) {
        chartHtml = `
            <div class="card p-4">
                <h3 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">${title}</h3>
                <div style="${containerStyle}">
                     <img src="${url}" style="${contentStyle} object-fit: contain;">
                </div>
            </div>`;
    } else if (isPdf) {
         chartHtml = `
            <div class="card p-4">
                <h3 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">${title}</h3>
                <div style="${containerStyle}">
                    <iframe src="${url}" style="${contentStyle}"></iframe>
                </div>
            </div>`;
    } else {
        // Fallback สำหรับไฟล์ประเภทอื่น (เช่น Word)
        const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
        chartHtml = `
            <div class="card p-4">
                 <h3 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">${title}</h3>
                <div style="${containerStyle}">
                    <iframe src="${viewerUrl}" style="${contentStyle}"></iframe>
                </div>
            </div>`;
    }
    
    displayContainer.innerHTML = chartHtml;
}

function renderCommitteeCards(data) {
    const currentContainer = document.getElementById('current-committee-container');
    const pastContainer = document.getElementById('past-committee-container');
    const { current, past } = data;
    if (!current) {
        currentContainer.innerHTML = `<div class="card p-4">ไม่พบคณะกรรมการชุดปัจจุบัน</div>`;
    } else {
        currentContainer.innerHTML = createCommitteeCard(current, true);
    }
    pastContainer.innerHTML = past && past.length > 0 ? past.map(c => createCommitteeCard(c, false)).join('') : `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;
}

// --- Event Handling ---

function setupCommitteeEventListeners() {
    const container = document.getElementById('committee-page');
    if (!container) return;

    container.addEventListener('click', async (event) => {
        const target = event.target;
        const addBtn = target.closest('#btn-add-committee');
        const editBtn = target.closest('.btn-edit-committee');
        const deleteBtn = target.closest('.btn-delete-committee');
        const viewDocBtn = target.closest('[data-action="view-doc"]');
        const viewHistoryBtn = target.closest('.btn-view-history');
        const toggleAccordionBtn = target.closest('.accordion-toggle');
        
        // --- ▼▼▼ ส่วนที่เพิ่ม (1): เพิ่มตัวแปรสำหรับปุ่มใหม่ ▼▼▼ ---
        const setCurrentBtn = target.closest('.btn-set-current');

        if (addBtn) {
            showCommitteeForm();
        } else if (editBtn) {
            const committeeId = editBtn.dataset.id;
            const committeeToEdit = allCommittees.find(c => c.id == committeeId);
            if (committeeToEdit) showCommitteeForm(committeeToEdit);
        } else if (deleteBtn) {
            const committeeId = deleteBtn.dataset.id;
            const committeeTitle = allCommittees.find(c => c.id == committeeId)?.CommitteeTitle || 'รายการนี้';
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `คุณต้องการลบข้อมูลคณะกรรมการ "${committeeTitle}" ใช่หรือไม่?`);
            if (confirmed) {
                const cardToRemove = document.getElementById(`committee-card-${committeeId}`);
                if (cardToRemove) {
                    cardToRemove.style.transition = 'opacity 0.5s';
                    cardToRemove.style.opacity = '0';
                    setTimeout(() => cardToRemove.remove(), 500);
                }
                try {
                    await apiFetch(`/api/committees/${committeeId}`, { method: 'DELETE' });
                    showToast('ลบข้อมูลสำเร็จ');
                } catch (error) {
                    loadCommitteePage(); 
                }
            }
        } else if (viewDocBtn) {
            event.preventDefault();
            const url = viewDocBtn.href;
            const title = viewDocBtn.dataset.title || 'เอกสาร';
            showDocumentModal(url, title);
        } else if (viewHistoryBtn) {
            const committeeId = viewHistoryBtn.dataset.committeeId;
            const department = viewHistoryBtn.dataset.department;
            const committee = allCommittees.find(c => c.id == committeeId);
            const subCommittee = committee?.SubCommitteeData.find(sc => sc.department === department);
            if (subCommittee) showHistoryModal(subCommittee);
        } else if (toggleAccordionBtn) {
            const content = toggleAccordionBtn.nextElementSibling;
            const icon = toggleAccordionBtn.querySelector('svg');
            content.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        } 
        // --- ▼▼▼ ส่วนที่เพิ่ม (2): เพิ่ม else if สำหรับจัดการปุ่มใหม่ ▼▼▼ ---
        else if (setCurrentBtn) {
            const committeeId = setCurrentBtn.dataset.id;
            const committeeTitle = allCommittees.find(c => c.id == committeeId)?.CommitteeTitle || 'รายการนี้';
            const confirmed = await showConfirmationModal(
                'ยืนยันการตั้งเป็นชุดปัจจุบัน',
                `การกระทำนี้จะทำให้ "${committeeTitle}" กลายเป็นคณะกรรมการชุดปัจจุบัน และย้ายชุดเดิมไปอยู่ในประวัติ ต้องการดำเนินการต่อหรือไม่?`
            );
            if (confirmed) {
                handleSetCurrentCommittee(committeeId);
            }
        }
    });
}

function createCommitteeCard(committee, isCurrent) {
    if (!committee) return '';

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isAdmin = currentUser?.role === 'Admin';

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    };
    
    // --- ▼▼▼ นี่คือ Logic ใหม่ทั้งหมดสำหรับ Sub-committee Card Grid ▼▼▼ ---
    const subCommitteesHtml = (committee.SubCommitteeData && committee.SubCommitteeData.length > 0)
        ? `<div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${committee.SubCommitteeData.map(sc => {
                const latestVersion = sc.versions.length > 0 
                    ? sc.versions.sort((a, b) => b.version - a.version)[0] 
                    : null;
                
                const statusDotColor = sc.activeLink ? 'bg-green-500' : 'bg-slate-400';
                const lastUpdatedText = latestVersion ? formatDate(latestVersion.effectiveDate) : 'ยังไม่มีข้อมูล';
                const versionText = latestVersion ? `v.${latestVersion.version}` : '-';

                return `
                <div class="card flex flex-col">
                    <div class="p-4 border-b dark:border-slate-700 flex items-center gap-3">
                        <span class="h-3 w-3 rounded-full ${statusDotColor}"></span>
                        <h5 class="font-semibold text-slate-800 dark:text-slate-200 flex-grow">${sc.department}</h5>
                    </div>
                    <div class="p-4 flex-grow space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-slate-500 dark:text-slate-400">อัปเดตล่าสุด:</span>
                            <span class="font-medium">${lastUpdatedText}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-500 dark:text-slate-400">เวอร์ชันปัจจุบัน:</span>
                            <span class="font-medium">${versionText}</span>
                        </div>
                    </div>
                    <div class="p-4 border-t dark:border-slate-700 flex justify-end items-center gap-2">
                        <button data-committee-id="${committee.id}" data-department="${sc.department}" class="btn btn-secondary btn-sm btn-view-history" ${sc.versions.length === 0 ? 'disabled' : ''}>ดูประวัติ</button>
                        ${sc.activeLink ? `<a href="${sc.activeLink}" data-action="view-doc" data-title="ผังปัจจุบัน: ${sc.department}" class="btn btn-primary btn-sm">ดูผังปัจจุบัน</a>` : `<button class="btn btn-secondary btn-sm" disabled>ไม่มีผัง</button>`}
                    </div>
                </div>`;
            }).join('')}
           </div>`
        : '<p class="text-sm text-slate-500 p-4">ไม่มีข้อมูล Sub-committee</p>';
    // --- ▲▲▲ สิ้นสุด Logic ใหม่ ▲▲▲ ---
    
    let adminButtons = '';
    if (isAdmin) {
        const setCurrentButton = !isCurrent ? `<button data-id="${committee.id}" class="btn btn-secondary btn-sm btn-set-current">⭐ ตั้งเป็นชุดปัจจุบัน</button>` : '';
        adminButtons = `
            <div class="mt-4 pt-4 border-t dark:border-slate-700 flex items-center gap-3">
                <button data-id="${committee.id}" class="btn btn-secondary btn-sm btn-edit-committee">แก้ไข</button>
                <button data-id="${committee.id}" class="btn btn-danger btn-sm btn-delete-committee">ลบ</button>
                ${setCurrentButton}
            </div>`;
    }

    return `
    <div class="card overflow-hidden" id="committee-card-${committee.id}">
        <div class="p-5">
            <div class="flex justify-between items-start mb-2">
                <div>
                    ${isCurrent ? `<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400">ชุดปัจจุบัน</div>` : ''}
                </div>
            </div>
            <h3 class="text-lg font-semibold text-blue-600 dark:text-blue-400">${committee.CommitteeTitle || 'N/A'}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">วาระ: ${formatDate(committee.TermStartDate)} - ${formatDate(committee.TermEndDate)}</p>
            <div class="mt-4">
                ${committee.MainOrgChartLink ? `<a href="${committee.MainOrgChartLink}" data-action="view-doc" data-title="ผังองค์กรหลัก" class="btn btn-secondary">ผังองค์กรหลัก</a>` : ''}
            </div>
            ${adminButtons} 
        </div>
        <div class="bg-slate-100 dark:bg-slate-800">
            <h4 class="p-4 text-sm font-semibold border-b dark:border-slate-700">Sub-committees</h4>
            ${subCommitteesHtml}
        </div>
    </div>`;
}

async function handleSetCurrentCommittee(committeeId) {
    showLoading('กำลังอัปเดตสถานะ...');
    try {
        await apiFetch(`/api/committees/${committeeId}`, {
            method: 'PUT',
            body: { IsCurrent: 1 }
        });
        await loadCommitteePage(); // โหลดหน้าใหม่ทั้งหมดเพื่อแสดงผลที่ถูกต้อง
        showToast('อัปเดตสถานะเป็นชุดปัจจุบันสำเร็จ');
    } catch (error) {
        // showError ถูกเรียกจาก apiFetch แล้ว
    } finally {
        hideLoading();
    }
}

function showHistoryModal(subCommittee) {
    const historyHtml = subCommittee.versions.sort((a, b) => b.version - a.version).map(v => `
        <li class="flex justify-between items-center py-2 border-b dark:border-slate-700 last:border-b-0">
            <span class="text-sm">เวอร์ชัน ${v.version} (มีผล ${new Date(v.effectiveDate).toLocaleDateString('th-TH')})</span>
            <a href="${v.link}" data-action="view-doc" data-title="ประวัติ: ${subCommittee.department} v.${v.version}" class="btn btn-secondary btn-sm">ดูเอกสาร</a>
        </li>`).join('');
    openModal(`ประวัติ: ${subCommittee.department}`, `<ul class="space-y-2">${historyHtml}</ul>`);
}

function createCommitteeFormHtml(committeeData, termStart, termEnd) {
    const isEditing = committeeData.id != null;
    let subCommitteesHtml = (committeeData.SubCommitteeData || []).map(sc => `
        <div class="flex items-center justify-between p-3 rounded-lg border dark:border-slate-600" data-dept-row="${sc.department}">
            <span class="font-medium">${sc.department}</span>
            <div class="space-x-2">
                ${sc.activeLink ? `<a href="${sc.activeLink}" target="_blank" class="text-blue-500 text-sm hover:underline">ดูไฟล์</a>` : '<span class="text-sm text-slate-400">ไม่มีไฟล์</span>'}
                <button type="button" data-department="${sc.department}" class="btn btn-secondary btn-sm btn-update-sub">อัปเดตผัง</button>
                <button type="button" data-department="${sc.department}" class="btn btn-danger btn-sm btn-delete-sub">ลบ</button>
            </div>
        </div>`).join('');

    return `
      <form id="committee-form" novalidate>
        <div class="p-6 space-y-6">
            <input type="hidden" name="id" value="${committeeData.id || ''}">
            <div class="form-group"><input type="text" id="CommitteeTitle" name="CommitteeTitle" class="form-field w-full rounded-lg p-3" value="${committeeData.CommitteeTitle || ''}" required placeholder=" "><label for="CommitteeTitle" class="form-label-floating">ชื่อคณะกรรมการชุดใหญ่ *</label></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="form-group"><input type="text" id="TermStartDate" name="TermStartDate" class="form-field w-full rounded-lg p-3" value="${termStart}" required placeholder=" "><label for="TermStartDate" class="form-label-floating">วันเริ่มวาระ *</label></div>
                <div class="form-group"><input type="text" id="TermEndDate" name="TermEndDate" class="form-field w-full rounded-lg p-3" value="${termEnd}" required placeholder=" "><label for="TermEndDate" class="form-label-floating">วันสิ้นสุดวาระ *</label></div>
            </div>
            <div class="form-group"><label class="form-label block mb-1 text-sm">ผังองค์กรหลัก</label><div id="file-upload-area-main"></div><input type="hidden" id="MainOrgChartLink" name="MainOrgChartLink" value="${committeeData.MainOrgChartLink || ''}"></div>
            <div class="rounded-lg border dark:border-slate-700 p-4 flex items-center justify-between"><span class="text-slate-800 dark:text-slate-200 font-medium">ตั้งเป็นชุดปัจจุบัน</span><label for="IsCurrent" class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="IsCurrent" name="IsCurrent" class="sr-only peer" ${committeeData.IsCurrent ? 'checked' : ''}><div class="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-500 peer-checked:bg-blue-600"></div></label></div>
            <div>
                <h4 class="text-lg font-semibold mb-3 border-b dark:border-slate-600 pb-2">จัดการ Sub-committees</h4>
                <div id="sub-committee-list" class="space-y-3">${subCommitteesHtml}</div>
                <div class="flex items-center gap-2 mt-4"><input type="text" id="new-dept-name" class="form-input" placeholder="ชื่อหน่วยงานใหม่..."><button type="button" id="btn-add-dept" class="btn btn-secondary">เพิ่มหน่วยงาน</button></div>
            </div>
        </div>
        <div class="flex justify-end items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border-t dark:border-slate-700 rounded-b-xl"><button type="button" id="btn-cancel-modal" class="btn btn-secondary">ยกเลิก</button><button type="submit" id="btn-submit-committee" class="btn btn-primary"><span>${isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างข้อมูล'}</span><div class="loader hidden animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div></button></div>
      </form>`;
}

function initializeFormLogic() {
    flatpickr("#TermStartDate", { altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d", locale: "th" });
    flatpickr("#TermEndDate", { altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d", locale: "th" });
    updateFileUploadUI('main', activeCommitteeDataInModal.MainOrgChartLink || '');
    const form = document.getElementById('committee-form');
    form.addEventListener('submit', handleCommitteeFormSubmit);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-add-dept').addEventListener('click', handleAddDepartment);
    document.getElementById('sub-committee-list').addEventListener('click', (event) => {
        if (event.target.closest('.btn-update-sub')) {
            handleUpdateSubCommittee(event.target.closest('.btn-update-sub').dataset.department);
        } else if (event.target.closest('.btn-delete-sub')) {
            handleDeleteDepartment(event.target.closest('.btn-delete-sub').dataset.department);
        }
    });
}

function showCommitteeForm(committee = null) {
    activeCommitteeDataInModal = JSON.parse(JSON.stringify(committee || { CommitteeTitle: '', TermStartDate: '', TermEndDate: '', MainOrgChartLink: '', IsCurrent: false, SubCommitteeData: [] }));
    const isEditing = committee !== null;
    const title = isEditing ? 'แก้ไขข้อมูลคณะกรรมการ' : 'เพิ่มข้อมูลคณะกรรมการ';
    const termStart = committee?.TermStartDate ? new Date(committee.TermStartDate).toISOString().split('T')[0] : '';
    const termEnd = committee?.TermEndDate ? new Date(committee.TermEndDate).toISOString().split('T')[0] : '';
    const formHtml = createCommitteeFormHtml(activeCommitteeDataInModal, termStart, termEnd);
    openModal(title, formHtml, 'max-w-3xl no-padding');
    initializeFormLogic();
}

// --- Form & Upload & Sub-committee Logic ---
function getCurrentFormState() {
    const form = document.getElementById('committee-form');
    if (!form) return activeCommitteeDataInModal;
    activeCommitteeDataInModal.CommitteeTitle = form.CommitteeTitle.value;
    activeCommitteeDataInModal.TermStartDate = form.TermStartDate.value;
    activeCommitteeDataInModal.TermEndDate = form.TermEndDate.value;
    activeCommitteeDataInModal.MainOrgChartLink = form.MainOrgChartLink.value;
    activeCommitteeDataInModal.IsCurrent = form.IsCurrent.checked;
    return activeCommitteeDataInModal;
}

async function handleCommitteeFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.CommitteeTitle.value || !form.TermStartDate.value || !form.TermEndDate.value) {
        return showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
    }
    const submitBtn = document.getElementById('btn-submit-committee');
    const btnText = submitBtn.querySelector('span');
    const btnLoader = submitBtn.querySelector('.loader');
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    const data = getCurrentFormState();
    const method = data.id ? 'PUT' : 'POST';
    const endpoint = data.id ? `/api/committees/${data.id}` : '/api/committees';
    try {
        const result = await apiFetch(endpoint, { method: method, body: data });
        closeModal();
        await loadCommitteePage();
        showToast(result.message);
    } catch (error) {
        // Error shown from apiFetch
    } finally {
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

// --- Sub-committee specific functions ---
function handleAddDepartment() {
    const currentState = getCurrentFormState();
    const input = document.getElementById('new-dept-name');
    const deptName = input.value.trim();
    if (!deptName) return showToast('กรุณาใส่ชื่อหน่วยงาน', 'error');
    if (currentState.SubCommitteeData.find(sc => sc.department === deptName)) {
        return showToast('มีหน่วยงานนี้อยู่แล้ว', 'error');
    }
    currentState.SubCommitteeData.push({ department: deptName, activeLink: '', versions: [] });
    showCommitteeForm(currentState);
}

function handleDeleteDepartment(department) {
    if (confirm(`คุณต้องการลบหน่วยงาน "${department}" และประวัติทั้งหมดใช่หรือไม่?`)) {
        const currentState = getCurrentFormState();
        currentState.SubCommitteeData = currentState.SubCommitteeData.filter(sc => sc.department !== department);
        showCommitteeForm(currentState);
    }
}

// js/pages/committee.js

// --- ▼▼▼ แทนที่ฟังก์ชันนี้ทั้งหมด ▼▼▼ ---
async function handleUpdateSubCommittee(department) {
    // 1. สร้าง HTML สำหรับฟอร์มใน Modal
    const formHtml = `
        <div class="space-y-4">
            <p class="text-sm text-slate-500">เลือกไฟล์ผังโครงสร้างใหม่สำหรับหน่วยงาน "${department}" และกำหนดวันที่เริ่มใช้งาน</p>
            <div class="form-group">
                <label class="form-label block mb-1 text-sm">ไฟล์เอกสาร (PDF, รูปภาพ)</label>
                <input type="file" id="sub-committee-file-input" class="form-input text-sm" accept=".pdf,.jpg,.jpeg,.png">
            </div>
            <div class="form-group">
                <label for="sub-committee-date-input" class="form-label block mb-1 text-sm">วันที่มีผลบังคับใช้</label>
                <input type="text" id="sub-committee-date-input" class="form-field w-full rounded-lg p-3" placeholder="กรุณาเลือกวันที่...">
            </div>
            <div id="sub-upload-progress" class="hidden mt-2 text-sm text-slate-500">
                <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 inline-block mr-2"></div>
                กำลังอัปโหลด...
            </div>
        </div>
        <div class="flex justify-end items-center gap-3 pt-4 mt-4 border-t dark:border-slate-700">
            <button type="button" class="btn btn-secondary" id="btn-cancel-sub-modal">ยกเลิก</button>
            <button type="button" class="btn btn-primary" id="btn-confirm-sub-upload">บันทึก</button>
        </div>
    `;

    // 2. เปิด Modal ขึ้นมา
    openModal(`อัปเดตผัง: ${department}`, formHtml, 'max-w-xl');

    // 3. ทำให้ Date Picker ทำงาน
    const datePicker = flatpickr("#sub-committee-date-input", {
        altInput: true,
        altFormat: "j F Y",
        dateFormat: "Y-m-d",
        locale: "th",
        defaultDate: "today" // ตั้งค่าเริ่มต้นเป็นวันนี้
    });

    // 4. จัดการ Logic เมื่อกดปุ่ม "บันทึก"
    document.getElementById('btn-confirm-sub-upload').addEventListener('click', async () => {
        const fileInput = document.getElementById('sub-committee-file-input');
        const dateInput = document.getElementById('sub-committee-date-input');
        const progressEl = document.getElementById('sub-upload-progress');
        const file = fileInput.files[0];

        if (!file) {
            return showToast('กรุณาเลือกไฟล์ก่อน', 'error');
        }
        if (!dateInput.value) {
            return showToast('กรุณาเลือกวันที่มีผลบังคับใช้', 'error');
        }

        progressEl.classList.remove('hidden');
        
        const newUrl = await uploadFile(file); // ใช้ฟังก์ชัน uploadFile ที่เรามีอยู่แล้ว
        
        if (newUrl) { 
            const currentState = getCurrentFormState();
            const subCommittee = currentState.SubCommitteeData.find(sc => sc.department === department);
            if (subCommittee) {
                subCommittee.activeLink = newUrl;
                subCommittee.versions.push({
                    version: subCommittee.versions.length + 1,
                    link: newUrl,
                    effectiveDate: datePicker.selectedDates[0].toISOString() // ใช้ค่าวันที่จาก Date Picker
                });
                showToast('อัปเดตผังสำเร็จ พร้อมบันทึก', 'success');
                closeModal();
                showCommitteeForm(currentState); // วาดฟอร์มหลักใหม่เพื่อแสดงข้อมูลที่อัปเดต
            }
        } else {
            // กรณีอัปโหลดล้มเหลว (showError จะถูกเรียกจาก uploadFile แล้ว)
            progressEl.classList.add('hidden');
        }
    });

    document.getElementById('btn-cancel-sub-modal').addEventListener('click', closeModal);
}

// --- Generic Upload Helper Functions ---
function openFileUpload() {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ".pdf,.jpg,.jpeg,.png";
        input.onchange = () => resolve(input.files[0] || null);
        input.click();
    });
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('document', file);
    try {
        const result = await apiFetch('/api/upload/document', { method: 'POST', body: formData });
        return result.url;
    } catch (error) {
        return null;
    }
}

function updateFileUploadUI(type, fileUrl) {
    const container = document.getElementById(`file-upload-area-${type}`);
    const hiddenInput = document.getElementById(type === 'main' ? 'MainOrgChartLink' : 'SubOrgChartLink');
    if (!container || !hiddenInput) return;

    if (fileUrl) {
        container.innerHTML = `<div class="flex items-center justify-between p-3 border rounded-lg bg-slate-50 dark:bg-slate-700 dark:border-slate-600"><a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline truncate text-sm">ดูไฟล์ปัจจุบัน</a><button type="button" data-type="${type}" class="btn btn-secondary btn-sm btn-remove-file">เปลี่ยนไฟล์</button></div>`;
        container.querySelector('.btn-remove-file').addEventListener('click', () => {
            hiddenInput.value = '';
            updateFileUploadUI(type, null);
        });
    } else {
        container.innerHTML = `<input type="file" data-type="${type}" class="form-input text-sm file-input" accept=".pdf,.jpg,.jpeg,.png">`;
        container.querySelector('.file-input').addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if(!file) return;
            showToast('กำลังอัปโหลดผังหลัก...');
            const newUrl = await uploadFile(file);
if(newUrl) {
                hiddenInput.value = newUrl;
                updateFileUploadUI(type, newUrl);
                showToast('อัปโหลดสำเร็จ!');
            }
        });
    }
}