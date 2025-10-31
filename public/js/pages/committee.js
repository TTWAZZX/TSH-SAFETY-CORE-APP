// public/js/pages/committee.js
// เวอร์ชันเข้ากับ backend ปัจจุบัน (pagedata/committees => { success, items })

import { apiFetch } from '../api.js';
import {
  showLoading, hideLoading, showError, showToast,
  openModal, closeModal, showConfirmationModal, showDocumentModal
} from '../ui.js';

// --- Utils ---
function parseSubData(maybeJson) {
  if (Array.isArray(maybeJson)) return maybeJson;
  if (typeof maybeJson === 'string') {
    try { return JSON.parse(maybeJson); } catch { return []; }
  }
  return [];
}
function normalizeCommittee(raw) {
  const c = { ...raw };
  c.SubCommitteeData = parseSubData(raw.SubCommitteeData);
  return c;
}

// --- Global Variables ---
let activeCommitteeDataInModal = null;
let allCommittees = [];
let committeeEventListenersInitialized = false;

// --- Main Page Flow ---
export async function loadCommitteePage() {
  const container = document.getElementById('committee-page');
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  const isAdmin = currentUser?.role === 'Admin';

  const adminButtonHtml = isAdmin ? `
    <button id="btn-add-committee" class="btn btn-primary">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
      </svg>
      เพิ่มคณะกรรมการชุดใหญ่
    </button>` : '';

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
      <h2 class="text-2xl font-bold">คณะกรรมการความปลอดภัย</h2>
      ${adminButtonHtml}
    </div>
    <div id="current-committee-container" class="mb-6">
      <div class="card p-4">กำลังโหลดข้อมูลปัจจุบัน...</div>
    </div>
    <div>
      <h3 class="text-lg font-semibold mb-3 border-b dark:border-slate-700 pb-2">ประวัติ</h3>
      <div id="past-committee-container" class="space-y-4">
        <div class="card p-4">กำลังโหลดประวัติ...</div>
      </div>
    </div>
  `;

  if (!committeeEventListenersInitialized) {
    setupCommitteeEventListeners();
    committeeEventListenersInitialized = true;
  }

  showLoading('กำลังโหลดข้อมูลคณะกรรมการ...');
  try {
    // ใช้ path แบบไม่ใส่ /api นำหน้า แล้วให้ apiFetch เติมให้เอง
    const data = await apiFetch('/pagedata/committees'); // => { success, items }
    const items = (data?.items || []).map(normalizeCommittee);

    if (!items.length) {
      document.getElementById('current-committee-container').innerHTML =
        `<div class="card p-4">ไม่พบคณะกรรมการชุดปัจจุบัน</div>`;
      document.getElementById('past-committee-container').innerHTML =
        `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;
      return;
    }

    const current = items.find(x => Number(x.IsCurrent) === 1) || items[0] || null;
    const past = items.filter(x => current ? x.id !== current.id : true);

    allCommittees = [current, ...past].filter(Boolean);
    renderCommitteeCards({ current, past });
  } catch (error) {
    showError(error);
    container.innerHTML = `<div class="card p-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</div>`;
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
  } else {
    currentContainer.innerHTML = createCommitteeCard(current, true);
  }

  pastContainer.innerHTML = past && past.length > 0
    ? past.map(c => createCommitteeCard(c, false)).join('')
    : `<div class="card p-4 text-center text-slate-500">ไม่มีประวัติ</div>`;
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
    const setCurrentBtn = target.closest('.btn-set-current');

    if (addBtn) {
      showCommitteeForm();
    } else if (editBtn) {
      const committeeId = editBtn.dataset.id;
      const committeeToEdit = allCommittees.find(c => String(c.id) === String(committeeId));
      if (committeeToEdit) showCommitteeForm(committeeToEdit);
    } else if (deleteBtn) {
      const committeeId = deleteBtn.dataset.id;
      const committeeTitle = allCommittees.find(c => String(c.id) === String(committeeId))?.CommitteeTitle || 'รายการนี้';
      const confirmed = await showConfirmationModal('ยืนยันการลบ', `คุณต้องการลบข้อมูลคณะกรรมการ "${committeeTitle}" ใช่หรือไม่?`);
      if (confirmed) {
        const cardToRemove = document.getElementById(`committee-card-${committeeId}`);
        if (cardToRemove) {
          cardToRemove.style.transition = 'opacity 0.5s';
          cardToRemove.style.opacity = '0';
          setTimeout(() => cardToRemove.remove(), 500);
        }
        try {
          await apiFetch(`/committees/${committeeId}`, { method: 'DELETE' });
          showToast('ลบข้อมูลสำเร็จ');
        } catch (error) {
          loadCommitteePage();
        }
      }
    } else if (viewDocBtn) {
      event.preventDefault();
      showDocumentModal(viewDocBtn.href, viewDocBtn.dataset.title || 'เอกสาร');
    } else if (viewHistoryBtn) {
      const committeeId = viewHistoryBtn.dataset.committeeId;
      const department = viewHistoryBtn.dataset.department;
      const committee = allCommittees.find(c => String(c.id) === String(committeeId));
      const subCommittee = committee?.SubCommitteeData?.find(sc => sc.department === department);
      if (subCommittee) showHistoryModal(subCommittee);
    } else if (toggleAccordionBtn) {
      const content = toggleAccordionBtn.nextElementSibling;
      const icon = toggleAccordionBtn.querySelector('svg');
      content.classList.toggle('hidden');
      icon?.classList.toggle('rotate-180');
    } else if (setCurrentBtn) {
      const committeeId = setCurrentBtn.dataset.id;
      const committeeTitle = allCommittees.find(c => String(c.id) === String(committeeId))?.CommitteeTitle || 'รายการนี้';
      const confirmed = await showConfirmationModal('ยืนยันการตั้งเป็นชุดปัจจุบัน', `การกระทำนี้จะทำให้ "${committeeTitle}" กลายเป็นคณะกรรมการชุดปัจจุบัน ต้องการดำเนินการต่อหรือไม่?`);
      if (confirmed) handleSetCurrentCommittee(committeeId);
    }
  });
}

