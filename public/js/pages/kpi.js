// js/pages/kpi.js (เวอร์ชันสมบูรณ์ + Year Selector)

import { apiFetch } from '../api.js';
import { hideLoading, showError, showToast, openModal, closeModal, showConfirmationModal, showDocumentModal } from '../ui.js';

let chartInstances = {};
let allKpiDataForYear = [];
let kpiEventListenersAttached = false;

// --- Main Page Flow ---
export async function loadKpiPage(year = null) {
    const container = document.getElementById('kpi-page');
    container.innerHTML = `<div class="card p-6 text-center">กำลังโหลดข้อมูล KPI...</div>`;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isAdmin = currentUser?.role === 'Admin';

    try {
        const annData = await apiFetch('/api/pagedata/kpi-announcements');
        const { current, availableYears, past } = annData;

        if (!current) {
            container.innerHTML = `<div class="card p-6 text-center text-slate-500">ยังไม่มีการสร้างประกาศ KPI<br>${isAdmin ? '<button id="btn-manage-anns" class="btn btn-primary mt-4">สร้างประกาศแรก</button>' : ''}</div>`;
            if (isAdmin && !kpiEventListenersAttached) setupKpiEventListeners();
            hideLoading();
            return;
        }

        const yearToDisplay = year || new Date(current.EffectiveDate).getFullYear();
        allKpiDataForYear = await apiFetch(`/api/kpidata/${yearToDisplay}`);
        
        const allAnnouncements = [current, ...past];
        const announcementForYear = allAnnouncements.find(a => new Date(a.EffectiveDate).getFullYear() == yearToDisplay) || current;

        renderKpiDashboard(container, announcementForYear, allKpiDataForYear, isAdmin, availableYears, yearToDisplay);

    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-6 text-red-500">ไม่สามารถโหลดข้อมูล KPI ได้</div>`;
    } finally {
        hideLoading();
    }
}

