import { showLoading, hideLoading, showToast, showError } from '../ui.js';
import { API } from '../api.js';

// --- 🎨 GLOBAL STATE ---
let currentTab = 'scheduler';
let allEmployeesCache = [];
let calendarInstance = null; // เก็บตัวแปรปฏิทิน
let currentViewMode = 'list'; // 'list' หรือ 'calendar'

export async function loadAdminPage() {
    const container = document.getElementById('admin-page');

    // 1. HEADER & NAVIGATION
    const headerHtml = `
        <div class="mb-8 animate-fade-in">
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <svg class="w-7 h-7 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        System Console
                    </h1>
                    <p class="text-sm text-slate-500 mt-1">ศูนย์ควบคุมการตั้งค่าระบบและจัดตารางเวร</p>
                </div>
                
                <div class="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button id="tab-btn-scheduler" onclick="switchAdminTab('scheduler')" class="px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2">Schedule</button>
                    <button id="tab-btn-master" onclick="switchAdminTab('master')" class="px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2">Master Data</button>
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

    // Expose Functions
    window.switchAdminTab = renderTabContent;
    window.addMasterData = addMasterData;
    window.deleteMasterData = deleteMasterData;
    window.deleteSchedule = deleteSchedule;
    window.filterEmployeesInTeam = filterEmployeesInTeam;
    window.updateSelectedCount = updateSelectedCount;
    window.loadSchedules = loadSchedules; // สำคัญสำหรับปุ่ม Filter
    window.toggleViewMode = toggleViewMode; // ปุ่มสลับมุมมอง

    renderTabContent('scheduler');
}

async function renderTabContent(tabName) {
    currentTab = tabName;
    const contentArea = document.getElementById('admin-content-area');
    const activeClass = "bg-white text-slate-800 shadow-sm";
    const inactiveClass = "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50";

    document.getElementById('tab-btn-scheduler').className = `px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${tabName === 'scheduler' ? activeClass : inactiveClass}`;
    document.getElementById('tab-btn-master').className = `px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${tabName === 'master' ? activeClass : inactiveClass}`;

    contentArea.innerHTML = '<div class="flex justify-center py-20"><span class="loading-spinner w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></span></div>';

    if (tabName === 'scheduler') await renderScheduler(contentArea);
    else await renderMasterData(contentArea);
}

// ===================== SCHEDULER =====================
async function renderScheduler(container) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
            
            <div class="lg:col-span-4 space-y-6">
                <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-200 sticky top-6">
                    <h3 class="font-bold text-slate-800 mb-4 border-b pb-2">Assign Team</h3>
                    <form id="form-scheduler" onsubmit="return false;" class="space-y-6">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-2">1. Select Date</label>
                            <input type="date" name="ScheduledDate" class="form-input w-full rounded-lg border-slate-300" required>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-2">2. Allocate Teams</label>
                            <div id="team-allocator-container" class="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">Loading...</div>
                        </div>
                        <button id="btn-save-schedule" class="w-full btn bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all">
                            Confirm Schedule
                        </button>
                    </form>
                </div>
            </div>

            <div class="lg:col-span-8">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    
                    <div class="flex items-center gap-2">
                        <select id="filter-month" onchange="loadSchedules()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8 font-medium text-slate-700 bg-slate-50 focus:ring-indigo-500">
                            ${Array.from({length: 12}, (_, i) => {
                                const m = i + 1;
                                return `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${new Date(0, i).toLocaleString('en-US', {month: 'long'})}</option>`;
                            }).join('')}
                        </select>
                        <select id="filter-year" onchange="loadSchedules()" class="form-select text-sm border-slate-200 rounded-lg py-1.5 pl-3 pr-8 font-medium text-slate-700 bg-slate-50 focus:ring-indigo-500">
                            ${[currentYear-1, currentYear, currentYear+1].map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
                        </select>
                    </div>

                    <div class="flex bg-slate-100 p-1 rounded-lg">
                        <button onclick="toggleViewMode('list')" id="btn-view-list" class="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all bg-white shadow-sm text-slate-800">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> List
                        </button>
                        <button onclick="toggleViewMode('calendar')" id="btn-view-calendar" class="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all text-slate-500 hover:text-slate-700">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> Calendar
                        </button>
                    </div>
                </div>

                <div id="scheduler-content-wrapper" class="relative">
                    <div id="list-view-container" class="space-y-4 animate-fade-in">
                        <div class="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">Loading...</div>
                    </div>
                    
                    <div id="calendar-view-container" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                        <div id="calendar"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    await Promise.all([loadTeamsAndEmployees(), loadSchedules()]);
    setupSchedulerEvents();
}

// 🔄 Toggle View Logic
window.toggleViewMode = (mode) => {
    currentViewMode = mode;
    const listContainer = document.getElementById('list-view-container');
    const calContainer = document.getElementById('calendar-view-container');
    const btnList = document.getElementById('btn-view-list');
    const btnCal = document.getElementById('btn-view-calendar');
    
    // Style Update
    const activeClass = "bg-white shadow-sm text-slate-800";
    const inactiveClass = "text-slate-500 hover:text-slate-700";

    if(mode === 'list') {
        listContainer.classList.remove('hidden');
        calContainer.classList.add('hidden');
        btnList.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${activeClass}`;
        btnCal.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${inactiveClass}`;
    } else {
        listContainer.classList.add('hidden');
        calContainer.classList.remove('hidden');
        btnList.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${inactiveClass}`;
        btnCal.className = `px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${activeClass}`;
        
        // Render Calendar if not already rendered
        // Note: FullCalendar needs to be rendered when visible
        setTimeout(() => {
            if(calendarInstance) calendarInstance.render(); 
            else loadSchedules(); // Force reload to init calendar
        }, 100);
    }
}

