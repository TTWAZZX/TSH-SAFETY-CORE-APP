// js/pages/patrol.js

import { apiFetch } from '../api.js';
import { hideLoading, showError } from '../ui.js';

export async function loadPatrolCccfPage() {
    const container = document.getElementById('patrol-cccf-page');
    container.innerHTML = `<div class="card p-6 text-center">กำลังโหลดข้อมูล Patrol & CCCF Dashboard...</div>`;

    try {
        // เรียก API ที่เราเพิ่งสร้าง
        const result = await apiFetch('/api/dashboard/patrol-cccf');
        if (!result.success) throw new Error(result.message);

        renderDashboard(container, result);

    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-6 text-red-500">ไม่สามารถโหลดข้อมูล Dashboard ได้</div>`;
    } finally {
        hideLoading();
    }
}

function renderDashboard(container, result) {
    const { data, availableYears, selectedYear, allPatrolSections, allCccfSections } = result;

    // HTML โครงสร้างหลักของหน้า Dashboard
    container.innerHTML = `
        <div id="patrol-dashboard-view">
            <div class="flex justify-between items-center mb-4 flex-wrap gap-4">
                <div class="flex items-center gap-3 flex-wrap">
                    <h2 class="text-2xl font-bold">Patrol & CCCF Dashboard</h2>
                    <select id="patrol-year-select" class="form-input py-2 pl-3 pr-8 text-base">
                        ${availableYears.map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="space-y-8">
                <div id="patrol-dashboard-content" class="card p-6">
                    <h3 class="text-xl font-semibold border-b-2 border-blue-500 pb-2 text-blue-700 dark:text-blue-400">Patrol System</h3>
                    <p class="mt-4 text-slate-500">ส่วนแสดงผล Patrol กำลังอยู่ระหว่างการพัฒนา...</p>
                    </div>
                <div id="cccf-dashboard-content" class="card p-6">
                    <h3 class="text-xl font-semibold border-b-2 border-green-500 pb-2 text-green-700 dark:text-green-400">CCCF Activity</h3>
                    <p class="mt-4 text-slate-500">ส่วนแสดงผล CCCF กำลังอยู่ระหว่างการพัฒนา...</p>
                    </div>
            </div>
        </div>
    `;

    // **หมายเหตุ:** โค้ดส่วนที่นำข้อมูลมาสร้างกราฟและตารางจริงๆ นั้นยาวมาก
    // เพื่อให้กระชับ ในตอนนี้จะแสดงแค่โครงสร้างหลักก่อน
    // แต่ข้อมูลทั้งหมดได้ถูกดึงมาเตรียมพร้อมไว้แล้วในตัวแปร 'data'
}