function renderKpiDashboard(container, announcement, kpiData, isAdmin, availableYears, selectedYear) {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const yearSelectorHtml = (availableYears && availableYears.length > 0) ? `
        <select id="kpi-year-select" class="form-input text-base mt-2">
            ${availableYears.map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>ปีงบประมาณ ${y}</option>`).join('')}
        </select>
    ` : '';

    const adminButtonHtml = isAdmin ? `<div class="flex items-center gap-4"><button id="btn-manage-anns" class="btn btn-secondary">จัดการประกาศ</button><button id="btn-add-kpi" class="btn btn-primary">+ เพิ่มตัวชี้วัดใหม่</button></div>` : '';
    const docButtonHtml = announcement.DocumentLink ? `<div class="mt-4"><a href="${announcement.DocumentLink}" data-action="view-doc" data-title="ประกาศ KPI: ${announcement.AnnouncementTitle}" class="btn btn-secondary">ดูเอกสารประกาศ</a></div>` : '';
    const kpiCardsHtml = kpiData.length > 0 ? kpiData.map(kpi => createKpiMetricCard(kpi, isAdmin)).join('') : `<div class="col-span-1 md:col-span-2 xl:col-span-3 text-center py-16 card"><svg class="mx-auto h-12 w-12 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 1.5m-5.25-11.25L2.25 6l1.5 1.5m5.25-3L6.75 6l1.5 1.5m5.25-3l1.5 1.5l1.5-1.5m-7.5 7.5l1.5 1.5l1.5-1.5M3 10.5h18" /></svg><h3 class="mt-2 text-sm font-semibold text-slate-900 dark:text-white">ไม่มีข้อมูลตัวชี้วัด</h3><p class="mt-1 text-sm text-slate-500">ยังไม่มีการเพิ่มข้อมูล KPI สำหรับปีนี้</p>${isAdmin ? `<div class="mt-6"><button id="btn-add-kpi-empty" class="btn btn-primary">+ เพิ่มตัวชี้วัดแรก</button></div>` : ''}</div>`;

    container.innerHTML = `
        <div id="kpi-dashboard-view">
            <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
                <div>
                    <h3 class="font-bold text-xl">${announcement.AnnouncementTitle}</h3>
                    ${yearSelectorHtml}
                </div>
                ${adminButtonHtml}
            </div>
            ${docButtonHtml}
            <div id="kpi-cards-container" class="grid grid-cols-1 md:grid-cols-2 xl:col-span-3 gap-6 mt-6">${kpiCardsHtml}</div>
        </div>`;

    kpiData.forEach(drawKpiChart);

    if (!kpiEventListenersAttached) {
        setupKpiEventListeners();
        kpiEventListenersAttached = true;
    }

    const yearSelect = document.getElementById('kpi-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', (event) => {
            const newYear = event.target.value;
            loadKpiPage(newYear);
        });
    }
}


// --- Event Handling ---
function setupKpiEventListeners() {
    const container = document.getElementById('kpi-page');
    if (!container) return;
    container.addEventListener('click', async (event) => {
        const addBtn = event.target.closest('#btn-add-kpi, #btn-add-kpi-empty');
        const manageAnnsBtn = event.target.closest('#btn-manage-anns');
        const editBtn = event.target.closest('.btn-edit-kpi');
        const deleteBtn = event.target.closest('.btn-delete-kpi');
        const viewDocBtn = event.target.closest('[data-action="view-doc"]');

        if (addBtn) showKpiForm();
        else if (manageAnnsBtn) showAnnouncementManager();
        else if (editBtn) {
            const kpiToEdit = allKpiDataForYear.find(k => k.id == editBtn.dataset.id);
            if (kpiToEdit) showKpiForm(kpiToEdit);
        } else if (deleteBtn) {
            const kpiMetric = allKpiDataForYear.find(k => k.id == deleteBtn.dataset.id)?.Metric || 'รายการนี้';
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `คุณต้องการลบตัวชี้วัด "${kpiMetric}" ใช่หรือไม่?`);
            if (confirmed) handleDeleteKpi(deleteBtn.dataset.id);
        } else if (viewDocBtn) {
            event.preventDefault();
            showDocumentModal(viewDocBtn.href, viewDocBtn.dataset.title || 'เอกสาร');
        }
    });
}

// --- Announcement Manager ---
async function showAnnouncementManager() {
    openModal('จัดการประกาศ KPI', '<div id="ann-list-container">กำลังโหลด...</div><div class="mt-6 text-right border-t dark:border-slate-700 pt-4"><button id="btn-add-ann" class="btn btn-primary">+ เพิ่มประกาศใหม่</button></div>', 'max-w-4xl');
    document.getElementById('btn-add-ann').addEventListener('click', () => showAnnouncementForm());
    try {
        const announcements = await apiFetch('/api/kpiannouncements');
        const listContainer = document.getElementById('ann-list-container');
        if (announcements.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-slate-500 py-8">ยังไม่มีประกาศ</p>';
            return;
        }
        const listHtml = announcements.map(ann => `
            <div class="flex justify-between items-center p-3 border-b dark:border-slate-700 last:border-b-0">
                <div>
                    <p class="font-medium">${ann.AnnouncementTitle}</p>
                    <p class="text-sm text-slate-500">มีผลบังคับใช้: ${new Date(ann.EffectiveDate).toLocaleDateString('th-TH')}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${ann.IsCurrent ? '<span class="text-sm font-medium text-green-500 px-3">ใช้งานอยู่</span>' : `<button data-id="${ann.id}" class="btn btn-secondary btn-sm btn-set-ann-current">ตั้งเป็นปัจจุบัน</button>`}
                    <button data-id="${ann.id}" class="btn btn-secondary btn-sm btn-edit-ann">แก้ไข</button>
                    <button data-id="${ann.id}" class="btn btn-danger btn-sm btn-delete-ann">ลบ</button>
                </div>
            </div>`).join('');
        listContainer.innerHTML = `<div class="space-y-2">${listHtml}</div>`;
        listContainer.addEventListener('click', async (event) => {
            const target = event.target;
            const annId = target.dataset.id;
            if (!annId) return;
            if (target.matches('.btn-edit-ann')) {
                const annToEdit = announcements.find(a => a.id == annId);
                if(annToEdit) showAnnouncementForm(annToEdit);
            } else if (target.matches('.btn-delete-ann')) {
                const annTitle = announcements.find(a => a.id == annId)?.AnnouncementTitle || 'รายการนี้';
                const confirmed = await showConfirmationModal('ยืนยันการลบ', `คุณต้องการลบประกาศ "${annTitle}" ใช่หรือไม่?`);
                if (confirmed) {
                    await apiFetch(`/api/kpiannouncements/${annId}`, { method: 'DELETE' });
                    showToast('ลบประกาศสำเร็จ');
                    showAnnouncementManager();
                }
            } else if (target.matches('.btn-set-ann-current')) {
                await apiFetch(`/api/kpiannouncements/${annId}`, { method: 'PUT', body: { IsCurrent: 1 } });
                showToast('ตั้งเป็นประกาศปัจจุบันสำเร็จ');
                showAnnouncementManager();
                loadKpiPage();
            }
        });
    } catch (error) { showError(error); }
}

function showAnnouncementForm(ann = null) {
    const isEditing = ann !== null;
    const title = isEditing ? 'แก้ไขประกาศ KPI' : 'สร้างประกาศ KPI ใหม่';
    const effectiveDate = ann?.EffectiveDate ? new Date(ann.EffectiveDate).toISOString().split('T')[0] : '';
    const formHtml = `
        <form id="ann-form" class="space-y-4">
            <input type="hidden" name="AnnouncementID" value="${ann?.id || ''}">
            <div class="form-group"><input type="text" name="AnnouncementTitle" class="form-field w-full rounded-lg p-3" value="${ann?.AnnouncementTitle || ''}" required placeholder=" "><label class="form-label-floating">ชื่อประกาศ *</label></div>
            <div class="form-group"><input type="text" id="ann-effective-date" name="EffectiveDate" class="form-field w-full rounded-lg p-3" value="${effectiveDate}" required placeholder=" "><label class="form-label-floating">วันที่มีผล *</label></div>
            <div class="form-group"><label class="form-label block mb-1 text-sm">เอกสารแนบ</label><div id="file-upload-area-ann"></div><input type="hidden" id="AnnDocumentLink" name="DocumentLink" value="${ann?.DocumentLink || ''}"></div>
            <div class="rounded-lg border dark:border-slate-700 p-4 flex items-center justify-between"><span class="text-slate-800 dark:text-slate-200 font-medium">ตั้งเป็นประกาศปัจจุบัน</span><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" name="IsCurrent" class="sr-only peer" ${ann?.IsCurrent ? 'checked' : ''}><div class="w-11 h-6 bg-slate-200 ..."></div></label></div>
            <div class="flex justify-end ..."><button type="button" class="btn btn-secondary" id="btn-cancel-ann-modal">ยกเลิก</button><button type="submit" class="btn btn-primary">${isEditing ? 'บันทึก' : 'สร้าง'}</button></div>
        </form>
    `;
    openModal(title, formHtml, 'max-w-2xl no-padding');
    flatpickr("#ann-effective-date", { altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d", locale: "th" });
    // updateFileUploadUI logic for announcement is needed here
    document.getElementById('ann-form').addEventListener('submit', handleAnnouncementFormSubmit);
    document.getElementById('btn-cancel-ann-modal').addEventListener('click', showAnnouncementManager);
}

async function handleAnnouncementFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.IsCurrent = form.querySelector('[name="IsCurrent"]').checked;
    const method = data.AnnouncementID ? 'PUT' : 'POST';
    const endpoint = data.AnnouncementID ? `/api/kpiannouncements/${data.AnnouncementID}` : '/api/kpiannouncements';
    try {
        await apiFetch(endpoint, { method: method, body: data });
        showToast(data.AnnouncementID ? 'แก้ไขประกาศสำเร็จ' : 'สร้างประกาศสำเร็จ');
        showAnnouncementManager();
        loadKpiPage();
    } catch (error) { showError(error); }
}

// --- KPI Metric Card and Form Functions (Unchanged) ---
// (The functions createKpiMetricCard, drawKpiChart, showKpiForm, handleKpiFormSubmit, handleDeleteKpi remain here, exactly as they were in the previous version)
function createKpiMetricCard(kpi, isAdmin) {
    const chartId = `kpi-chart-${kpi.id}`;
    const adminButtons = isAdmin ? `
        <div class="absolute top-4 right-4 space-x-2">
            <button data-id="${kpi.id}" class="btn btn-secondary btn-sm !p-2 btn-edit-kpi" title="แก้ไข"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
            <button data-id="${kpi.id}" class="btn btn-danger btn-sm !p-2 btn-delete-kpi" title="ลบ"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>
        </div>` : '';
    return `
        <div class="card p-6 flex flex-col relative">
            ${adminButtons}
            <h3 class="font-semibold text-lg flex-grow pr-20">${kpi.Metric}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">เป้าหมาย: ${kpi.Target} ${kpi.Unit || ''}</p>
            <div class="text-xs text-slate-500 dark:text-slate-400 mb-2">${kpi.Department || ''}</div>
            <div class="flex-grow min-h-[250px] mt-4"><canvas id="${chartId}"></canvas></div>
        </div>
    `;
}
function drawKpiChart(kpi) {
    const canvasId = `kpi-chart-${kpi.id}`;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const actualData = months.map(m => kpi[m] !== null && kpi[m] !== undefined ? parseFloat(kpi[m]) : null);
    const annualTarget = parseFloat(kpi.Target);
    const backgroundColors = actualData.map(val => {
        if (val === null || isNaN(annualTarget)) return 'rgba(59, 130, 246, 0.5)';
        return val >= annualTarget ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
    });
    const datasets = [{
        label: `ผลงานจริง`,
        data: actualData,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors.map(c => c.replace('0.5', '1')),
        borderWidth: 1,
        type: 'bar',
        order: 2
    }];
    if (!isNaN(annualTarget)) {
        datasets.push({
            label: 'เป้าหมาย',
            data: Array(12).fill(annualTarget),
            borderColor: '#F59E0B',
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            type: 'line',
            order: 1
        });
    }
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: months, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 20 } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString();
                            }
                            if (context.dataset.type === 'bar' && !isNaN(annualTarget)) {
                                const diff = context.parsed.y - annualTarget;
                                const sign = diff >= 0 ? '+' : '';
                                label += ` (${sign}${diff.toLocaleString()} vs Target)`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}
function showKpiForm(kpi = null) {
    const isEditing = kpi !== null;
    const title = isEditing ? 'แก้ไขตัวชี้วัด KPI' : 'เพิ่มตัวชี้วัด KPI ใหม่';
    const yearText = document.querySelector('#kpi-dashboard-view .text-sm.text-slate-500');
    const year = kpi?.Year || (yearText ? new Date(yearText.textContent.split(' ')[1]).getFullYear() : new Date().getFullYear());
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyInputs = months.map((month, index) => {
        const value = kpi?.[month];
        const isFutureMonth = (year > currentYear) || (year === currentYear && index > currentMonth);
        let placeholder = 'ยังไม่มีข้อมูล';
        let isDisabled = false;
        let extraClasses = 'bg-slate-50 dark:bg-slate-700/50';
        if (isFutureMonth) {
            placeholder = 'ยังไม่ถึงเดือนที่ต้องกรอก';
            isDisabled = true;
            extraClasses = 'bg-slate-200 dark:bg-slate-800 cursor-not-allowed';
        }
        return `
        <div class="form-group">
            <input 
                type="number" 
                step="any" 
                id="kpi-${month}" 
                name="${month}" 
                class="form-field w-full rounded-lg p-3 ${extraClasses}" 
                value="${value ?? ''}" 
                placeholder="${placeholder}"
                ${isDisabled ? 'disabled' : ''}
            >
            <label for="kpi-${month}" class="form-label-floating ${value !== null && value !== undefined ? 'is-active' : ''}">${month}</label>
        </div>`;
    }).join('');
    const formHtml = `
        <form id="kpi-form" novalidate>
            <div class="p-6 space-y-6">
                <input type="hidden" name="id" value="${kpi?.id || ''}">
                <input type="hidden" name="Year" value="${year}">
                <div class="form-group">
                    <input type="text" id="kpi-Metric" name="Metric" class="form-field w-full rounded-lg p-3" value="${kpi?.Metric || ''}" required placeholder=" ">
                    <label for="kpi-Metric" class="form-label-floating">ชื่อตัวชี้วัด *</label>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="form-group"><input type="text" id="kpi-Department" name="Department" class="form-field w-full rounded-lg p-3" value="${kpi?.Department || ''}" placeholder=" "><label for="kpi-Department" class="form-label-floating">แผนก</label></div>
                    <div class="form-group"><input type="text" id="kpi-Unit" name="Unit" class="form-field w-full rounded-lg p-3" value="${kpi?.Unit || ''}" placeholder=" "><label for="kpi-Unit" class="form-label-floating">หน่วยนับ</label></div>
                    <div class="form-group"><input type="number" step="any" id="kpi-Target" name="Target" class="form-field w-full rounded-lg p-3" value="${kpi?.Target || ''}" required placeholder=" "><label for="kpi-Target" class="form-label-floating">เป้าหมายรายปี *</label></div>
                </div>
                <div>
                    <h4 class="text-base font-semibold mb-3 border-b dark:border-slate-600 pb-2">ข้อมูลรายเดือน</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        ${monthlyInputs}
                    </div>
                </div>
            </div>
            <div class="flex justify-end items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border-t dark:border-slate-700 rounded-b-xl">
                <button type="button" class="btn btn-secondary" id="btn-cancel-modal">ยกเลิก</button>
                <button type="submit" class="btn btn-primary" id="btn-submit-kpi"><span>${isEditing ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างตัวชี้วัด'}</span><div class="loader hidden animate-spin ..."></div></button>
            </div>
        </form>
    `;
    openModal(title, formHtml, 'max-w-4xl no-padding');
    document.getElementById('kpi-form').addEventListener('submit', handleKpiFormSubmit);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
}
async function handleKpiFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.Metric.value || !form.Target.value) {
        return showToast('กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วน', 'error');
    }
    const submitBtn = document.getElementById('btn-submit-kpi');
    const btnText = submitBtn.querySelector('span');
    const btnLoader = submitBtn.querySelector('.loader');
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const method = data.id ? 'PUT' : 'POST';
    const endpoint = data.id ? `/api/kpidata/${data.id}` : '/api/kpidata';
    try {
        const result = await apiFetch(endpoint, { method: method, body: data });
        closeModal();
        await loadKpiPage();
        showToast(result.message);
    } catch (error) {
        // Error is shown from apiFetch
    } finally {
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}
async function handleDeleteKpi(kpiId) {
    showLoading('กำลังลบข้อมูล...');
    try {
        await apiFetch(`/api/kpidata/${kpiId}`, { method: 'DELETE' });
        await loadKpiPage();
        showToast('ลบตัวชี้วัดสำเร็จ');
    } catch (error) {
        // Error is shown from apiFetch
    } finally {
        hideLoading();
    }
}