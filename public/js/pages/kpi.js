import { API } from '../api.js';
import { hideLoading, showLoading, showError, showToast, openModal, closeModal, showConfirmationModal, showDocumentModal, escHtml } from '../ui.js?v=20260602-mobile-nav-m53';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let chartInstances = {};
let allKpiDataForYear = [];
let currentAnnouncementId = null;
let currentKpiAnnouncement = null;
let kpiEventListenersAttached = false;
let _availableYears = [];
let _selectedYear = null;
let _viewMode = 'card'; // 'card' | 'table'
let _filterDept = 'all';
let _filterStatus = 'all';
let _filterSearch = '';
let _tableChanges = {}; // { id: { Jan: 5, ... } }
let kpiMasterOrgOptions = [];
let kpiMasterLoaded = false;
let _accidentMonthlyReports = [];

// ─── helpers ────────────────────────────────────────────────────────────────
const getAnnouncementId = (ann) => ann?.id ?? ann?.AnnouncementID ?? '';
const kpiAnnouncementItemUrl = (id) => `/kpiannouncements/item?id=${encodeURIComponent(id)}`;

function getIsAdmin() {
    const cu = TSHSession.getUser();
    if (!cu) return false;
    return !!(
        (cu.role  && cu.role.toLowerCase()  === 'admin') ||
        (cu.Role  && cu.Role.toLowerCase()  === 'admin') ||
        cu.id === 'admin'
    );
}

function calcKpiStatus(kpi) {
    const direction = kpi.Direction || 'lower_better';
    let sumActual = 0, hasData = false;
    MONTHS.forEach(m => {
        const v = kpi[m];
        if (v !== null && v !== undefined && v !== '') { sumActual += parseFloat(v); hasData = true; }
    });
    if (!hasData) return 'nodata';
    const target = parseFloat(kpi.Target);
    return direction === 'higher_better'
        ? (sumActual >= target ? 'ok' : 'over')
        : (sumActual <= target ? 'ok' : 'over');
}

function getLatestMonthValue(kpi) {
    for (let i = MONTHS.length - 1; i >= 0; i--) {
        const v = kpi[MONTHS[i]];
        if (v !== null && v !== undefined && v !== '') return { month: MONTHS[i], value: parseFloat(v) };
    }
    return null;
}

function calcYtdSum(kpi) {
    let s = 0;
    MONTHS.forEach(m => { const v = kpi[m]; if (v !== null && v !== undefined && v !== '') s += parseFloat(v); });
    return s;
}

function getTrendInfo(kpi) {
    const direction = kpi.Direction || 'lower_better';
    const vals = MONTHS.map(m => kpi[m]).filter(v => v !== null && v !== undefined && v !== '').map(Number);
    if (vals.length < 2) return null;
    const recent = vals.slice(-Math.min(3, vals.length));
    const first = recent[0], last = recent[recent.length - 1];
    if (first === 0) return null;
    const pct = ((last - first) / Math.abs(first)) * 100;
    const dir = Math.abs(pct) < 2 ? 'flat' : pct > 0 ? 'up' : 'down';
    const isBad = dir !== 'flat' && (direction === 'lower_better' ? dir === 'up' : dir === 'down');
    return { dir, pct: Math.abs(pct).toFixed(1), isBad };
}

function calcForecast(kpi) {
    const pts = [];
    MONTHS.forEach((m, i) => {
        const v = kpi[m];
        if (v !== null && v !== undefined && v !== '') pts.push({ x: i, y: parseFloat(v) });
    });
    if (pts.length < 3) return null;
    const n = pts.length;
    const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
    const sxy = pts.reduce((s, p) => s + p.x * p.y, 0), sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
    const d = n * sxx - sx * sx;
    if (d === 0) return Math.round(sy / n * 12 * 10) / 10;
    const slope = (n * sxy - sx * sy) / d, intercept = (sy - slope * sx) / n;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Math.max(0, intercept + slope * i);
    return Math.round(sum * 10) / 10;
}

