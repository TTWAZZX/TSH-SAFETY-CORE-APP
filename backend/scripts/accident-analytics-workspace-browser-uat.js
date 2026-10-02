'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const appUrl = process.env.ACCIDENT_ANALYTICS_APP_URL || 'http://localhost/tsh-safety-core/index.html#accident';
const browserPath = process.env.ACCIDENT_ANATOMY_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = Number(process.env.ACCIDENT_ANALYTICS_CDP_PORT || 9877);
const apiPort = Number(process.env.ACCIDENT_ANALYTICS_API_PORT || 5897);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-accident-analytics-'));
const errors = [];
const writes = [];
let browser;
let server;
let cdp;
let db;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const paretoLabels = [
    'บาดเจ็บจากเครื่องจักรและชิ้นส่วนที่กำลังเคลื่อนที่', 'บาดแผลฉีกขาดจากวัสดุมีคม',
    'กระดูกหักหรือร้าวจากการกระแทก', 'กล้ามเนื้ออักเสบจากการยศาสตร์',
    'แผลไหม้จากความร้อนหรือสารเคมี', 'สิ่งแปลกปลอมเข้าตา',
    'ฟกช้ำจากวัตถุตกหล่น', 'ข้อเท้าแพลงจากการลื่นสะดุด',
    'การระคายเคืองผิวหนัง', 'การสูญเสียการได้ยินชั่วคราว',
];
function mockInjuryReports(typeCount) {
    const reports = [];
    paretoLabels.slice(0, typeCount).forEach((injuryType, index) => {
        const count = typeCount - index;
        for (let caseIndex = 0; caseIndex < count; caseIndex++) reports.push({
            id: 900000 + index * 100 + caseIndex,
            AccidentDate: `2026-${String((index % 12) + 1).padStart(2, '0')}-15`,
            AccidentType: caseIndex % 3 === 0 ? 'First Aid' : 'Medical Treatment',
            InjuryType: injuryType,
            BodyPart: index % 2 ? 'มือ / นิ้วมือ' : 'เท้า / นิ้วเท้า',
            BodySide: index % 2 ? 'Left' : 'Right',
            Department: `UAT DEPARTMENT ${index + 1}`,
            Area: `UAT AREA ${index + 1}`,
            Severity: ['Minor', 'Moderate', 'Serious'][index % 3],
            LostDays: index % 4 === 0 ? 2 : 0,
        });
    });
    return reports;
}

