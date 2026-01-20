import { apiFetch } from '../api.js';
import {
  showLoading, hideLoading, showError, showToast,
  openModal, closeModal, showConfirmationModal, showDocumentModal
} from '../ui.js';

let allCommittees = [];
let committeeEventListenersInitialized = false;
let tempSubCommittees = [];

function parseSubData(maybeJson) {
  if (!maybeJson) return [];
  if (Array.isArray(maybeJson)) return maybeJson;
  if (typeof maybeJson === 'string') {
    try { return JSON.parse(maybeJson); } catch { return []; }
  }
  return [];
}

function normalizeCommittee(raw) {
  if (!raw) return null;
  const c = { ...raw };
  c.SubCommitteeData = parseSubData(raw.SubCommitteeData);
  return c;
}

export async function loadCommitteePage() {
  const container = document.getElementById('committee-page');
  
  if (!committeeEventListenersInitialized) {
    setupCommitteeEventListeners();
    committeeEventListenersInitialized = true;
  }

  // ✅ 1. Get User & Check Admin Role (Robust Check)
  const userStr = localStorage.getItem('currentUser');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  
  const isAdmin = currentUser && (
      (currentUser.role && currentUser.role.toLowerCase() === 'admin') || 
      (currentUser.Role && currentUser.Role.toLowerCase() === 'admin') ||
      (currentUser.id === 'admin') // Hardcode admin ID just in case
  );

  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
        <div class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-5">
            <div>
                <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                    คณะกรรมการความปลอดภัย
                </h1>
                <p class="text-sm text-slate-500 mt-1">โครงสร้างคณะกรรมการและคณะทำงาน</p>
            </div>
            
            ${isAdmin ? `
            <button id="btn-add-committee" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                เพิ่มคณะกรรมการ
            </button>` : ''}
        </div>

        <div id="current-committee-container">
            <div class="py-12 text-center text-slate-400">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3"></div>
                <p>กำลังโหลดข้อมูล...</p>
            </div>
        </div>

        <div>
            <h3 class="text-lg font-bold text-slate-700 mb-4 border-l-4 border-slate-300 pl-3">ประวัติย้อนหลัง</h3>
            <div id="past-committee-container" class="space-y-4"></div>
        </div>
    </div>
  `;

  try {
    const data = await apiFetch('/pagedata/committees'); 
    let items = [];
    
    if (data.current || data.past) {
        if (data.current) items.push(data.current);
        if (data.past && Array.isArray(data.past)) items.push(...data.past);
    } else if (Array.isArray(data)) {
        items = data;
    } else if (data && data.items) {
        items = data.items;
    }

    items = items.map(normalizeCommittee).filter(Boolean);

    if (items.length === 0) {
      document.getElementById('current-committee-container').innerHTML =
        `<div class="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">ไม่พบข้อมูลคณะกรรมการ</div>`;
      document.getElementById('past-committee-container').innerHTML = `<div class="text-sm text-slate-400 pl-4">ไม่มีประวัติ</div>`;
      return;
    }

    const current = items.find(x => Number(x.IsCurrent) === 1) || items[0];
    const past = items.filter(x => x.id !== current.id);

    allCommittees = [current, ...past].filter(Boolean);
    // ✅ 3. Pass isAdmin to render function
    renderCommitteeCards({ current, past }, isAdmin);

  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded text-center">โหลดข้อมูลไม่สำเร็จ: ${error.message}</div>`;
  }
}

function renderCommitteeCards(data, isAdmin) {
  const currentContainer = document.getElementById('current-committee-container');
  const pastContainer = document.getElementById('past-committee-container');
  const { current, past } = data;

  if (current) currentContainer.innerHTML = createCommitteeCard(current, true, isAdmin);
  
  if (past && past.length > 0) {
      pastContainer.innerHTML = past.map(c => createCommitteeCard(c, false, isAdmin)).join('');
  } else {
      pastContainer.innerHTML = `<div class="text-sm text-slate-400 pl-4 italic">ไม่มีประวัติย้อนหลัง</div>`;
  }
}