async function handleExportPdf() {
    if (!window.html2canvas || !window.jspdf) { showToast('ไลบรารี PDF ยังโหลดไม่เสร็จ', 'error'); return; }
    showLoading('กำลังสร้าง PDF...');
    let holder;
    try {
        const rows = getFilteredData();
        const total = rows.length;
        const onTrack = rows.filter(k => calcKpiStatus(k) === 'ok').length;
        const offTrack = rows.filter(k => calcKpiStatus(k) === 'over').length;
        const noData = rows.filter(k => calcKpiStatus(k) === 'nodata').length;
        const measured = Math.max(1, total - noData);
        const compliance = total > 0 ? Math.round((onTrack / measured) * 100) : 0;
        const composite = calcCompositeScore(rows);
        const generatedAt = new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' });
        const scopeText = [
            `FY ${_selectedYear}`,
            _filterDept !== 'all' ? _filterDept : 'All departments',
            _filterStatus !== 'all' ? _filterStatus : 'All status',
        ].join(' / ');
        const reportHealth = compliance >= 85 ? 'Stable' : compliance >= 70 ? 'Watch' : 'Action';
        const healthColor = reportHealth === 'Stable' ? '#059669' : reportHealth === 'Watch' ? '#d97706' : '#dc2626';
        const denseRegister = total > 18;
        const statusMeta = {
            ok: { label: 'On Track', color: '#059669', bg: '#d1fae5' },
            over: { label: 'Off Track', color: '#dc2626', bg: '#fee2e2' },
            nodata: { label: 'No Data', color: '#64748b', bg: '#f1f5f9' },
        };
        const deptSummary = Array.from(rows.reduce((map, k) => {
            const dept = k.Department || 'General';
            const item = map.get(dept) || { dept, total: 0, ok: 0, over: 0, nodata: 0 };
            const status = calcKpiStatus(k);
            item.total += 1;
            if (status === 'ok') item.ok += 1;
            else if (status === 'over') item.over += 1;
            else item.nodata += 1;
            map.set(dept, item);
            return map;
        }, new Map()).values()).map(d => {
            const measuredDept = Math.max(1, d.total - d.nodata);
            return { ...d, compliance: Math.round((d.ok / measuredDept) * 100) };
        }).sort((a, b) => b.over - a.over || a.compliance - b.compliance || b.total - a.total);
        const priorityRows = rows
            .filter(k => calcKpiStatus(k) === 'over')
            .sort((a, b) => (parseFloat(b.Weight) || 1) - (parseFloat(a.Weight) || 1))
            .slice(0, 4);

        const fmt = v => Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }).replace(/\.0$/, '') : '-';
        const bar = (pct, color = '#059669', h = 6) => `<div style="height:${h}px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:999px"></div></div>`;
        const card = (label, value, color = '#065f46') => `
            <div style="border:1px solid #e2e8f0;border-radius:9px;background:#fff;padding:8px;text-align:center;min-height:60px;overflow:hidden">
                <div style="font-size:20px;font-weight:900;color:${color};line-height:1.08;">${escHtml(String(value))}</div>
                <div style="font-size:8.2px;color:#475569;font-weight:900;margin-top:4px;line-height:1.12;">${label}</div>
            </div>`;
        const sectionTitle = (title, sub = '') => `
            <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:5px;margin-bottom:7px">
                <div><h2 style="font-size:11.6px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="font-size:7.8px;color:#64748b;margin:1px 0 0">${sub}</p>` : ''}</div>
            </div>`;
        const header = `
            <div style="background:#065f46;color:#fff;padding:13px 24px;display:flex;justify-content:space-between;gap:18px;flex-shrink:0">
                <div style="min-width:0;max-width:560px">
                    <div style="font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#a7f3d0;">Official Safety KPI Report</div>
                    <div style="font-size:17px;font-weight:900;margin-top:4px;line-height:1.12;word-break:break-word;">${escHtml(currentKpiAnnouncement?.AnnouncementTitle || `KPI Overview ${_selectedYear}`)}</div>
                    <div style="font-size:9.2px;color:#d1fae5;margin-top:3px;line-height:1.2;word-break:break-word;">${escHtml(scopeText)}</div>
                </div>
                <div style="text-align:right;font-size:8.4px;color:#d1fae5;line-height:1.42;white-space:nowrap;">
                    <div>Thai Summit Harness Co., Ltd.</div>
                    <div>Generated ${generatedAt}</div>
                    <div>Page 1 / 1</div>
                    <div>Classification: Internal Use Only</div>
                </div>
            </div>`;
        const footer = `
            <div style="margin-top:auto;padding:7px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#64748b;font-size:8px;flex-shrink:0">
                <span>Safety KPI Report - Thai Summit Harness Co., Ltd.</span>
                <span>Page 1 / 1</span>
            </div>`;
        const deptPanel = deptSummary.slice(0, 4).map(d => `
            <div style="margin-bottom:5px;break-inside:avoid">
                <div style="display:flex;justify-content:space-between;gap:8px;font-size:8px;margin-bottom:2px">
                    <b style="color:#334155;line-height:1.2;word-break:break-word">${escHtml(d.dept)}</b>
                    <span style="font-weight:900;color:${d.over ? '#dc2626' : '#059669'}">${d.compliance}%</span>
                </div>
                ${bar(d.compliance, d.over ? '#d97706' : '#059669', 5)}
                <div style="font-size:6.8px;color:#94a3b8;margin-top:2px">Total ${d.total} - On ${d.ok} - Off ${d.over} - No data ${d.nodata}</div>
            </div>`).join('');
        const priorityPanel = priorityRows.length ? priorityRows.map((k, idx) => {
            const trend = getTrendInfo(k);
            return `<div style="display:grid;grid-template-columns:16px minmax(0,1fr) 46px;gap:7px;padding:4px 0;border-bottom:1px solid #e2e8f0;font-size:7.6px">
                <b style="color:#dc2626;text-align:center">${idx + 1}</b>
                <div style="min-width:0"><b style="color:#334155;line-height:1.2;word-break:break-word">${escHtml(k.Metric || '-')}</b><div style="color:#64748b;margin-top:1px">${escHtml(k.Department || 'General')}</div></div>
                <div style="text-align:right;color:#dc2626;font-weight:900">${trend ? `${trend.dir} ${trend.pct}%` : `YTD ${fmt(calcYtdSum(k))}`}</div>
            </div>`;
        }).join('') : `<div style="font-size:9px;color:#059669;text-align:center;padding:12px;font-weight:900">No off-track KPI in current scope</div>`;
        const table = () => `
            <table style="width:100%;border-collapse:collapse;font-size:${denseRegister ? '7.2px' : '7.8px'};border:1px solid #e2e8f0;">
                <thead><tr style="background:#065f46;color:#fff;">
                    <th style="padding:4px;text-align:center;width:27px;">No.</th>
                    <th style="padding:4px;text-align:left;">Metric</th>
                    <th style="padding:4px;text-align:left;width:100px;">Department</th>
                    <th style="padding:4px;text-align:right;width:50px;">Target</th>
                    <th style="padding:4px;text-align:right;width:50px;">YTD</th>
                    <th style="padding:4px;text-align:right;width:40px;">W</th>
                    <th style="padding:4px;text-align:center;width:68px;">Status</th>
                </tr></thead>
                <tbody>${rows.length ? rows.map((k, idx) => {
                    const status = calcKpiStatus(k);
                    const meta = statusMeta[status] || statusMeta.nodata;
                    const ytd = calcYtdSum(k);
                    return `<tr style="background:${idx % 2 ? '#fff' : '#f8fafc'};">
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${idx + 1}</td>
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:800;line-height:1.16;word-break:break-word">${escHtml(k.Metric || '-')}</td>
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;color:#475569;line-height:1.16;word-break:break-word">${escHtml(k.Department || '-')}</td>
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569;">${escHtml(k.Target ?? '-')}</td>
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:900;color:#1e293b;">${fmt(ytd)}</td>
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;">${escHtml(k.Weight ?? 1)}</td>
                        <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:center;">
                            <span style="display:inline-block;border-radius:999px;padding:1px 5px;background:${meta.bg};color:${meta.color};font-size:6.8px;font-weight:900;white-space:nowrap;">${meta.label}</span>
                        </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="7" style="padding:28px;text-align:center;color:#94a3b8;">No KPI records in current scope</td></tr>`}</tbody>
            </table>`;

        const page = `
            <div class="kpi-pdf-page" style="width:794px;height:1122px;background:#fff;font-family:Kanit,Arial,sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden;">
                ${header}
                <div class="kpi-pdf-content" style="flex:1;padding:12px 18px 9px;overflow:hidden;min-height:0">
                    <div class="kpi-pdf-content-inner" style="display:flex;flex-direction:column;gap:8px;transform-origin:top left;">
                        ${sectionTitle('1. Report Summary / ภาพรวม KPI', 'สรุปสถานะ KPI ตาม scope และ filter ปัจจุบัน')}
                        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;">
                            ${card('Total KPI', total, '#065f46')}
                            ${card('On Track', onTrack, '#059669')}
                            ${card('Off Track', offTrack, '#dc2626')}
                            ${card('No Data', noData, '#64748b')}
                            ${card('Compliance', `${compliance}%`, compliance >= 85 ? '#059669' : compliance >= 70 ? '#d97706' : '#dc2626')}
                            ${card('Composite', composite == null ? '-' : `${composite}%`, composite == null ? '#64748b' : composite >= 80 ? '#059669' : '#d97706')}
                        </div>
                        <div style="display:grid;grid-template-columns:1.08fr .92fr;gap:8px">
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:9px;background:#f8fafc">
                                <div style="font-size:10.6px;font-weight:900;color:#065f46;margin-bottom:5px">Report Health</div>
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
                                    <div style="font-size:20px;font-weight:900;line-height:1.14;color:${healthColor}">${reportHealth}</div>
                                    <div style="font-size:7.5px;color:#64748b;text-align:right;line-height:1.25">Measured ${measured}<br>Scope ${escHtml(scopeText)}</div>
                                </div>
                                ${bar(compliance, healthColor, 6)}
                                <div style="font-size:7.8px;color:#475569;line-height:1.35;margin-top:6px">On-track ratio is ${compliance}% from measured KPI rows. Weighted composite score is ${composite == null ? '-' : composite + '%'}.</div>
                            </div>
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:9px">${sectionTitle('2. Priority Off-track', 'KPI ที่ควรติดตามก่อน')}${priorityPanel}</div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:9px">${sectionTitle('3. Department Focus', 'สถานะตามแผนก / หน่วยงาน')}${deptPanel || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:18px">No department data</div>'}</div>
                            <div style="border:1px solid #e2e8f0;border-radius:10px;padding:9px;background:#f0fdf4">
                                <div style="font-size:10.6px;font-weight:900;color:#065f46;margin-bottom:5px">4. Follow-up Notes</div>
                                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:7.4px;color:#334155;line-height:1.3">
                                    <div><b style="color:#dc2626">Off-track</b><br>Review owner, trend and action plan for red KPI rows.</div>
                                    <div><b style="color:#d97706">No data</b><br>Complete monthly actual values before management review.</div>
                                    <div><b style="color:#0f766e">Control</b><br>Keep evidence and month-to-month monitoring aligned with the KPI announcement.</div>
                                </div>
                            </div>
                        </div>
                        <div style="font-size:11.8px;font-weight:900;color:#065f46;border-bottom:2px solid #d1fae5;padding-bottom:5px;margin-top:1px;">
                            5. KPI Register (${total ? `1-${total}` : '0'} / ${total})
                        </div>
                        ${table()}
                    </div>
                </div>
                ${footer}
            </div>`;

        holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;';
        holder.innerHTML = page;
        document.body.appendChild(holder);
        holder.querySelectorAll('.kpi-pdf-content').forEach(content => {
            const inner = content.querySelector('.kpi-pdf-content-inner');
            if (!inner) return;
            const scale = Math.min(1.3, Math.max(0.72, content.clientHeight / Math.max(1, inner.scrollHeight)));
            inner.style.transform = `scale(${scale})`;
            inner.style.width = `${100 / scale}%`;
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageEl = holder.querySelector('.kpi-pdf-page');
        const canvas = await window.html2canvas(pageEl, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297);
        pdf.save(`KPI_Report_${_selectedYear}.pdf`);
        showToast('ส่งออก PDF สำเร็จ', 'success');
    } catch (err) { showError(err); }
    finally {
        if (holder?.parentNode) holder.parentNode.removeChild(holder);
        hideLoading();
    }
}

function calcCompositeScore(kpiData) {
    const relevant = kpiData.filter(k => calcKpiStatus(k) !== 'nodata');
    if (relevant.length === 0) return null;
    const totalW = relevant.reduce((s, k) => s + (parseFloat(k.Weight) || 1), 0);
    const passW  = relevant.reduce((s, k) => s + (calcKpiStatus(k) === 'ok' ? (parseFloat(k.Weight) || 1) : 0), 0);
    return totalW > 0 ? Math.round((passW / totalW) * 100) : 0;
}

async function handleExportPdfPaged() {
    if (!window.html2canvas || !window.jspdf) { showToast('ไลบรารี PDF ยังโหลดไม่เสร็จ', 'error'); return; }
    showLoading('กำลังสร้าง PDF...');
    let holder;
    try {
        const rows = getFilteredData();
        const total = rows.length;
        const onTrack = rows.filter(k => calcKpiStatus(k) === 'ok').length;
        const offTrack = rows.filter(k => calcKpiStatus(k) === 'over').length;
        const noData = rows.filter(k => calcKpiStatus(k) === 'nodata').length;
        const measured = Math.max(1, total - noData);
        const compliance = total > 0 ? Math.round((onTrack / measured) * 100) : 0;
        const composite = calcCompositeScore(rows);
        const generatedAt = new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' });
        const scopeText = [
            `FY ${_selectedYear}`,
            _filterDept !== 'all' ? _filterDept : 'All departments',
            _filterStatus !== 'all' ? _filterStatus : 'All status',
        ].join(' / ');
        const reportHealth = compliance >= 85 ? 'Stable' : compliance >= 70 ? 'Watch' : 'Action';
        const healthColor = reportHealth === 'Stable' ? '#059669' : reportHealth === 'Watch' ? '#d97706' : '#dc2626';

        const statusMeta = {
            ok: { label: 'On Track', color: '#059669', bg: '#d1fae5' },
            over: { label: 'Off Track', color: '#dc2626', bg: '#fee2e2' },
            nodata: { label: 'No Data', color: '#64748b', bg: '#f1f5f9' },
        };
        const deptSummary = Array.from(rows.reduce((map, k) => {
            const dept = k.Department || 'General';
            const item = map.get(dept) || { dept, total: 0, ok: 0, over: 0, nodata: 0 };
            const status = calcKpiStatus(k);
            item.total += 1;
            if (status === 'ok') item.ok += 1;
            else if (status === 'over') item.over += 1;
            else item.nodata += 1;
            map.set(dept, item);
            return map;
        }, new Map()).values()).map(d => {
            const measuredDept = Math.max(1, d.total - d.nodata);
            return { ...d, compliance: Math.round((d.ok / measuredDept) * 100) };
        }).sort((a, b) => b.over - a.over || a.compliance - b.compliance || b.total - a.total);
        const priorityRows = rows
            .filter(k => calcKpiStatus(k) === 'over')
            .sort((a, b) => (parseFloat(b.Weight) || 1) - (parseFloat(a.Weight) || 1))
            .slice(0, 4);

        const pageItems = [];
        const firstRows = rows.slice(0, 4);
        pageItems.push({ rows: firstRows, start: 0 });
        for (let i = firstRows.length; i < rows.length; i += 16) pageItems.push({ rows: rows.slice(i, i + 16), start: i });
        if (!pageItems.length) pageItems.push({ rows: [], start: 0 });
        const totalPages = pageItems.length;

        const fmt = v => Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }).replace(/\.0$/, '') : '-';
        const bar = (pct, color = '#059669', h = 7) => `<div style="height:${h}px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:999px"></div></div>`;
        const card = (label, value, color = '#065f46', sub = '') => `
            <div style="border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:9px;text-align:center;min-height:68px;overflow:hidden">
                <div style="font-size:21px;font-weight:900;color:${color};line-height:1.12;">${escHtml(String(value))}</div>
                <div style="font-size:8.4px;color:#475569;font-weight:900;margin-top:5px;line-height:1.15;">${label}</div>
                ${sub ? `<div style="font-size:7.6px;color:#94a3b8;margin-top:2px">${escHtml(sub)}</div>` : ''}
            </div>`;
        const sectionTitle = (title, sub = '') => `
            <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px">
                <div><h2 style="font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>${sub ? `<p style="font-size:9.2px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}</div>
            </div>`;
        const header = (pageNo) => `
            <div style="background:#065f46;color:#fff;padding:17px 28px;display:flex;justify-content:space-between;gap:20px;flex-shrink:0">
                <div style="min-width:0;max-width:560px">
                    <div style="font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#a7f3d0;">Official Safety KPI Report</div>
                    <div style="font-size:20px;font-weight:900;margin-top:5px;line-height:1.18;word-break:break-word;">${escHtml(currentKpiAnnouncement?.AnnouncementTitle || `KPI Overview ${_selectedYear}`)}</div>
                    <div style="font-size:10.5px;color:#d1fae5;margin-top:4px;line-height:1.25;word-break:break-word;">${escHtml(scopeText)}</div>
                </div>
                <div style="text-align:right;font-size:9.2px;color:#d1fae5;line-height:1.55;white-space:nowrap;">
                    <div>Thai Summit Harness Co., Ltd.</div>
                    <div>Generated ${generatedAt}</div>
                    <div>Page ${pageNo} / ${totalPages}</div>
                    <div>Classification: Internal Use Only</div>
                </div>
            </div>`;
        const footer = (pageNo) => `
            <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#64748b;font-size:8.8px;flex-shrink:0">
                <span>Safety KPI Report - Thai Summit Harness Co., Ltd.</span>
                <span>Page ${pageNo} / ${totalPages}</span>
            </div>`;
        const deptPanel = deptSummary.slice(0, 4).map(d => `
            <div style="margin-bottom:7px;break-inside:avoid">
                <div style="display:flex;justify-content:space-between;gap:8px;font-size:8.8px;margin-bottom:3px">
                    <b style="color:#334155;line-height:1.2;word-break:break-word">${escHtml(d.dept)}</b>
                    <span style="font-weight:900;color:${d.over ? '#dc2626' : '#059669'}">${d.compliance}%</span>
                </div>
                ${bar(d.compliance, d.over ? '#d97706' : '#059669', 6)}
                <div style="font-size:7.4px;color:#94a3b8;margin-top:2px">Total ${d.total} · On ${d.ok} · Off ${d.over} · No data ${d.nodata}</div>
            </div>`).join('');
        const priorityPanel = priorityRows.length ? priorityRows.map((k, idx) => {
            const trend = getTrendInfo(k);
            return `<div style="display:grid;grid-template-columns:18px minmax(0,1fr) 48px;gap:8px;padding:5px 0;border-bottom:1px solid #e2e8f0;font-size:8.2px">
                <b style="color:#dc2626;text-align:center">${idx + 1}</b>
                <div style="min-width:0"><b style="color:#334155;line-height:1.2;word-break:break-word">${escHtml(k.Metric || '-')}</b><div style="color:#64748b;margin-top:1px">${escHtml(k.Department || 'General')}</div></div>
                <div style="text-align:right;color:#dc2626;font-weight:900">${trend ? `${trend.dir} ${trend.pct}%` : `YTD ${fmt(calcYtdSum(k))}`}</div>
            </div>`;
        }).join('') : `<div style="font-size:10px;color:#059669;text-align:center;padding:18px;font-weight:900">No off-track KPI in current scope</div>`;
        const table = (chunk, startIndex) => `
            <table style="width:100%;border-collapse:collapse;font-size:8.6px;border:1px solid #e2e8f0;">
                <thead><tr style="background:#065f46;color:#fff;">
                    <th style="padding:6px;text-align:center;width:30px;">No.</th>
                    <th style="padding:6px;text-align:left;">Metric</th>
                    <th style="padding:6px;text-align:left;width:112px;">Department</th>
                    <th style="padding:6px;text-align:right;width:54px;">Target</th>
                    <th style="padding:6px;text-align:right;width:54px;">YTD</th>
                    <th style="padding:6px;text-align:right;width:46px;">Weight</th>
                    <th style="padding:6px;text-align:center;width:74px;">Status</th>
                </tr></thead>
                <tbody>${chunk.length ? chunk.map((k, idx) => {
                    const status = calcKpiStatus(k);
                    const meta = statusMeta[status] || statusMeta.nodata;
                    const ytd = calcYtdSum(k);
                    return `<tr style="background:${idx % 2 ? '#fff' : '#f8fafc'};">
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${startIndex + idx + 1}</td>
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:800;line-height:1.22;word-break:break-word">${escHtml(k.Metric || '-')}</td>
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;color:#475569;line-height:1.22;word-break:break-word">${escHtml(k.Department || '-')}</td>
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569;">${escHtml(k.Target ?? '-')}</td>
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:900;color:#1e293b;">${fmt(ytd)}</td>
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;">${escHtml(k.Weight ?? 1)}</td>
                        <td style="padding:5px;border-bottom:1px solid #e2e8f0;text-align:center;">
                            <span style="display:inline-block;border-radius:999px;padding:2px 7px;background:${meta.bg};color:${meta.color};font-size:8px;font-weight:900;">${meta.label}</span>
                        </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="7" style="padding:28px;text-align:center;color:#94a3b8;">No KPI records in current scope</td></tr>`}</tbody>
            </table>`;

        const pages = pageItems.map(({ rows: chunk, start }, pageIdx) => `
            <div class="kpi-pdf-page" style="width:794px;height:1122px;background:#fff;font-family:Kanit,Arial,sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden;">
                ${header(pageIdx + 1)}
                <div style="flex:1;padding:17px 28px 14px;overflow:hidden;display:flex;flex-direction:column;gap:10px;min-height:0">
                    ${pageIdx === 0 ? `
                    ${sectionTitle('1. Report Summary / ภาพรวม KPI', 'สรุปสถานะ KPI ตาม scope และ filter ปัจจุบัน')}
                    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;">
                        ${card('Total KPI', total, '#065f46')}
                        ${card('On Track', onTrack, '#059669')}
                        ${card('Off Track', offTrack, '#dc2626')}
                        ${card('No Data', noData, '#64748b')}
                        ${card('Compliance', `${compliance}%`, compliance >= 85 ? '#059669' : compliance >= 70 ? '#d97706' : '#dc2626')}
                        ${card('Composite', composite == null ? '-' : `${composite}%`, composite == null ? '#64748b' : composite >= 80 ? '#059669' : '#d97706')}
                    </div>
                    <div style="display:grid;grid-template-columns:1.05fr .95fr;gap:12px">
                        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc">
                            <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:7px">Report Health</div>
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
                                <div style="font-size:25px;font-weight:900;line-height:1.22;color:${healthColor}">${reportHealth}</div>
                                <div style="font-size:8.4px;color:#64748b;text-align:right">Measured ${measured}<br>Scope ${escHtml(scopeText)}</div>
                            </div>
                            ${bar(compliance, healthColor, 7)}
                            <div style="font-size:9px;color:#475569;line-height:1.5;margin-top:8px">On-track ratio is ${compliance}% from measured KPI rows. Weighted composite score is ${composite == null ? '-' : composite + '%'}.</div>
                        </div>
                        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">${sectionTitle('2. Priority Off-track', 'KPI ที่ควรติดตามก่อน')}${priorityPanel}</div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">${sectionTitle('3. Department Focus', 'สถานะตามแผนก / หน่วยงาน')}${deptPanel || '<div style="font-size:10px;color:#94a3b8;text-align:center;padding:18px">No department data</div>'}</div>
                        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f0fdf4">
                            <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:6px">4. Follow-up Notes</div>
                            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:8.5px;color:#334155;line-height:1.38">
                                <div><b style="color:#dc2626">Off-track</b><br>Review owner, trend and action plan for red KPI rows.</div>
                                <div><b style="color:#d97706">No data</b><br>Complete monthly actual values before management review.</div>
                                <div><b style="color:#0f766e">Control</b><br>Keep evidence and month-to-month monitoring aligned with the KPI announcement.</div>
                            </div>
                        </div>
                    </div>` : ''}
                    <div style="font-size:13px;font-weight:900;color:#065f46;border-bottom:2px solid #d1fae5;padding-bottom:6px;">
                        ${pageIdx === 0 ? '5.' : ''} KPI Register (${chunk.length ? `${start + 1}-${start + chunk.length}` : '0'} / ${total})
                    </div>
                    ${table(chunk, start)}
                </div>
                ${footer(pageIdx + 1)}
            </div>`);

        holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;';
        holder.innerHTML = pages.join('');
        document.body.appendChild(holder);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageEls = Array.from(holder.querySelectorAll('.kpi-pdf-page'));
        for (let i = 0; i < pageEls.length; i++) {
            const canvas = await window.html2canvas(pageEls[i], { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297);
        }
        pdf.save(`KPI_Report_${_selectedYear}.pdf`);
        showToast('ส่งออก PDF สำเร็จ', 'success');
    } catch (err) { showError(err); }
    finally {
        if (holder?.parentNode) holder.parentNode.removeChild(holder);
        hideLoading();
    }
}

function getFilteredData() {
    return allKpiDataForYear.filter(k => {
        if (_filterDept !== 'all' && k.Department !== _filterDept) return false;
        if (_filterStatus !== 'all' && calcKpiStatus(k) !== _filterStatus) return false;
        if (_filterSearch) {
            const q = _filterSearch.toLowerCase();
            if (!(k.Metric || '').toLowerCase().includes(q) && !(k.Department || '').toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

function getUniqueDepts(kpiData) {
    return [...new Set(kpiData.map(k => k.Department || '').filter(Boolean))].sort();
}

function normalizeKpiKeyPart(value) {
    return String(value || '').trim().toLowerCase();
}

function getKpiDuplicateKey(data) {
    return [
        normalizeKpiKeyPart(data.Year ?? _selectedYear),
        normalizeKpiKeyPart(data.AnnouncementID ?? currentAnnouncementId),
        normalizeKpiKeyPart(data.Metric),
        normalizeKpiKeyPart(data.Department),
    ].join('|');
}

function parseOptionalNumber(value, label) {
    if (value === null || value === undefined || String(value).trim() === '') return { value: null };
    const num = Number(value);
    if (!Number.isFinite(num)) return { error: `${label} ต้องเป็นตัวเลข` };
    return { value: num };
}

function validateKpiPayload(data, { monthlyRequired = false } = {}) {
    const errors = [];
    if (!String(data.Metric || '').trim()) errors.push('กรุณากรอกชื่อตัวชี้วัด');
    const target = parseOptionalNumber(data.Target, 'เป้าหมาย');
    if (target.error) errors.push(target.error);
    if (target.value === null) errors.push('กรุณากรอกเป้าหมาย');
    const weight = parseOptionalNumber(data.Weight ?? 1, 'น้ำหนัก');
    if (weight.error) errors.push(weight.error);
    if (weight.value !== null && weight.value <= 0) errors.push('น้ำหนักต้องมากกว่า 0');
    MONTHS.forEach(m => {
        const monthValue = parseOptionalNumber(data[m], m);
        if (monthValue.error) errors.push(monthValue.error);
        if (monthlyRequired && monthValue.value === null) errors.push(`${m} ต้องเป็นตัวเลข`);
    });
    return errors;
}

function getAnnouncementLabel(kpi = {}) {
    const annId = kpi.AnnouncementID || currentAnnouncementId || '';
    const title = currentKpiAnnouncement?.AnnouncementTitle || '';
    if (title && annId) return `${annId} · ${title}`;
    return annId || title || 'ยังไม่ผูกประกาศ';
}

function hasActiveKpiFilters() {
    return !!(_filterSearch || _filterDept !== 'all' || _filterStatus !== 'all');
}

function renderAccidentEvidenceStrip() {
    const rows = Array.isArray(_accidentMonthlyReports) ? _accidentMonthlyReports : [];
    const map = Object.fromEntries(rows.map(row => [String(row.MonthNo), row]));
    const completed = MONTHS.filter((_m, i) => !!map[String(i + 1)]?.ReportFileUrl).length;
    const waiting = MONTHS.filter((_m, i) => {
        const row = map[String(i + 1)];
        return row && (row.Status === 'green' || row.Status === 'red') && !row.ReportFileUrl;
    }).length;
    return `
    <div class="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/70">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-slate-400">Accident Report Monthly Evidence</p>
          <h3 class="text-sm font-black text-slate-800">หลักฐานรายงานอุบัติเหตุประจำเดือน ปี ${_selectedYear}</h3>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-100">${completed}/12 มีไฟล์รายงาน</span>
          ${waiting ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-xs font-bold text-amber-700 border border-amber-100">${waiting} เดือนรอไฟล์</span>` : ''}
          <button type="button" onclick="sessionStorage.setItem('pending_filter_accident', JSON.stringify({tab:'dashboard', year:${_selectedYear}})); location.hash='#accident';"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
            เปิด Accident Board
          </button>
        </div>
      </div>
      <div class="grid grid-cols-6 sm:grid-cols-12 gap-1.5 p-3">
        ${MONTHS.map((m, i) => {
            const row = map[String(i + 1)];
            const hasFile = !!row?.ReportFileUrl;
            const waitingFile = row && (row.Status === 'green' || row.Status === 'red') && !hasFile;
            const cls = hasFile ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                : waitingFile ? 'bg-amber-50 border-amber-100 text-amber-700'
                : 'bg-slate-50 border-slate-100 text-slate-400';
            const label = hasFile ? 'OK' : waitingFile ? 'FILE' : '-';
            return `<div class="rounded-lg border ${cls} px-2 py-1.5 text-center">
              <p class="text-[10px] font-black">${m}</p>
              <p class="text-[10px] font-bold">${label}</p>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function syncKpiFilterButton() {
    const clearBtn = document.getElementById('btn-clear-kpi-filters');
    if (!clearBtn) return;
    const active = hasActiveKpiFilters();
    clearBtn.classList.toggle('hidden', !active);
    clearBtn.classList.toggle('inline-flex', active);
}

function rerenderKpiDashboard(isAdmin) {
    const container = document.getElementById('kpi-page');
    if (container && currentKpiAnnouncement) {
        renderKpiDashboard(container, currentKpiAnnouncement, allKpiDataForYear, isAdmin);
    } else {
        renderKpiContent(isAdmin);
    }
}

function getFirstValue(obj, keys) {
    for (const key of keys) {
        const value = obj?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

async function loadKpiMasterData() {
    if (kpiMasterLoaded) return;
    const [deptRes, unitRes] = await Promise.all([
        API.get('/master/departments'),
        API.get('/master/safety-units')
    ]);
    const depts = (deptRes?.data || deptRes || [])
        .map(d => ({
            id: String(getFirstValue(d, ['id', 'DepartmentID', 'department_id']) || ''),
            name: String(getFirstValue(d, ['Name', 'name', 'Department', 'DeptName']) || '')
        }))
        .filter(d => d.name);
    const units = (unitRes?.data || unitRes || [])
        .map(u => ({
            id: String(getFirstValue(u, ['id', 'UnitID', 'unit_id']) || ''),
            name: String(getFirstValue(u, ['name', 'Name', 'UnitName', 'unit_name']) || ''),
            departmentId: String(getFirstValue(u, ['department_id', 'DepartmentID', 'departmentId']) || ''),
            departmentName: String(getFirstValue(u, ['DeptName', 'DepartmentName', 'Department', 'department']) || '')
        }))
        .filter(u => u.name);

    const options = new Map();
    depts.forEach(d => options.set(d.name, { value: d.name, label: d.name, type: 'department' }));
    units.forEach(u => {
        const dept = depts.find(d => d.id === u.departmentId)?.name || u.departmentName;
        const value = dept ? `${dept} / ${u.name}` : u.name;
        options.set(value, { value, label: value, type: 'unit' });
    });
    kpiMasterOrgOptions = Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, 'th'));
    kpiMasterLoaded = true;
}

// ─── Main Loader ─────────────────────────────────────────────────────────────
export async function loadKpiPage(year = null) {
    const container = document.getElementById('kpi-page');
    if (!kpiEventListenersAttached) { setupKpiEventListeners(); kpiEventListenersAttached = true; }

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <span class="text-sm">กำลังโหลดข้อมูล KPI...</span>
        </div>`;

    try {
        const annData = await API.get('/pagedata/kpi-announcements');
        const { current, past } = annData;
        const allAnn = [current, ...(past || [])].filter(Boolean);

        const yearSet = new Set();
        allAnn.forEach(a => { if (a.EffectiveDate) yearSet.add(new Date(a.EffectiveDate).getFullYear()); });
        yearSet.add(new Date().getFullYear());
        _availableYears = Array.from(yearSet).sort((a, b) => b - a);

        _selectedYear = year ? parseInt(year) : (current ? new Date(current.EffectiveDate).getFullYear() : new Date().getFullYear());
        [allKpiDataForYear, _prevYearData, _accidentMonthlyReports] = await Promise.all([
            API.get(`/kpidata/${_selectedYear}`),
            API.get(`/kpidata/${_selectedYear - 1}`).catch(() => []),
            API.get(`/accident/monthly-reports?year=${_selectedYear}`).then(res => res?.data || []).catch(() => []),
        ]);

        const annForYear = allAnn.find(a => new Date(a.EffectiveDate).getFullYear() == _selectedYear) || current;
        if (annForYear && new Date(annForYear.EffectiveDate).getFullYear() == _selectedYear) {
            currentAnnouncementId = String(getAnnouncementId(annForYear));
        } else {
            currentAnnouncementId = null;
        }

        const displayAnn = currentAnnouncementId ? annForYear : { AnnouncementTitle: `KPI Overview ${_selectedYear}`, id: null };
        currentKpiAnnouncement = displayAnn;
        renderKpiDashboard(container, displayAnn, allKpiDataForYear, getIsAdmin());

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="m-6 p-5 bg-red-50 text-red-600 rounded-xl text-center text-sm">${escHtml(err.message)}</div>`;
    }
}

// ─── Dashboard Renderer ───────────────────────────────────────────────────────
function renderKpiDashboard(container, announcement, kpiData, isAdmin) {
    Object.values(chartInstances).forEach(c => c.destroy());
    chartInstances = {};

    const total = kpiData.length;
    let onTrack = 0, offTrack = 0, noData = 0;
    kpiData.forEach(k => {
        const s = calcKpiStatus(k);
        if (s === 'ok') onTrack++;
        else if (s === 'over') offTrack++;
        else noData++;
    });
    const compliancePct = total > 0 ? Math.round((onTrack / (total - noData || 1)) * 100) : 0;
    const prevYearIdx = _availableYears.indexOf(_selectedYear);
    const prevYear = _availableYears[prevYearIdx + 1] ?? null;
    const nextYear = _availableYears[prevYearIdx - 1] ?? null;

    container.innerHTML = `
    <div class="animate-fade-in">

      <!-- ═══ HERO HEADER ═══ -->
      <div class="relative overflow-hidden rounded-2xl mb-6" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
        <div class="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%"><defs><pattern id="kpi-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#kpi-dots)"/></svg>
        </div>
        <div class="absolute -right-12 -top-12 w-56 h-56 rounded-full opacity-10" style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

        <div class="relative z-10 p-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <!-- Left: title -->
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                  ตัวชี้วัดความปลอดภัย
                </span>
              </div>
              <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">${announcement.AnnouncementTitle}</h1>
              ${announcement.DocumentLink ? `
              <a href="${announcement.DocumentLink}" data-action="view-doc" data-title="${announcement.AnnouncementTitle}"
                 class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 text-white border border-white/25 hover:bg-white/25 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                เอกสารประกาศอย่างเป็นทางการ
              </a>` : ''}
            </div>

            <!-- Right: year nav + admin actions -->
            <div class="flex flex-col items-end gap-3 flex-shrink-0">
              <!-- Year navigation -->
              <div class="flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-xl p-1 border border-white/20">
                <button id="btn-prev-year" ${!prevYear ? 'disabled' : ''} data-year="${prevYear}"
                  class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="px-4 text-center min-w-[80px]">
                  <div class="text-white font-bold text-lg leading-none">${_selectedYear}</div>
                  <div class="text-white/60 text-[10px] mt-0.5">ปีงบประมาณ</div>
                </div>
                <button id="btn-next-year" ${!nextYear ? 'disabled' : ''} data-year="${nextYear}"
                  class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>

              ${isAdmin ? `
              <!-- Admin actions -->
              <div class="flex items-center gap-2 flex-wrap justify-end">
                <div class="flex items-center gap-1 bg-white/15 rounded-xl p-1 border border-white/20">
                  <button id="btn-export-excel" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 text-xs font-semibold transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Excel
                  </button>
                  <div class="w-px h-4 bg-white/20"></div>
                  <button id="btn-import-excel" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 text-xs font-semibold transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/></svg>
                    Import
                  </button>
                  <div class="w-px h-4 bg-white/20"></div>
                  <button id="btn-export-pdf" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 text-xs font-semibold transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                    PDF
                  </button>
                </div>
                <input type="file" id="kpi-file-import" class="hidden" accept=".xlsx,.xls" />
                <button id="btn-manage-anns" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  จัดการประกาศ
                </button>
                <button id="btn-add-kpi" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg" style="background:rgba(255,255,255,0.95);color:#065f46">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  เพิ่ม KPI
                </button>
              </div>` : ''}
            </div>
          </div>

          <!-- Stats strip -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold text-white">${total}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">ตัวชี้วัดทั้งหมด</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:#6ee7b7">${onTrack}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">ผ่านเกณฑ์</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:${offTrack > 0 ? '#fca5a5' : '#6ee7b7'}">${offTrack}</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">เกินเกณฑ์</p>
            </div>
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
              <p class="text-2xl font-bold" style="color:${compliancePct >= 80 ? '#6ee7b7' : compliancePct >= 50 ? '#fcd34d' : '#fca5a5'}">${compliancePct}%</p>
              <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">อัตราผ่านเกณฑ์</p>
            </div>
            ${(() => {
              const cs = calcCompositeScore(kpiData);
              const hasWeights = kpiData.some(k => k.Weight && parseFloat(k.Weight) !== 1);
              if (cs === null || !hasWeights) return '';
              return `<div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px)">
                <p class="text-2xl font-bold" style="color:${cs >= 80 ? '#6ee7b7' : cs >= 50 ? '#fcd34d' : '#fca5a5'}">${cs}%</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">คะแนนถ่วงน้ำหนัก</p>
              </div>`;
            })()}
          </div>
        </div>
      </div>

      <!-- ═══ COMPLIANCE BAR ═══ -->
      ${total > 0 ? `
      <div class="ds-section p-4 mb-6 flex items-center gap-4">
        <div class="flex-shrink-0 text-center w-16">
          <div class="relative w-14 h-14 mx-auto">
            <svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" stroke-width="6"/>
              <circle cx="28" cy="28" r="22" fill="none"
                stroke="${compliancePct >= 80 ? '#10b981' : compliancePct >= 50 ? '#f59e0b' : '#ef4444'}"
                stroke-width="6" stroke-linecap="round"
                stroke-dasharray="${(2 * Math.PI * 22).toFixed(1)}"
                stroke-dashoffset="${((1 - compliancePct / 100) * 2 * Math.PI * 22).toFixed(1)}"
                style="transition:stroke-dashoffset 1s ease"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-bold" style="color:${compliancePct >= 80 ? '#065f46' : compliancePct >= 50 ? '#92400e' : '#991b1b'}">${compliancePct}%</span>
            </div>
          </div>
        </div>
        <div class="flex-1">
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-sm font-bold text-slate-700">อัตราผ่านเกณฑ์ความปลอดภัย (YTD)</span>
            <span class="text-xs text-slate-400">${onTrack} / ${total - noData} รายการ</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-1000"
              style="width:${compliancePct}%;background:${compliancePct >= 80 ? 'linear-gradient(90deg,#10b981,#34d399)' : compliancePct >= 50 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)' : 'linear-gradient(90deg,#ef4444,#f87171)'}">
            </div>
          </div>
          <div class="flex gap-4 mt-2">
            <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>ผ่านเกณฑ์ ${onTrack}</span>
            <span class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>เกินเกณฑ์ ${offTrack}</span>
            ${noData > 0 ? `<span class="flex items-center gap-1.5 text-xs text-slate-400"><span class="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>ยังไม่มีข้อมูล ${noData}</span>` : ''}
          </div>
        </div>
      </div>` : ''}

      ${renderAccidentEvidenceStrip()}

      <!-- ═══ FILTER BAR ═══ -->
      ${kpiData.length > 0 ? (() => {
        const depts = getUniqueDepts(kpiData);
        const statusFilters = [
          ['all', 'ทั้งหมด', total],
          ['ok', 'ผ่านเกณฑ์', onTrack],
          ['over', 'ไม่ผ่าน', offTrack],
          ['nodata', 'ไม่มีข้อมูล', noData],
        ];
        const statusClass = {
          all: 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-800',
          ok: 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600',
          over: 'bg-red-600 text-white shadow-sm ring-1 ring-red-600',
          nodata: 'bg-slate-500 text-white shadow-sm ring-1 ring-slate-500',
        };
        return `
      <div class="mb-5 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div class="flex flex-wrap gap-3 items-center">
          <div class="relative flex-1 min-w-[150px] max-w-xs">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input id="kpi-search" type="text" placeholder="ค้นหาตัวชี้วัด..." value="${_filterSearch}"
              class="pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm w-full focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-colors">
          </div>
          ${depts.length > 1 ? `
          <select id="kpi-filter-dept" class="rounded-lg border border-slate-200 text-sm py-2 px-2.5 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white transition-colors">
            <option value="all">ทุกแผนก</option>
            ${depts.map(d => `<option value="${d}" ${_filterDept === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>` : ''}
          <div class="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 text-xs font-bold" role="tablist" aria-label="กรองสถานะ KPI">
            ${statusFilters.map(([v, l, count]) => `
            <button type="button"
              class="kpi-status-filter inline-flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-100 ${_filterStatus === v ? statusClass[v] : 'bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-sm'}"
              data-status="${v}" aria-pressed="${_filterStatus === v}">
              <span>${l}</span>
              <span class="rounded-full px-1.5 py-0.5 text-[10px] ${_filterStatus === v ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}">${count}</span>
            </button>`).join('')}
          </div>
          <button id="btn-clear-kpi-filters" type="button"
            class="${hasActiveKpiFilters() ? 'inline-flex' : 'hidden'} items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-100">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            ล้างตัวกรอง
          </button>
          <div class="flex-1"></div>
          <div class="flex rounded-xl bg-slate-100 p-1">
            <button id="btn-view-card" title="Card View" aria-pressed="${_viewMode === 'card'}"
              class="p-2 rounded-lg transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-100 ${_viewMode==='card'?'bg-slate-800 text-white shadow-sm':'bg-white text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            </button>
            <button id="btn-view-table" title="Table View" aria-pressed="${_viewMode === 'table'}"
              class="p-2 rounded-lg transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-100 ${_viewMode==='table'?'bg-slate-800 text-white shadow-sm':'bg-white text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z"/></svg>
            </button>
          </div>
        </div>
      </div>`;
      })() : ''}
      <!-- ═══ CONTENT (card / table) ═══ -->
      <div id="kpi-content-area" class="pb-8"></div>
    </div>`;

    if (kpiData.length > 0) renderKpiContent(isAdmin);

    document.getElementById('btn-prev-year')?.addEventListener('click', e => {
        const y = e.currentTarget.dataset.year; if (y) loadKpiPage(y);
    });
    document.getElementById('btn-next-year')?.addEventListener('click', e => {
        const y = e.currentTarget.dataset.year; if (y) loadKpiPage(y);
    });
    document.getElementById('btn-view-card')?.addEventListener('click', () => { _viewMode = 'card'; rerenderKpiDashboard(isAdmin); });
    document.getElementById('btn-view-table')?.addEventListener('click', () => { _viewMode = 'table'; rerenderKpiDashboard(isAdmin); });
    document.getElementById('kpi-search')?.addEventListener('input', e => {
        _filterSearch = e.target.value;
        syncKpiFilterButton();
        renderKpiContent(isAdmin);
    });
    document.getElementById('kpi-filter-dept')?.addEventListener('change', e => { _filterDept = e.target.value; rerenderKpiDashboard(isAdmin); });
    document.getElementById('btn-clear-kpi-filters')?.addEventListener('click', () => {
        _filterDept = 'all';
        _filterStatus = 'all';
        _filterSearch = '';
        rerenderKpiDashboard(isAdmin);
    });
    document.querySelectorAll('.kpi-status-filter').forEach(btn => btn.addEventListener('click', () => { _filterStatus = btn.dataset.status; rerenderKpiDashboard(isAdmin); }));
}

function renderKpiContent(isAdmin) {
    const area = document.getElementById('kpi-content-area');
    if (!area) return;
    const filtered = getFilteredData();
    Object.values(chartInstances).forEach(c => c.destroy());
    chartInstances = {};
    if (_viewMode === 'table') {
        area.innerHTML = filtered.length > 0 ? renderTableView(filtered, isAdmin) : renderEmptyState(null, _selectedYear, isAdmin);
        if (isAdmin) attachTableListeners();
    } else {
        area.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5">
            ${filtered.length > 0
                ? filtered.map(k => createKpiMetricCard(k, isAdmin)).join('')
                : `<div class="col-span-full py-12 text-center text-slate-400">
                    <p class="font-medium">ไม่พบตัวชี้วัดที่ตรงกับตัวกรอง</p>
                    <button id="btn-clear-filters" class="mt-2 text-xs text-emerald-600 hover:underline">ล้างตัวกรอง</button>
                   </div>`}
        </div>`;
        if (filtered.length > 0) requestAnimationFrame(() => filtered.forEach(drawKpiChart));
        document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
            _filterDept = 'all'; _filterStatus = 'all'; _filterSearch = '';
            rerenderKpiDashboard(isAdmin);
        });
    }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function createKpiMetricCard(kpi, isAdmin) {
    const status = calcKpiStatus(kpi);
    const latest = getLatestMonthValue(kpi);
    const ytd = calcYtdSum(kpi);
    const parsedTarget = parseFloat(kpi.Target);
    const target = Number.isFinite(parsedTarget) ? parsedTarget : 0;
    const ytdPct = target > 0 ? Math.min(Math.round((ytd / target) * 100), 200) : 0;
    const announcementLabel = getAnnouncementLabel(kpi);

    const statusMeta = {
        ok:     { border: '#10b981', bg: '#ecfdf5', text: '#065f46', label: 'ผ่านเกณฑ์',     dot: '#10b981' },
        over:   { border: '#ef4444', bg: '#fef2f2', text: '#991b1b', label: 'เกินเกณฑ์',     dot: '#ef4444' },
        nodata: { border: '#cbd5e1', bg: '#f8fafc', text: '#64748b', label: 'ยังไม่มีข้อมูล', dot: '#94a3b8' },
    }[status];

    const adminButtons = isAdmin ? `
        <div class="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button data-id="${kpi.id}" class="btn-edit-kpi p-1.5 rounded-lg bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
          <button data-id="${kpi.id}" class="btn-delete-kpi p-1.5 rounded-lg bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>` : '';

    return `
    <div class="bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden hover:shadow-lg transition-all duration-300 relative group"
         style="border-left-color:${statusMeta.border};border-top:1px solid #f1f5f9;border-right:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9">
      ${adminButtons}

      <!-- Card Header -->
      <div class="p-5 pb-3">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">${kpi.Department || 'General'}</span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:${statusMeta.bg};color:${statusMeta.text}">
                <span class="w-1.5 h-1.5 rounded-full inline-block ${status === 'ok' ? '' : status === 'over' ? 'animate-pulse' : ''}" style="background:${statusMeta.dot}"></span>
                ${statusMeta.label}
              </span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600" title="${escHtml(announcementLabel)}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h10M7 11h10M7 15h6M5 3h14a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z"/></svg>
                ${escHtml(kpi.AnnouncementID || currentAnnouncementId || 'ประกาศ')}
              </span>
            </div>
            <h3 class="font-bold text-slate-800 leading-snug pr-16" title="${escHtml(kpi.Metric || '')}">${escHtml(kpi.Metric || '')}</h3>
          </div>
        </div>

        <!-- Current month callout + target -->
        <div class="grid grid-cols-3 gap-2 mt-3">
          <div class="col-span-1 rounded-xl p-2.5 text-center" style="background:${statusMeta.bg}">
            <div class="text-[10px] font-bold uppercase tracking-wide mb-0.5" style="color:${statusMeta.text};opacity:0.7">${latest ? latest.month : '—'}</div>
            <div class="text-xl font-bold leading-none" style="color:${statusMeta.text}">${latest ? latest.value.toLocaleString() : '—'}</div>
            <div class="text-[9px] mt-0.5" style="color:${statusMeta.text};opacity:0.6">${kpi.Unit || 'หน่วย'}</div>
          </div>
          <div class="col-span-1 rounded-xl p-2.5 text-center bg-amber-50">
            <div class="text-[10px] font-bold uppercase tracking-wide text-amber-600/70 mb-0.5">เป้าหมาย</div>
            <div class="text-xl font-bold text-amber-600 leading-none">${target.toLocaleString()}</div>
            <div class="text-[9px] text-amber-500/60 mt-0.5">${kpi.Unit || 'หน่วย'}</div>
          </div>
          <div class="col-span-1 rounded-xl p-2.5 text-center bg-slate-50">
            <div class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">YTD รวม</div>
            <div class="text-xl font-bold text-slate-700 leading-none">${ytd.toLocaleString()}</div>
            <div class="text-[9px] text-slate-400 mt-0.5">${kpi.Unit || 'หน่วย'}</div>
          </div>
        </div>

        <!-- YTD Progress bar -->
        <div class="mt-3">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] text-slate-400 font-medium">ความคืบหน้า YTD เทียบเป้าหมาย</span>
            <span class="text-[10px] font-bold" style="color:${statusMeta.text}">${ytdPct}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-700"
              style="width:${Math.min(ytdPct, 100)}%;background:${status === 'ok' ? '#10b981' : status === 'over' ? '#ef4444' : '#94a3b8'}">
            </div>
          </div>
        </div>
      </div>

      <!-- Trend + Forecast -->
      ${(() => {
        const trend = getTrendInfo(kpi);
        const forecast = calcForecast(kpi);
        if (!trend && !forecast) return '';
        const trendIcon = trend?.dir === 'up'
            ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7 7 7"/></svg>`
            : trend?.dir === 'down'
            ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7-7-7"/></svg>`
            : `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 12h14"/></svg>`;
        const trendColor = !trend || trend.dir === 'flat' ? 'text-slate-400' : trend.isBad ? 'text-red-500' : 'text-emerald-500';
        return `
        <div class="px-5 pb-3 flex items-center justify-between gap-3">
          ${trend ? `<div class="flex items-center gap-1 ${trendColor} text-[10px] font-semibold">
            ${trendIcon}
            <span>${trend.dir === 'flat' ? 'คงที่' : (trend.isBad ? 'แนวโน้มแย่ลง' : 'แนวโน้มดีขึ้น')} ${trend.dir !== 'flat' ? trend.pct + '%' : ''}</span>
          </div>` : '<div></div>'}
          ${forecast !== null ? `<div class="text-[10px] text-slate-400 font-medium">
            คาดสิ้นปี: <span class="font-bold text-slate-600">${forecast.toLocaleString()} ${kpi.Unit || ''}</span>
          </div>` : ''}
        </div>`;
      })()}

      <!-- Chart -->
      <div class="px-4 pb-4 cursor-pointer" data-action="open-drilldown" data-kpi-id="${kpi.id}">
        <div class="h-44 w-full"><canvas id="kpi-chart-${kpi.id}"></canvas></div>
      </div>
    </div>`;
}

function renderEmptyState(announcement, year, isAdmin) {
    const noAnn = !announcement?.id && !currentAnnouncementId;
    const isFiltered = hasActiveKpiFilters();
    return `
    <div class="col-span-full py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5)">
        <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
      </div>
      <h3 class="text-lg font-bold text-slate-700 mb-1">${isFiltered ? 'ไม่พบ KPI ตามตัวกรอง' : 'ยังไม่มีข้อมูล KPI'}</h3>
      ${noAnn
        ? `<p class="text-sm text-red-500 font-medium">ยังไม่มีประกาศสำหรับปี ${year} — กรุณาสร้างประกาศก่อน</p>`
        : isFiltered
          ? `<p class="text-sm text-slate-400">ลองล้างตัวกรองหรือค้นหาด้วยคำอื่น</p>
             <button id="btn-clear-filters" class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">ล้างตัวกรอง</button>`
          : `<p class="text-sm text-slate-400">${isAdmin ? 'คลิก "เพิ่ม KPI" เพื่อสร้างตัวชี้วัดใหม่ หรือ Import จาก Excel หากมีหลายรายการ' : 'ยังไม่มีข้อมูลตัวชี้วัดในปีนี้'}</p>
             ${isAdmin ? '<p class="text-xs text-slate-400 mt-2">ต้องมีประกาศ KPI ของปีนี้ก่อน ระบบจึงจะผูกตัวชี้วัดเข้ากับประกาศได้ถูกต้อง</p>' : ''}`
      }
    </div>`;
}

// ─── Table View ───────────────────────────────────────────────────────────────
function renderTableView(kpiData, isAdmin) {
    const statusMeta = {
        ok:     { dot: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'ผ่าน' },
        over:   { dot: '#ef4444', bg: 'bg-red-50',     text: 'text-red-700',     label: 'ไม่ผ่าน' },
        nodata: { dot: '#94a3b8', bg: 'bg-slate-50',   text: 'text-slate-500',   label: '—' },
    };
    const rows = kpiData.map(kpi => {
        const status = calcKpiStatus(kpi);
        const sm = statusMeta[status];
        const direction = kpi.Direction || 'lower_better';
        const target = parseFloat(kpi.Target) || 0;
        const ytd = calcYtdSum(kpi);
        const cells = MONTHS.map(m => {
            const raw = kpi[m];
            const v = (raw !== null && raw !== undefined && raw !== '') ? parseFloat(raw) : null;
            const pass = v !== null && (direction === 'higher_better' ? v >= target : v <= target);
            const bg = v === null ? '' : pass ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700';
            if (isAdmin) {
                return `<td class="px-1 py-2 text-center">
                  <input type="number" step="any"
                    class="table-month-input w-16 text-center text-xs rounded border border-transparent hover:border-slate-300 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 py-1 ${bg} outline-none transition-colors"
                    data-kpi-id="${kpi.id}" data-month="${m}" value="${v !== null ? v : ''}">
                </td>`;
            }
            return `<td class="px-2 py-2.5 text-center text-xs ${bg} rounded">${v !== null ? v.toLocaleString() : '<span class="text-slate-300">—</span>'}</td>`;
        }).join('');
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors" data-kpi-id="${kpi.id}">
          <td class="pl-4 pr-3 py-3 sticky left-0 bg-white z-10 min-w-[200px] border-r border-slate-100">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${sm.dot}"></span>
              <div>
                <p class="font-semibold text-slate-800 text-sm leading-snug">${kpi.Metric || '—'}</p>
                <p class="text-[10px] text-slate-400">${kpi.Department || ''}</p>
                <p class="text-[10px] text-indigo-500 font-semibold">${escHtml(kpi.AnnouncementID || currentAnnouncementId || 'ประกาศ KPI')}</p>
              </div>
            </div>
          </td>
          <td class="px-3 py-3 text-center min-w-[80px]">
            <span class="text-sm font-bold text-amber-600">${target.toLocaleString()}</span>
            <span class="text-[10px] text-slate-400 block">${kpi.Unit || ''}</span>
          </td>
          ${cells}
          <td class="px-3 py-3 text-center min-w-[72px]">
            <span class="text-sm font-bold text-slate-700">${ytd.toLocaleString()}</span>
          </td>
          <td class="px-3 py-3 text-center min-w-[80px]">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sm.bg} ${sm.text}">
              <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${sm.dot}"></span>
              ${sm.label}
            </span>
          </td>
          ${isAdmin ? `<td class="px-2 py-3 text-center min-w-[72px]">
            <div class="flex items-center justify-center gap-1">
              <button data-id="${kpi.id}" class="btn-edit-kpi p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button data-id="${kpi.id}" class="btn-delete-kpi p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>` : ''}
        </tr>`;
    }).join('');

    return `
    <div class="ds-table-wrap">
      <div class="overflow-x-auto">
        <table class="ds-table text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
              <th class="text-left pl-4 pr-3 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[200px]">ตัวชี้วัด</th>
              <th class="px-3 py-3 text-center min-w-[80px] text-amber-600">เป้าหมาย</th>
              ${MONTHS.map(m => `<th class="px-2 py-3 text-center min-w-[64px]">${m}</th>`).join('')}
              <th class="px-3 py-3 text-center min-w-[72px]">YTD</th>
              <th class="px-3 py-3 text-center min-w-[80px]">สถานะ</th>
              ${isAdmin ? '<th class="px-2 py-3 text-center min-w-[72px]">จัดการ</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${isAdmin ? `
      <div class="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
        <p id="table-change-info" class="text-xs text-slate-400">แก้ไขค่าในตารางได้โดยตรง</p>
        <button id="btn-save-table" disabled
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style="background:linear-gradient(135deg,#059669,#0d9488)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          บันทึกการเปลี่ยนแปลง
        </button>
      </div>` : ''}
    </div>`;
}

function attachTableListeners() {
    _tableChanges = {};
    const saveBtn = document.getElementById('btn-save-table');
    const info = document.getElementById('table-change-info');

    document.querySelectorAll('.table-month-input').forEach(inp => {
        inp.addEventListener('change', e => {
            const id = e.target.dataset.kpiId;
            const month = e.target.dataset.month;
            const parsed = parseOptionalNumber(e.target.value, month);
            if (parsed.error) {
                showToast(parsed.error, 'error');
                e.target.value = '';
                return;
            }
            const val = parsed.value;
            if (!_tableChanges[id]) _tableChanges[id] = {};
            _tableChanges[id][month] = val;

            const count = Object.keys(_tableChanges).length;
            if (saveBtn) saveBtn.disabled = count === 0;
            if (info) info.textContent = count > 0 ? `มีการเปลี่ยนแปลง ${count} รายการ` : 'แก้ไขค่าในตารางได้โดยตรง';
        });
    });

    saveBtn?.addEventListener('click', handleSaveTableChanges);
}

async function handleSaveTableChanges() {
    const updates = Object.entries(_tableChanges).map(([id, fields]) => ({ id, ...fields }));
    if (updates.length === 0) return;
    const saveBtn = document.getElementById('btn-save-table');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full mr-1"></span>กำลังบันทึก...'; }
    showLoading('กำลังบันทึก...');
    try {
        await API.put('/kpidata/bulk', updates);
        _tableChanges = {};
        showToast(`บันทึกสำเร็จ ${updates.length} รายการ`, 'success');
        await loadKpiPage(_selectedYear);
    } catch (err) { showError(err); }
    finally { hideLoading(); }
}

// ─── Chart ────────────────────────────────────────────────────────────────────
function drawKpiChart(kpi) {
    const ctx = document.getElementById(`kpi-chart-${kpi.id}`);
    if (!ctx) return;
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

    const dataPoints = MONTHS.map(m => {
        const v = kpi[m];
        return (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
    });
    const target = parseFloat(kpi.Target);
    const direction = kpi.Direction || 'lower_better';
    const barColors = dataPoints.map(v => {
        if (v === null) return 'transparent';
        const pass = direction === 'higher_better' ? v >= target : v <= target;
        return pass ? '#10b981' : '#ef4444';
    });
    const instance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [
                {
                    label: 'Actual',
                    data: dataPoints,
                    backgroundColor: barColors,
                    borderRadius: 5,
                    barPercentage: 0.65,
                    minBarLength: 4,
                    order: 2,
                    datalabels: {
                        anchor: 'end', align: 'top', offset: -2,
                        color: c => c.dataset.data[c.dataIndex] > target ? '#dc2626' : '#64748b',
                        font: { family: 'Kanit', weight: 'bold', size: 9 },
                        formatter: v => v === null ? '' : v
                    }
                },
                {
                    label: 'Target',
                    data: Array(12).fill(target),
                    type: 'line',
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    fill: false,
                    order: 1,
                    datalabels: { display: false }
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 18, left: 2, right: 2 } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { display: false } },
                x: { grid: { display: false }, ticks: { font: { family: 'Kanit', size: 9 }, color: '#94a3b8' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.92)',
                    titleFont: { family: 'Kanit', size: 11 },
                    bodyFont: { family: 'Kanit', size: 11 },
                    padding: 10, cornerRadius: 8,
                    callbacks: {
                        title: items => items[0].label,
                        label: c => {
                            const v = c.raw;
                            if (v === null) return ' ไม่มีข้อมูล';
                            const pass = direction === 'higher_better' ? v >= target : v <= target;
                            return ` ค่าจริง: ${v}  ${pass ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'}`;
                        },
                        afterLabel: c => c.dataset.label === 'Actual' ? ` เป้าหมาย: ${target}` : null
                    }
                }
            }
        }
    });
    chartInstances[kpi.id] = instance;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupKpiEventListeners() {
    document.addEventListener('click', async e => {
        if (!e.target.closest('#kpi-page') && !e.target.closest('#modal-container')) return;
        const t = e.target;

        if (t.closest('#btn-add-kpi')) {
            if (!currentAnnouncementId) { showToast('กรุณาสร้างประกาศสำหรับปีนี้ก่อน', 'error'); return; }
            await showKpiForm(null, currentAnnouncementId); return;
        }
        if (t.closest('#btn-manage-anns')) { showAnnouncementManager(); return; }
        if (t.closest('#btn-export-excel')) { handleExportExcel(); return; }
        if (t.closest('#btn-export-pdf')) { handleExportPdf(); return; }
        if (t.closest('#btn-import-excel')) {
            if (!currentAnnouncementId) { showToast('กรุณาสร้างประกาศก่อน', 'error'); return; }
            document.getElementById('kpi-file-import')?.click(); return;
        }
        if (t.matches('#btn-add-ann-modal')) { showAnnouncementForm(); return; }

        const editBtn = t.closest('.btn-edit-kpi');
        if (editBtn) {
            const kpi = allKpiDataForYear.find(k => String(k.id) === String(editBtn.dataset.id));
            if (kpi) await showKpiForm(kpi); return;
        }

        const deleteBtn = t.closest('.btn-delete-kpi');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const kpi = allKpiDataForYear.find(k => String(k.id) === String(id));
            const name = kpi?.Metric || 'รายการนี้';
            const ok = await showConfirmationModal(
                'ยืนยันการลบ KPI',
                `ต้องการลบตัวชี้วัด "${escHtml(name)}" ใช่หรือไม่?<br><br><span class="text-sm text-slate-500">ปี: ${escHtml(kpi?.Year || _selectedYear || '-')}<br>แผนก/หน่วยงาน: ${escHtml(kpi?.Department || '-')}<br>ประกาศ: ${escHtml(kpi?.AnnouncementID || currentAnnouncementId || '-')}</span><br><br><span class="text-sm text-red-600">การลบนี้จะลบค่ารายเดือนของ KPI นี้ด้วย</span>`
            );
            if (ok) handleDeleteKpi(id); return;
        }

        const docBtn = t.closest('[data-action="view-doc"]');
        if (docBtn) { e.preventDefault(); showDocumentModal(docBtn.href, docBtn.dataset.title || 'เอกสาร'); return; }

        const drillBtn = t.closest('[data-action="open-drilldown"]');
        if (drillBtn) { showKpiDrilldown(drillBtn.dataset.kpiId); return; }
    });

    document.addEventListener('change', async e => {
        if (e.target.id === 'kpi-file-import') {
            const f = e.target.files[0];
            if (f) handleImportExcel(f);
            e.target.value = '';
        }
    });
}