class Cdp {
    constructor(url) { this.id = 1; this.pending = new Map(); this.socket = new WebSocket(url); }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
            if (message.method === 'Network.requestWillBeSent') {
                const request = message.params?.request || {};
                const method = String(request.method || '').toUpperCase();
                const readOnlyPost = method === 'POST' && /\/api\/session\/verify(?:\?|$)/.test(String(request.url || ''));
                if (!['GET', 'OPTIONS'].includes(method) && !readOnlyPost) writes.push(`${request.method} ${request.url}`);
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Edge CDP connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { try { this.socket.close(); } catch {} }
}

async function evaluate(expression) {
    const result = await cdp.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}

async function waitFor(expression, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${expression}`);
}

(async () => {
    assert.ok(fs.existsSync(browserPath), `Microsoft Edge not found: ${browserPath}`);
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    const [[admin]] = await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE LOWER(Role)='admin' ORDER BY EmployeeID LIMIT 1");
    assert.ok(admin, 'A local Admin account is required for read-only Browser UAT');
    const user = { id: admin.EmployeeID, EmployeeID: admin.EmployeeID, name: admin.EmployeeName, EmployeeName: admin.EmployeeName, role: admin.Role, Role: admin.Role, department: admin.Department, Department: admin.Department, unit: admin.Unit, Unit: admin.Unit, position: admin.Position, Position: admin.Position };
    const token = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department, unit: admin.Unit, position: admin.Position }, process.env.JWT_SECRET, { expiresIn: '30m' });

    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(apiPort) },
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
    });
    let serverReady = false;
    for (let attempt = 0; attempt < 80; attempt++) {
        if (server.exitCode !== null) break;
        try {
            const response = await fetch(`${apiOrigin}/api/health`);
            if (response.status > 0) { serverReady = true; break; }
        } catch {}
        await sleep(250);
    }
    assert.ok(serverReady, `Current Node API did not start on ${apiOrigin}`);

    browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--remote-allow-origins=*', '--window-size=1440,1000', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt++) {
        try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Edge page target unavailable');
    cdp = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await cdp.connect();
    await cdp.command('Runtime.enable');
    await cdp.command('Page.enable');
    await cdp.command('Network.enable');
    await cdp.command('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.API_BASE=${JSON.stringify(`${apiOrigin}/api`)};
        if (!window.Chart) {
            class AccidentUatChart {
                static instances = new WeakMap();
                constructor(context, config) {
                    this.canvas = context.canvas;
                    this.data = config.data || {};
                    this.options = config.options || {};
                    AccidentUatChart.instances.set(this.canvas, this);
                }
                destroy() { AccidentUatChart.instances.delete(this.canvas); }
                static getChart(canvas) { return AccidentUatChart.instances.get(canvas); }
            }
            window.Chart = AccidentUatChart;
        }
    ` });
    await cdp.command('Page.navigate', { url: appUrl });
    await waitFor(`document.readyState === 'complete'`);
    await evaluate(`(() => { localStorage.setItem('tsh_token', ${JSON.stringify(token)}); localStorage.setItem('tsh_user', JSON.stringify(${JSON.stringify(user)})); location.hash='#accident'; location.reload(); return true; })()`);
    await waitFor(`document.querySelector('#acc-tab-btn-analytics')`);
    await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
    await waitFor(`document.querySelector('[data-analytics-select="month"]') && document.querySelector('[data-acc-anatomy]')`, 45000);
    // The intentional anonymous -> authenticated reload can abort the anonymous branding request.
    // Start the application-console assertion after the authenticated Analytics workspace is stable.
    errors.length = 0;

    const desktop = await evaluate(`(() => ({
        filters: document.querySelectorAll('[data-analytics-select]').length,
        anatomy: Boolean(document.querySelector('[data-acc-anatomy]')),
        injury: Boolean(document.querySelector('[data-injury-intelligence]')),
        injuryMode: document.querySelector('[data-injury-intelligence]')?.dataset.injuryMode || '',
        injuryMetrics: document.querySelectorAll('[data-injury-metric]').length,
        injuryExports: document.querySelectorAll('[data-injury-export]').length,
        injuryFullscreen: Boolean(document.querySelector('[data-injury-fullscreen-open]')),
        fullscreen: Boolean(document.querySelector('[data-anatomy-fullscreen]')),
        zoomControls: document.querySelectorAll('[data-anatomy-zoom]').length,
        qualityText: document.querySelector('#acc-panel-analytics').innerText.includes('Missing side'),
        enterpriseText: document.querySelector('#acc-panel-analytics').innerText.includes('Enterprise Analytics Workspace'),
        pdfExport: document.querySelector('#acc-panel-analytics').innerText.includes('Export PDF'),
        deepLink: document.querySelector('#acc-panel-analytics').innerText.includes('คัดลอกลิงก์'),
        yoy: document.querySelector('#acc-panel-analytics').innerText.includes('vs ' + (new Date().getFullYear() - 1)),
        overflow: document.querySelector('#acc-panel-analytics').scrollWidth > document.querySelector('#acc-panel-analytics').clientWidth + 2,
        widths: [document.querySelector('#acc-panel-analytics').clientWidth, document.querySelector('#acc-panel-analytics').scrollWidth],
    }))()`);
    assert.strictEqual(desktop.filters, 6);
    assert.strictEqual(desktop.anatomy, true);
    assert.strictEqual(desktop.injury, true);
    assert.match(desktop.injuryMode, /^(focus|pareto|empty)$/);
    assert.strictEqual(desktop.injuryMetrics, 3);
    assert.strictEqual(desktop.injuryExports, 2);
    assert.strictEqual(desktop.injuryFullscreen, true);
    assert.strictEqual(desktop.fullscreen, true);
    assert.strictEqual(desktop.zoomControls, 4);
    assert.strictEqual(desktop.qualityText, true);
    assert.strictEqual(desktop.enterpriseText, true);
    assert.strictEqual(desktop.pdfExport, true);
    assert.strictEqual(desktop.deepLink, true);
    assert.strictEqual(desktop.yoy, true);
    assert.strictEqual(desktop.overflow, false, `Desktop Analytics horizontal overflow ${desktop.widths.join(' -> ')}`);

    const accessibility = await evaluate(`(() => { const panel=document.querySelector('#acc-panel-analytics'); const visible=node=>{const style=getComputedStyle(node);return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;}; const name=node=>(node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||'').trim(); const controls=[...panel.querySelectorAll('button,select,[role="button"][tabindex]')].filter(visible); const scoped=[...panel.querySelectorAll('[data-injury-intelligence] button,[data-acc-anatomy] button')].filter(visible); const small=scoped.map(node=>{const box=node.getBoundingClientRect();return{name:name(node),width:Math.round(box.width),height:Math.round(box.height)}}).filter(row=>row.width<24||row.height<24); const short=[...panel.querySelectorAll('[data-injury-metric],[data-injury-export],[data-injury-fullscreen-open],[data-injury-row],[data-anatomy-zoom]')].filter(visible).map(node=>({name:name(node),height:Math.round(node.getBoundingClientRect().height)})).filter(row=>row.height<44); const ids=[...panel.querySelectorAll('[id]')].map(node=>node.id); return {unnamed:controls.filter(node=>!name(node)).map(node=>node.outerHTML.slice(0,120)),small,short,duplicateIds:[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))],injuryRegion:panel.querySelector('[data-injury-intelligence]')?.getAttribute('aria-label')||'',anatomyRegion:panel.querySelector('[data-acc-anatomy]')?.getAttribute('aria-label')||''}; })()`);
    assert.deepStrictEqual(accessibility.unnamed, [], `Visible Analytics controls missing accessible names: ${JSON.stringify(accessibility.unnamed)}`);
    assert.deepStrictEqual(accessibility.small, [], `Injury/Anatomy controls below WCAG 24px target: ${JSON.stringify(accessibility.small)}`);
    assert.deepStrictEqual(accessibility.short, [], `Primary Injury/Anatomy controls below 44px touch target: ${JSON.stringify(accessibility.short)}`);
    assert.deepStrictEqual(accessibility.duplicateIds, [], `Duplicate Analytics IDs: ${accessibility.duplicateIds.join(', ')}`);
    assert.strictEqual(accessibility.injuryRegion, 'Injury Type Breakdown');
    assert.strictEqual(accessibility.anatomyRegion, 'Body Part Anatomy Analytics');

    for (const typeCount of [4, 10]) {
        const fixture = mockInjuryReports(typeCount);
        const pareto = await evaluate(`(() => { let host=document.querySelector('#acc-injury-pareto-uat'); if(!host){host=document.createElement('div');host.id='acc-injury-pareto-uat';host.style.cssText='width:760px;max-width:calc(100vw - 32px);padding:8px;';document.body.appendChild(host);} host.innerHTML=window._accRenderInjuryIntelligencePreview(${JSON.stringify(fixture)},[],{fullscreen:true}); const card=host.querySelector('[data-injury-intelligence]'); const rows=[...host.querySelectorAll('[data-injury-row]')]; return {mode:card?.dataset.injuryMode||'',rows:rows.length,labels:rows.map(row=>row.dataset.injuryLabel),cumulative:rows.map(row=>Number(row.dataset.injuryCumulative)),text:host.innerText,fits:host.scrollWidth<=host.clientWidth+2,widths:[host.clientWidth,host.scrollWidth]}; })()`);
        assert.strictEqual(pareto.mode, 'pareto', `${typeCount} Injury Types must use Pareto mode`);
        assert.strictEqual(pareto.rows, typeCount, `Pareto must render all ${typeCount} Injury Types`);
        assert.strictEqual(pareto.labels[0], paretoLabels[0], 'Long Thai Injury Type label must remain complete');
        assert.ok(pareto.text.includes('80% PRIORITY'), 'Pareto must explain the 80% priority threshold');
        assert.ok(pareto.cumulative.every((value, index, values) => index === 0 || value >= values[index - 1]), 'Cumulative percentages must be monotonic');
        assert.strictEqual(pareto.cumulative.at(-1), 100, 'Final Pareto cumulative percentage must be 100%');
        assert.strictEqual(pareto.fits, true, `${typeCount}-type desktop Pareto overflow ${pareto.widths.join(' -> ')}`);
    }
    await evaluate(`document.querySelector('#acc-injury-pareto-uat')?.remove()`);

    await evaluate(`document.querySelector('#acc-tab-btn-dashboard').click()`);
    await waitFor(`document.querySelector('[data-acc-dashboard-enterprise]')`, 45000);
    await evaluate(`(() => { window.__accUatOriginalFetch=window.fetch.bind(window); window.__accUatReleaseAnalytics=null; window.fetch=(url,options)=>String(url).includes('/accident/analytics?year=')?new Promise((resolve,reject)=>{window.__accUatReleaseAnalytics=()=>window.__accUatOriginalFetch(url,options).then(resolve,reject);}):window.__accUatOriginalFetch(url,options); return true; })()`);
    await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
    await waitFor(`document.querySelector('[data-analytics-state="loading"][aria-busy="true"]')`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-analytics-state="loading"]').innerText.includes('กำลังเตรียมข้อมูลวิเคราะห์')`), true);
    await evaluate(`window.__accUatReleaseAnalytics()`);
    await waitFor(`document.querySelector('[data-injury-intelligence]')`, 45000);
    await evaluate(`window.fetch=window.__accUatOriginalFetch;delete window.__accUatReleaseAnalytics;`);

    await evaluate(`document.querySelector('#acc-tab-btn-dashboard').click()`);
    await waitFor(`document.querySelector('[data-acc-dashboard-enterprise]')`, 45000);
    await evaluate(`(() => { window.__accUatOriginalFetch=window.fetch.bind(window); window.fetch=(url,options)=>String(url).includes('/accident/analytics?year=')?Promise.resolve(new Response(JSON.stringify({success:false,message:'UAT simulated failure'}),{status:503,headers:{'Content-Type':'application/json'}})):window.__accUatOriginalFetch(url,options); return true; })()`);
    await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
    await waitFor(`document.querySelector('[data-analytics-state="error"] [data-analytics-retry]')`, 45000);
    assert.strictEqual(await evaluate(`document.querySelector('[data-analytics-state="error"]')?.getAttribute('role')`), 'alert');
    await evaluate(`window.fetch=window.__accUatOriginalFetch;document.querySelector('[data-analytics-retry]').click()`);
    await waitFor(`document.querySelector('[data-injury-intelligence]')`, 45000);

    await evaluate(`window._accSetAnalyticsFilter('injury','__UAT_NO_MATCH__')`);
    await waitFor(`document.querySelector('[data-analytics-state="empty-filtered"]')`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-analytics-state="empty-filtered"]').innerText.includes('ไม่พบเคสที่ตรงกับตัวกรองนี้')`), true);
    await evaluate(`document.querySelector('[data-analytics-state="empty-filtered"] button').click()`);
    await waitFor(`!document.querySelector('[data-analytics-state="empty-filtered"]') && document.querySelector('[data-analytics-select="injury"]')?.value === ''`);

    await evaluate(`document.querySelector('[data-injury-metric="severity"]').focus()`);
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space' });
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' });
    await waitFor(`document.querySelector('[data-injury-metric="severity"]')?.getAttribute('aria-pressed') === 'true'`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-injury-metric="cases"]')?.getAttribute('aria-pressed')`), 'false');
    await evaluate(`(() => { const button=document.querySelector('[data-injury-fullscreen-open]'); button.focus(); button.click(); })()`);
    await waitFor(`document.querySelector('#modal-wrapper:not(.hidden):not(.opacity-0) [data-injury-fullscreen] [data-injury-intelligence]')`);
    assert.strictEqual(await evaluate(`document.querySelectorAll('#modal-body [data-injury-metric]').length`), 3);
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await waitFor(`document.querySelector('#modal-wrapper').classList.contains('hidden')`);
    assert.strictEqual(await evaluate(`document.activeElement?.matches?.('[data-injury-fullscreen-open]')`), true, 'Closing Injury fullscreen with Escape must restore focus');

    const injurySelection = await evaluate(`(() => { const row=document.querySelector('[data-injury-row]'); if(!row)return {tested:false}; row.click(); return {tested:true}; })()`);
    if (injurySelection.tested) {
        await waitFor(`Boolean(document.querySelector('[data-analytics-select="injury"]')?.value)`);
        const injuryValue = await evaluate(`document.querySelector('[data-analytics-select="injury"]').value`);
        assert.strictEqual(await evaluate(`Boolean(document.querySelector('[data-acc-anatomy]'))`), true, 'Body Part Ranking must remain connected after Injury Type filtering');
        assert.strictEqual(await evaluate(`new URL(location.href).searchParams.get('accInjury')`), injuryValue);
        await evaluate(`window._accOpenInjuryReports(${JSON.stringify(injuryValue)})`);
        await waitFor(`document.querySelector('#acc-panel-reports')?.innerText.includes('Analytics') && document.querySelector('#acc-panel-reports')?.innerText.includes(${JSON.stringify(injuryValue)})`);
        await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
        await waitFor(`document.querySelector('[data-analytics-select="injury"]')?.value === ${JSON.stringify(injuryValue)}`);
        await evaluate(`window._accClearAnalyticsFilters()`);
        await waitFor(`document.querySelector('[data-analytics-select="injury"]')?.value === ''`);
    }

    const layoutUpload = await evaluate(`(() => { const button=[...document.querySelectorAll('#acc-panel-analytics button')].find(node=>node.textContent.trim()==='เปลี่ยนรูป'); if(!button)return {present:false}; button.click(); return {present:true}; })()`);
    assert.strictEqual(layoutUpload.present, true, 'Admin Factory Layout upload control must be visible');
    await waitFor(`document.querySelector('#acc-layout-file')`);
    assert.strictEqual(await evaluate(`document.querySelector('#acc-layout-file').accept`), 'image/jpeg,image/png,image/webp');
    await evaluate(`window.closeModal()`);

    const selectable = await evaluate(`Boolean(document.querySelector('[data-anatomy-row]'))`);
    if (selectable) {
        await evaluate(`document.querySelector('[data-anatomy-row]').click()`);
        assert.match(await evaluate(`document.querySelector('[data-anatomy-detail]').textContent`), /เคส/);
        await evaluate(`document.querySelector('[data-anatomy-fullscreen]').click()`);
        assert.strictEqual(await evaluate(`document.querySelector('[data-acc-anatomy]').dataset.anatomyFullscreenOpen`), 'true');
        await evaluate(`document.querySelector('[data-anatomy-view="both"]').click();document.querySelector('[data-anatomy-zoom="in"]').click()`);
        assert.strictEqual(await evaluate(`document.querySelector('[data-anatomy-zoom-label]').textContent`), '125%');
        await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        await sleep(100);
        assert.strictEqual(await evaluate(`document.querySelector('[data-acc-anatomy]').dataset.anatomyFullscreenOpen`), 'false');
    }

    const optionState = await evaluate(`(() => { const select=document.querySelector('[data-analytics-select="dept"]'); if(select.options.length<2)return {tested:false}; select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));return {tested:true,value:select.value}; })()`);
    if (optionState.tested) {
        await waitFor(`document.querySelector('#acc-panel-analytics').innerText.includes(${JSON.stringify(optionState.value)})`);
        assert.strictEqual(await evaluate(`document.querySelector('[data-analytics-select="dept"]').value`), optionState.value);
        assert.strictEqual(await evaluate(`new URL(location.href).searchParams.get('accDept')`), optionState.value);
        await evaluate(`window._accOpenAnalyticsReports({})`);
        await waitFor(`document.querySelector('#acc-panel-reports')?.innerText.includes('Analytics') && document.querySelector('#acc-panel-reports')?.innerText.includes(${JSON.stringify(optionState.value)})`);
        await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
        await waitFor(`document.querySelector('[data-analytics-select="dept"]')?.value === ${JSON.stringify(optionState.value)}`);
    }

    await evaluate(`document.querySelector('#acc-tab-btn-dashboard').click()`);
    await waitFor(`document.querySelector('[data-acc-dashboard-enterprise]') && document.querySelector('#acc-trend-chart')`, 45000);
    await waitFor(`window.Chart && window.Chart.getChart(document.querySelector('#acc-trend-chart')) && window.Chart.getChart(document.querySelector('#acc-type-chart'))`, 45000);
    const dashboardDesktop = await evaluate(`(() => { const panel=document.querySelector('#acc-panel-dashboard'); const trend=window.Chart.getChart(document.querySelector('#acc-trend-chart')); const type=window.Chart.getChart(document.querySelector('#acc-type-chart')); return {enterprise:panel.innerText.includes('Enterprise Safety Overview'),trend:panel.innerText.includes('Safety Trend'),type:panel.innerText.includes('ประเภทอุบัติเหตุ'),department:panel.innerText.includes('อุบัติเหตุรายแผนก'),insight:Boolean(panel.querySelector('[data-acc-dashboard-insight]')),ranking:Boolean(panel.querySelector('[data-acc-department-ranking]')),metricButtons:panel.querySelectorAll('[data-acc-department-metric] button').length,trendMonths:trend?.data?.labels?.length||0,typeSlices:type?.data?.labels?.length||0,fits:panel.scrollWidth<=panel.clientWidth+2,widths:[panel.clientWidth,panel.scrollWidth]}; })()`);
    assert.strictEqual(dashboardDesktop.enterprise, true);
    assert.strictEqual(dashboardDesktop.trend, true);
    assert.strictEqual(dashboardDesktop.type, true);
    assert.strictEqual(dashboardDesktop.department, true);
    assert.strictEqual(dashboardDesktop.insight, true);
    assert.strictEqual(dashboardDesktop.ranking, true);
    assert.strictEqual(dashboardDesktop.metricButtons, 3);
    assert.strictEqual(dashboardDesktop.trendMonths, 12);
    assert.ok(dashboardDesktop.typeSlices > 0);
    assert.strictEqual(dashboardDesktop.fits, true, `Desktop Dashboard horizontal overflow ${dashboardDesktop.widths.join(' -> ')}`);

    await evaluate(`(() => { const chart=window.Chart.getChart(document.querySelector('#acc-trend-chart')); chart.options.onClick({},[{index:3}]); return true; })()`);
    await waitFor(`document.querySelector('[data-analytics-select="month"]')?.value === '4'`, 45000);
    assert.strictEqual(await evaluate(`new URL(location.href).searchParams.get('accMonth')`), '4');
    if (optionState.tested) {
        await evaluate(`window._accDashboardOpenAnalytics('dept',${JSON.stringify(optionState.value)})`);
        await waitFor(`document.querySelector('[data-analytics-select="dept"]')?.value === ${JSON.stringify(optionState.value)}`, 45000);
    } else {
        await evaluate(`window._accDashboardOpenAnalytics()`);
        await waitFor(`document.querySelector('[data-analytics-select="month"]')?.value === ''`, 45000);
    }
    await evaluate(`document.querySelector('#acc-tab-btn-dashboard').click()`);
    await waitFor(`document.querySelector('[data-acc-dashboard-enterprise]') && document.querySelector('#acc-type-chart')`, 45000);
    await evaluate(`([...document.querySelectorAll('[data-acc-department-metric] button')].find(button=>button.textContent.includes('Lost Days'))).click()`);
    await waitFor(`[...document.querySelectorAll('[data-acc-department-metric] button')].some(button=>button.textContent.includes('Lost Days') && button.classList.contains('bg-slate-900'))`, 45000);

    // Let the current panel finish its read-only requests before the intentional
    // viewport reload; otherwise the browser correctly aborts an in-flight fetch.
    await sleep(700);
    assert.deepStrictEqual(errors, [], `Desktop browser errors: ${errors.join(' | ')}`);
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.command('Page.reload', { ignoreCache: true });
    await waitFor(`document.readyState === 'complete'`);
    await waitFor(`document.querySelector('#acc-tab-btn-analytics')`);
    await waitFor(`document.querySelector('[data-acc-dashboard-enterprise]') || document.querySelector('[data-analytics-select="month"]')`, 45000);
    await sleep(300);
    await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
    await waitFor(`document.querySelector('[data-analytics-select="month"]') && document.querySelector('[data-acc-anatomy]')`, 45000);
    if (optionState.tested) assert.strictEqual(await evaluate(`document.querySelector('[data-analytics-select="dept"]').value`), optionState.value, 'Deep link must restore the Department filter after reload');
    const mobile = await evaluate(`(() => { const panel=document.querySelector('#acc-panel-analytics'); const box=panel.getBoundingClientRect(); return { injury:Boolean(panel.querySelector('[data-injury-intelligence]')),injuryMode:panel.querySelector('[data-injury-intelligence]')?.dataset.injuryMode||'',injuryToolbar:panel.querySelectorAll('[data-injury-metric]').length, fits:panel.scrollWidth<=panel.clientWidth+2, widths:[panel.clientWidth,panel.scrollWidth], offenders:[...panel.querySelectorAll('*')].map(node=>{const b=node.getBoundingClientRect();return{tag:node.tagName,cls:String(node.className||'').slice(0,100),left:Math.round(b.left),right:Math.round(b.right),width:Math.round(b.width)}}).filter(row=>row.right>box.right+2||row.left<box.left-2).sort((a,b)=>b.right-a.right).slice(0,10) }; })()`);
    assert.strictEqual(mobile.injury, true);
    assert.match(mobile.injuryMode, /^(focus|pareto|empty)$/);
    assert.strictEqual(mobile.injuryToolbar, 3);
    assert.strictEqual(mobile.fits, true, `Mobile Analytics horizontal overflow ${mobile.widths.join(' -> ')}: ${JSON.stringify(mobile.offenders)}`);
    const mobileParetoFixture = mockInjuryReports(10);
    const mobilePareto = await evaluate(`(() => { const host=document.createElement('div');host.id='acc-injury-pareto-mobile-uat';host.style.cssText='width:100%;max-width:100%;padding:8px;';document.querySelector('#acc-panel-analytics').prepend(host);host.innerHTML=window._accRenderInjuryIntelligencePreview(${JSON.stringify(mobileParetoFixture)},[],{fullscreen:true});const rows=[...host.querySelectorAll('[data-injury-row]')];return{mode:host.querySelector('[data-injury-intelligence]')?.dataset.injuryMode||'',rows:rows.length,last:Number(rows.at(-1)?.dataset.injuryCumulative),fits:host.scrollWidth<=host.clientWidth+2,widths:[host.clientWidth,host.scrollWidth]};})()`);
    assert.strictEqual(mobilePareto.mode, 'pareto');
    assert.strictEqual(mobilePareto.rows, 10);
    assert.strictEqual(mobilePareto.last, 100);
    assert.strictEqual(mobilePareto.fits, true, `10-type mobile Pareto overflow ${mobilePareto.widths.join(' -> ')}`);
    await evaluate(`document.querySelector('#acc-injury-pareto-mobile-uat')?.remove()`);
    const mobileInjuryFullscreen = await evaluate(`(() => { const button=document.querySelector('#acc-panel-analytics [data-injury-fullscreen-open]'); if(!button)return {button:false}; button.click(); return {button:true}; })()`);
    assert.strictEqual(mobileInjuryFullscreen.button, true, 'Mobile Injury fullscreen button must exist');
    await sleep(800);
    const mobileInjuryOpenState = await evaluate(`(() => { const wrapper=document.querySelector('#modal-wrapper'); return {hidden:wrapper?.classList.contains('hidden'),opacity:wrapper?.classList.contains('opacity-0'),body:Boolean(wrapper?.querySelector('[data-injury-fullscreen]')),modalText:document.querySelector('#modal-title')?.textContent||''}; })()`);
    assert.strictEqual(mobileInjuryOpenState.body, true, `Mobile Injury fullscreen content must render: ${JSON.stringify(mobileInjuryOpenState)}`);
    assert.strictEqual(mobileInjuryOpenState.hidden, false, `Mobile Injury fullscreen must open: ${JSON.stringify(mobileInjuryOpenState)}`);
    assert.strictEqual(await evaluate(`document.querySelector('#modal-wrapper').classList.contains('opacity-0')`), false, 'Mobile Injury fullscreen must be visible');
    const injuryMobileModal = await evaluate(`(() => { const modal=document.querySelector('#modal-container'); return {fits:modal.scrollWidth<=modal.clientWidth+2,widths:[modal.clientWidth,modal.scrollWidth]}; })()`);
    assert.strictEqual(injuryMobileModal.fits, true, `Mobile Injury fullscreen horizontal overflow ${injuryMobileModal.widths.join(' -> ')}`);
    await evaluate(`window.closeModal()`);
    await evaluate(`document.querySelector('#acc-tab-btn-dashboard').click()`);
    await waitFor(`document.querySelector('[data-acc-dashboard-enterprise]')`, 45000);
    const dashboardMobile = await evaluate(`(() => { const panel=document.querySelector('#acc-panel-dashboard'); const box=panel.getBoundingClientRect(); return {fits:panel.scrollWidth<=panel.clientWidth+2,widths:[panel.clientWidth,panel.scrollWidth],offenders:[...panel.querySelectorAll('*')].map(node=>{const b=node.getBoundingClientRect();return{tag:node.tagName,cls:String(node.className||'').slice(0,100),left:Math.round(b.left),right:Math.round(b.right),width:Math.round(b.width)}}).filter(row=>row.right>box.right+2||row.left<box.left-2).slice(0,10)}; })()`);
    assert.strictEqual(dashboardMobile.fits, true, `Mobile Dashboard horizontal overflow ${dashboardMobile.widths.join(' -> ')}: ${JSON.stringify(dashboardMobile.offenders)}`);
    assert.deepStrictEqual(writes, [], `Read-only Browser UAT sent mutations: ${writes.join(' | ')}`);
    assert.deepStrictEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
    console.log('Accident Analytics Workspace Browser UAT: PASS (accessibility names/regions/keyboard/focus/touch targets, 4/10-type Pareto fixtures, loading/error/retry states, Injury/Anatomy/fullscreen/cross-filter/report drilldown, desktop/mobile, zero writes/errors)');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { cdp?.close(); } catch {}
    try { browser?.kill(); } catch {}
    try { server?.kill(); } catch {}
    if (db) await db.end().catch(() => {});
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
