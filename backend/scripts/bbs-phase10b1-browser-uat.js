'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const appUrl = process.env.BBS_PHASE10B1_APP_URL || 'http://127.0.0.1:5500/index.html';
const apiUrl = String(process.env.BBS_PHASE10B1_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const chromePath = process.env.BBS_PHASE10B1_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.BBS_PHASE10B1_CDP_PORT || 9841);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs10b1-browser-'));
const consoleErrors = [];
let chrome;
let socket;
let db;
let commandId = 1;
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timeout ${method}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    let result;
    try { result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); }
    catch (error) { throw new Error(`${error.message}: ${expression.slice(0, 180)}`); }
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Timed out: ${expression}; console=${consoleErrors.join(' | ')}`);
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', '--window-size=390,844',
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
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') consoleErrors.push((message.params.args || []).map(x => x.value || x.description || '').join(' '));
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
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};` });
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required');
    db = await mysql.createConnection({
        host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS,
        database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306)
    });
    const [[admin]] = await db.query(
        "SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin'",
        [process.env.PROD_UAT_ADMIN_ID]
    );
    assert.ok(admin, 'Admin browser fixture unavailable');
    const token = jwt.sign({ id:admin.EmployeeID, name:admin.EmployeeName, role:admin.Role, department:admin.Department, unit:admin.Unit, position:admin.Position }, process.env.JWT_SECRET, { expiresIn:'30m' });
    const user = { id:admin.EmployeeID, EmployeeID:admin.EmployeeID, name:admin.EmployeeName, EmployeeName:admin.EmployeeName, role:admin.Role, Role:admin.Role, department:admin.Department, Department:admin.Department, unit:admin.Unit, Unit:admin.Unit, position:admin.Position, Position:admin.Position };
    const [[ordinaryUser]] = await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE LOWER(Role)<>'admin' LIMIT 1");
    if (ordinaryUser) {
        const ordinaryToken = jwt.sign({ id:ordinaryUser.EmployeeID, name:ordinaryUser.EmployeeName, role:ordinaryUser.Role, department:ordinaryUser.Department, unit:ordinaryUser.Unit, position:ordinaryUser.Position }, process.env.JWT_SECRET, { expiresIn:'10m' });
        const denied = await fetch(`${apiUrl}/api/bbs/admin/community-reports/1`, { headers:{ Authorization:`Bearer ${ordinaryToken}` } });
        assert.strictEqual(denied.status, 403, 'Community Risk detail must remain Admin-only');
    }
    const foundationResponse = await fetch(`${apiUrl}/api/bbs/admin/foundation`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.strictEqual(foundationResponse.status, 200, 'Foundation API must be readable by Admin');
    const foundation = await foundationResponse.json();
    assert.ok(foundation.data.departments.length > 0, 'Master Department fixture must not be empty');
    const eligibleResponse = await fetch(`${apiUrl}/api/bbs/eligible-employees`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.strictEqual(eligibleResponse.status, 200, 'Checklist-ready employee list must be readable by Admin');
    const eligible = (await eligibleResponse.json()).data.rows || [];
    assert.ok(eligible.every(row => row.ChecklistReadiness && typeof row.ChecklistReadiness.ready === 'boolean' && row.ChecklistReadiness.code), 'Every eligible employee must carry server Checklist Readiness');
    const workspaceResponse = await fetch(`${apiUrl}/api/bbs/workspace`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.strictEqual(workspaceResponse.status, 200, 'Workspace KPI must be readable by Admin');
    const workspace = (await workspaceResponse.json()).data;
    assert.ok(workspace.kpi?.status?.code, 'Workspace KPI must carry a server semantic status');
    let communityPayload = null;
    for (const [label, route, nested = false] of [
        ['History','/api/bbs/observations?paged=1&page=1&pageSize=5&view=observer'],
        ['Actions','/api/bbs/actions?paged=1&page=1&pageSize=5'],
        ['Cards','/api/bbs/admin/cards?paged=1&page=1&pageSize=5&status=Active'],
        ['Card employees','/api/bbs/admin/card-employees?paged=1&page=1&pageSize=5'],
        ['Action email outbox','/api/bbs/admin/action-outbox?paged=1&page=1&pageSize=5'],
        ['Community','/api/bbs/community/dashboard?paged=1&pageSize=5&goodPage=1&riskyPage=1',true],
    ]) {
        const response = await fetch(`${apiUrl}${route}`, { headers:{ Authorization:`Bearer ${token}` } });
        assert.strictEqual(response.status, 200, `${label} paged API must be readable`);
        const payload = (await response.json()).data;
        if (nested) {
            assert.ok(Array.isArray(payload.good) && payload.pagination?.good, `${label} must expose paged Good rows`);
            assert.ok(Array.isArray(payload.risky) && payload.pagination?.risky, `${label} Admin view must expose paged Risky rows`);
            communityPayload = payload;
        } else {
            assert.ok(Array.isArray(payload.rows) && payload.pagination, `${label} must expose rows and pagination: ${JSON.stringify(payload).slice(0,500)}`);
            assert.ok(payload.rows.length <= 5, `${label} must respect pageSize`);
        }
    }
    const riskId = communityPayload?.risky?.[0]?.id || null;
    if (riskId) {
        const detailResponse = await fetch(`${apiUrl}/api/bbs/admin/community-reports/${riskId}`, { headers:{ Authorization:`Bearer ${token}` } });
        assert.strictEqual(detailResponse.status, 200, 'Admin must be able to read Community Risk detail');
        const detail = (await detailResponse.json()).data;
        assert.strictEqual(detail.report.ReportType, 'Risky', 'Risk detail must not project Good reports');
        assert.ok(Array.isArray(detail.files), 'Risk detail must include evidence metadata');
        assert.ok(detail.files.every(file => !Object.prototype.hasOwnProperty.call(file, 'StoredName')), 'Risk detail must never expose private stored filenames');
        assert.ok(!detail.action || Array.isArray(detail.action.history), 'Risk detail must include Action History when an Action exists');
    }

    await connectChrome();
    await command('Page.navigate', { url:appUrl });
    await sleep(1800);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`document.querySelector('[data-bbs-tab="cards"]')`);
    await waitFor(`document.querySelector('[data-bbs-workspace-kpi-status]')`);
    const mobileKpi = await evaluate(`(()=>{const root=document.querySelector('[data-bbs-workspace-kpi-status]');return {code:root?.dataset.bbsWorkspaceKpiStatus,text:root?.innerText||'',overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.strictEqual(mobileKpi.code, workspace.kpi.status.code, 'Mobile Workspace must render the server KPI semantic state');
    assert.ok(!/NaN%|undefined%|null%/.test(mobileKpi.text), 'Mobile Workspace must not fabricate an invalid KPI percent');
    assert.strictEqual(mobileKpi.overflow, false, '390px KPI status view must not overflow horizontally');
    await evaluate(`document.querySelector('[data-bbs-tab="history"]').click()`);
    await waitFor(`document.querySelector('[data-list-search="history"]') && document.querySelector('[data-history-filter="departmentId"]')`);
    assert.strictEqual(await evaluate(`document.documentElement.scrollWidth>document.documentElement.clientWidth+2`), false, '390px History filters must not overflow');
    await evaluate(`document.querySelector('[data-bbs-tab="actions"]').click()`);
    await waitFor(`document.querySelector('[data-list-search="actions"]') && document.querySelector('[data-action-list-filter="departmentId"]')`);
    await waitFor(`document.querySelector('[data-action-outbox]') && document.querySelector('[data-list-search="action-outbox"]') && document.querySelector('[data-action-outbox-filter="status"]')`);
    const outbox = await evaluate(`(()=>({statuses:['Queued','Sent','Failed'].every(status=>[...document.querySelector('[data-action-outbox-filter="status"]').options].some(option=>option.value===status)),retryOnlyFailed:[...document.querySelectorAll('[data-action-outbox-row]')].every(row=>!row.querySelector('[data-action-outbox-retry]')||row.innerText.includes('Failed')),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
    assert.deepStrictEqual(outbox, { statuses:true, retryOnlyFailed:true, overflow:false }, '390px Action Email Outbox must expose statuses and Failed-only Retry without overflow');
    assert.strictEqual(await evaluate(`document.documentElement.scrollWidth>document.documentElement.clientWidth+2`), false, '390px Action filters must not overflow');
    await evaluate(`document.querySelector('[data-bbs-tab="community"]').click()`);
    await waitFor(`document.querySelector('[data-list-search="community"]') && document.querySelector('[data-community-filter="departmentId"]')`);
    assert.strictEqual(await evaluate(`document.documentElement.scrollWidth>document.documentElement.clientWidth+2`), false, '390px Community filters must not overflow');
    if (riskId) {
        await waitFor(`document.querySelector('[data-community-risk-detail]')`);
        await evaluate(`document.querySelector('[data-community-risk-detail]').click()`);
        await waitFor(`document.querySelector('[data-community-risk-dialog]')`);
        const riskDialog = await evaluate(`(()=>{const dialog=document.querySelector('[data-community-risk-dialog]');return {modal:dialog?.getAttribute('role')==='dialog',history:dialog?.innerText.includes('Action History'),overflow:dialog?.scrollWidth>dialog?.clientWidth+2};})()`);
        assert.deepStrictEqual(riskDialog, { modal:true, history:true, overflow:false }, '390px Community Risk detail must be accessible and mobile-safe');
        await evaluate(`document.querySelector('[data-community-risk-dialog] [data-close]').click()`);
    }
    if (await evaluate(`Boolean(document.querySelector('[data-bbs-tab="team-management"]'))`)) {
        await evaluate(`document.querySelector('[data-bbs-tab="team-management"]').click()`);
        await waitFor(`document.querySelector('[data-inspector-open]') || document.querySelector('[data-inspector-period="month"]')`);
        if (await evaluate(`Boolean(document.querySelector('[data-inspector-open]'))`)) {
            await evaluate(`document.querySelector('[data-inspector-open]').click()`);
            await waitFor(`document.querySelector('[data-inspector-schedule-mode="agenda"]')`);
            const agenda = await evaluate(`(()=>({pressed:document.querySelector('[data-inspector-schedule-mode="agenda"]')?.getAttribute('aria-pressed'),visible:Boolean(document.querySelector('[data-inspector-agenda]')),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
            assert.deepStrictEqual(agenda, { pressed:'true', visible:true, overflow:false }, '390px Inspector Schedule must default to mobile Agenda without page overflow');
        }
    }
    await evaluate(`document.querySelector('[data-bbs-tab="workspace"]').click()`);
    await waitFor(`document.querySelector('[data-bbs-workspace-kpi-status]')`);
    await evaluate(`document.querySelector('[data-bbs-tab="cards"]').click()`);
    await waitFor(`document.querySelector('[data-bbs-master-readiness]') && document.querySelector('[data-card-workspace="personal"]')`);
    const overview = await evaluate(`(()=>({navigation:document.querySelectorAll('[data-card-workspace-navigation] [data-card-workspace]').length,mode:document.querySelector('[data-card-guided-workflow]')?.dataset.cardGuidedWorkflow,personalForm:Boolean(document.querySelector('#bbs-template-form')),departmentForm:Boolean(document.querySelector('#bbs-dept-template-form'))}))()`);
    assert.deepStrictEqual(overview, { navigation:3, mode:'overview', personalForm:false, departmentForm:false }, 'Overview must separate both detailed workflows');
    await evaluate(`document.querySelector('[data-card-workspace="personal"]').click()`);
    await waitFor(`document.querySelector('[data-master-source="departments"]')`);
    await waitFor(`document.querySelector('[data-list-search="card-employees"]') && document.querySelector('[data-card-filter="status"]')`);
    const result = await evaluate(`(()=>{const dept=document.querySelector('[data-master-source="departments"]');return {departments:dept.options.length-1,mode:document.querySelector('[data-card-guided-workflow]')?.dataset.cardGuidedWorkflow,hasEmptyExplanation:Boolean(document.querySelector('#bbs-card-employees')?.children.length),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.strictEqual(result.departments, foundation.data.departments.length, 'Personal Card Department dropdown must match Foundation Master Department count');
    assert.strictEqual(result.mode, 'personal');
    assert.strictEqual(result.hasEmptyExplanation, true);
    assert.strictEqual(result.overflow, false, '390px BBS card Admin view must not overflow horizontally');
    await evaluate(`document.querySelector('[data-card-workspace="department"]').click()`);
    await waitFor(`document.querySelector('#bbs-dept-template-form') && document.querySelector('[data-community-handler]')`);
    const department = await evaluate(`(()=>({mode:document.querySelector('[data-card-guided-workflow]')?.dataset.cardGuidedWorkflow,personalForm:Boolean(document.querySelector('#bbs-template-form')),departmentForm:Boolean(document.querySelector('#bbs-dept-template-form')),rows:document.querySelectorAll('[data-department-config-row]').length,pickers:document.querySelectorAll('[data-admin-picker-search]').length,hiddenDepartmentId:Number(document.querySelector('#bbs-dept-template-form [name="departmentId"]')?.value||0),detailId:Number(document.querySelector('[data-department-config-detail]')?.dataset.departmentConfigDetail||0),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
    assert.deepStrictEqual(department, { mode:'department', personalForm:false, departmentForm:true, rows:foundation.data.departments.length, pickers:2, hiddenDepartmentId:department.detailId, detailId:department.detailId, overflow:false }, 'Department workflow must be Master-backed, isolated and mobile-safe');
    const filterResult = await evaluate(`(()=>{const input=document.querySelector('[data-department-config-search]');input.value='__no_such_department__';input.dispatchEvent(new Event('input',{bubbles:true}));const empty=!document.querySelector('[data-department-config-empty]').classList.contains('hidden');const visible=[...document.querySelectorAll('[data-department-config-row]')].filter(row=>!row.classList.contains('hidden')).length;input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));const picker=document.querySelector('[data-admin-picker-search="bbs-owner-admin"]');const first=document.querySelector('#bbs-owner-admin option[data-admin-option-search]');picker.value=String(first?.dataset.adminOptionSearch||'').split(' ')[0];picker.dispatchEvent(new Event('input',{bubbles:true}));const shown=[...document.querySelectorAll('#bbs-owner-admin option[data-admin-option-search]')].filter(option=>!option.hidden).length;return {empty,visible,shown};})()`);
    assert.strictEqual(filterResult.empty, true, 'Unknown Department search must show an empty explanation');
    assert.strictEqual(filterResult.visible, 0, 'Unknown Department search must hide all rows');
    assert.ok(filterResult.shown >= 1, 'Admin Master picker search must return a matching account');
    await evaluate(`document.querySelector('[data-bbs-tab="start"]').click()`);
    await waitFor(`document.querySelector('#bbs-batch-list') || document.querySelector('#bbs-eligible-list')`);
    const expectedEmployees = eligible.filter(row => String(row.EmployeeID) !== String(admin.EmployeeID));
    const expectedNotReady = expectedEmployees.filter(row => row.ChecklistReadiness?.ready !== true).length;
    const mobileReadiness = await evaluate(`(()=>{const root=document.querySelector('#bbs-batch-list')||document.querySelector('#bbs-eligible-list');return {rows:root?.querySelectorAll('[data-search]').length||0,badges:root?.querySelectorAll('[id^="bbs-batch-readiness-"],[id^="bbs-single-readiness-"]').length||0,disabledChecks:root?.querySelectorAll('[data-batch-employee]:disabled').length||0,disabledStarts:root?.querySelectorAll('[data-bbs-start]:disabled').length||0,described:[...root.querySelectorAll('[data-batch-employee],[data-bbs-start]')].every(control=>Boolean(control.getAttribute('aria-describedby'))),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.strictEqual(mobileReadiness.rows, expectedEmployees.length, 'Mobile selector must render the permission-scoped employee list');
    assert.strictEqual(mobileReadiness.badges, expectedEmployees.length, 'Mobile selector must explain Checklist Readiness for every employee');
    assert.strictEqual(mobileReadiness.disabledStarts, expectedNotReady, 'Mobile Single Observation controls must disable every non-ready employee');
    if (mobileReadiness.disabledChecks) assert.strictEqual(mobileReadiness.disabledChecks, expectedNotReady, 'Mobile Batch controls must disable every non-ready employee');
    assert.strictEqual(mobileReadiness.described, true, 'Readiness controls must reference their accessible reason');
    assert.strictEqual(mobileReadiness.overflow, false, '390px Checklist Readiness view must not overflow horizontally');
    await command('Emulation.setDeviceMetricsOverride', { width:1365, height:900, deviceScaleFactor:1, mobile:false });
    await sleep(500);
    const desktopReadiness = await evaluate(`(()=>({badges:document.querySelectorAll('[id^="bbs-batch-readiness-"],[id^="bbs-single-readiness-"]').length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
    assert.strictEqual(desktopReadiness.badges, expectedEmployees.length, 'Desktop selector must retain every Checklist Readiness explanation');
    assert.strictEqual(desktopReadiness.overflow, false, 'Desktop Checklist Readiness view must not overflow horizontally');
    await evaluate(`document.querySelector('[data-bbs-tab="workspace"]').click()`);
    await waitFor(`document.querySelector('[data-bbs-workspace-kpi-status]')`);
    const desktopKpi = await evaluate(`(()=>{const root=document.querySelector('[data-bbs-workspace-kpi-status]');return {code:root?.dataset.bbsWorkspaceKpiStatus,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.deepStrictEqual(desktopKpi, { code:workspace.kpi.status.code, overflow:false }, 'Desktop Workspace must retain the server KPI semantic state without overflow');
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log(`BBS Phase 10B-1/10B-3/10D-1/10D-2/10D-3/10D-4/10D-5 browser UAT: PASS (${result.departments} departments; ${eligible.length} employees)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    if (db) await db.end();
    await fs.promises.rm(profile, { recursive:true, force:true }).catch(() => {});
});