async function handleSetCurrentCommittee(committeeId) {
  showLoading('กำลังอัปเดตสถานะ...');
  try {
    await apiFetch(`/committees/${committeeId}`, { method: 'PUT', body: { IsCurrent: 1 } });
    await loadCommitteePage();
    showToast('อัปเดตสถานะเป็นชุดปัจจุบันสำเร็จ');
  } catch (error) {
    // แสดง error ผ่าน apiFetch แล้ว
  } finally { hideLoading(); }
}

// --- UI Components & Forms ---
function createCommitteeCard(committee, isCurrent) {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  const isAdmin = currentUser?.role === 'Admin';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

  const subList = Array.isArray(committee.SubCommitteeData) ? committee.SubCommitteeData : [];
  const subCommitteesHtml = subList.length > 0
    ? `<div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${
        subList.map(sc => {
          const versions = Array.isArray(sc.versions) ? sc.versions.slice().sort((a,b)=> (b.version||0)-(a.version||0)) : [];
          const latest = versions[0] || null;
          const statusDotColor = sc.activeLink ? 'bg-green-500' : 'bg-slate-400';
          const lastUpdatedText = latest?.effectiveDate ? formatDate(latest.effectiveDate) : 'ยังไม่มีข้อมูล';
          const versionText = latest?.version ? `v.${latest.version}` : '-';
          return `
            <div class="card flex flex-col">
              <div class="p-4 border-b dark:border-slate-700 flex items-center gap-3">
                <span class="h-3 w-3 rounded-full ${statusDotColor}"></span>
                <h5 class="font-semibold text-slate-800 dark:text-slate-200 flex-grow">${sc.department || '-'}</h5>
              </div>
              <div class="p-4 flex-grow space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">อัปเดตล่าสุด:</span><span class="font-medium">${lastUpdatedText}</span></div>
                <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">เวอร์ชันปัจจุบัน:</span><span class="font-medium">${versionText}</span></div>
              </div>
              <div class="p-4 border-t dark:border-slate-700 flex justify-end items-center gap-2">
                <button data-committee-id="${committee.id}" data-department="${sc.department}" class="btn btn-secondary btn-sm btn-view-history" ${versions.length === 0 ? 'disabled' : ''}>ดูประวัติ</button>
                ${sc.activeLink ? `<a href="${sc.activeLink}" data-action="view-doc" data-title="ผังปัจจุบัน: ${sc.department}" class="btn btn-primary btn-sm">ดูผังปัจจุบัน</a>` : `<button class="btn btn-secondary btn-sm" disabled>ไม่มีผัง</button>`}
              </div>
            </div>`;
        }).join('')
      }</div>`
    : '<p class="text-sm text-slate-500 p-4">ไม่มีข้อมูล Sub-committee</p>';

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
        <div>${isCurrent ? `<div class="text-xs font-bold uppercase text-green-600 dark:text-green-400">ชุดปัจจุบัน</div>` : ''}</div>
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

function showHistoryModal(subCommittee) {
  const versions = (Array.isArray(subCommittee.versions) ? subCommittee.versions : []).slice().sort((a,b)=> (b.version||0)-(a.version||0));
  const historyHtml = versions.map(v => `
    <li class="flex justify-between items-center py-2 border-b dark:border-slate-700 last:border-b-0">
      <span class="text-sm">เวอร์ชัน ${v.version || '-'} (มีผล ${v.effectiveDate ? new Date(v.effectiveDate).toLocaleDateString('th-TH') : '-'})</span>
      <a href="${v.link}" data-action="view-doc" data-title="ประวัติ: ${subCommittee.department} v.${v.version || '-'}" class="btn btn-secondary btn-sm">ดูเอกสาร</a>
    </li>`).join('');
  openModal(`ประวัติ: ${subCommittee.department}`, `<ul class="space-y-2">${historyHtml || '<li class="p-2 text-slate-500">ไม่มีประวัติ</li>'}</ul>`);
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
            <div class="rounded-lg border dark:border-slate-700 p-4 flex items-center justify-between"><span class="text-slate-800 dark:text-slate-200 font-medium">ตั้งเป็นชุดปัจจุบัน</span><label for="IsCurrent" class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="IsCurrent" name="IsCurrent" class="sr-only peer" ${committeeData.IsCurrent ? 'checked' : ''}><div class="w-11 h-6 bg-slate-200 ..."></div></label></div>
            <div>
                <h4 class="text-lg font-semibold mb-3 border-b dark:border-slate-600 pb-2">จัดการ Sub-committees</h4>
                <div id="sub-committee-list" class="space-y-3">${subCommitteesHtml}</div>
                <div class="flex items-center gap-2 mt-4"><input type="text" id="new-dept-name" class="form-input" placeholder="ชื่อหน่วยงานใหม่..."><button type="button" id="btn-add-dept" class="btn btn-secondary">เพิ่มหน่วยงาน</button></div>
            </div>
        </div>
        <div class="flex justify-end ..."><button type="button" id="btn-cancel-modal" class="btn btn-secondary">ยกเลิก</button><button type="submit" id="btn-submit-committee" class="btn btn-primary"><span>${isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างข้อมูล'}</span><div class="loader hidden ..."></div></button></div>
      </form>`;
}

function initializeFormLogic(committee) {
    flatpickr("#TermStartDate", { altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d", locale: "th" });
    flatpickr("#TermEndDate", { altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d", locale: "th" });
    updateFileUploadUI('main', committee?.MainOrgChartLink || '');
    const form = document.getElementById('committee-form');
    form.addEventListener('submit', handleCommitteeFormSubmit);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-add-dept').addEventListener('click', handleAddDepartment);
    document.getElementById('sub-committee-list').addEventListener('click', (event) => {
        if (event.target.closest('.btn-update-sub')) handleUpdateSubCommittee(event.target.closest('.btn-update-sub').dataset.department);
        else if (event.target.closest('.btn-delete-sub')) handleDeleteDepartment(event.target.closest('.btn-delete-sub').dataset.department);
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
    initializeFormLogic(activeCommitteeDataInModal);
}

// --- Form & Upload & Sub-committee Logic ---
function getCurrentFormState() {
    const form = document.getElementById('committee-form');
    if (!form) return activeCommitteeDataInModal;
    const currentState = JSON.parse(JSON.stringify(activeCommitteeDataInModal));
    currentState.CommitteeTitle = form.CommitteeTitle.value;
    currentState.TermStartDate = form.TermStartDate.value;
    currentState.TermEndDate = form.TermEndDate.value;
    currentState.MainOrgChartLink = form.MainOrgChartLink.value;
    currentState.IsCurrent = form.IsCurrent.checked;
    return currentState;
}

async function handleCommitteeFormSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('btn-submit-committee');
    const btnText = submitBtn.querySelector('span');
    const btnLoader = submitBtn.querySelector('.loader');
    const data = getCurrentFormState();
    if (!data.CommitteeTitle || !data.TermStartDate || !data.TermEndDate) {
        return showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
    }
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    const method = data.id ? 'PUT' : 'POST';
    const endpoint = data.id ? `/api/committees/${data.id}` : '/api/committees';
    try {
        const result = await apiFetch(endpoint, { method: method, body: data });
        closeModal();
        await loadCommitteePage();
        showToast(result.message);
    } catch (error) { /* Error shown from apiFetch */ }
    finally {
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
    activeCommitteeDataInModal = currentState;
    showCommitteeForm(activeCommitteeDataInModal);
}

function handleDeleteDepartment(department) {
    if (confirm(`คุณต้องการลบหน่วยงาน "${department}" และประวัติทั้งหมดใช่หรือไม่?`)) {
        const currentState = getCurrentFormState();
        currentState.SubCommitteeData = currentState.SubCommitteeData.filter(sc => sc.department !== department);
        activeCommitteeDataInModal = currentState;
        showCommitteeForm(currentState);
    }
}

async function handleUpdateSubCommittee(department) {
    // This now opens a modal for date selection
    const formHtml = `...`; // As defined in previous responses
    openModal(`อัปเดตผัง: ${department}`, formHtml, 'max-w-xl');

    const datePicker = flatpickr("#sub-committee-date-input", {
        altInput: true,
        altFormat: "j F Y",
        dateFormat: "Y-m-d",
        locale: "th",
        defaultDate: "today"
    });

    document.getElementById('btn-confirm-sub-upload').addEventListener('click', async () => {
        const fileInput = document.getElementById('sub-committee-file-input');
        const file = fileInput.files[0];
        if (!file || !datePicker.selectedDates.length) {
            return showToast('กรุณาเลือกไฟล์และวันที่', 'error');
        }
        
        const newUrl = await uploadFile(file);
        if (newUrl) {
            const currentState = getCurrentFormState();
            const subCommittee = currentState.SubCommitteeData.find(sc => sc.department === department);
            if (subCommittee) {
                subCommittee.activeLink = newUrl;
                subCommittee.versions.push({
                    version: subCommittee.versions.length + 1,
                    link: newUrl,
                    effectiveDate: datePicker.selectedDates[0].toISOString()
                });
                activeCommitteeDataInModal = currentState;
                closeModal();
                showCommitteeForm(activeCommitteeDataInModal);
                showToast('อัปเดตผังสำเร็จ');
            }
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
    } catch (error) { return null; }
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