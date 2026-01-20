import { openModal, closeModal, showLoading, hideLoading, showToast, showError } from '../ui.js';
import { apiFetch } from '../api.js';

const currentUser = JSON.parse(localStorage.getItem('currentUser')) || { name: 'Staff', id: 'EMP001', team: 'Safety Team' };
const isAdmin = (currentUser.role === 'Admin' || currentUser.Role === 'Admin');

// =========================================
// 🚀 MAIN FUNCTION: Load Patrol Page
// =========================================
export async function loadPatrolPage() {
    const container = document.getElementById('patrol-page');

    container.innerHTML = `
        <div class="space-y-6 pb-20 animate-fade-in">
            
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full opacity-50 pointer-events-none"></div>
                
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 border border-slate-200 shadow-inner">
                            <span class="text-xl font-bold">${currentUser.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-slate-800">Welcome, ${currentUser.name}</h2>
                            <p class="text-sm text-slate-500 flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                                ${currentUser.team || 'Safety Team'}
                            </p>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-3">
                        <div id="my-stats-display" class="hidden items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                            <div class="text-center">
                                <span class="block text-xs text-slate-400 uppercase font-bold">Walks</span>
                                <span class="block text-lg font-bold text-blue-600" id="stat-total">0</span>
                            </div>
                            <div class="w-px h-8 bg-slate-200 mx-2"></div>
                            <div class="text-center">
                                <span class="block text-xs text-slate-400 uppercase font-bold">Status</span>
                                <span class="block text-sm font-semibold text-slate-700" id="stat-rank">-</span>
                            </div>
                        </div>

                        <button onclick="openHistoryModal()" class="btn bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 shadow-sm px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            History
                        </button>
                        
                        <button id="btn-checkin" class="btn bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all transform hover:-translate-y-0.5">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Check-in Patrol
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <div class="flex justify-between items-center mb-4 border-b border-slate-200 pb-4">
                    <div>
                        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            Safety Reports
                        </h3>
                        <p class="text-xs text-slate-500 mt-0.5">Latest issues reported by the team</p>
                    </div>
                    <button id="btn-create-issue" class="btn bg-white border border-slate-300 text-slate-700 hover:text-red-600 hover:border-red-200 hover:bg-red-50 px-4 py-2 rounded-lg shadow-sm text-sm font-medium flex items-center gap-2 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        Report Issue
                    </button>
                </div>
                
                <div id="issue-feed-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="col-span-full py-12 text-center text-slate-400">
                        <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-400 border-t-transparent mb-2"></div>
                        <p class="text-sm">Loading reports...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-checkin').addEventListener('click', openCheckInModal);
    document.getElementById('btn-create-issue').addEventListener('click', () => {
        // ใช้ฟังก์ชัน Global ถ้ามี หรือเรียก Modal
        if(window.openCreateIssueModal) window.openCreateIssueModal();
        else showToast('Function openCreateIssueModal not found', 'error');
    });
    
    await loadIssueFeed();
    await loadMyStats();
}

// =========================================
// 📋 FEED: Load Issues
// =========================================
async function loadIssueFeed() {
    const container = document.getElementById('issue-feed-container');
    try {
        const res = await apiFetch('/patrol/issues');
        
        if (!res.success || !res.issues || res.issues.length === 0) {
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                    <div class="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                        <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>
                    <h3 class="text-sm font-bold text-slate-600">No Issues Found</h3>
                    <p class="text-xs text-slate-400 mt-1">Great job maintaining safety!</p>
                </div>`;
            return;
        }
        
        container.innerHTML = res.issues.map(issue => createIssueCard(issue)).join('');

    } catch (e) { 
        console.error(e);
        container.innerHTML = `<div class="col-span-full text-center text-red-500 py-8 text-sm">Failed to load issues</div>`;
    }
}