function createCommitteeCard(committee, isCurrent, isAdmin) {
  const formatDate = (d) => {
      if(!d) return 'N/A';
      const date = new Date(d);
      return isNaN(date.getTime()) ? d : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  
  const subList = Array.isArray(committee.SubCommitteeData) ? committee.SubCommitteeData : [];
  
  const subCommitteesHtml = subList.length > 0
    ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        ${subList.map(sc => `
           <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all group">
              <div class="flex items-start justify-between mb-2">
                 <h5 class="font-semibold text-slate-700 text-sm">${sc.department}</h5>
                 ${sc.activeLink ? `<span class="flex h-2 w-2 relative"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>` : ''}
              </div>
              ${sc.activeLink ? 
                `<a href="${sc.activeLink}" data-action="view-doc" data-title="ผัง: ${sc.department}" class="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 group-hover:underline">
                   <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                   ดูผังองค์กร
                 </a>` : 
                `<span class="text-xs text-slate-400 flex items-center gap-1">ไม่มีเอกสาร</span>`
              }
           </div>
        `).join('')}
      </div>`
    : '<div class="text-center p-6 bg-slate-50 rounded-lg border border-slate-200 border-dashed text-slate-400 text-sm">ยังไม่มีข้อมูลคณะทำงานย่อย</div>';

  return `
  <div class="bg-white rounded-xl shadow-sm border ${isCurrent ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'} overflow-hidden transition-all hover:shadow-md" id="committee-card-${committee.id}">
    
    <div class="p-5 ${isCurrent ? 'bg-gradient-to-r from-blue-50 to-white' : 'bg-white'} border-b border-slate-100 flex justify-between items-start">
      <div class="flex-grow">
           ${isCurrent ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 mb-2 border border-blue-200">ชุดปัจจุบัน</span>` : ''}
           <h3 class="text-xl font-bold text-slate-800 ${isCurrent ? 'text-blue-900' : ''}">${committee.CommitteeTitle}</h3>
           <div class="flex items-center gap-4 mt-2 text-sm text-slate-500">
             <span class="flex items-center gap-1.5">
               <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
               ${formatDate(committee.TermStartDate)} - ${formatDate(committee.TermEndDate)}
             </span>
           </div>
      </div>
      
      ${isAdmin ? `
      <div class="flex gap-1">
           <button data-id="${committee.id}" class="btn-edit-committee p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
           <button data-id="${committee.id}" class="btn-delete-committee p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
      </div>` : ''}
    </div>

    <div class="p-6">
      ${committee.MainOrgChartLink ? 
        `<div class="mb-6">
           <a href="${committee.MainOrgChartLink}" data-action="view-doc" data-title="ผังองค์กรหลัก" 
              class="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              ดูผังองค์กรหลัก (Main Chart)
           </a>
         </div>` : ''}

      <div>
        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span class="w-8 h-px bg-slate-200"></span> คณะทำงานย่อย (Sub-Committees)
        </h4>
        ${subCommitteesHtml}
      </div>
    </div>
  </div>`;
}

function openCommitteeForm(committee = null) {
  const isEditing = !!committee;
  tempSubCommittees = committee ? parseSubData(JSON.stringify(committee.SubCommitteeData)) : [];

  const html = `
    <form id="committee-form" class="space-y-5 px-1" novalidate>
        <input type="hidden" name="id" value="${committee?.id || ''}">
        
        <div class="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm border border-blue-100 flex gap-2">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            กรุณากรอกข้อมูลวาระและลิงก์เอกสารให้ถูกต้อง
        </div>

        <div>
            <label class="block text-sm font-bold text-slate-700 mb-1">ชื่อคณะกรรมการ *</label>
            <input type="text" name="CommitteeTitle" class="form-input w-full rounded-lg" value="${committee?.CommitteeTitle || ''}" required>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-bold text-slate-700 mb-1">วันเริ่มวาระ</label><input type="text" id="TermStartDate" name="TermStartDate" class="form-input w-full rounded-lg bg-white" value="${committee?.TermStartDate ? new Date(committee.TermStartDate).toISOString().split('T')[0] : ''}"></div>
            <div><label class="block text-sm font-bold text-slate-700 mb-1">วันสิ้นสุดวาระ</label><input type="text" id="TermEndDate" name="TermEndDate" class="form-input w-full rounded-lg bg-white" value="${committee?.TermEndDate ? new Date(committee.TermEndDate).toISOString().split('T')[0] : ''}"></div>
        </div>

        <div>
            <label class="block text-sm font-bold text-slate-700 mb-1">ลิงก์ผังองค์กรหลัก</label>
            <input type="text" name="MainOrgChartLink" class="form-input w-full rounded-lg text-sm" value="${committee?.MainOrgChartLink || ''}">
        </div>

        <div class="flex items-center gap-2 py-2">
            <input type="checkbox" id="IsCurrent" name="IsCurrent" class="rounded text-blue-600" ${committee?.IsCurrent ? 'checked' : ''}>
            <label for="IsCurrent" class="text-sm font-medium text-slate-700 cursor-pointer">ตั้งเป็นชุดปัจจุบัน</label>
        </div>

        <div class="border-t border-slate-200 pt-4 mt-4">
            <div class="flex justify-between items-center mb-3">
                <label class="block text-sm font-bold text-slate-700">คณะอนุกรรมการ</label>
                <button type="button" id="btn-add-sub" class="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200">+ เพิ่มรายการ</button>
            </div>
            <div id="sub-committee-list" class="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200"></div>
        </div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
            <button type="button" class="px-5 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium" onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
            <button type="submit" class="px-6 py-2.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-sm font-bold shadow-md">บันทึกข้อมูล</button>
        </div>
    </form>
  `;

  openModal(isEditing ? 'แก้ไขข้อมูล' : 'เพิ่มคณะกรรมการ', html, 'max-w-3xl');
  flatpickr("#TermStartDate", { locale: "th", dateFormat: "Y-m-d" });
  flatpickr("#TermEndDate", { locale: "th", dateFormat: "Y-m-d" });
  renderSubCommitteeList();

  document.getElementById('btn-add-sub').addEventListener('click', () => {
      const deptName = prompt("ระบุชื่อหน่วยงาน/แผนกย่อย:");
      if (deptName && deptName.trim()) {
          tempSubCommittees.push({ department: deptName.trim(), activeLink: "" });
          renderSubCommitteeList();
      }
  });

  document.getElementById('committee-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      data.IsCurrent = e.target.querySelector('#IsCurrent').checked ? 1 : 0;
      data.SubCommitteeData = JSON.stringify(tempSubCommittees);
      const method = data.id ? 'PUT' : 'POST';
      const url = data.id ? `/committees/${data.id}` : '/committees';
      try {
          showLoading('กำลังบันทึก...');
          await apiFetch(url, { method, body: data });
          closeModal(); await loadCommitteePage(); showToast('บันทึกข้อมูลสำเร็จ', 'success');
      } catch (err) { showError(err); } finally { hideLoading(); }
  });
}

function renderSubCommitteeList() {
    const listEl = document.getElementById('sub-committee-list');
    if (!listEl) return;
    if (tempSubCommittees.length === 0) { listEl.innerHTML = `<div class="text-center text-xs text-slate-400 py-2">ยังไม่มีรายการย่อย</div>`; return; }
    listEl.innerHTML = tempSubCommittees.map((sub, index) => `
        <div class="flex items-center justify-between bg-white p-2.5 rounded border border-slate-200 shadow-sm">
            <span class="text-sm font-semibold text-slate-700 pl-1">${sub.department}</span>
            <div class="flex gap-2 items-center">
                <input type="text" placeholder="ลิงก์เอกสาร" class="text-xs border rounded px-2 py-1 w-48" value="${sub.activeLink || ''}" onchange="updateSubLink(${index}, this.value)">
                <button type="button" class="text-slate-400 hover:text-red-500" onclick="removeSub(${index})">×</button>
            </div>
        </div>`).join('');
    window.removeSub = (index) => { tempSubCommittees.splice(index, 1); renderSubCommitteeList(); };
    window.updateSubLink = (index, val) => { tempSubCommittees[index].activeLink = val; };
}

function setupCommitteeEventListeners() {
  document.addEventListener('click', async (event) => {
    if (!event.target.closest('#committee-page')) return;
    const target = event.target;
    if (target.closest('#btn-add-committee')) { openCommitteeForm(); return; }
    const editBtn = target.closest('.btn-edit-committee');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const committee = allCommittees.find(c => String(c.id) === String(id));
      if (committee) openCommitteeForm(committee);
      return;
    }
    const deleteBtn = target.closest('.btn-delete-committee');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const confirmed = await showConfirmationModal('ยืนยันการลบ', `คุณต้องการลบข้อมูลนี้ใช่หรือไม่?`);
      if (confirmed) {
          showLoading('กำลังลบ...');
          try { await apiFetch(`/committees/${id}`, { method: 'DELETE' }); await loadCommitteePage(); showToast('ลบข้อมูลสำเร็จ', 'success'); } 
          catch(err) { showError(err); } finally { hideLoading(); }
      }
      return;
    }
    const viewDocBtn = target.closest('[data-action="view-doc"]');
    if (viewDocBtn) { event.preventDefault(); showDocumentModal(viewDocBtn.href, 'เอกสาร'); return; }
  });
}