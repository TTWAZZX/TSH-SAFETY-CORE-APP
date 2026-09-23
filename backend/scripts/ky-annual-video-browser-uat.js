'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const appUrl = process.env.KY_BROWSER_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiUrl = String(process.env.KY_BROWSER_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const usePhpApi = process.env.KY_BROWSER_USE_PHP === '1';
const browserApiBase = usePhpApi
    ? String(process.env.KY_BROWSER_PHP_API_BASE || 'http://localhost/tsh-safety-core/api/index.php?route=')
    : `${apiUrl}/api`;
const chromePath = process.env.KY_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.KY_BROWSER_CDP_PORT || 9851);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-ky-annual-browser-'));
const consoleErrors = [];
const failedResponses = [];
const mutationRequests = [];
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let commandId = 1;
let chrome;
let socket;
let db;
let apiServer;
let apiServerOutput = '';

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', '--window-size=1440,1000',
        `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(row => row.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            if (String(request.url || '').includes('/api/ky') && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase())) mutationRequests.push(`${request.method} ${request.url}`);
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/')) {
                failedResponses.push(`${response.status} ${response.url}`);
            }
        }
        const current = pending.get(message.id);
        if (!current) return;
        pending.delete(message.id);
        clearTimeout(current.timer);
        message.error ? current.reject(new Error(message.error.message)) : current.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    const phpRouteFetchShim = usePhpApi ? `
        const kyNativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const rawUrl = typeof input === 'string' ? input : input?.url;
            if (!rawUrl || !rawUrl.startsWith(window.API_BASE)) return kyNativeFetch(input, init);
            const queryOffset = rawUrl.indexOf('?', window.API_BASE.length);
            if (queryOffset < 0) return kyNativeFetch(input, init);
            const normalizedUrl = rawUrl.slice(0, queryOffset) + '&' + rawUrl.slice(queryOffset + 1);
            return kyNativeFetch(typeof input === 'string' ? normalizedUrl : new Request(normalizedUrl, input), init);
        };
    ` : '';
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(browserApiBase)};${phpRouteFetchShim}` });
}

