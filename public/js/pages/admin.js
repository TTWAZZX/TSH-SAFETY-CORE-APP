import { showLoading, hideLoading, showToast, showError } from '../ui.js';
import { apiFetch } from '../api.js';

// --- 🎨 GLOBAL STATE ---
let currentTab = 'scheduler';

export async function loadAdminPage() {
    const container = document.getElementById('admin-page');

    // 1. HEADER & NAVIGATION (Professional Style)
    const headerHtml = `
        <div class="mb-8 animate-fade-in">
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <svg class="w-7 h-7 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        System Console
                    </h1>
                    <p class="text-sm text-slate-500 mt-1">
                        ศูนย์ควบคุมการตั้งค่าระบบและจัดตารางเวร (Configuration & Scheduler)
                    </p>
                </div>
                
                <div class="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button id="tab-btn-scheduler" onclick="switchAdminTab('scheduler')" class="px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        Schedule
                    </button>
                    <button id="tab-btn-master" onclick="switchAdminTab('master')" class="px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>
                        Master Data
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="p-6 max-w-7xl mx-auto">
            ${headerHtml}
            <div id="admin-content-area" class="relative min-h-[500px]"></div>
        </div>
    `;

    // Expose functions to window
    window.switchAdminTab = renderTabContent;
    window.addMasterData = addMasterData;
    window.deleteMasterData = deleteMasterData;
    window.deleteSchedule = deleteSchedule; // For Scheduler

    // Start at Scheduler
    renderTabContent('scheduler');
}

// --- 🔄 TAB RENDER LOGIC ---
async function renderTabContent(tabName) {
    currentTab = tabName;
    const contentArea = document.getElementById('admin-content-area');
    
    // Update Tab Styles
    const activeClass = "bg-white text-slate-800 shadow-sm";
    const inactiveClass = "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50";

    const btnScheduler = document.getElementById('tab-btn-scheduler');
    const btnMaster = document.getElementById('tab-btn-master');

    if(btnScheduler) btnScheduler.className = `px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${tabName === 'scheduler' ? activeClass : inactiveClass}`;
    if(btnMaster) btnMaster.className = `px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${tabName === 'master' ? activeClass : inactiveClass}`;

    contentArea.innerHTML = '<div class="flex justify-center py-20"><span class="loading-spinner w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></span></div>';

    if (tabName === 'scheduler') await renderScheduler(contentArea);
    else await renderMasterData(contentArea);
}

