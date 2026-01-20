import { apiFetch } from '../api.js';
import { hideLoading, showLoading, showError, showToast, openModal, showDocumentModal } from '../ui.js';

// public/js/pages/cccf.js

export async function loadCccfPage() {
    console.log("💡 Loading CCCF Activity...");
    const container = document.getElementById('cccf-page');
    container.innerHTML = `<div class="flex justify-center items-center h-64"><div class="animate-spin rounded-full h-10 w-10 border-4 border-green-500 border-t-transparent"></div></div>`;

    try {
        // --- 🟢 แก้ตรงนี้: ใช้ API จริงแทน Mock Data ---
        
        // 1. เรียก API ดึงข้อมูล CCCF ทั้งหมด
        const activities = await apiFetch('/api/cccf'); // เรียกไปที่ routes/cccf.js (GET /)
        
        // ส่งข้อมูลที่ได้ไปแสดงผล
        renderCccfGallery(container, activities);

    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="p-4 text-red-500 text-center">เกิดข้อผิดพลาด: ${error.message}</div>`;
    }
}

function renderCccfGallery(container, activities) {
    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h2 class="text-2xl font-bold text-slate-800 dark:text-white">CCCF Activity</h2>
                <p class="text-slate-500 text-sm">กิจกรรมค้นหาจุดเสี่ยงและปรับปรุงสภาพแวดล้อม</p>
            </div>
            <button id="btn-add-cccf" class="btn btn-success text-white bg-green-600 hover:bg-green-700 shadow-lg flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                ส่งผลงาน CCCF
            </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${activities.map(item => `
                <div class="card overflow-hidden group hover:shadow-xl transition-all duration-300">
                    <div class="relative h-48">
                        <div class="absolute inset-0 flex">
                    <div class="w-1/2 h-full relative border-r border-white/20">
                        <img src="${item.BeforePhoto || item.BeforeImg || ''}" 
                             class="w-full h-full object-cover bg-slate-200"
                             onerror="this.style.display='none'; this.nextElementSibling.innerText='NO IMAGE'">
                        <span class="absolute top-2 left-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-sm">BEFORE</span>
                    </div>
                    <div class="w-1/2 h-full relative">
                        <img src="${item.AfterPhoto || item.AfterImg || ''}" 
                             class="w-full h-full object-cover bg-slate-200"
                             onerror="this.style.display='none'; this.nextElementSibling.innerText='NO IMAGE'">
                        <span class="absolute top-2 right-2 bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-sm">AFTER</span>
                    </div>
                        </div>
                    </div>
                    <div class="p-4">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-slate-800 dark:text-white truncate pr-2">${item.Title}</h3>
                            <span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">${item.Area}</span>
                        </div>
                        <button class="w-full btn btn-sm btn-white border border-slate-200 mt-2 text-slate-600 hover:bg-slate-50" onclick="alert('ดูรายละเอียด')">ดูรายละเอียด</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    document.getElementById('btn-add-cccf').addEventListener('click', () => showToast('ฟอร์ม CCCF กำลังมา...', 'success'));
}