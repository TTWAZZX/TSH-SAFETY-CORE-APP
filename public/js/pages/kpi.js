import { apiFetch } from '../api.js';
import { hideLoading, showLoading, showError, showToast, openModal, closeModal, showConfirmationModal, showDocumentModal } from '../ui.js';

let chartInstances = {};
let allKpiDataForYear = [];
let currentAnnouncementId = null;
let kpiEventListenersAttached = false;

// --- Main Page Loader ---
export async function loadKpiPage(year = null) {
    console.log("📊 Loading KPI Page...");
    const container = document.getElementById('kpi-page');
    
    // Initialize Listeners Once
    if (!kpiEventListenersAttached) {
        setupKpiEventListeners();
        kpiEventListenersAttached = true;
    }

    // ✅ 1. ตรวจสอบข้อมูลผู้ใช้และสิทธิ์ Admin (Robust Check)
    const userStr = localStorage.getItem('currentUser');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    
    const isAdmin = currentUser && (
        (currentUser.role && currentUser.role.toLowerCase() === 'admin') || 
        (currentUser.Role && currentUser.Role.toLowerCase() === 'admin') ||
        (currentUser.id === 'admin')
    );

    // 1. Setup Loading State
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4"></div>
            <span class="text-sm font-medium">Loading KPI Data...</span>
        </div>`;

    // 2. Fetch Data
    try {
        const annData = await apiFetch('/pagedata/kpi-announcements');
        const { current, past } = annData;

        const allAnnouncements = [current, ...(past || [])].filter(Boolean);
        const calculatedYears = new Set();
        allAnnouncements.forEach(ann => {
            if(ann.EffectiveDate) calculatedYears.add(new Date(ann.EffectiveDate).getFullYear());
        });
        calculatedYears.add(new Date().getFullYear());
        const availableYears = Array.from(calculatedYears).sort((a, b) => b - a);

        let yearToDisplay = year ? parseInt(year) : (current ? new Date(current.EffectiveDate).getFullYear() : new Date().getFullYear());
        allKpiDataForYear = await apiFetch(`/kpidata/${yearToDisplay}`);
        
        const announcementForYear = allAnnouncements.find(a => new Date(a.EffectiveDate).getFullYear() == yearToDisplay) || current;
        
        if (announcementForYear && new Date(announcementForYear.EffectiveDate).getFullYear() == yearToDisplay) {
            currentAnnouncementId = announcementForYear.id || announcementForYear.AnnouncementID;
        } else {
            currentAnnouncementId = null;
        }

        const displayAnnouncement = (currentAnnouncementId) ? announcementForYear : { 
            AnnouncementTitle: `KPI Overview ${yearToDisplay}`,
            id: null
        };

        // ✅ ส่งค่า isAdmin ไปให้ฟังก์ชัน Render
        renderKpiDashboard(container, displayAnnouncement, allKpiDataForYear, isAdmin, availableYears, yearToDisplay);

    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="p-6 bg-red-50 text-red-600 rounded-xl text-center">Failed to load data: ${error.message}</div>`;
    } 
}