// ==========================================
// 📅 TAB: SCHEDULER (Logic เดิม แต่เปลี่ยน UI)
// ==========================================
async function renderScheduler(container) {
    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
            
            <div class="lg:col-span-4 space-y-6">
                <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-200 sticky top-6">
                    <div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                        <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800">Create Schedule</h3>
                            <p class="text-xs text-slate-500">กำหนดวันและทีมเดินตรวจ</p>
                        </div>
                    </div>

                    <form id="form-scheduler" onsubmit="return false;" class="space-y-5">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Select Date</label>
                            <input type="date" name="ScheduledDate" class="form-input w-full rounded-lg border-slate-300 text-sm focus:ring-blue-500 focus:border-blue-500" required>
                        </div>
                        
                        <div>
                            <div class="flex justify-between items-end mb-2">
                                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide">Select Teams</label>
                                <button onclick="loadTeamsForCheckbox()" class="text-[10px] text-blue-600 hover:underline font-medium">Refresh List</button>
                            </div>
                            <div id="checkbox-teams" class="space-y-1 max-h-[300px] overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200 custom-scrollbar">
                                <div class="text-center py-8 text-slate-400 text-xs">Loading teams...</div>
                            </div>
                        </div>

                        <button id="btn-save-schedule" class="w-full btn bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-lg shadow-md transition-all font-medium text-sm">
                            Save Schedule
                        </button>
                    </form>
                </div>
            </div>

            <div class="lg:col-span-8">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="font-bold text-lg text-slate-800 flex items-center gap-2">
                        Upcoming Schedules
                        <span id="schedule-count" class="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">0</span>
                    </h3>
                    <button onclick="loadSchedules()" class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        Refresh
                    </button>
                </div>

                <div id="list-schedules" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div class="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                        Loading data...
                     </div>
                </div>
            </div>
        </div>
    `;

    await loadTeamsForCheckbox();
    await loadSchedules();
    setupSchedulerEvents();
}

async function loadTeamsForCheckbox() {
    const teamContainer = document.getElementById('checkbox-teams');
    try {
        const res = await apiFetch('/master/teams'); 
        if(res.success && res.data.length > 0) {
            teamContainer.innerHTML = res.data.map(t => `
                <label class="flex items-center gap-3 p-2 rounded hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200 group">
                    <input type="checkbox" name="Teams" value="${t.Name}" 
                           class="form-checkbox h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500">
                    <span class="text-sm font-medium text-slate-600 group-hover:text-slate-800">${t.Name}</span>
                </label>
            `).join('');
        } else {
             teamContainer.innerHTML = `<div class="text-center py-4 text-xs text-slate-400">No teams found. Add in Master Data.</div>`;
        }
    } catch (err) { 
        teamContainer.innerHTML = `<div class="text-center text-red-400 text-xs py-4">Error loading teams</div>`;
    }
}

async function loadSchedules() {
    const listContainer = document.getElementById('list-schedules');
    const countEl = document.getElementById('schedule-count');

    try {
        const res = await apiFetch('/admin/schedules'); 
        
        if(!res.success || res.data.length === 0) {
            listContainer.innerHTML = `
                <div class="col-span-full py-16 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <svg class="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <p class="font-medium text-sm">No Active Schedules</p>
                </div>`;
            if(countEl) countEl.innerText = "0";
            return;
        }

        const grouped = res.data.reduce((acc, curr) => {
            const date = curr.ScheduledDate.split('T')[0];
            if(!acc[date]) acc[date] = [];
            acc[date].push(curr);
            return acc;
        }, {});

        if(countEl) countEl.innerText = Object.keys(grouped).length;

        listContainer.innerHTML = Object.entries(grouped)
            .sort((a, b) => new Date(b[0]) - new Date(a[0]))
            .map(([date, items]) => {
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const fullDate = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
                
                return `
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-4">
                            <div class="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-center min-w-[60px] border border-blue-100">
                                <div class="text-[10px] font-bold uppercase tracking-wider">${dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                                <div class="text-xl font-bold leading-none">${dateObj.getDate()}</div>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm">${dayName}</h4>
                                <p class="text-xs text-slate-500">${fullDate}</p>
                            </div>
                        </div>
                        <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            ${items.length} Teams
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${items.map(item => `
                            <div class="relative flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded text-xs font-medium text-slate-600 border border-slate-200 group/item hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all cursor-default">
                                <span>${item.TeamName}</span>
                                <button onclick="deleteSchedule(${item.ScheduleID})" class="ml-1 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 hover:bg-red-200 rounded-full" title="Remove Team">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `}).join('');

    } catch (err) { 
        console.error(err);
    }
}

function setupSchedulerEvents() {
    const btnSave = document.getElementById('btn-save-schedule');
    const form = document.getElementById('form-scheduler');
    
    const newBtn = btnSave.cloneNode(true);
    btnSave.parentNode.replaceChild(newBtn, btnSave);

    newBtn.onclick = async () => {
        const dateInput = form.querySelector('input[name="ScheduledDate"]');
        const date = dateInput.value;
        const selectedTeams = Array.from(document.querySelectorAll('input[name="Teams"]:checked')).map(cb => cb.value);

        if(!date) return showToast('Please select a date', 'error');
        if(selectedTeams.length === 0) return showToast('Please select at least one team', 'error');

        try {
            const originalContent = newBtn.innerHTML;
            newBtn.disabled = true;
            newBtn.innerHTML = `<span class="loading-spinner w-4 h-4 border-white border-t-transparent"></span> Saving...`;

            const res = await apiFetch('/admin/schedule/create', {
                method: 'POST',
                body: { ScheduledDate: date, Teams: selectedTeams }
            });

            if(res.success || res.status === 'success') {
                showToast('Schedule created successfully', 'success');
                loadSchedules();
                dateInput.value = '';
                document.querySelectorAll('input[name="Teams"]').forEach(cb => cb.checked = false);
            } else {
                showError(res.message || 'Error creating schedule');
            }
        } catch(err) {
            showError(err);
        } finally {
            newBtn.disabled = false;
            newBtn.innerHTML = 'Save Schedule';
        }
    };
}