// ─── Drill-down Modal ────────────────────────────────────────────────────────
let _prevYearData = [];

function showKpiDrilldown(kpiId) {
    const kpi = allKpiDataForYear.find(k => String(k.id) === String(kpiId));
    if (!kpi) return;
    window.closeModal = closeModal;

    const direction = kpi.Direction || 'lower_better';
    const target = parseFloat(kpi.Target) || 0;
    const trend = getTrendInfo(kpi);
    const forecast = calcForecast(kpi);
    const prevKpi = _prevYearData.find(p => p.Metric === kpi.Metric);

    const dataPoints = MONTHS.map(m => {
        const v = kpi[m]; return (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
    });
    const prevPoints = prevKpi ? MONTHS.map(m => {
        const v = prevKpi[m]; return (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
    }) : null;
    const status = calcKpiStatus(kpi);
    const statusColor = status === 'ok' ? '#10b981' : status === 'over' ? '#ef4444' : '#94a3b8';

    const monthRows = MONTHS.map((_m, i) => {
        const v = dataPoints[i];
        const prev = prevPoints?.[i];
        const pass = v !== null && (direction === 'higher_better' ? v >= target : v <= target);
        const rowBg = v === null ? '' : pass ? 'bg-emerald-50' : 'bg-red-50';
        const delta = (v !== null && prev !== null && prev !== undefined) ? (v - prev) : null;
        return `<tr class="border-b border-slate-100 ${rowBg}">
          <td class="px-3 py-2 text-xs font-bold text-slate-500">${MONTHS_TH[i]}</td>
          <td class="px-3 py-2 text-center text-sm font-bold ${v === null ? 'text-slate-300' : pass ? 'text-emerald-700' : 'text-red-700'}">${v !== null ? v.toLocaleString() : '—'}</td>
          <td class="px-3 py-2 text-center text-xs text-amber-600 font-semibold">${target.toLocaleString()}</td>
          ${prevKpi ? `<td class="px-3 py-2 text-center text-xs text-slate-400">${prev !== null ? prev.toLocaleString() : '—'}</td>
          <td class="px-3 py-2 text-center text-xs font-semibold ${delta === null ? 'text-slate-300' : delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-slate-400'}">${delta !== null ? (delta > 0 ? '+' : '') + delta.toFixed(1) : '—'}</td>` : ''}
          <td class="px-3 py-2 text-center">
            ${v !== null ? `<span class="inline-block w-2 h-2 rounded-full" style="background:${pass ? '#10b981' : '#ef4444'}"></span>` : '<span class="text-slate-300 text-xs">—</span>'}
          </td>
        </tr>`;
    }).join('');

    openModal(kpi.Metric || 'KPI Detail', `
    <div class="space-y-4">
      <!-- Summary strip -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${[
            ['เป้าหมาย', target.toLocaleString() + ' ' + (kpi.Unit || ''), '#f59e0b'],
            ['YTD รวม', calcYtdSum(kpi).toLocaleString() + ' ' + (kpi.Unit || ''), statusColor],
            ['แนวโน้ม', trend ? (trend.dir === 'flat' ? 'คงที่' : (trend.isBad ? 'แย่ลง ' : 'ดีขึ้น ') + trend.pct + '%') : '—', trend?.isBad ? '#ef4444' : '#10b981'],
            ['คาดสิ้นปี', forecast !== null ? forecast.toLocaleString() + ' ' + (kpi.Unit || '') : '—', '#6366f1'],
        ].map(([label, val, color]) => `
        <div class="rounded-xl p-3 bg-slate-50 text-center">
          <p class="text-xs text-slate-400 mb-1">${label}</p>
          <p class="text-base font-bold" style="color:${color}">${val}</p>
        </div>`).join('')}
      </div>

      <!-- Chart -->
      <div class="bg-slate-50 rounded-xl p-3">
        <div class="h-52"><canvas id="drilldown-chart"></canvas></div>
      </div>

      <!-- Monthly breakdown -->
      <div class="ds-table-wrap">
        <table class="ds-table text-sm">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="text-left px-3 py-2 text-xs font-bold text-slate-500">เดือน</th>
              <th class="text-center px-3 py-2 text-xs font-bold text-slate-600">ค่าจริง</th>
              <th class="text-center px-3 py-2 text-xs font-bold text-amber-600">เป้าหมาย</th>
              ${prevKpi ? `<th class="text-center px-3 py-2 text-xs font-bold text-slate-400">ปีก่อน</th>
              <th class="text-center px-3 py-2 text-xs font-bold text-slate-400">เปลี่ยน</th>` : ''}
              <th class="text-center px-3 py-2 text-xs font-bold text-slate-500">สถานะ</th>
            </tr>
          </thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>
    </div>`, 'max-w-2xl');

    requestAnimationFrame(() => {
        const ctx = document.getElementById('drilldown-chart');
        if (!ctx) return;
        if (_drilldownChart) { _drilldownChart.destroy(); _drilldownChart = null; }
        const barColors = dataPoints.map(v => {
            if (v === null) return 'transparent';
            return (direction === 'higher_better' ? v >= target : v <= target) ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
        });
        const datasets = [
            { label: 'ค่าจริง', data: dataPoints, backgroundColor: barColors, borderRadius: 4, barPercentage: 0.6, order: 2, datalabels: { display: false } },
            { label: 'เป้าหมาย', data: Array(12).fill(target), type: 'line', borderColor: '#f59e0b', borderWidth: 2, borderDash: [5,4], pointRadius: 0, fill: false, order: 1, datalabels: { display: false } },
        ];
        if (prevPoints) datasets.push({ label: 'ปีก่อน', data: prevPoints, type: 'line', borderColor: '#94a3b8', borderWidth: 1.5, borderDash: [3,3], pointRadius: 3, pointBackgroundColor: '#94a3b8', fill: false, order: 0, datalabels: { display: false } });
        _drilldownChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: MONTHS_TH, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { font: { family: 'Kanit', size: 9 } } }, x: { grid: { display: false }, ticks: { font: { family: 'Kanit', size: 9 }, color: '#94a3b8' } } },
                plugins: { legend: { display: !!prevKpi, labels: { font: { family: 'Kanit', size: 10 }, boxWidth: 12 } }, tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleFont: { family: 'Kanit', size: 11 }, bodyFont: { family: 'Kanit', size: 11 }, padding: 10, cornerRadius: 8 } }
            }
        });
    });
}