// 📦 Load Teams & Employees (เหมือนเดิม)
async function loadTeamsAndEmployees() {
    const container = document.getElementById('team-allocator-container');
    try {
        const [teamsRes, empsRes] = await Promise.all([
            API.get('/master/teams'),
            API.get('/employees')
        ]);

        allEmployeesCache = (empsRes.success || Array.isArray(empsRes.data)) ? (empsRes.data || empsRes) : [];
        if (!Array.isArray(allEmployeesCache)) allEmployeesCache = [];

        if (teamsRes.data.length > 0) {
            container.innerHTML = teamsRes.data.map(team => {
                const teamIdSafe = team.Name.replace(/\s+/g, '-');
                return `
                <div class="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 transition-all team-card" data-team-name="${team.Name}" data-team-id="${teamIdSafe}">
                    <div class="p-3 bg-white flex items-center justify-between cursor-pointer" onclick="document.getElementById('body-${teamIdSafe}').classList.toggle('hidden');">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" class="team-checkbox w-5 h-5 text-indigo-600 rounded" value="${team.Name}" onclick="event.stopPropagation()">
                            <div>
                                <span class="font-bold text-slate-700 text-sm">${team.Name}</span>
                                <span id="count-badge-${teamIdSafe}" class="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full hidden">0 selected</span>
                            </div>
                        </div>
                        <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                    <div id="body-${teamIdSafe}" class="hidden border-t border-slate-100 bg-white p-3">
                        <input type="text" placeholder="Search..." class="w-full text-xs border-slate-200 rounded mb-2" onkeyup="filterEmployeesInTeam(this, '${teamIdSafe}')">
                        <div class="max-h-[150px] overflow-y-auto space-y-1 custom-scrollbar member-list-${teamIdSafe}">
                            ${renderEmployeeCheckboxes(teamIdSafe)}
                        </div>
                    </div>
                </div>`;
            }).join('');
        } else { container.innerHTML = `<div class="text-center text-xs">No teams found.</div>`; }
    } catch (err) { container.innerHTML = `Error loading data`; }
}

function renderEmployeeCheckboxes(teamIdSafe) {
    return allEmployeesCache.map(emp => `
        <label class="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
            <input type="checkbox" name="members-${teamIdSafe}" value="${emp.EmployeeID}" class="w-3.5 h-3.5 text-indigo-500 rounded" onchange="updateSelectedCount('${teamIdSafe}')">
            <div class="flex-1 min-w-0"><div class="text-xs font-medium truncate">${emp.EmployeeName}</div></div>
        </label>
    `).join('');
}