function createIssueCard(issue) {
    const apiBase = window.API_BASE_URL || 'http://localhost:5000'; // Fallback
    // Helper to fix image path
    const getImgUrl = (path) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        return `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
    };

    const statusConfig = {
        'Open': { color: 'red', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        'Temporary': { color: 'orange', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        'Closed': { color: 'green', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
    };
    const st = statusConfig[issue.CurrentStatus] || statusConfig['Open'];

    return `
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-all flex flex-col">
        <div class="p-4 border-b border-slate-50 flex items-start gap-4">
            <div class="w-16 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-100 relative">
                ${issue.BeforeImage ? 
                    `<img src="${getImgUrl(issue.BeforeImage)}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/100?text=No+Img'">` :
                    `<div class="flex items-center justify-center h-full text-slate-300"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`
                }
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-${st.color}-50 text-${st.color}-700 border border-${st.color}-100">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${st.icon}"/></svg>
                        ${issue.CurrentStatus}
                    </span>
                    <span class="text-[10px] text-slate-400">${new Date(issue.DateFound).toLocaleDateString('th-TH')}</span>
                </div>
                <h4 class="font-bold text-slate-800 text-sm mt-1 truncate" title="${issue.HazardDescription}">${issue.HazardDescription || 'No description'}</h4>
                <div class="text-xs text-slate-500 mt-1 flex items-center gap-1 truncate">
                    <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${issue.Area}
                </div>
            </div>
        </div>

        <div class="mt-auto px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <button onclick='viewIssueDetail(${JSON.stringify(issue).replace(/'/g, "&#39;")})' class="text-xs font-bold text-slate-600 hover:text-blue-600 flex items-center gap-1 transition-colors">
                View Details
            </button>
            ${issue.CurrentStatus !== 'Closed' ? 
                `<button onclick="openUpdateModal(${issue.IssueID}, '${issue.CurrentStatus}')" class="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-md hover:border-blue-300 hover:text-blue-600 shadow-sm transition-all">Update Status</button>` : 
                `<span class="text-xs text-green-600 flex items-center gap-1 font-medium"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Completed</span>`
            }
        </div>
    </div>`;
}

// =========================================
// 📍 PART 3: CHECK-IN SYSTEM
// =========================================
function openCheckInModal() {
    const html = `
        <div class="text-center mb-6">
            <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-blue-100 shadow-inner">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <h3 class="text-lg font-bold text-slate-800">Confirm Patrol Check-in</h3>
            <p class="text-sm text-slate-500">Record your daily safety patrol activity</p>
        </div>
        
        <form id="checkin-form" onsubmit="return false;" class="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Inspector</label>
                    <div class="text-sm font-semibold text-slate-700">${currentUser.name}</div>
                    <input type="hidden" name="UserName" value="${currentUser.name}">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">ID Code</label>
                    <div class="text-sm font-mono text-slate-600">${currentUser.id}</div>
                    <input type="hidden" name="UserID" value="${currentUser.id}">
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Team <span class="text-red-500">*</span></label>
                <input type="text" name="TeamName" class="form-input w-full rounded-md border-slate-300 text-sm font-medium" value="${currentUser.team}" required>
            </div>
        </form>

        <div class="flex justify-end gap-3 mt-6">
            <button type="button" class="btn px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors" onclick="document.getElementById('modal-close-btn').click()">Cancel</button>
            <button type="button" id="btn-confirm-checkin" class="btn px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition-colors">Confirm Check-in</button>
        </div>
    `;
    
    openModal('📍 Patrol Check-in', html, 'max-w-sm');
    
    setTimeout(() => {
        const btnConfirm = document.getElementById('btn-confirm-checkin');
        if(btnConfirm) btnConfirm.onclick = async () => {
            const form = document.getElementById('checkin-form');
            const teamInput = form.querySelector('input[name="TeamName"]');
            if (!teamInput.value.trim()) {
                showToast('Please enter your team name', 'error');
                return;
            }
            
            try {
                showLoading('Recording...');
                const res = await apiFetch('/patrol/checkin', {
                    method: 'POST', 
                    body: Object.fromEntries(new FormData(form).entries())
                });
                
                if (res.success) {
                    hideLoading(); 
                    closeModal(); 
                    updateMyStats(res.data); 
                    showToast('Check-in Successful!', 'success');
                } else {
                    throw new Error(res.message);
                }
            } catch (e) { 
                hideLoading(); 
                showError(e); 
            }
        };
    }, 100);
}

// --- Stats & History Helpers ---
async function loadMyStats() {
    // In a real app, you might fetch this from an API
    // For now, using mock or data from previous check-in if available
    const stats = { totalWalks: 0, rank: '-' }; 
    updateMyStats(stats);
}

function updateMyStats(stats) {
    const totalEl = document.getElementById('stat-total');
    const rankEl = document.getElementById('stat-rank');
    const container = document.getElementById('my-stats-display');

    if (totalEl) {
        totalEl.innerText = stats.totalWalks || 0;
        
        const walks = stats.totalWalks || 0;
        let rankName = "Observer";
        let rankColor = "text-slate-600";
        
        if (walks > 20) { rankName = "Guardian"; rankColor = "text-yellow-600"; }
        else if (walks > 5) { rankName = "Officer"; rankColor = "text-blue-600"; }
        
        if(rankEl) {
            rankEl.innerText = rankName;
            rankEl.className = `block text-sm font-bold ${rankColor}`;
        }

        if(container) {
            container.classList.remove('hidden');
            container.classList.add('flex');
        }
    }
}

// --- History Modal ---
window.openHistoryModal = function() {
    const html = `
        <div class="text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            <svg class="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="text-sm">History feature coming soon...</p>
        </div>
    `;
    openModal('📅 Patrol History', html, 'max-w-md');
}

// --- Issue Details & Update Modal Wrapper ---
// Note: Actual implementation depends on shared modal logic, keeping it simple here
window.openUpdateModal = function(issueId, currentStatus) {
    if(window.openCreateIssueModal) {
        window.openCreateIssueModal();
        // Logic to pre-fill modal would go here, simplified for this snippet
        setTimeout(() => {
            const title = document.getElementById('modal-title');
            if(title) title.innerText = `Update Issue #${issueId}`;
            // Add logic to set ID and Action Type
        }, 100);
    }
}