let _drilldownChart = null;
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// ─── Excel Import / Export ────────────────────────────────────────────────────
function handleExportExcel() {
    const data = allKpiDataForYear.length > 0
        ? allKpiDataForYear.map(({ id, AnnouncementID, CreatedAt, UpdatedAt, Year, ...rest }) => rest)
        : [{ Metric: 'Accident Rate', Department: 'Safety', Unit: 'Cases', Target: 0, Jan: 0, Feb: 0 }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI_Data');
    XLSX.writeFile(wb, `KPI_Export_${_selectedYear || new Date().getFullYear()}.xlsx`);
}

async function handleImportExcel(file) {
    showLoading('กำลัง Import...');
    try {
        const wb = XLSX.read(await file.arrayBuffer());
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        if (!currentAnnouncementId) throw new Error('ไม่พบ Announcement ID');
        const existingKeys = new Set(allKpiDataForYear.map(k => getKpiDuplicateKey(k)));
        const seenKeys = new Set();
        const skippedDuplicates = [];
        const invalidRows = [];
        let count = 0;

        for (const [index, row] of rows.entries()) {
            const payload = {
                AnnouncementID: currentAnnouncementId, Year: _selectedYear,
                Metric: row.Metric || 'New KPI', Department: row.Department || '',
                Unit: row.Unit || '', Target: row.Target || 0,
                Direction: row.Direction || 'lower_better',
                Weight: row.Weight || 1,
                Jan: row.Jan ?? null, Feb: row.Feb ?? null, Mar: row.Mar ?? null,
                Apr: row.Apr ?? null, May: row.May ?? null, Jun: row.Jun ?? null,
                Jul: row.Jul ?? null, Aug: row.Aug ?? null, Sep: row.Sep ?? null,
                Oct: row.Oct ?? null, Nov: row.Nov ?? null, Dec: row.Dec ?? null,
            };
            const rowNo = index + 2;
            const validationErrors = validateKpiPayload(payload);
            if (validationErrors.length > 0) {
                invalidRows.push({ rowNo, metric: payload.Metric, message: validationErrors[0] });
                continue;
            }
            const duplicateKey = getKpiDuplicateKey(payload);
            if (existingKeys.has(duplicateKey) || seenKeys.has(duplicateKey)) {
                skippedDuplicates.push({ rowNo, metric: payload.Metric, department: payload.Department });
                continue;
            }

            try {
                await API.post('/kpidata', payload);
                seenKeys.add(duplicateKey);
                count++;
            } catch (err) {
                if (err?.status === 409 || /ซ้ำ|อยู่แล้ว|duplicate/i.test(err?.message || '')) {
                    skippedDuplicates.push({ rowNo, metric: payload.Metric, department: payload.Department });
                    continue;
                }
                throw err;
            }
        }
        const parts = [`นำเข้าสำเร็จ ${count} รายการ`];
        if (skippedDuplicates.length) parts.push(`ข้ามรายการซ้ำ ${skippedDuplicates.length}`);
        if (invalidRows.length) parts.push(`ข้อมูลไม่ถูกต้อง ${invalidRows.length}`);
        const type = invalidRows.length || skippedDuplicates.length ? 'warning' : 'success';
        showToast(parts.join(' · '), type);
        if (skippedDuplicates.length || invalidRows.length) {
            const details = [
                ...skippedDuplicates.slice(0, 8).map(r => `แถว ${r.rowNo}: KPI ซ้ำ (${r.metric}${r.department ? ` / ${r.department}` : ''})`),
                ...invalidRows.slice(0, 8).map(r => `แถว ${r.rowNo}: ${r.message} (${r.metric || 'ไม่ระบุชื่อ'})`),
            ];
            console.warn('KPI import summary:', { imported: count, skippedDuplicates, invalidRows });
            showToast(escHtml(details.join('\n')).replace(/\n/g, '<br>'), 'warning');
        }
        await loadKpiPage(_selectedYear);
    } catch (err) { showError(err); } finally { hideLoading(); }
}

// ─── Announcement Manager ─────────────────────────────────────────────────────
async function showAnnouncementManager() {
    openModal('จัดการประกาศ KPI', '<div id="ann-list-content" class="py-8 text-center text-slate-400">กำลังโหลด...</div>', 'max-w-3xl');
    try {
        const announcements = await API.get('/kpiannouncements');
        const el = document.getElementById('ann-list-content');
        if (!el) return;

        el.innerHTML = `
          <div class="flex justify-between items-center mb-4">
            <p class="text-sm text-slate-500">ประกาศทั้งหมด ${announcements.length} รายการ</p>
            <button id="btn-add-ann-modal" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm" style="background:linear-gradient(135deg,#059669,#0d9488)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              สร้างประกาศใหม่
            </button>
          </div>
          <div class="space-y-2">
            ${announcements.length === 0 ? '<div class="text-center text-slate-400 py-10 bg-slate-50 rounded-xl">ยังไม่มีประกาศ</div>' :
              announcements.map(ann => `
              <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-200 hover:shadow-sm transition-all">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ann.IsCurrent ? 'bg-emerald-50' : 'bg-slate-100'}">
                    <svg class="w-5 h-5 ${ann.IsCurrent ? 'text-emerald-600' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  </div>
                  <div>
                    <div class="font-semibold text-slate-800 text-sm">${ann.AnnouncementTitle}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-xs text-slate-400">FY ${new Date(ann.EffectiveDate).getFullYear()}</span>
                      ${ann.IsCurrent
                        ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"><span class="w-1 h-1 rounded-full bg-emerald-500 animate-pulse inline-block"></span>Active</span>'
                        : '<span class="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Archived</span>'
                      }
                    </div>
                  </div>
                </div>
                <div class="flex gap-1.5 flex-shrink-0">
                  <button class="btn-edit-ann p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-colors" data-id="${ann.id}" title="แก้ไขประกาศ">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  ${!ann.IsCurrent ? `<button class="btn-set-curr-ann px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors" data-id="${ann.id}">Set Active</button>` : ''}
                  <button class="btn-del-ann p-1.5 rounded-lg border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors" data-id="${ann.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>`).join('')
            }
          </div>`;

        el.querySelectorAll('.btn-del-ann').forEach(btn => btn.addEventListener('click', async () => {
            const ok = await showConfirmationModal('ยืนยันการลบ', 'ลบประกาศนี้ใช่หรือไม่?');
            if (ok) { await API.delete(kpiAnnouncementItemUrl(btn.dataset.id)); showAnnouncementManager(); loadKpiPage(); }
        }));
        el.querySelectorAll('.btn-edit-ann').forEach(btn => btn.addEventListener('click', () => {
            const ann = announcements.find(a => String(a.id) === String(btn.dataset.id));
            if (ann) showAnnouncementForm(ann);
        }));
        el.querySelectorAll('.btn-set-curr-ann').forEach(btn => btn.addEventListener('click', async () => {
            const ann = announcements.find(a => String(a.id) === String(btn.dataset.id));
            if (ann) { await API.put(kpiAnnouncementItemUrl(btn.dataset.id), { ...ann, IsCurrent: 1 }); showAnnouncementManager(); loadKpiPage(); }
        }));
    } catch (err) {
        const el = document.getElementById('ann-list-content');
        if (el) el.innerHTML = `<p class="text-red-500 text-sm p-4">${escHtml(err.message)}</p>`;
    }
}

// ─── Announcement Form ────────────────────────────────────────────────────────
function showAnnouncementForm(announcement = null) {
    const isEdit = !!announcement;
    const annId = getAnnouncementId(announcement);
    openModal(isEdit ? 'แก้ไขประกาศ KPI' : 'สร้างประกาศใหม่', `
      <form id="ann-form" class="space-y-4 px-1">
        <input type="hidden" name="id" value="${escHtml(annId)}">
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">ชื่อประกาศ <span class="text-red-500">*</span></label>
          <input type="text" name="AnnouncementTitle" class="form-input w-full rounded-xl" required
            value="${escHtml(announcement?.AnnouncementTitle || '')}" placeholder="เช่น เป้าหมายความปลอดภัย 2568">
        </div>
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">วันที่มีผลบังคับใช้ <span class="text-red-500">*</span></label>
          <input type="text" id="ann-date" name="EffectiveDate" class="form-input w-full rounded-xl" required
            value="${escHtml(announcement?.EffectiveDate || '')}" placeholder="เลือกวันที่">
        </div>
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">ลิงก์เอกสาร (ไม่บังคับ)</label>
          <input type="text" name="DocumentLink" class="form-input w-full rounded-xl text-sm"
            value="${escHtml(announcement?.DocumentLink || '')}" placeholder="https://...">
        </div>
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1.5">หรืออัปโหลดไฟล์ (PDF / DOCX)</label>
          <input type="file" name="AnnouncementFile" accept=".pdf,.doc,.docx"
            class="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
          <p class="text-xs text-slate-400 mt-1">ถ้าเลือกไฟล์จะใช้แทนลิงก์</p>
        </div>
        <div class="flex items-center gap-2.5">
          <input type="checkbox" id="is-curr-ann" name="IsCurrent" class="w-4 h-4 rounded text-emerald-600" ${announcement?.IsCurrent ? 'checked' : ''}>
          <label for="is-curr-ann" class="text-sm font-medium text-slate-700 cursor-pointer">ตั้งเป็นประกาศปัจจุบัน</label>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-ann" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">${isEdit ? 'บันทึกประกาศ' : 'สร้างประกาศ'}</button>
        </div>
      </form>`, 'max-w-lg');

    window.flatpickr?.('#ann-date', { locale: 'th', dateFormat: 'Y-m-d', defaultDate: announcement?.EffectiveDate || 'today', mobileNative: true });
    document.getElementById('ann-form').addEventListener('submit', handleAnnouncementSubmit);
}

async function handleAnnouncementSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('#btn-submit-ann');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังบันทึก...';

    const fd = new FormData(form);
    try {
        showLoading('กำลังบันทึก...');
        const file = fd.get('AnnouncementFile');
        if (file instanceof File && file.size > 0) {
            const up = new FormData(); up.append('document', file);
            const res = await API.post('/upload/document', up);
            if (!res?.url) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
            fd.set('DocumentLink', res.url);
        }
        fd.delete('AnnouncementFile');
        const data = Object.fromEntries(fd.entries());
        data.IsCurrent = form.querySelector('#is-curr-ann').checked ? 1 : 0;
        const id = data.id || '';
        if (id) await API.put(kpiAnnouncementItemUrl(id), data);
        else await API.post('/kpiannouncements', data);
        closeModal();
        showToast(id ? 'บันทึกประกาศสำเร็จ' : 'สร้างประกาศสำเร็จ', 'success');
        await showAnnouncementManager();
        await loadKpiPage();
    } catch (err) { showError(err); }
    finally { hideLoading(); btn.disabled = false; btn.textContent = form.elements.id?.value ? 'บันทึกประกาศ' : 'สร้างประกาศ'; }
}

// ─── KPI Form ─────────────────────────────────────────────────────────────────
async function showKpiForm(kpi = null, announcementId = null) {
    const isEdit = !!kpi;
    const selYear = kpi?.Year ?? _selectedYear ?? new Date().getFullYear();
    const annId = kpi?.AnnouncementID ?? announcementId;
    try {
        await loadKpiMasterData();
    } catch (err) {
        showError(err);
        return;
    }
    const orgOptions = kpiMasterOrgOptions
        .map(item => `<option value="${escHtml(item.value)}" ${String(kpi?.Department || '') === item.value ? 'selected' : ''}>${escHtml(item.label)}</option>`)
        .join('');

    const monthInputs = MONTHS.map(m => `
      <div class="flex flex-col items-center">
        <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">${m}</label>
        <input type="number" step="any" name="${m}"
          class="w-full text-center text-sm font-semibold rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 py-2 bg-white transition-colors"
          value="${kpi?.[m] ?? ''}" placeholder="—"
          style="min-width:0">
      </div>`).join('');

    openModal(isEdit ? 'แก้ไขตัวชี้วัด KPI' : 'เพิ่มตัวชี้วัด KPI', `
      <form id="kpi-form" novalidate class="space-y-5 px-1">
        <input type="hidden" name="id" value="${kpi?.id || ''}">
        <input type="hidden" name="Year" value="${selYear}">
        <input type="hidden" name="AnnouncementID" value="${annId || ''}">

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-bold text-slate-700 mb-1.5">ชื่อตัวชี้วัด <span class="text-red-500">*</span></label>
            <input type="text" name="Metric" class="form-input w-full rounded-xl font-medium" value="${kpi?.Metric || ''}" required placeholder="เช่น อัตราการเกิดอุบัติเหตุ">
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1.5">แผนก / หน่วยงาน</label>
            <select name="Department" class="form-input w-full rounded-xl text-sm">
              <option value="">เลือกจาก Master...</option>
              ${orgOptions}
              ${kpi?.Department && !kpiMasterOrgOptions.some(item => item.value === kpi.Department)
                  ? `<option value="${escHtml(kpi.Department)}" selected>${escHtml(kpi.Department)} (เดิม)</option>`
                  : ''}
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1.5">หน่วย</label>
            <input type="text" name="Unit" class="form-input w-full rounded-xl" value="${kpi?.Unit || ''}" placeholder="เช่น ราย, ครั้ง">
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              ทิศทางตัวชี้วัด
              <span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500" title="ใช้บอกระบบว่าค่าจริงแบบไหนถือว่าผ่านเกณฑ์">?</span>
            </label>
            <select name="Direction" class="form-input w-full rounded-xl text-sm">
              <option value="lower_better" ${(kpi?.Direction || 'lower_better') === 'lower_better' ? 'selected' : ''}>น้อยกว่า = ดี (อุบัติเหตุ, ของเสีย)</option>
              <option value="higher_better" ${kpi?.Direction === 'higher_better' ? 'selected' : ''}>มากกว่า = ดี (ความสำเร็จ, อัตราผ่าน)</option>
            </select>
            <p class="text-xs text-slate-400 mt-1">เลือกให้ตรงกับวิธีวัดผล เช่น อุบัติเหตุควรน้อยกว่าเป้าหมาย</p>
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              น้ำหนัก (Weight)
              <span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500" title="ใช้ถ่วงน้ำหนักใน Composite Score: KPI สำคัญมากให้ค่าสูงกว่า 1">?</span>
            </label>
            <input type="number" step="0.1" min="0.1" name="Weight"
              class="form-input w-full rounded-xl text-sm"
              value="${kpi?.Weight ?? 1}" placeholder="1">
            <p class="text-xs text-slate-400 mt-1">ค่าเริ่มต้น 1; KPI สำคัญมากสามารถเพิ่มเป็น 1.5 หรือ 2 ได้</p>
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-bold text-slate-700 mb-1.5">เป้าหมาย <span class="text-red-500">*</span></label>
            <div class="relative">
              <input type="number" step="any" name="Target" required
                class="form-input w-full rounded-xl font-bold pl-4 pr-16 border-amber-200 focus:border-amber-400 bg-amber-50/40 text-amber-700"
                value="${kpi?.Target || ''}" placeholder="0">
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">${kpi?.Unit || 'หน่วย'}</span>
            </div>
            <p id="kpi-target-hint" class="text-xs text-slate-400 mt-1">ค่าจริง ≤ เป้าหมาย = ผ่านเกณฑ์</p>
          </div>
        </div>

        <div class="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div class="flex items-center justify-between mb-3">
            <label class="text-sm font-bold text-slate-700 flex items-center gap-2">
              <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              ข้อมูลรายเดือน (ค่าจริง)
            </label>
            <span class="text-xs text-slate-400">เว้นว่างได้ถ้าไม่มีข้อมูล</span>
          </div>
          <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">${monthInputs}</div>
        </div>

        <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onclick="document.getElementById('modal-close-btn')?.click()"
            class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
          <button type="submit" id="btn-submit-kpi"
            class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all hover:shadow-md"
            style="background:linear-gradient(135deg,#059669,#0d9488)">บันทึก KPI</button>
        </div>
      </form>`, 'max-w-4xl');

    document.getElementById('kpi-form').addEventListener('submit', handleKpiFormSubmit);

    // dynamic hint for direction
    const dirSel = document.querySelector('[name="Direction"]');
    const hint = document.getElementById('kpi-target-hint');
    if (dirSel && hint) {
        dirSel.addEventListener('change', () => {
            hint.textContent = dirSel.value === 'higher_better'
                ? 'ค่าจริง ≥ เป้าหมาย = ผ่านเกณฑ์'
                : 'ค่าจริง ≤ เป้าหมาย = ผ่านเกณฑ์';
        });
    }
}

async function handleKpiFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.Metric.value || !form.Target.value) { showToast('กรุณากรอกชื่อและเป้าหมาย', 'error'); return; }
    const btn = document.getElementById('btn-submit-kpi');
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span>กำลังบันทึก...';

    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.AnnouncementID) {
        showToast('ไม่พบ Announcement ID', 'error');
        btn.disabled = false;
        btn.textContent = 'บันทึก KPI';
        return;
    }
    MONTHS.forEach(m => { if (data[m] === '') data[m] = null; });
    const validationErrors = validateKpiPayload(data);
    if (validationErrors.length > 0) {
        showToast(validationErrors[0], 'error');
        btn.disabled = false;
        btn.textContent = 'บันทึก KPI';
        return;
    }

    try {
        if (data.id) await API.put(`/kpidata/${data.id}`, data);
        else await API.post('/kpidata', data);
        closeModal();
        await loadKpiPage(data.Year);
        showToast('บันทึก KPI สำเร็จ', 'success');
    } catch (err) { showError(err); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'บันทึก KPI'; } }
}

async function handleDeleteKpi(id) {
    showLoading('กำลังลบ...');
    try {
        await API.delete(`/kpidata/${id}`);
        await loadKpiPage(_selectedYear);
        showToast('ลบข้อมูลสำเร็จ', 'success');
    } catch (err) { showError(err); } finally { hideLoading(); }
}