window.updateSelectedCount = (teamIdSafe) => {
    const count = document.querySelectorAll(`input[name="members-${teamIdSafe}"]:checked`).length;
    const badge = document.getElementById(`count-badge-${teamIdSafe}`);
    const teamCheckbox = document.querySelector(`.team-card[data-team-id="${teamIdSafe}"] .team-checkbox`);
    if (badge) {
        badge.innerText = `${count} selected`;
        badge.classList.remove('hidden');
        if(count === 0) badge.classList.add('hidden');
    }
    if (teamCheckbox && count > 0) teamCheckbox.checked = true;
};

window.filterEmployeesInTeam = (input, teamIdSafe) => {
    const filter = input.value.toLowerCase();
    document.querySelectorAll(`.member-list-${teamIdSafe} label`).forEach(label => {
        label.style.display = label.textContent.toLowerCase().includes(filter) ? "flex" : "none";
    });
};

// 📅 Load Schedules (List & Calendar)
async function loadSchedules() {
    const listContainer = document.getElementById('list-view-container');
    const month = document.getElementById('filter-month').value;
    const year = document.getElementById('filter-year').value;

    try {
        // ส่ง params ไป Backend
        const res = await API.get(`/admin/schedules?month=${month}&year=${year}`);
        const data = (res.success) ? res.data : [];

        // 1. Render List View
        if (data.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-16 text-slate-400 border border-dashed rounded-xl bg-slate-50">No schedules for ${month}/${year}</div>`;
        } else {
            const grouped = data.reduce((acc, curr) => {
                const d = curr.ScheduledDate.split('T')[0];
                if (!acc[d]) acc[d] = [];
                acc[d].push(curr);
                return acc;
            }, {});

            listContainer.innerHTML = Object.entries(grouped)
                .sort((a, b) => new Date(b[0]) - new Date(a[0])) // เรียงจากวันที่ล่าสุด (ในเดือนนั้น) ลงมา
                .map(([date, items]) => {
                    const dObj = new Date(date);
                    const fullDate = dObj.toLocaleDateString('th-TH', { dateStyle: 'long' });
                    return `
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div class="flex gap-4 mb-3 border-b pb-2">
                            <div class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded text-center border border-indigo-100">
                                <div class="text-xs font-bold uppercase">${dObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                                <div class="text-xl font-bold">${dObj.getDate()}</div>
                            </div>
                            <div><h4 class="font-bold text-slate-800">${fullDate}</h4><p class="text-xs text-slate-500">${items.length} Teams</p></div>
                        </div>
                        <div class="space-y-2">
                            ${items.map(item => `
                                <div class="bg-slate-50 p-2 rounded border border-slate-100 flex justify-between items-start">
                                    <div>
                                        <div class="font-bold text-sm text-slate-700">${item.TeamName}</div>
                                        <div class="text-xs text-slate-500 mt-1">
                                            ${item.Members ? item.Members.split(',').map(m => `<span class="inline-block bg-white border px-1 rounded mr-1 mb-1 shadow-sm">${m.trim()}</span>`).join('') : '<span class="italic text-slate-400">No members</span>'}
                                        </div>
                                    </div>
                                    <button onclick="deleteSchedule(${item.ScheduleID})" class="text-slate-300 hover:text-red-500 p-1"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
                }).join('');
        }

        // 2. Render Calendar View
        initCalendar(data);

    } catch (err) { console.error(err); }
}

function initCalendar(eventsData) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || !window.FullCalendar) return;

    // Transform Data for FullCalendar
    const events = eventsData.map(item => ({
        title: item.TeamName,
        start: item.ScheduledDate.split('T')[0],
        extendedProps: { members: item.Members, id: item.ScheduleID },
        backgroundColor: '#4f46e5', // Indigo-600
        borderColor: '#4338ca'
    }));

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: false, // ซ่อน Toolbar เดิม เพราะเรามี Dropdown ของเราเองแล้ว
        initialDate: `${document.getElementById('filter-year').value}-${document.getElementById('filter-month').value.padStart(2,'0')}-01`,
        height: 'auto',
        events: events,
        eventClick: function(info) {
            alert(`Team: ${info.event.title}\nMembers: ${info.event.extendedProps.members || 'None'}`);
        }
    });

    calendarInstance.render();
}