function renderKpiDashboard(container, announcement, kpiData, isAdmin, availableYears, selectedYear) {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const summaryHtml = renderSummaryWidgets(kpiData);

    const yearSelectorHtml = `
        <div class="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Fiscal Year</span>
            <select id="kpi-year-select" class="text-sm font-semibold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer py-0">
                ${availableYears.map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
        </div>
    `;

    // ✅ ซ่อน Toolbar ทั้งหมดถ้าไม่ใช่ Admin
    const adminButtonHtml = isAdmin ? `
        <div class="flex items-center gap-2 mt-4 lg:mt-0 flex-wrap justify-end">
            <div class="flex bg-white rounded-lg border border-slate-200 shadow-sm p-1">
                <button id="btn-export-excel" class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded flex items-center gap-1 transition-colors">
                    Export
                </button>
                <div class="w-px bg-slate-200 my-1 mx-1"></div>
                <button id="btn-import-excel" class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded flex items-center gap-1 transition-colors">
                    Import
                </button>
            </div>
            <input type="file" id="kpi-file-import" class="hidden" accept=".xlsx, .xls" />

            <div class="h-6 w-px bg-slate-300 mx-2 hidden md:block"></div>

            <button id="btn-manage-anns" class="btn bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-all">
                จัดการประกาศ (Announcements)
            </button>
            <button id="btn-add-kpi" class="btn bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-2 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                เพิ่ม KPI
            </button>
        </div>` : '';

    const docButtonHtml = announcement.DocumentLink ? `
        <a href="${announcement.DocumentLink}" data-action="view-doc" data-title="${announcement.AnnouncementTitle}" 
           class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold transition-colors mt-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            View Official Document
        </a>` : '';

    let kpiCardsHtml = '';
    if (kpiData.length > 0) {
        // ✅ ส่งค่า isAdmin ไปให้ฟังก์ชันสร้าง Card
        kpiCardsHtml = kpiData.map(kpi => createKpiMetricCard(kpi, isAdmin)).join('');
    } else {
        const emptyMessage = announcement.id 
            ? `Ready to track performance? Click "Add KPI" or Import from Excel.` 
            : `<span class="text-red-500 font-bold">⚠️ Warning: No announcement created for ${selectedYear}. Please create one first.</span>`;

        kpiCardsHtml = `
            <div class="col-span-full py-20 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <div class="bg-white p-4 rounded-full shadow-sm w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                </div>
                <h3 class="text-lg font-bold text-slate-700">No KPIs Found</h3>
                <p class="text-sm text-slate-500 mt-1">${emptyMessage}</p>
            </div>`;
    }

    container.innerHTML = `
        <div id="kpi-dashboard-view" class="animate-fade-in">
            <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div class="flex-grow">
                    <h3 class="font-bold text-2xl text-slate-800 dark:text-white leading-tight flex items-center gap-2">
                        <span class="bg-slate-800 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm">KPI</span>
                        ${announcement.AnnouncementTitle}
                    </h3>
                    ${docButtonHtml}
                </div>
                <div class="flex flex-col items-end gap-3 w-full lg:w-auto">
                    ${yearSelectorHtml}
                    ${adminButtonHtml}
                </div>
            </div>
            
            ${summaryHtml}

            <div id="kpi-cards-container" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 pb-8">
                ${kpiCardsHtml}
            </div>
        </div>`;

    if (kpiData.length > 0) {
        requestAnimationFrame(() => { kpiData.forEach(drawKpiChart); });
    }

    const yearSelect = document.getElementById('kpi-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', (event) => loadKpiPage(event.target.value));
    }
}

