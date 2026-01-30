import { openModal, closeModal, showLoading, hideLoading, showToast, showError } from '../ui.js';
import { API } from '../api.js';
import { normalizeApiArray } from '../utils/normalize.js';
import { normalizeApiObject } from '../utils/normalize.js';


// Admin Permission Check
const userStr = localStorage.getItem('currentUser');
const currentUser = userStr ? JSON.parse(userStr) : { name: 'Staff', id: 'EMP001', team: 'Safety Team', role: 'User' };
const isAdmin = (currentUser.role && currentUser.role.toLowerCase() === 'admin') || (currentUser.Role && currentUser.Role.toLowerCase() === 'admin');

// =========================================
// 🚀 MAIN LOAD FUNCTION
// =========================================
export async function loadPatrolPage() {
    // ✅ Expose functions to Window (Fix ReferenceError)
    window.loadPatrolPage = loadPatrolPage;
    window.openCheckInModal = openCheckInModal;
    window.openIssueForm = openIssueForm;
    window.handleCheckInSubmit = handleCheckInSubmit;
    window.uploadDocument = uploadDocument; // ฟังก์ชันใหม่สำหรับ Admin

    const container = document.getElementById('patrol-page');
    
    // 1. Show Skeleton Loading (Premium User Experience)
    container.innerHTML = getSkeletonHTML();

    try {
        // 2. Fetch All Data in Parallel (ตัด documents ออกเพื่อแก้ 404)
        const [scheduleRes, statsRes, issuesRes] = await Promise.all([
            API.get(`/patrol/my-schedule?employeeId=${currentUser.id}&month=${new Date().getMonth()+1}&year=${new Date().getFullYear()}`),
            API.get('/patrol/attendance-stats'),
            API.get('/patrol/issues')
        ]);

        // 3. Render Real Dashboard
        renderDashboard(container, {
            schedule: normalizeApiArray(scheduleRes),
            stats: normalizeApiArray(statsRes),
            issues: normalizeApiArray(issuesRes)
        });

        // 4. Load Charts & Carousel Async
        loadDashboardCharts();

    } catch (err) {
        console.error(err);
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
                <div class="bg-red-50 p-4 rounded-full mb-4">
                    <svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h3 class="text-lg font-bold text-slate-700">ไม่สามารถโหลดข้อมูลได้</h3>
                <p class="text-sm">ระบบขัดข้องชั่วคราว หรือ Server ยังไม่พร้อมใช้งาน</p>
                <button onclick="loadPatrolPage()" class="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all">ลองใหม่อีกครั้ง</button>
            </div>`;
    }
}

// =========================================
// 🎨 RENDER ENGINE (The UI)
// =========================================
function renderDashboard(container, data) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const issuesArray = normalizeApiArray(data.issues);
    const statsArray  = normalizeApiArray(data.stats);

    // ใช้งานต่อได้ปลอดภัย 100%
    const myStats = statsArray.find(r => r.Name === currentUser.name)
        || { Total: 0, Percent: 0 };

    const openIssues = issuesArray.filter(i => i.ResultStatus === 'Open').length;
    const closedIssues = issuesArray.filter(i => i.ResultStatus === 'Closed').length;

    // Carousel Config
    const slideImages = [
        { src: 'https://lh3.googleusercontent.com/d/1TE2fjDinq-4lZ9HbKQI4mucsNbiwiDzO', title: 'SAFETY FIRST', desc: 'ความปลอดภัย...เริ่มที่ตัวเรา' },
        { src: 'https://lh3.googleusercontent.com/d/1qCbUecLPJ45Og2msKwDPbt4lKAAxTiYG', title: 'HAZARD ID', desc: 'ตาไว ใจกล้า แจ้งเหตุอันตราย' },
        { src: 'https://lh3.googleusercontent.com/d/1-IsDYiBYVmhrQRC6M97dYY_qWV3rEpGS', title: 'ZERO ACCIDENT', desc: 'เป้าหมายอุบัติเหตุเป็นศูนย์' },
        { src: 'https://lh3.googleusercontent.com/d/1yrK1hjtwOALwHtOd_mZr77U-mNwaX_2H', title: 'TEAMWORK', desc: 'ร่วมมือร่วมใจ เพื่อความปลอดภัย' },
        { src: 'https://lh3.googleusercontent.com/d/1E0xzqcIictAACEmHJ0QzxbjS71dVgcfi', title: 'KAIZEN', desc: 'ปรับปรุงสภาพแวดล้อมอย่างต่อเนื่อง' }
    ];

    // Mock Documents Data (ใช้ข้อมูลจำลองแทน API ชั่วคราว)
    const documents = [
        { name: 'ประกาศนโยบายความปลอดภัย 2026', type: 'PDF', url: '#' },
        { name: 'คู่มือการเดินตรวจ (Patrol Guide)', type: 'PDF', url: '#' },
        { name: 'แบบฟอร์มแจ้งซ่อม (Offline Form)', type: 'DOC', url: '#' }
    ];

    container.innerHTML = `
        <div class="max-w-[1600px] mx-auto space-y-8 pb-20 animate-fade-in font-['Kanit']">
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white/80 backdrop-blur-md sticky top-0 z-30 py-4 -mx-6 px-6 border-b border-slate-200/60">
                <div>
                    <h1 class="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span class="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </span>
                        ระบบเดินตรวจความปลอดภัย
                    </h1>
                    <div class="flex items-center gap-3 mt-2 text-sm text-slate-500">
                        <span class="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            ${dateStr}
                        </span>
                        <span class="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span>ผู้ใช้งาน: <strong class="text-indigo-600">${currentUser.name}</strong> ${isAdmin ? '<span class="text-[9px] bg-red-100 text-red-600 px-1 rounded ml-1 border border-red-200">ADMIN</span>' : ''}</span>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button onclick="loadPatrolPage()" class="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 rounded-xl shadow-sm transition-all active:scale-95" title="Refresh">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                    <button onclick="openIssueForm('OPEN')" class="btn bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-slate-200 flex items-center gap-2 text-sm font-bold transition-all transform hover:-translate-y-0.5 active:scale-95">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        แจ้งปัญหา (Report Issue)
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                ${renderKPICard('รอบเดินของฉัน (My Walks)', myStats.Total, 'ครั้งในปีนี้', 'text-blue-600', 'bg-blue-50', 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6')}
                ${renderKPICard('อัตราการเข้าเดิน (Rate)', `${myStats.Percent}%`, 'เทียบกับเป้าหมาย', 'text-emerald-600', 'bg-emerald-50', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z')}
                ${renderKPICard('งานค้างดำเนินการ (Open)', openIssues, 'รอการแก้ไข', 'text-rose-500', 'bg-rose-50', 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z')}
                ${renderKPICard('แก้ไขเสร็จสิ้น (Closed)', closedIssues, 'ปลอดภัยแล้ว', 'text-indigo-600', 'bg-indigo-50', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01')}
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
                
                <div class="xl:col-span-2 space-y-8">
                    
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row h-auto md:h-64">
                        <div class="md:w-5/12 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 flex flex-col justify-between relative overflow-hidden group">
                            <div class="absolute top-0 right-0 w-40 h-40 bg-white opacity-5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                            
                            <div>
                                <div class="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 border border-white/10 backdrop-blur-sm">
                                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> พร้อมใช้งาน (System Live)
                                </div>
                                <h3 class="text-2xl font-bold">เช็คอินประจำวัน</h3>
                                <p class="text-slate-400 text-sm mt-2 leading-relaxed">พร้อมสำหรับการเดินตรวจความปลอดภัยแล้วหรือยัง? บันทึกเวลาของคุณได้ที่นี่</p>
                            </div>

                            <button onclick="openCheckInModal()" class="mt-6 w-full btn bg-white text-slate-900 hover:bg-indigo-50 font-bold py-3.5 rounded-xl shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 group-hover:shadow-white/10">
                                <span>กดเพื่อเช็คอิน (Check-in)</span>
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                            </button>
                        </div>

                        <div class="md:w-7/12 flex flex-col">
                            <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                    ตารางเวรของฉัน (เดือนนี้)
                                </h3>
                            </div>
                            <div class="flex-1 overflow-y-auto custom-scrollbar p-0 bg-white">
                                ${data.schedule.length > 0 ? `
                                    <div class="divide-y divide-slate-50">
                                        ${data.schedule.map(item => {
                                            const d = new Date(item.ScheduledDate);
                                            const isToday = d.toDateString() === today.toDateString();
                                            const isPast = d < new Date().setHours(0,0,0,0);
                                            return `
                                            <div class="flex items-center px-6 py-4 hover:bg-slate-50 transition-colors ${isToday ? 'bg-indigo-50/40' : ''}">
                                                <div class="w-12 text-center flex-shrink-0 border-r border-slate-100 pr-4 mr-4">
                                                    <div class="text-[10px] font-bold text-slate-400 uppercase">${d.toLocaleString('th-TH', { month: 'short' })}</div>
                                                    <div class="text-xl font-bold ${isToday ? 'text-indigo-600' : 'text-slate-700'}">${d.getDate()}</div>
                                                </div>
                                                <div class="flex-1">
                                                    <div class="flex justify-between items-center">
                                                        <h4 class="text-sm font-bold text-slate-800">${item.TeamName}</h4>
                                                        ${isToday 
                                                            ? '<span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded shadow-sm">วันนี้ (TODAY)</span>' 
                                                            : isPast ? '<span class="text-[10px] text-slate-300 font-bold"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> ผ่านมาแล้ว</span>' : ''}
                                                    </div>
                                                    <p class="text-xs text-slate-500">เดินตรวจพื้นที่โรงงาน (Factory Area)</p>
                                                </div>
                                            </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                                        <svg class="w-10 h-10 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                        <p class="text-xs">เดือนนี้คุณไม่มีตารางเวรเดินตรวจ</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <div>
                                <h3 class="font-bold text-slate-700 text-base">ทะเบียนติดตามประเด็นความปลอดภัย (Safety Issue Register)</h3>
                                <p class="text-xs text-slate-500 mt-0.5">บันทึกความไม่ปลอดภัยและการแก้ไข</p>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">สถานะ:</span>
                                <div class="flex -space-x-2">
                                    <span class="w-6 h-6 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center text-[8px] text-white font-bold" title="Open">${openIssues}</span>
                                    <span class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[8px] text-white font-bold" title="Closed">${closedIssues}</span>
                                </div>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm text-left">
                                <thead class="text-[10px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200 font-semibold">
                                    <tr>
                                        <th class="px-6 py-3 font-semibold w-16">ID</th>
                                        <th class="px-6 py-3 font-semibold w-24">รูปภาพ</th>
                                        <th class="px-6 py-3 font-semibold">รายละเอียด / พื้นที่ (Detail & Area)</th>
                                        <th class="px-6 py-3 font-semibold text-center w-28">สถานะ</th>
                                        <th class="px-6 py-3 font-semibold text-right w-20">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-50">
                                  ${issuesArray.length > 0
                                        ? issuesArray.slice(0, 10).map(renderIssueRow).join('')
                                        : '<tr><td colspan="5" class="text-center py-12 text-slate-400 text-xs">ไม่พบรายการแจ้งซ่อม</td></tr>'
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                <div class="xl:col-span-1 space-y-6">
                    
                    <div id="promo-carousel" class="relative overflow-hidden rounded-2xl shadow-xl group h-[30rem] bg-slate-900 border border-slate-700/50">
                        <div id="carousel-slides" class="relative w-full h-full">
                            ${slideImages.map((img, idx) => `
                                <div class="carousel-item absolute inset-0 transition-opacity duration-700 ease-in-out ${idx===0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}" data-index="${idx}">
                                    
                                    <div class="absolute inset-0 overflow-hidden pointer-events-none">
                                        <img src="${img.src}" class="w-full h-full object-cover blur-3xl opacity-30 scale-150 saturate-150">
                                        <div class="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-transparent to-slate-950/90"></div>
                                    </div>

                                    <div class="relative z-10 flex flex-col items-center h-full py-5 px-4 text-center">
                                        
                                        <div class="flex-shrink-0 mb-3 space-y-1">
                                            <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 backdrop-blur-md shadow-sm">
                                                <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                                                <span class="text-[9px] font-bold uppercase tracking-wider text-indigo-100">Safety Campaign</span>
                                            </div>
                                            <h3 class="text-xl font-extrabold text-white leading-tight drop-shadow-lg tracking-wide">
                                                ${img.title}
                                            </h3>
                                            <p class="text-xs text-slate-300 font-light opacity-90 line-clamp-1">
                                                ${img.desc}
                                            </p>
                                        </div>

                                        <div class="flex-1 w-full flex items-center justify-center relative min-h-0 mb-3">
                                            <div class="h-full aspect-square rounded-xl overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border-2 border-white/10 bg-slate-800 relative group-hover:scale-[1.02] transition-transform duration-500">
                                                <img src="${img.src}" 
                                                     class="w-full h-full object-cover" 
                                                     alt="${img.title}">
                                            </div>
                                        </div>

                                        <div class="flex-shrink-0 relative z-20 pb-4">
                                            <button class="text-[10px] font-bold text-white bg-white/10 hover:bg-indigo-600 border border-white/20 hover:border-transparent px-5 py-2 rounded-full transition-all flex items-center gap-2 shadow-lg backdrop-blur-sm group/btn">
                                                ดูรายละเอียด <svg class="w-3 h-3 transition-transform group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                            </button>
                                        </div>

                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <div class="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-30 pointer-events-none">
                            ${slideImages.map((_, idx) => `<button class="h-1 rounded-full transition-all duration-300 ${idx===0?'bg-indigo-500 w-5 shadow-[0_0_10px_rgba(99,102,241,0.5)]':'bg-slate-700 w-1.5'}" data-index="${idx}"></button>`).join('')}
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                        <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                            <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                ปฏิทินการเดินตรวจ
                            </h3>
                            <span class="text-xs text-slate-500 font-medium">${today.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
                        </div>
                        
                        <div class="grid grid-cols-7 gap-1 text-center mb-2">
                            ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="text-[9px] font-bold text-slate-400 uppercase tracking-wide">${d}</div>`).join('')}
                        </div>
                        <div class="grid grid-cols-7 gap-1 text-center" id="mini-calendar-grid">
                            ${generateMiniCalendarHTML(data.schedule)}
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[300px]">
                        <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                            <h3 class="font-bold text-slate-700 text-sm">📊 สถิติการมีส่วนร่วม (Participation)</h3>
                        </div>
                        <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
                            <div class="space-y-1">
                                ${statsArray.slice(0, 10).map((row) => `
                                    <div class="flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-lg transition-colors group">
                                        <div class="flex items-center gap-3 w-full">
                                            <div class="w-8 h-8 rounded-full bg-slate-50 text-slate-500 font-bold text-[10px] flex items-center justify-center border border-slate-100">${row.Name.charAt(0)}</div>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-xs font-bold text-slate-700 truncate">${row.Name}</span>
                                                    <span class="text-[10px] text-slate-400 font-mono">${row.Total} ครั้ง</span>
                                                </div>
                                                <div class="w-full bg-slate-100 rounded-full h-1">
                                                    <div class="bg-indigo-500 h-1 rounded-full transition-all duration-500" style="width: ${Math.min(row.Percent, 100)}%"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>`).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 class="font-bold text-slate-700 text-sm">สรุปตามแผนก (By Section)</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs text-left">
                                <thead class="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th class="px-4 py-2">แผนก</th>
                                        <th class="px-4 py-2 text-center text-green-600">เสร็จ</th>
                                        <th class="px-4 py-2 text-center text-orange-500">รอ</th>
                                    </tr>
                                </thead>
                                <tbody id="dashboard-section-body" class="divide-y divide-slate-50"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                        <h3 class="font-bold text-slate-700 text-xs mb-4 uppercase tracking-wide border-b border-slate-100 pb-2">วิเคราะห์ความเสี่ยง (Risk)</h3>
                        <div class="h-32 relative"><canvas id="rankChart"></canvas></div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                เอกสารที่เกี่ยวข้อง
                            </h3>
                            ${isAdmin ? `<button onclick="uploadDocument()" class="text-[10px] text-indigo-600 hover:underline flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg> เพิ่ม</button>` : ''}
                        </div>
                        <div class="p-2 space-y-1">
                            ${documents.map(doc => `
                                <a href="${doc.url}" class="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-lg transition-colors group">
                                    <div class="w-8 h-8 rounded ${doc.type === 'PDF' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-blue-50 text-blue-500 border border-blue-100'} flex items-center justify-center font-bold text-[10px] transition-colors">${doc.type}</div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">${doc.name}</p>
                                        <p class="text-[9px] text-slate-400">คลิกเพื่อดาวน์โหลด</p>
                                    </div>
                                    <svg class="w-4 h-4 text-slate-300 group-hover:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                </a>
                            `).join('')}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
}

// =========================================
// 📅 HELPER: Mini Calendar Generator
// =========================================
function generateMiniCalendarHTML(scheduleData) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    // หาวันแรกและจำนวนวันในเดือน
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let html = '';
    
    // ช่องว่างก่อนวันที่ 1
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="h-8"></div>`;
    }

    // วนลูปวันที่ 1-31
    for (let day = 1; day <= daysInMonth; day++) {
        const isScheduled = Array.isArray(scheduleData)
            && scheduleData.some(
                s => s?.ScheduledDate && new Date(s.ScheduledDate).getDate() === day
            );

        const isToday = day === today.getDate();
        
        let classes = "h-8 flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer transition-all hover:bg-slate-100";
        let content = `${day}`;

        if (isToday) {
            classes += " bg-indigo-600 text-white hover:bg-indigo-700 shadow-md";
        } else if (isScheduled) {
            classes += " bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold";
            content += `<span class="absolute bottom-1 w-1 h-1 bg-indigo-500 rounded-full"></span>`;
        } else {
            classes += " text-slate-600";
        }

        html += `<div class="relative ${classes}">${content}</div>`;
    }
    return html;
}

// =========================================
// 🧩 HELPER FUNCTIONS
// =========================================

function renderKPICard(title, value, subtext, colorClass, bgClass, iconPath) {
    return `<div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex justify-between items-start hover:shadow-md transition-all group">
        <div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${title}</p><h3 class="text-2xl font-bold text-slate-800">${value}</h3><p class="text-[10px] text-slate-500">${subtext}</p></div>
        <div class="w-10 h-10 rounded-lg ${bgClass} ${colorClass} flex items-center justify-center group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/></svg></div>
    </div>`;
}

function renderIssueRow(rawItem) {
    const item = normalizeApiObject(rawItem);

    const isClosed = item.ResultStatus === 'Closed';

    const allowEdit = !isClosed || isAdmin;

    const st = isClosed
        ? {c:'bg-green-50 text-green-700 border-green-100', l:'เสร็จสิ้น'} 
        : item.ResultStatus==='Temporary'
            ? {c:'bg-orange-50 text-orange-700 border-orange-100', l:'แก้ชั่วคราว'}
            : {c:'bg-red-50 text-red-700 border-red-100', l:'รอแก้ไข'};
    
    const imgUrl = item.BeforeImage || 'https://via.placeholder.com/40?text=IMG';

    let actionBtn = '';
    if (allowEdit && !isClosed) {
        actionBtn = `<button onclick='openIssueForm("TEMP",${JSON.stringify(item)})' class="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-300 rounded-lg shadow-sm transition-all" title="แก้ไข"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>`;
    } else {
        actionBtn = `<button onclick='openIssueForm("VIEW",${JSON.stringify(item)})' class="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 rounded-lg shadow-sm transition-all" title="ดูรายละเอียด"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.235 3.932-5.732 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>`;
    }
    if (isClosed && isAdmin) {
        actionBtn += ` <button onclick='openIssueForm("CLOSE",${JSON.stringify(item)})' class="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-red-600 rounded-lg shadow-sm transition-all ml-1" title="แก้ไข (Admin)"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>`;
    }

    return `<tr class="hover:bg-slate-50 transition-colors group cursor-pointer" onclick='openIssueForm("VIEW",${JSON.stringify(item)})'>
        <td class="px-6 py-4 text-xs text-slate-400 font-mono align-top pt-5">#${item.IssueID}</td>
        <td class="px-6 py-3 align-top">
            <div class="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shadow-sm group-hover:scale-110 transition-transform">
                <img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/40x40?text=No+Img'">
            </div>
        </td>
        <td class="px-6 py-3 align-top">
            <div class="font-bold text-slate-700 text-xs mb-0.5">${item.Area}</div>
            <div class="text-[10px] text-slate-500 leading-relaxed line-clamp-2 max-w-[200px]">${item.HazardDescription}</div>
        </td>
        <td class="px-6 py-4 text-center align-top">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${st.c}">${st.l}</span>
        </td>
        <td class="px-6 py-4 text-right align-top" onclick="event.stopPropagation()">
            ${actionBtn}
        </td>
    </tr>`;
}

function getSkeletonHTML() { 
    return `<div class="max-w-7xl mx-auto space-y-6 pb-20 animate-pulse"><div class="h-12 bg-slate-100 rounded-lg w-1/3 mb-8"></div><div class="grid grid-cols-4 gap-4"><div class="h-24 bg-slate-100 rounded-xl"></div><div class="h-24 bg-slate-100 rounded-xl"></div><div class="h-24 bg-slate-100 rounded-xl"></div><div class="h-24 bg-slate-100 rounded-xl"></div></div></div>`; 
}

// =========================================
// 🕹️ CHECK-IN & ISSUE FORMS (Full 17 Fields)
// =========================================

function openCheckInModal() {
    const html = `
        <form id="checkin-form" onsubmit="handleCheckInSubmit(event)" class="space-y-6">
            <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="w-14 h-14 bg-white rounded-full flex items-center justify-center border border-slate-200 shadow-sm text-indigo-600">
                    <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .884-.5 2-2 2h4c-1.5 0-2-1.116-2-2zM6 20h12M10 10a2 2 0 114 0 2 2 0 01-4 0z"/></svg>
                </div>
                <div>
                    <p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">ผู้ปฏิบัติงาน (Inspector)</p>
                    <h3 class="text-base font-bold text-slate-800">${currentUser.name}</h3>
                    <p class="text-xs text-slate-500 bg-slate-100 inline-block px-2 rounded-full border border-slate-200 mt-1">${currentUser.team}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <label class="cursor-pointer group relative">
                    <input type="radio" name="PatrolType" value="Normal" class="peer sr-only" checked>
                    <div class="p-5 rounded-2xl border-2 border-slate-100 bg-white text-center hover:border-indigo-100 hover:bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-800 transition-all duration-200 shadow-sm">
                        <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center group-hover:scale-110 peer-checked:bg-indigo-600 peer-checked:text-white transition-all">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                        </div>
                        <span class="text-xs font-bold block">เดินตรวจปกติ</span>
                        <span class="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Routine Patrol</span>
                    </div>
                </label>
                <label class="cursor-pointer group relative">
                    <input type="radio" name="PatrolType" value="Re-inspection" class="peer sr-only">
                    <div class="p-5 rounded-2xl border-2 border-slate-100 bg-white text-center hover:border-orange-100 hover:bg-slate-50 peer-checked:border-orange-500 peer-checked:bg-orange-50 peer-checked:text-orange-800 transition-all duration-200 shadow-sm">
                        <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center group-hover:scale-110 peer-checked:bg-orange-500 peer-checked:text-white transition-all">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
                        </div>
                        <span class="text-xs font-bold block">เดินตรวจซ้ำ/ซ่อม</span>
                        <span class="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Re-inspection</span>
                    </div>
                </label>
            </div>

            <button type="submit" class="w-full btn bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-slate-200 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2">
                <span>ยืนยันเช็คอิน (Confirm)</span>
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            </button>
        </form>
    `;
    openModal('📍 บันทึกการเดินตรวจ (Patrol Check-in)', html, 'max-w-sm');
}

async function handleCheckInSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const type = formData.get('PatrolType');

    showLoading();
    try {
        await API.post('/patrol/checkin', {
            UserID: currentUser.id,
            UserName: currentUser.name,
            TeamName: currentUser.team,
            PatrolType: type
        });
        closeModal();
        showToast(`เช็คอินสำเร็จ (${type})`, 'success');
        loadPatrolPage();

    } catch(err) { showError(err); } finally { hideLoading(); }
}

// 📌 New function: Upload Document (Mock)
function uploadDocument() {
    showToast('ฟังก์ชันอัปโหลดเอกสารสำหรับ Admin (Coming Soon)', 'info');
}

window.openIssueForm = function(mode, rawIssueData = null) {
    const issueData = normalizeApiObject(rawIssueData);

    const isEdit =
    mode !== 'VIEW' &&
    (
        mode === 'OPEN' ||
        (issueData && issueData.ResultStatus !== 'Closed') ||
        isAdmin
    );
    const isView = mode === 'VIEW';
    const today = new Date().toISOString().split('T')[0];

    // Helper to disable fields
    const d = isEdit ? '' : 'disabled';
    const r = isEdit ? '' : 'readonly';

    const html = `
        <form id="issue-form" class="space-y-6 text-sm">
            <input type="hidden" name="ActionType" value="${mode}">
            <input type="hidden" name="IssueID" value="${issueData ? issueData.IssueID : ''}">

            ${isView || mode === 'CLOSE' ? `
            <div class="bg-slate-900 rounded-2xl p-1 shadow-lg overflow-hidden mb-4">
                <div class="grid grid-cols-2 divide-x divide-slate-700">
                    <div class="relative group h-48 bg-slate-800 flex items-center justify-center overflow-hidden">
                        ${issueData?.BeforeImage 
                            ? `<img src="${issueData.BeforeImage}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">` 
                            : `<span class="text-slate-500 text-xs">No Before Image</span>`}
                        <div class="absolute top-2 left-2 bg-red-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-sm">BEFORE</div>
                    </div>
                    <div class="relative group h-48 bg-slate-800 flex items-center justify-center overflow-hidden">
                        ${issueData?.AfterImage 
                            ? `<img src="${issueData.AfterImage}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">` 
                            : `<span class="text-slate-500 text-xs flex flex-col items-center gap-1"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>รอภาพหลังแก้ไข</span>`}
                        <div class="absolute top-2 left-2 bg-green-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-sm">AFTER</div>
                    </div>
                </div>
            </div>
            ` : ''}

            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <h4 class="font-bold text-slate-700 mb-4 text-xs uppercase tracking-wide border-b border-slate-100 pb-2 flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">1</span> ข้อมูลทั่วไป
                </h4>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">วันที่ตรวจพบ</label>
                        <input type="date" name="DateFound" class="form-input w-full rounded-lg bg-slate-50 border-slate-200 text-xs" value="${issueData?.DateFound ? issueData.DateFound.split('T')[0] : today}" ${r}>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">พื้นที่ (Area)</label>
                        <select name="Area" class="form-select w-full rounded-lg text-xs" ${d}>
                            <option value="Line 1" ${issueData?.Area === 'Line 1' ? 'selected' : ''}>Line 1</option>
                            <option value="Warehouse" ${issueData?.Area === 'Warehouse' ? 'selected' : ''}>Warehouse</option>
                            <option value="Office" ${issueData?.Area === 'Office' ? 'selected' : ''}>Office</option>
                        </select>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">รายละเอียด / ปัญหาที่พบ</label>
                        <textarea name="HazardDescription" class="form-input w-full h-16 rounded-lg bg-slate-50 border-slate-200 text-xs" ${r}>${issueData?.HazardDescription || ''}</textarea>
                    </div>
                </div>
            </div>

            ${mode === 'TEMP' || (issueData && issueData.TempDescription) ? `
            <div class="bg-orange-50 p-5 rounded-2xl border border-orange-200 animate-fade-in relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                <h4 class="font-bold text-orange-800 mb-4 text-xs uppercase tracking-wide flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-white text-orange-600 flex items-center justify-center font-bold shadow-sm">2</span> การแก้ไขชั่วคราว
                </h4>
                <textarea name="TempDescription" class="form-input w-full h-16 rounded-lg border-orange-200 focus:ring-orange-200 text-xs" ${isView ? 'readonly' : ''}>${issueData?.TempDescription || ''}</textarea>
                ${!isView ? `<div class="mt-3"><input type="file" name="TempImage" class="text-xs bg-white rounded-lg border-orange-200"></div>` : ''}
            </div>` : ''}

            ${mode === 'CLOSE' || (issueData && issueData.ActionDescription) ? `
            <div class="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 animate-fade-in relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                <h4 class="font-bold text-emerald-800 mb-4 text-xs uppercase tracking-wide flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center font-bold shadow-sm">3</span> การปิดจบงาน (Final Fix)
                </h4>
                <textarea name="ActionDescription" class="form-input w-full h-16 rounded-lg border-emerald-200 focus:ring-emerald-200 text-xs" ${isView ? 'readonly' : ''}>${issueData?.ActionDescription || ''}</textarea>
                <div class="grid grid-cols-2 gap-4 mt-3">
                    <div><label class="text-[10px] font-bold text-emerald-700">วันที่เสร็จ</label><input type="date" name="FinishDate" class="form-input w-full text-xs rounded-lg border-emerald-200" value="${issueData?.FinishDate ? issueData.FinishDate.split('T')[0] : today}" ${isView ? 'readonly' : ''}></div>
                </div>
                ${!isView ? `<div class="mt-3"><input type="file" name="AfterImage" class="text-xs bg-white rounded-lg border-emerald-200"></div>` : ''}
            </div>` : ''}

            <div class="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" class="btn bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-bold text-sm" onclick="document.getElementById('modal-close-btn').click()">
                    ${isView ? 'ปิดหน้าต่าง' : 'ยกเลิก'}
                </button>
                ${!isView ? `<button type="submit" class="btn bg-slate-900 hover:bg-slate-800 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-slate-200 transition-all transform active:scale-[0.98]">บันทึกข้อมูล</button>` : ''}
            </div>
        </form>
    `;

    const titleMap = {
        'OPEN': '📝 แจ้งปัญหาใหม่',
        'TEMP': '🔧 อัปเดตการแก้ไข',
        'CLOSE': '✅ ปิดจบงาน',
        'VIEW': '👁️ รายละเอียดประเด็นความปลอดภัย'
    };

    openModal(titleMap[mode], html, 'max-w-2xl');

    if (!isView) {
        setTimeout(() => {
            const form = document.getElementById('issue-form');
            form.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                if (mode === 'OPEN') {
                    if(!formData.get('FoundByTeam')) formData.append('FoundByTeam', currentUser.team);
                    if(!formData.get('ResponsibleDept')) formData.append('ResponsibleDept', 'Maintenance');
                    if(!formData.get('HazardType')) formData.append('HazardType', 'Unsafe Condition');
                }

                showLoading('กำลังบันทึก...');
                try {
                    const res = await API.post('/patrol/issue/save', formData);

                    if (res?.success === false) {
                        showError(res.message || 'บันทึกไม่สำเร็จ');
                        return;
                    }

                    showToast('บันทึกสำเร็จ!', 'success');
                    closeModal();
                    loadPatrolPage();

                } catch(err) { showError(err); } finally { hideLoading(); }
            };
        }, 100);
    }
};

// =========================================
// 🎠 CAROUSEL LOGIC
// =========================================
function initPromoCarousel() {
    const slides = document.querySelectorAll('.carousel-item');
    const dots = document.querySelectorAll('[data-index]');
    if(!slides.length) return;

    let currentIndex = 0;
    const showSlide = (index) => {
        if (index >= slides.length) currentIndex = 0;
        else if (index < 0) currentIndex = slides.length - 1;
        else currentIndex = index;

        slides.forEach((slide, i) => {
            slide.classList.toggle('opacity-100', i === currentIndex);
            slide.classList.toggle('z-10', i === currentIndex);
            slide.classList.toggle('opacity-0', i !== currentIndex);
            slide.classList.toggle('z-0', i !== currentIndex);
        });
        dots.forEach((dot, i) => {
            dot.classList.toggle('bg-indigo-500', i === currentIndex);
            dot.classList.toggle('w-4', i === currentIndex);
            dot.classList.toggle('bg-slate-700', i !== currentIndex);
            dot.classList.toggle('w-1.5', i !== currentIndex);
        });
    };

    setInterval(() => showSlide(currentIndex + 1), 5000);
}

// =========================================
// 📈 ANALYTICS CHARTS (Async)
// =========================================
async function loadDashboardCharts() {
    try {
        const res = await API.get('/patrol/dashboard-stats');
        const data = normalizeApiObject(res);
        const bySection = normalizeApiArray(data.bySection);
        const byRank    = normalizeApiArray(data.byRank);

        // 1. Update Section Table
        const tbody = document.getElementById('dashboard-section-body');
        if(tbody) {
            tbody.innerHTML = bySection.length > 0 ? bySection.map(row => {
                return `
                    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                        <td class="px-4 py-3 font-medium text-slate-700 text-xs">${row.Section || 'General'}</td>
                        <td class="px-4 py-3 text-center text-emerald-600 font-bold text-xs">${row.Achieved}</td>
                        <td class="px-4 py-3 text-center text-orange-500 font-bold text-xs">${row.OnProcess}</td>
                    </tr>
                `;
            }).join('') : `<tr><td colspan="3" class="text-center py-4 text-xs text-slate-400">ยังไม่มีข้อมูล</td></tr>`;
        }

        // 2. Render Chart
        const ctxRank = document.getElementById('rankChart');
        if(ctxRank && byRank.length > 0) {
            const rankMap = { 'A': 0, 'B': 0, 'C': 0 };
            byRank.forEach(r => rankMap[r.Rank] = r.Count);
            
            if(window.rankChartInstance) window.rankChartInstance.destroy();
            window.rankChartInstance = new Chart(ctxRank.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['A (สูง)', 'B (กลาง)', 'C (ต่ำ)'],
                    datasets: [{
                        data: [rankMap['A'], rankMap['B'], rankMap['C']],
                        backgroundColor: ['#f43f5e', '#fb923c', '#3b82f6'],
                        borderWidth: 0, hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '75%',
                    plugins: { legend: { position: 'right', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10, family: "'Kanit', sans-serif" } } } }
                }
            });
        }

        // 3. Init Carousel
        initPromoCarousel();

    } catch(e) { console.error('Chart Error:', e); }
}