function setupSchedulerEvents() {
    const btnSave = document.getElementById('btn-save-schedule');
    const form = document.getElementById('form-scheduler');
    const newBtn = btnSave.cloneNode(true);
    btnSave.parentNode.replaceChild(newBtn, btnSave);

    newBtn.onclick = async () => {
        // ✅ 1. ย้ายตัวแปรนี้ออกมานอก try เพื่อให้ finally มองเห็น
        const originalContent = newBtn.innerHTML; 
        
        try {
            const dateInput = form.querySelector('input[name="ScheduledDate"]');
            const date = dateInput.value;
            const allocations = [];

            // ... (Logic วนลูปหา Team และ Member เหมือนเดิม ไม่ต้องแก้) ...
            document.querySelectorAll('.team-card').forEach(card => {
                const cb = card.querySelector('.team-checkbox');
                if (cb.checked) {
                    const teamName = cb.value;
                    const teamIdSafe = card.dataset.teamId || card.dataset.teamName.replace(/\s+/g, '-');
                    const members = Array.from(card.querySelectorAll(`input[name="members-${teamIdSafe}"]:checked`)).map(c => c.value);
                    allocations.push({ TeamName: teamName, MemberIDs: members });
                }
            });

            if (!date) return showToast('Please select a date', 'error');
            if (allocations.length === 0) return showToast('Select at least one team', 'error');

            newBtn.disabled = true;
            newBtn.innerHTML = `Saving...`;

            await API.post('/admin/schedule/create', {
                ScheduledDate: date,
                Allocations: allocations
            });

            showToast('Success', 'success');
            loadSchedules();
            
            // Reset Form
            dateInput.value = '';
            document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
            document.querySelectorAll('[id^="count-badge-"]').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('div[id^="body-"]').forEach(el => el.classList.add('hidden'));

        } catch (err) {
            showError(err.message);
        } finally {
            // ✅ 2. ตอนนี้เรียกใช้ originalContent ได้แล้ว ไม่ error
            newBtn.disabled = false;
            newBtn.innerHTML = originalContent; 
        }
    };
}

window.deleteSchedule = async (id) => {
    if(!confirm('Delete this item?')) return;
    try {
        const res = await API.delete(`/admin/schedule/${id}`);
        if(res.success) { showToast('Deleted', 'success'); loadSchedules(); }
        else showError(res.message);
    } catch(err) { showError(err); }
};

// ==========================================
// 💾 TAB: MASTER DATA (ส่วนนี้เหมือนเดิม)
// ==========================================
async function renderMasterData(container) {
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
            ${renderMasterCard('departments', 'Departments', 'แผนก')}
            ${renderMasterCard('teams', 'Teams', 'ทีม (สำหรับจัดเวร)')}
            ${renderMasterCard('positions', 'Positions', 'ตำแหน่ง (สำหรับพนักงาน)')} 
            ${renderMasterCard('roles', 'System Roles', 'สิทธิ์การใช้งาน')}
        </div>
    `;

    loadMasterList('departments');
    loadMasterList('teams');
    loadMasterList('positions');
    loadMasterList('roles');
}

function renderMasterCard(type, title, subtitle) {
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
        const res = await API.get(`/master/${type}`);
        if (!res.success) throw new Error(res.message);
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
        const res = await API.post(`/master/${type}`, { Name: name });
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
        const res = await API.delete(`/master/${type}/${id}`);
        if(res.success) { 
            showToast('Deleted successfully', 'success'); 
            loadMasterList(type); 
        } else {
            showError(res.message);
        }
    } catch(err) { showError(err); }
}

// ✅ เพิ่มฟังก์ชันนี้ไว้ท้ายไฟล์
window.printScheduleReport = () => {
    // 1. เปลี่ยน Title ชั่วคราว (เพื่อเป็นชื่อไฟล์ตอน Save PDF)
    const originalTitle = document.title;
    const today = new Date().toISOString().split('T')[0];
    document.title = `Patrol_Schedule_Report_${today}`;

    // 2. เรียกคำสั่ง Print
    window.print();

    // 3. คืนค่า Title เดิม
    document.title = originalTitle;
};