function renderSummaryWidgets(kpiData) {
    if (!kpiData || kpiData.length === 0) return '';

    const total = kpiData.length;
    let onTrack = 0;
    let offTrack = 0;

    kpiData.forEach(kpi => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let sumActual = 0;
        
        months.forEach(m => {
            const val = kpi[m];
            if (val !== null && val !== '' && val !== undefined) {
                sumActual += parseFloat(val);
            }
        });

        // Safety Logic: น้อยกว่าหรือเท่ากับเป้าหมาย = ดี (สีเขียว)
        if (sumActual <= parseFloat(kpi.Target)) {
            onTrack++;
        } else {
            offTrack++;
        }
    });

    return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between relative overflow-hidden group">
            <div class="relative z-10">
                <div class="text-sm font-bold text-slate-400 uppercase tracking-wide">Total Metrics</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-white mt-1">${total}</div>
            </div>
            <div class="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between group">
            <div>
                <div class="text-sm font-bold text-emerald-600/80 uppercase tracking-wide">On Track</div>
                <div class="text-3xl font-bold text-emerald-600 mt-1">${onTrack}</div>
                <div class="text-xs text-slate-400 mt-1">Within safety limits</div>
            </div>
            <div class="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between group">
            <div>
                <div class="text-sm font-bold text-red-500/80 uppercase tracking-wide">Needs Attention</div>
                <div class="text-3xl font-bold text-red-600 mt-1">${offTrack}</div>
                <div class="text-xs text-slate-400 mt-1">Exceeded safety limits</div>
            </div>
            <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-600 animate-pulse">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
        </div>
    </div>`;
}

function drawKpiChart(kpi) {
    const ctx = document.getElementById(`kpi-chart-${kpi.id}`);
    if (!ctx) return;

    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dataPoints = months.map(m => {
        const val = kpi[m];
        return (val !== null && val !== undefined && val !== '') ? parseFloat(val) : null;
    });
    
    const target = parseFloat(kpi.Target);

    const barColors = dataPoints.map(val => {
        if (val === null) return 'transparent';
        return val <= target ? '#10B981' : '#EF4444'; 
    });

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { 
                    label: 'Actual', 
                    data: dataPoints, 
                    backgroundColor: barColors, 
                    borderRadius: 4, 
                    barPercentage: 0.6,
                    minBarLength: 5,
                    order: 2,
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        offset: -2, 
                        color: (c) => c.dataset.data[c.dataIndex] > target ? '#DC2626' : '#64748B',
                        font: { family: 'Kanit', weight: 'bold', size: 10 },
                        formatter: (val) => val === null ? '' : val
                    }
                },
                { 
                    label: 'Target Limit', 
                    data: Array(12).fill(target), 
                    type: 'line', 
                    borderColor: '#F59E0B', 
                    borderWidth: 2, 
                    borderDash: [5, 5], 
                    pointRadius: 0, 
                    fill: false, 
                    order: 1,
                    datalabels: { display: false } 
                }
            ]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            layout: { padding: { top: 20 } },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    grid: { color: '#F1F5F9' }, 
                    ticks: { font: { family: 'Kanit', size: 10 }, display: false } 
                }, 
                x: { 
                    grid: { display: false }, 
                    ticks: { font: { family: 'Kanit', size: 10 } } 
                } 
            },
            plugins: { 
                legend: { 
                    display: true, 
                    position: 'bottom', 
                    labels: { 
                        usePointStyle: true, 
                        boxWidth: 6, 
                        font: { family: 'Kanit', size: 10 },
                        filter: item => !item.text.includes('Target')
                    } 
                }, 
                tooltip: { 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    titleFont: { family: 'Kanit' }, 
                    bodyFont: { family: 'Kanit' },
                    callbacks: {
                        label: (c) => {
                            const val = c.raw;
                            if (val === null) return 'No Data';
                            const status = val <= target ? 'Safe' : 'Warning';
                            return ` Value: ${val} | ${status}`;
                        }
                    }
                } 
            }
        }
    });
}

function createKpiMetricCard(kpi, isAdmin) {
    const chartId = `kpi-chart-${kpi.id}`;
    // ✅ ซ่อนปุ่มแก้ไข/ลบ ถ้าไม่ใช่ Admin
    const adminButtons = isAdmin ? `
        <div class="absolute top-4 right-4 flex gap-1 bg-white p-1 rounded-lg shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10 transform scale-95 group-hover:scale-100 duration-200">
            <button data-id="${kpi.id}" class="btn-edit-kpi p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button data-id="${kpi.id}" class="btn-delete-kpi p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
        </div>` : '';

    return `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-blue-300 transition-all duration-300 relative group">
            ${adminButtons}
            <div class="mb-4 pr-10">
                <div class="flex items-center gap-2 mb-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                        ${kpi.Department || 'General'}
                    </span>
                </div>
                <h3 class="font-bold text-lg text-slate-800 leading-snug truncate" title="${kpi.Metric}">${kpi.Metric}</h3>
                <div class="mt-1 text-sm text-slate-500">
                    Target Limit: <span class="font-bold text-amber-500">${parseFloat(kpi.Target).toLocaleString()}</span> <span class="text-xs text-slate-400">${kpi.Unit || ''}</span>
                </div>
            </div>
            <div class="h-48 w-full"><canvas id="${chartId}"></canvas></div>
        </div>
    `;
}

function setupKpiEventListeners() {
    document.addEventListener('click', async (event) => {
        if (!event.target.closest('#kpi-page') && !event.target.closest('#modal-container')) return;
        const target = event.target;
        
        if (target.closest('#btn-add-kpi')) { 
            if (!currentAnnouncementId) { showToast('⚠️ Please create an announcement for this year first.', 'error'); return; }
            showKpiForm(null, currentAnnouncementId); return; 
        }

        if (target.closest('#btn-manage-anns')) { showAnnouncementManager(); return; }

        const editBtn = target.closest('.btn-edit-kpi');
        if (editBtn) {
            const kpi = allKpiDataForYear.find(k => String(k.id) === String(editBtn.dataset.id));
            if (kpi) showKpiForm(kpi); return;
        }

        const deleteBtn = target.closest('.btn-delete-kpi');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const kpiName = allKpiDataForYear.find(k => String(k.id) === String(id))?.Metric || 'Item';
            const confirmed = await showConfirmationModal('Confirm Deletion', `Delete metric "${kpiName}"?`);
            if (confirmed) handleDeleteKpi(id); return;
        }

        const viewDocBtn = target.closest('[data-action="view-doc"]');
        if (viewDocBtn) {
            event.preventDefault();
            showDocumentModal(viewDocBtn.href, viewDocBtn.dataset.title || 'Document'); return;
        }
        
        if (target.closest('#btn-export-excel')) { handleExportExcel(); return; }
        if (target.closest('#btn-import-excel')) {
            if (!currentAnnouncementId) { showToast('⚠️ Create an announcement first.', 'error'); return; }
            document.getElementById('kpi-file-import').click(); return;
        }

        if (target.matches('#btn-add-ann-modal')) showAnnouncementForm();
    });

    document.addEventListener('change', async (e) => {
        if (e.target.id === 'kpi-file-import') {
            const file = e.target.files[0];
            if (file) handleImportExcel(file);
            e.target.value = '';
        }
    });
}

function handleExportExcel() {
    if (!allKpiDataForYear || allKpiDataForYear.length === 0) {
        const emptyData = [{ Metric: "Accident Rate", Department: "Safety", Unit: "Cases", Target: 0, Jan: 0, Feb: 0 }];
        const ws = XLSX.utils.json_to_sheet(emptyData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "KPI_Template");
        XLSX.writeFile(wb, "KPI_Template.xlsx");
        return;
    }
    const cleanData = allKpiDataForYear.map(item => {
        const { id, AnnouncementID, CreatedAt, UpdatedAt, Year, ...rest } = item;
        return rest;
    });
    const ws = XLSX.utils.json_to_sheet(cleanData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPI_Data");
    XLSX.writeFile(wb, `KPI_Export_${new Date().getFullYear()}.xlsx`);
}

async function handleImportExcel(file) {
    showLoading('Importing Data...');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (!currentAnnouncementId) throw new Error('Announcement ID not found.');

        const year = document.getElementById('kpi-year-select').value;
        let successCount = 0;

        for (const row of jsonData) {
            const payload = {
                AnnouncementID: currentAnnouncementId,
                Year: year,
                Metric: row.Metric || 'New KPI',
                Department: row.Department || '',
                Unit: row.Unit || '',
                Target: row.Target || 0,
                Jan: row.Jan, Feb: row.Feb, Mar: row.Mar, Apr: row.Apr, May: row.May, Jun: row.Jun,
                Jul: row.Jul, Aug: row.Aug, Sep: row.Sep, Oct: row.Oct, Nov: row.Nov, Dec: row.Dec
            };
            await apiFetch('/kpidata', { method: 'POST', body: payload });
            successCount++;
        }

        showToast(`Successfully imported ${successCount} items.`);
        loadKpiPage(year);

    } catch (error) {
        showError(error);
    } finally {
        hideLoading();
    }
}

async function showAnnouncementManager() {
    openModal('Announcement Management', '<div id="ann-list-content">Loading...</div>', 'max-w-4xl');
    try {
        const announcements = await apiFetch('/kpiannouncements');
        const contentEl = document.getElementById('ann-list-content');
        const addBtn = `<div class="text-right mb-4"><button id="btn-add-ann-modal" class="btn btn-primary text-sm shadow-sm">+ New Announcement</button></div>`;
        const listHtml = announcements.map(ann => `
            <div class="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-xl mb-3 shadow-sm hover:shadow-md transition-all">
                <div>
                    <div class="font-bold text-slate-800 text-lg">${ann.AnnouncementTitle}</div>
                    <div class="text-sm text-slate-500 mt-1 flex items-center gap-2">
                        <span class="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">FY ${new Date(ann.EffectiveDate).getFullYear()}</span>
                        ${ann.IsCurrent ? '<span class="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs font-bold border border-green-100">Current Active</span>' : '<span class="text-slate-400 text-xs">Archived</span>'}
                    </div>
                </div>
                <div class="flex gap-2">
                    ${!ann.IsCurrent ? `<button class="btn btn-sm btn-white border border-slate-300 text-slate-600 hover:bg-slate-50 btn-set-curr-ann" data-id="${ann.id}">Set Active</button>` : ''}
                    <button class="btn btn-sm btn-white border border-red-200 text-red-500 hover:bg-red-50 btn-del-ann" data-id="${ann.id}">Delete</button>
                </div>
            </div>`).join('');
        contentEl.innerHTML = addBtn + (listHtml || '<div class="text-center text-slate-400 py-8">No announcements found.</div>');

        document.getElementById('btn-add-ann-modal').addEventListener('click', showAnnouncementForm);
        contentEl.querySelectorAll('.btn-del-ann').forEach(btn => btn.addEventListener('click', async () => { 
            if(confirm('Delete this announcement?')) { 
                await apiFetch(`/kpiannouncements/${btn.dataset.id}`, { method: 'DELETE' }); 
                showAnnouncementManager(); loadKpiPage(); 
            } 
        }));
        contentEl.querySelectorAll('.btn-set-curr-ann').forEach(btn => btn.addEventListener('click', async () => { 
            const annToUpdate = announcements.find(a => String(a.id) === String(btn.dataset.id));
            if(annToUpdate) {
                const updatedData = { ...annToUpdate, IsCurrent: 1 };
                await apiFetch(`/kpiannouncements/${btn.dataset.id}`, { method: 'PUT', body: updatedData }); 
                showAnnouncementManager(); loadKpiPage();
            }
        }));
    } catch (e) { document.getElementById('ann-list-content').innerHTML = `<span class="text-red-500">Error: ${e.message}</span>`; }
}

function showAnnouncementForm() {
    const html = `
        <form id="ann-form" class="space-y-5 px-1">
            <div><label class="block text-sm font-bold text-slate-700 mb-1">Title *</label><input type="text" name="AnnouncementTitle" class="form-input w-full rounded-lg" required placeholder="e.g., Safety Goals 2024"></div>
            <div><label class="block text-sm font-bold text-slate-700 mb-1">Effective Date</label><input type="text" id="ann-date" name="EffectiveDate" class="form-input w-full rounded-lg" required></div>
            <div><label class="block text-sm font-bold text-slate-700 mb-1">Document Link (Optional)</label><input type="text" name="DocumentLink" class="form-input w-full rounded-lg" placeholder="https://..."></div>
            <div class="flex items-center gap-2 pt-2"><input type="checkbox" name="IsCurrent" id="is-curr-ann" class="rounded text-blue-600 focus:ring-blue-500"> <label for="is-curr-ann" class="text-sm font-medium text-slate-700">Set as Current Active Announcement</label></div>
            <div class="text-right pt-4 border-t"><button type="submit" class="btn btn-primary px-6">Create</button></div>
        </form>`;
    openModal('Create New Announcement', html, 'max-w-lg');
    flatpickr("#ann-date", { locale: "th", dateFormat: "Y-m-d", defaultDate: "today" });

    document.getElementById('ann-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.IsCurrent = e.target.querySelector('[name="IsCurrent"]').checked ? 1 : 0;
        try {
            await apiFetch('/kpiannouncements', { method: 'POST', body: data });
            closeModal(); showAnnouncementManager(); loadKpiPage();
        } catch (err) { showError(err); }
    });
}

function showKpiForm(kpi = null, announcementId = null) {
    const isEditing = kpi !== null;
    const title = isEditing ? 'Edit KPI Metric' : 'Add New KPI Metric';
    
    const yearSelect = document.getElementById('kpi-year-select');
    const selectedYear = kpi?.Year || (yearSelect ? yearSelect.value : new Date().getFullYear());
    const annIdToUse = kpi?.AnnouncementID || announcementId;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const monthlyInputs = months.map((month) => {
        const value = kpi?.[month];
        return `
        <div class="flex flex-col">
            <label class="text-[10px] font-bold text-slate-400 uppercase mb-1 pl-1">${month}</label>
            <input type="number" step="any" name="${month}" class="form-input w-full text-sm rounded-lg border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center" value="${value ?? ''}" placeholder="-">
        </div>`;
    }).join('');

    const formHtml = `
        <form id="kpi-form" novalidate class="space-y-6">
            <input type="hidden" name="id" value="${kpi?.id || ''}">
            <input type="hidden" name="Year" value="${selectedYear}">
            <input type="hidden" name="AnnouncementID" value="${annIdToUse || ''}">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Metric Name *</label><input type="text" name="Metric" class="form-input w-full rounded-lg font-medium" value="${kpi?.Metric || ''}" required placeholder="e.g., Zero Accident"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Department</label><input type="text" name="Department" class="form-input w-full rounded-lg" value="${kpi?.Department || ''}" placeholder="e.g., Safety"></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Unit</label><input type="text" name="Unit" class="form-input w-full rounded-lg" value="${kpi?.Unit || ''}" placeholder="e.g., Cases"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Target Limit (Max Allowed) *</label><input type="number" step="any" name="Target" class="form-input w-full rounded-lg border-amber-200 focus:border-amber-500 bg-amber-50/30 font-bold text-amber-700" value="${kpi?.Target || ''}" required></div>
            </div>
            
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label class="block text-sm font-bold mb-3 text-slate-700 flex items-center gap-2">
                    <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    Monthly Data (Actual)
                </label>
                <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">${monthlyInputs}</div>
            </div>

            <div class="flex justify-end gap-3 pt-2 border-t">
                <button type="button" class="btn px-5 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium transition-colors" onclick="document.getElementById('modal-close-btn').click()">Cancel</button>
                <button type="submit" class="btn px-6 py-2.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 font-bold shadow-md transition-colors" id="btn-submit-kpi">Save KPI</button>
            </div>
        </form>`;
    openModal(title, formHtml, 'max-w-4xl');
    document.getElementById('kpi-form').addEventListener('submit', handleKpiFormSubmit);
}

async function handleKpiFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.Metric.value || !form.Target.value) return showToast('Metric Name and Target are required.', 'error');
    
    const submitBtn = document.getElementById('btn-submit-kpi');
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>Saving...';
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    if (!data.AnnouncementID) { showToast('Missing Announcement ID', 'error'); submitBtn.disabled = false; return; }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach(m => { if (data[m] === '') data[m] = null; });
    
    const method = data.id ? 'PUT' : 'POST';
    const endpoint = data.id ? `/kpidata/${data.id}` : '/kpidata';
    
    try {
        await apiFetch(endpoint, { method: method, body: data });
        closeModal(); await loadKpiPage(data.Year); showToast('KPI Saved Successfully', 'success');
    } catch (error) { showError(error); } finally { if(submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save KPI'; } }
}

async function handleDeleteKpi(kpiId) {
    hideLoading(); showLoading('Deleting...');
    try {
        await apiFetch(`/kpidata/${kpiId}`, { method: 'DELETE' });
        await loadKpiPage(document.getElementById('kpi-year-select')?.value);
        showToast('KPI Deleted');
    } catch (error) { showError(error); } finally { hideLoading(); }
}