window.viewIssueDetail = function(issue) {
    const apiBase = window.API_BASE_URL || 'http://localhost:5000';
    const getImg = (path) => path ? (path.startsWith('http') ? path : `${apiBase}${path}`) : null;
    
    // Helper for grid items
    const gridItem = (label, text, imgPath, colorClass, statusLabel) => `
        <div class="flex flex-col gap-2">
            <div class="aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative group">
                ${imgPath ? 
                    `<img src="${getImg(imgPath)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">` : 
                    `<div class="flex items-center justify-center h-full text-slate-300 text-xs">No Image</div>`
                }
                <div class="absolute top-2 left-2 ${colorClass} text-white text-[10px] px-2 py-0.5 rounded shadow-sm font-bold uppercase tracking-wide">${statusLabel}</div>
            </div>
            <div>
                <span class="text-xs font-bold text-slate-700 block mb-0.5">${label}</span>
                <p class="text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 min-h-[3rem]">${text || '-'}</p>
            </div>
        </div>
    `;

    const html = `
        <div class="space-y-6">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-4 border-b border-slate-100">
                <div>
                    <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                        Issue #${issue.IssueID}
                        <span class="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">${issue.HazardType || 'General'}</span>
                    </h2>
                    <p class="text-sm text-slate-500 flex items-center gap-1 mt-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        ${issue.Area}
                    </p>
                </div>
                <div class="text-right">
                    <span class="block text-xs text-slate-400 mb-1">Status</span>
                    <span class="inline-block px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ${issue.CurrentStatus}
                    </span>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${gridItem('Problem Found', issue.HazardDescription, issue.BeforeImage, 'bg-red-500', 'Before')}
                ${gridItem('Temporary Fix', issue.TempDescription, issue.TempImage, 'bg-orange-500', 'Temporary')}
                ${gridItem('Final Solution', issue.ActionDescription, issue.AfterImage, 'bg-green-600', 'After')}
            </div>

            <div class="flex justify-end pt-4 border-t border-slate-100">
                <button class="btn px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-colors" onclick="document.getElementById('modal-close-btn').click()">Close</button>
            </div>
        </div>
    `;
    openModal('📄 Issue Details', html, 'max-w-5xl');
}