async function apiJson(route, token) {
    const url = usePhpApi
        ? `${browserApiBase}${route.replace('?', '&')}`
        : `${apiUrl}/api/${route}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(response.status, 200, `${route} must be readable`);
    return response.json();
}

async function startNodeApiIfRequested() {
    if (process.env.KY_BROWSER_START_NODE !== '1') return;
    apiServer = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    apiServer.stdout.on('data', chunk => { apiServerOutput += String(chunk); });
    apiServer.stderr.on('data', chunk => { apiServerOutput += String(chunk); });
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (apiServer.exitCode !== null) throw new Error(`Node API exited before Browser UAT (code ${apiServer.exitCode})`);
        try {
            const response = await fetch(`${apiUrl}/api/ky/stats?year=2000`);
            if (response.status > 0) return;
        } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Timed out waiting for the local Node API: ${apiServerOutput.trim()}`);
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required');
    await startNodeApiIfRequested();
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306)
    });
    const [[admin]] = await db.query(
        "SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin' LIMIT 1",
        [process.env.PROD_UAT_ADMIN_ID]
    );
    assert.ok(admin, 'Admin browser fixture unavailable');
    const token = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department, unit: admin.Unit, position: admin.Position }, process.env.JWT_SECRET, { expiresIn: '30m' });
    const user = { id: admin.EmployeeID, EmployeeID: admin.EmployeeID, name: admin.EmployeeName, EmployeeName: admin.EmployeeName, role: admin.Role, Role: admin.Role, department: admin.Department, Department: admin.Department, unit: admin.Unit, Unit: admin.Unit, position: admin.Position, Position: admin.Position };
    const year = new Date().getFullYear();
    const beforeStats = await apiJson(`ky/stats?year=${year}`, token);
    const beforeEvidenceOverview = await apiJson(`ky/evidence-overview?year=${year}`, token);
    const beforeAnnual = await apiJson(`ky/annual-video-evidence?year=${year}`, token);

    await connectChrome();
    await command('Page.navigate', { url: appUrl });
    await sleep(1200);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});localStorage.removeItem('tsh_active_tab_ky');location.hash='#ky';location.reload();return true;})()`);
    await waitFor(`document.querySelector('#ky-tab-btn-dashboard') && document.querySelector('#ky-kpi-row [data-ky-kpi-filter="all"]')`);
    await waitFor(`document.querySelector('#ky-evidence-completion-panel')?.innerText && !document.querySelector('#ky-evidence-completion-panel')?.innerText.includes('Loading file / video progress')`);
    const evidenceRecordCount = (beforeEvidenceOverview.data?.rows || []).reduce((total, row) => total + (row.records || []).length, 0);
    if (evidenceRecordCount > 0) {
        const splitEvidenceControls = await evaluate(`({
            production:Boolean(document.querySelector('#ky-evidence-completion-panel [data-ky-evidence-chart-filter="production_video"]')),
            externalVerified:Boolean(document.querySelector('#ky-evidence-completion-panel [data-ky-evidence-chart-filter="external_verified"]')),
            externalPending:Boolean(document.querySelector('#ky-evidence-completion-panel [data-ky-evidence-chart-filter="external_pending"]'))
        })`);
        assert.deepStrictEqual(splitEvidenceControls, { production: true, externalVerified: true, externalPending: true }, 'Dashboard must expose split Production, verified external, and pending external evidence controls');
    } else {
        assert.match(await evaluate(`document.querySelector('#ky-evidence-completion-panel')?.innerText||''`), /No KY activity found/i, 'Empty evidence scope must render an explicit no-record state');
    }
    const videoEvidenceStats = beforeStats.data?.videoEvidence || {};
    for (const key of ['productionVideo', 'verifiedExternalVideo', 'pendingExternalVideo', 'videoEvidenceTotal', 'missingVideoEvidence', 'videoEvidenceRate']) {
        assert.ok(Object.prototype.hasOwnProperty.call(videoEvidenceStats, key), `KY stats must expose ${key}`);
    }

    const renderedKpi = await evaluate(`[...document.querySelectorAll('#ky-kpi-row [data-ky-kpi-filter]')].reduce((out,el)=>{const key=el.dataset.kyKpiFilter;if(!(key in out))out[key]=el.querySelector('.text-2xl')?.textContent.trim();return out;},{})`);
    const kpi = beforeStats.data?.kpi || beforeStats.kpi || {};
    assert.strictEqual(Number(renderedKpi.all), Number(kpi.total || 0), 'Dashboard total must still match the KY stats API');
    assert.strictEqual(Number(renderedKpi.Open), Number(kpi.open || 0), 'Dashboard Open count must still match the KY stats API');
    assert.strictEqual(Number(renderedKpi.Reviewed), Number(kpi.reviewed || 0), 'Dashboard Reviewed count must still match the KY stats API');
    assert.strictEqual(Number(renderedKpi.Closed), Number(kpi.closed || 0), 'Dashboard Closed count must still match the KY stats API');
    const configuredDepartments = beforeStats.data?.configuredDepartments || [];
    assert.ok(configuredDepartments.length > 0, 'Local Browser UAT requires Active Program Config departments');
    const departmentDashboard = await evaluate(`({
        barLabels:[...(Chart.getChart('ky-chart-bar')?.data?.labels||[])],
        heatmapLabels:[...document.querySelectorAll('[data-ky-heatmap-department]')].map(row=>row.dataset.kyHeatmapDepartment),
        heatmapCells:document.querySelectorAll('[data-ky-heatmap-department]').length*12,
        diagnostics:document.querySelector('[data-ky-department-diagnostics]')?.innerText||''
    })`);
    assert.deepStrictEqual(departmentDashboard.barLabels, configuredDepartments, 'Department bar chart must render every configured department, including zero activity');
    assert.deepStrictEqual(departmentDashboard.heatmapLabels, configuredDepartments, 'Heatmap must render every configured department');
    assert.strictEqual(departmentDashboard.heatmapCells, configuredDepartments.length * 12, 'Heatmap must cover 12 months for every configured department');
    assert.ok(departmentDashboard.diagnostics, 'Dashboard must expose canonical Department mapping diagnostics');

    await evaluate(`document.querySelector('#ky-tab-btn-submit').click()`);
    await waitFor(`document.querySelector('#ky-video-central-machine') && document.querySelector('#ky-video-central-reference')`);
    const centralToggle = await evaluate(`(()=>{const toggle=document.querySelector('#ky-video-central-machine'),wrap=document.querySelector('#ky-video-central-reference-wrap');const hiddenBefore=wrap.classList.contains('hidden');toggle.click();return{hiddenBefore,hiddenAfter:wrap.classList.contains('hidden'),required:document.querySelector('#ky-video-central-reference').required};})()`);
    assert.deepStrictEqual(centralToggle, { hiddenBefore: true, hiddenAfter: false, required: true }, 'central-machine mode must reveal and require its external reference');

    await evaluate(`document.querySelector('#ky-tab-btn-history').click()`);
    await waitFor(`document.querySelector('#ky-history-clear')`);
    const evidenceFilterOptions = await evaluate(`[...document.querySelectorAll('#ky-hist-evidence option')].map(option=>option.value)`);
    assert.ok(evidenceFilterOptions.includes('production_video'), 'History must expose the Production video evidence filter');
    assert.ok(evidenceFilterOptions.includes('external_verified'), 'History must expose the verified external video evidence filter');
    assert.ok(evidenceFilterOptions.includes('external_pending'), 'History must expose the pending external video evidence filter');

    const hasFollowupRecord = await evaluate(`Boolean(document.querySelector('.btn-ky-video-followup[data-id]'))`);
    if (hasFollowupRecord) {
        await evaluate(`document.querySelector('.btn-ky-video-followup[data-id]').click()`);
        await waitFor(`document.querySelector('#ky-followup-video-file') && document.querySelector('#ky-followup-video-central')`);
        const followupContract = await evaluate(`(()=>{const toggle=document.querySelector('#ky-followup-video-central');toggle.click();return{file:Boolean(document.querySelector('#ky-followup-video-file')),central:Boolean(toggle),reference:Boolean(document.querySelector('#ky-followup-video-reference')),visible:!document.querySelector('#ky-followup-video-reference-wrap')?.classList.contains('hidden'),copy:document.querySelector('#modal-body')?.innerText||''};})()`);
        assert.ok(followupContract.file && followupContract.central && followupContract.reference && followupContract.visible, 'History follow-up must offer Production upload or central-machine metadata');
        assert.match(followupContract.copy, /SHA-256/i, 'History central-machine mode must explain local SHA-256 calculation');
        await evaluate(`document.querySelector('#modal-close-btn')?.click()`);
        await sleep(250);
    }

    const hasManageRecord = await evaluate(`Boolean(document.querySelector('.btn-ky-manage[data-id]'))`);
    if (hasManageRecord) {
        await evaluate(`document.querySelector('.btn-ky-manage[data-id]').click()`);
        await waitFor(`document.querySelector('#ky-manage-video-central-machine') && document.querySelector('#ky-manage-video-central-reference')`);
        const manageExternalContract = await evaluate(`(()=>({
            hasVideoPicker:Boolean(document.querySelector('#ky-manage-video')),
            hasCentralToggle:Boolean(document.querySelector('#ky-manage-video-central-machine')),
            copy:document.querySelector('#ky-manage-video-central-machine')?.closest('div')?.innerText||''
        }))()`);
        assert.ok(manageExternalContract.hasVideoPicker && manageExternalContract.hasCentralToggle, 'Closed-activity Admin manage must expose metadata-only external video controls');
        assert.match(manageExternalContract.copy, /SHA-256/i, 'External video control must explain browser-side SHA-256 metadata');
        assert.match(manageExternalContract.copy, /Admin Verify/i, 'External video control must explain that evidence counts only after Admin Verify');
        await evaluate(`document.querySelector('#modal-close-btn')?.click()`);
        await sleep(250);
    }
    await evaluate(`document.querySelector('#ky-tab-btn-manage').click()`);
    await waitFor(`document.querySelector('#ky-msub-annual-video')`);
    await evaluate(`document.querySelector('#ky-msub-annual-video').click()`);
    await waitFor(`document.querySelector('[data-ky-annual-admin-toolbar]') && document.querySelector('#ky-manage-panel')?.textContent.includes('Annual Compliance Dashboard')`);

    const annualUi = await evaluate(`(()=>({summaryCards:document.querySelector('[data-ky-annual-summary]')?.children.length||0,summaryClickable:[...document.querySelector('[data-ky-annual-summary]')?.children||[]].every(card=>card.getAttribute('role')==='button'),views:[...document.querySelectorAll('[data-ky-annual-view]')].map(button=>button.dataset.kyAnnualView),sticky:getComputedStyle(document.querySelector('[data-ky-annual-admin-toolbar]')).position,activityExternal:Boolean(document.querySelector('[data-ky-annual-view-panel="activity"]')),activityExternalRows:document.querySelectorAll('[data-ky-activity-external-detail]').length,hasDownload:Boolean(document.querySelector('[data-ky-annual-download]'))||${JSON.stringify((beforeAnnual.data?.summary?.productionFiles || 0) === 0)},hasAudit:Boolean(document.querySelector('[data-ky-annual-audit]'))||${JSON.stringify((beforeAnnual.data?.evidence || []).length === 0)},detail:Boolean(document.querySelector('[data-ky-annual-detail],[data-ky-inventory-detail],[data-ky-activity-external-detail]'))||${JSON.stringify((beforeAnnual.data?.evidence || []).length === 0 && (beforeAnnual.data?.inventory || []).length === 0 && (beforeAnnual.data?.activityExternalEvidence || []).length === 0)},cleanup:Boolean(document.querySelector('[data-ky-cleanup-panel]')),bulk:Boolean(document.querySelector('[data-ky-cleanup-panel] [data-ky-annual-delete-selected]')),inventory:Boolean(document.querySelector('[data-ky-video-inventory]')),inventoryRows:document.querySelectorAll('[data-ky-inventory-row]').length,inventoryDates:[...document.querySelectorAll('[data-ky-inventory-row]')].every(row=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.dataset.activityDate||'')),inventoryBulk:Boolean(document.querySelector('[data-ky-cleanup-panel] [data-ky-inventory-delete-selected]')),inventoryMaxHeight:getComputedStyle(document.querySelector('[data-ky-inventory-list]')).maxHeight,normalAnnualDeleteVisible:[...document.querySelectorAll('[data-ky-annual-view-panel="annual"] [data-ky-annual-delete-one]')].some(el=>!el.classList.contains('hidden')),normalInventoryDeleteVisible:[...document.querySelectorAll('[data-ky-video-inventory] [data-ky-inventory-delete-one]')].some(el=>!el.classList.contains('hidden'))}))()`);
    assert.strictEqual(annualUi.summaryCards, 6, 'Annual dashboard must render six summary metrics');
    assert.ok(annualUi.summaryClickable, 'Annual summary cards must be keyboard-clickable filters');
    assert.deepStrictEqual(annualUi.views, ['overview', 'annual', 'activity', 'inventory', 'cleanup'], 'Admin workspace must expose the Activity External review view separately');
    assert.ok(annualUi.activityExternal, 'Activity External Admin review panel must render');
    assert.strictEqual(annualUi.activityExternalRows, (beforeAnnual.data?.activityExternalEvidence || []).length, 'Activity External UI must render every API evidence row');
    assert.strictEqual(annualUi.sticky, 'sticky', 'Admin filters must remain sticky');
    assert.ok(annualUi.hasDownload && annualUi.hasAudit && annualUi.detail, `Annual Admin controls must match available records: ${JSON.stringify(annualUi)}`);
    assert.ok(annualUi.cleanup && annualUi.bulk && annualUi.inventoryBulk, 'guarded Annual and Inventory bulk cleanup must live in Cleanup Queue');
    assert.ok(annualUi.inventory, 'separate Production Video Inventory controls must render');
    assert.strictEqual(annualUi.normalAnnualDeleteVisible, false, 'destructive Annual actions must be hidden outside Cleanup Queue');
    assert.strictEqual(annualUi.normalInventoryDeleteVisible, false, 'destructive Inventory actions must be hidden outside Cleanup Queue');
    assert.strictEqual(annualUi.inventoryRows, (beforeAnnual.data?.inventory || []).length, 'Inventory UI must render every API inventory row');
    assert.ok(annualUi.inventoryDates, 'Every Inventory card must expose its authoritative Activity Date');
    assert.notStrictEqual(annualUi.inventoryMaxHeight, '288px', 'Inventory list must be expanded beyond the legacy max-h-72 height');
    const complianceCards = await evaluate(`[...document.querySelectorAll('[data-ky-annual-compliance-scope]')].map(card=>({production:Number(card.dataset.production),productionRequired:Number(card.dataset.productionRequired),externalVerified:Number(card.dataset.externalVerified),externalRequired:Number(card.dataset.externalRequired),evidenceTotal:Number(card.dataset.evidenceTotal),yearlyTarget:Number(card.dataset.yearlyTarget),externalPending:Number(card.dataset.externalPending),missing:Number(card.dataset.missing),compliant:card.dataset.compliant==='1',text:card.innerText}))`);
    const complianceScopes = beforeAnnual.data?.scopes || [];
    assert.strictEqual(complianceCards.length, complianceScopes.length, 'Annual Admin UI must render every configured compliance scope');
    complianceCards.forEach((card, index) => {
        const scope = complianceScopes[index];
        assert.strictEqual(card.production, Number(scope.productionVideo || 0), 'Annual UI Production count must match API');
        assert.strictEqual(card.productionRequired, Number(scope.productionRequired || 0), 'Annual UI Production requirement must match API');
        assert.strictEqual(card.externalVerified, Number(scope.verifiedExternalVideo || 0), 'Annual UI External verified count must match API');
        assert.strictEqual(card.externalRequired, Number(scope.externalRequired || 0), 'Annual UI External requirement must match API');
        assert.strictEqual(card.evidenceTotal, Number(scope.evidenceTotal || 0), 'Annual UI distinct evidence total must match API');
        assert.strictEqual(card.yearlyTarget, Number(scope.yearlyTarget || 0), 'Annual UI YearlyTarget must match API');
        assert.strictEqual(card.missing, Number(scope.missingEvidenceTotal || 0), 'Annual UI missing count must match API');
        assert.strictEqual(card.compliant, Boolean(scope.compliant), 'Annual UI compliance state must match API');
        assert.match(card.text, /Production/i, 'Annual UI must label the Production requirement');
        assert.match(card.text, /External verified/i, 'Annual UI must label the verified external requirement');
        assert.match(card.text, /Evidence total/i, 'Annual UI must label the distinct evidence total');
    });
    assert.strictEqual(await evaluate(`document.querySelector('[data-ky-annual-admin-status]')?.value`), 'action', 'Action-required must be the default Admin filter');
    const inventoryFeedback = await evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-ky-inventory-row]')];const registered=rows.filter(row=>!row.querySelector('[data-ky-inventory-register]'));const unregistered=rows.filter(row=>row.querySelector('[data-ky-inventory-register]'));return{productionNames:rows.every(row=>/ไฟล์ Production:\\s*\\S+/.test(row.innerText||'')),statusRegions:rows.filter(row=>row.querySelector('[data-ky-inventory-registration-status]')).length,registeredVisible:registered.every(row=>{const status=row.querySelector('[data-ky-inventory-registration-status]');return Boolean(status&&!status.hidden&&status.textContent.trim())}),unregisteredCorrect:unregistered.every(row=>/ยังไม่ได้ลงทะเบียน External Backup/.test(row.querySelector('[data-ky-inventory-registration-status]')?.textContent||'')),registeredCount:registered.length}})()`);
    assert.ok((beforeAnnual.data?.inventory || []).filter(row => row.CurrentVideoUrl).every(row => row.ProductionOriginalFileName), 'Inventory API must expose the current Production file name');
    assert.ok(inventoryFeedback.productionNames, 'Every Inventory card must display its Production video file name');
    assert.strictEqual(inventoryFeedback.statusRegions, annualUi.inventoryRows, 'Every Inventory card must include an accessible registration-status region');
    assert.ok(inventoryFeedback.registeredVisible, 'Registered Inventory cards must show their persisted registration state');
    assert.ok(inventoryFeedback.unregisteredCorrect, 'Unregistered Inventory cards must not claim registration success');

    const simpleRegistration = await evaluate(`(()=>{
        const buttons=[...document.querySelectorAll('[data-ky-inventory-register]')];
        if(!buttons.length)return{skipped:true};
        const nativePrompt=window.prompt;
        let promptMessage='';let promptDefault='';
        window.prompt=(message,defaultValue)=>{promptMessage=String(message||'');promptDefault=String(defaultValue||'');return null;};
        try{
            buttons[0].click();
            return{promptMessage,promptDefault,productionName:buttons[0].dataset.productionName||'',filePickers:document.querySelectorAll('[data-ky-inventory-file-picker]').length};
        }finally{window.prompt=nativePrompt;}
    })()`);
    if (!simpleRegistration.skipped) {
        assert.match(simpleRegistration.promptMessage, /ระบุชื่อไฟล์วิดีโอ/, 'Inventory registration must ask only for the central-machine filename');
        assert.ok(simpleRegistration.productionName && simpleRegistration.promptDefault === simpleRegistration.productionName, 'Inventory filename prompt must start with the Production filename');
        assert.strictEqual(simpleRegistration.filePickers, 0, 'Simplified Inventory registration must not open a browser file picker');
    }

    if (annualUi.detail) {
        await evaluate(`document.querySelector('[data-ky-annual-detail],[data-ky-inventory-detail]').click()`);
        await waitFor(`!document.querySelector('#modal-wrapper')?.classList.contains('hidden') && /Detail Drawer/.test(document.querySelector('#modal-title')?.textContent||'')`);
        const drawer = await evaluate(`({title:document.querySelector('#modal-title')?.textContent||'',body:document.querySelector('#modal-body')?.innerText||''})`);
        assert.match(drawer.title, /Detail Drawer/, 'Detail action must open the evidence drawer');
        assert.match(drawer.body, /SHA-256/, 'Detail drawer must expose full SHA-256 metadata');
        await evaluate(`document.querySelector('#modal-close-btn')?.click()`);
    }

    for (const view of ['overview', 'annual', 'activity', 'inventory', 'cleanup']) {
        const viewState = await evaluate(`(()=>{document.querySelector('[data-ky-annual-view="${view}"]').click();return{pressed:document.querySelector('[data-ky-annual-view="${view}"]').getAttribute('aria-pressed'),visible:[...document.querySelectorAll('[data-ky-annual-view-panel]')].filter(panel=>!panel.classList.contains('hidden')).map(panel=>panel.dataset.kyAnnualViewPanel)}})()`);
        assert.strictEqual(viewState.pressed, 'true', `${view} view button must become active`);
        assert.ok(viewState.visible.length > 0 && viewState.visible.every(value => value === view), `${view} view must hide unrelated workspaces`);
    }

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
        await command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 });
        await sleep(300);
        const layout = await evaluate(`(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,panel:Boolean(document.querySelector('#ky-manage-panel')),annual:Boolean(document.querySelector('[data-ky-cleanup-panel]')),toolbar:Boolean(document.querySelector('[data-ky-annual-admin-toolbar]'))}))()`);
        assert.ok(layout.panel && layout.annual, `Annual workspace must remain mounted at ${viewport.width}px`);
        assert.ok(layout.toolbar, `Sticky Admin filters must remain mounted at ${viewport.width}px`);
        assert.ok(layout.scroll <= layout.client + 24, `Annual workspace must not create material page overflow at ${viewport.width}px`);
    }

    const afterStats = await apiJson(`ky/stats?year=${year}`, token);
    assert.deepStrictEqual(afterStats.data?.kpi || afterStats.kpi, beforeStats.data?.kpi || beforeStats.kpi, 'read-only Browser UAT must not alter KY dashboard statistics');
    assert.deepStrictEqual(mutationRequests, [], `Browser UAT sent mutations: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('KY annual video Browser UI UAT: PASS (config-complete Dashboard, Activity External Admin review, guarded cleanup, 3 viewports, zero writes/errors)');
})().catch(async error => {
    console.error(error.stack || error);
    if (socket) {
        try {
            const diagnostic = await evaluate(`({href:location.href,hash:location.hash,title:document.title,body:document.body?.innerText?.slice(0,500)||'',hasApp:Boolean(document.querySelector('#app'))})`);
            const apiDiagnostic = await evaluate(`(async()=>{try{const response=await fetch(${JSON.stringify(`${browserApiBase}/ky/stats?year=${new Date().getFullYear()}`)},{headers:{Authorization:'Bearer '+localStorage.getItem('tsh_token')}});return{status:response.status,url:response.url,body:(await response.text()).slice(0,1000)}}catch(error){return{fetchError:String(error)}}})()`);
            console.error('Browser diagnostic:', diagnostic, 'API:', apiDiagnostic, 'Failed responses:', failedResponses, 'Console:', consoleErrors);
        } catch (_) {}
    }
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    try { apiServer?.kill(); } catch (_) {}
    if (db) await db.end();
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
