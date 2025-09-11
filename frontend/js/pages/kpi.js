// js/pages/kpi.js
import { apiFetch } from '../api.js';
import { hideLoading, showError } from '../ui.js';

let chartInstances = {}; // เก็บ instance ของ chart เพื่อทำลายทิ้งก่อนสร้างใหม่

export async function loadKpiPage() {
    const container = document.getElementById('kpi-page');
    container.innerHTML = `<div class="card p-6 text-center">กำลังโหลดข้อมูล KPI...</div>`;

    try {
        // 1. ดึงข้อมูลประกาศ KPI ล่าสุดก่อน
        const annData = await apiFetch('/api/pagedata/kpi-announcements');
        const currentAnn = annData.current;
        if (!currentAnn) {
            container.innerHTML = `<div class="card p-6">ไม่พบประกาศ KPI ที่ใช้งานอยู่</div>`;
            hideLoading();
            return;
        }

        const yearToDisplay = new Date(currentAnn.EffectiveDate).getFullYear();

        // 2. ดึงข้อมูล KPI ของปีนั้นๆ
        const kpiDataForYear = await apiFetch(`/api/kpidata/${yearToDisplay}`);

        // 3. แสดงผล
        renderKpiDashboard(container, currentAnn, kpiDataForYear);

    } catch (error) {
        showError(error);
        container.innerHTML = `<div class="card p-6 text-red-500">ไม่สามารถโหลดข้อมูล KPI ได้</div>`;
    } finally {
        hideLoading();
    }
}

function renderKpiDashboard(container, announcement, kpiData) {
    // ทำลาย chart เก่าทิ้งทั้งหมดก่อน render ใหม่
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const kpiCardsHtml = kpiData.length > 0
        ? kpiData.map(createKpiMetricCard).join('')
        : '<p class="md:col-span-3 text-center py-8 text-slate-500">ไม่พบข้อมูลตัวชี้วัดสำหรับปีนี้</p>';

    container.innerHTML = `
        <div id="kpi-dashboard-view">
            <div class="card p-4 mb-6">
                <h3 class="font-bold">${announcement.AnnouncementTitle}</h3>
                <p class="text-sm text-slate-500">ปีงบประมาณ ${new Date(announcement.EffectiveDate).getFullYear()}</p>
            </div>
            <div id="kpi-cards-container" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                ${kpiCardsHtml}
            </div>
        </div>
    `;

    // Render chart สำหรับแต่ละการ์ด
    kpiData.forEach(kpi => {
        drawKpiChart(kpi);
    });
}

function createKpiMetricCard(kpi) {
    const chartId = `kpi-chart-${kpi.rowIndex}`;
    return `
        <div class="card p-6 flex flex-col">
            <h3 class="font-semibold flex-grow pr-2">${kpi.Metric}</h3>
            <div class="text-xs text-slate-500 dark:text-slate-400 mb-2">${kpi.Department || ''}</div>
            <div class="flex-grow min-h-[200px]"><canvas id="${chartId}"></canvas></div>
        </div>
    `;
}

function drawKpiChart(kpi) {
    const canvasId = `kpi-chart-${kpi.rowIndex}`;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const actualData = months.map(m => kpi[m] !== null && kpi[m] !== '' ? parseFloat(kpi[m]) : null);

    const datasets = [{
        label: `ผลงานจริง (${kpi.Year})`,
        data: actualData,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
    }];

    const annualTarget = parseFloat(kpi.Target);
    if (!isNaN(annualTarget)) {
        datasets.push({
            label: 'เป้าหมายรายปี',
            data: Array(12).fill(annualTarget),
            borderColor: '#F59E0B',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            type: 'line'
        });
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels: months, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { position: 'bottom' } }
        }
    });
}