window.deleteSchedule = async (id) => {
    if(!confirm('Are you sure you want to remove this schedule item?')) return;
    try {
        const res = await apiFetch(`/admin/schedule/${id}`, { method: 'DELETE' });
        if(res.success || res.status === 'success') {
            showToast('Item removed', 'success');
            loadSchedules();
        } else {
            showError(res.message);
        }
    } catch(err) { showError(err); }
};


// ==========================================
// 💾 TAB: MASTER DATA
// ==========================================
async function renderMasterData(container) {
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
            ${renderMasterCard('departments', '🏢', 'Departments', 'แผนก')}
            ${renderMasterCard('teams', '👷', 'Teams', 'ทีม (สำหรับจัดเวร)')}
            ${renderMasterCard('positions', '💼', 'Positions', 'ตำแหน่ง (สำหรับพนักงาน)')} ${renderMasterCard('roles', '🔑', 'System Roles', 'สิทธิ์การใช้งาน')}
        </div>
    `;

    loadMasterList('departments');
    loadMasterList('teams');
    loadMasterList('positions'); // โหลดตำแหน่ง
    loadMasterList('roles');
}

function renderMasterCard(type, iconStr, title, subtitle) {
    // Note: iconStr is unused in this Pro version as we use specific SVGs, keeping arg for compatibility
    let svgIcon = '';
    if(type === 'departments') svgIcon = `<svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`;
    else if(type === 'teams') svgIcon = `<svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`;
    else if(type === 'positions') svgIcon = `<svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
    else svgIcon = `<svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>`;

    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="p-1.5 bg-white rounded border border-slate-200 shadow-sm">${svgIcon}</div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">${title}</h3>
                        <p class="text-[10px] text-slate-500">${subtitle}</p>
                    </div>
                </div>
                <span id="count-${type}" class="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500">0</span>
            </div>
            
            <div class="p-3 bg-white border-b border-slate-100">
                <div class="flex gap-2">
                    <input type="text" id="input-${type}" class="form-input w-full pl-3 pr-10 py-1.5 rounded-md text-sm border-slate-300 focus:ring-1 focus:ring-slate-800 focus:border-slate-800" 
                        placeholder="Add new..." onkeypress="if(event.key === 'Enter') addMasterData('${type}')">
                    <button onclick="addMasterData('${type}')" class="px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-bold transition-colors">
                        Add
                    </button>
                </div>
            </div>
            
            <ul id="list-${type}" class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                <li class="text-center text-xs text-slate-400 py-10">Loading...</li>
            </ul>
        </div>
    `;
}

async function loadMasterList(type) {
    const listEl = document.getElementById(`list-${type}`);
    const countEl = document.getElementById(`count-${type}`);
    try {
        const res = await apiFetch(`/master/${type}`);
        if(res.success) {
            if(countEl) countEl.innerText = res.data.length;
            
            if(res.data.length === 0) { 
                listEl.innerHTML = `<li class="text-center text-xs text-slate-300 py-10">No data available</li>`; 
                return; 
            }
            
            listEl.innerHTML = res.data.map((item, index) => `
                <li class="group flex justify-between items-center p-2 hover:bg-slate-50 rounded-md transition-colors border border-transparent hover:border-slate-100">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="text-[10px] text-slate-400 w-4 font-mono">${index + 1}</span>
                        <span class="text-sm font-medium text-slate-700 truncate">${item.Name}</span>
                    </div>
                    <button onclick="deleteMasterData('${type}', ${item.id})" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-red-50 rounded">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </li>
            `).join('');
        }
    } catch(err) { 
        listEl.innerHTML = `<li class="text-center text-red-400 text-xs py-4">Error loading data</li>`; 
    }
}

async function addMasterData(type) {
    const input = document.getElementById(`input-${type}`);
    const name = input.value.trim();
    if(!name) return showToast('Please enter a name', 'error');
    try {
        const res = await apiFetch(`/master/${type}`, { method: 'POST', body: { Name: name } });
        if(res.success) { 
            showToast('Added successfully', 'success'); 
            input.value = ''; 
            loadMasterList(type); 
        } else {
            showError(res.message);
        }
    } catch(err) { showError(err); }
}

async function deleteMasterData(type, id) {
    if(!confirm('Are you sure you want to delete this item?')) return;
    try {
        const res = await apiFetch(`/master/${type}/${id}`, { method: 'DELETE' });
        if(res.success) { 
            showToast('Deleted successfully', 'success'); 
            loadMasterList(type); 
        } else {
            showError(res.message);
        }
    } catch(err) { showError(err); }
}