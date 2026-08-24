'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const isLocal = ['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname);
const apiPort = Number(process.env.YOKOTEN_UAT_API_PORT || 5000);
const apiBaseUrl = isLocal ? `http://127.0.0.1:${apiPort}` : baseUrl;
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.PROD_UAT_CDP_PORT || 9812);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-prod-dashboard-uat-'));
const artifactDir = path.join(
    path.resolve(__dirname, '..', '..'),
    'backups',
    isLocal ? 'local' : 'production',
    `yokoten-dashboard-browser-uat-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let client;
let server;
let db;

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    close() {
        try { this.socket.close(); } catch (_) {}
    }
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const result = await client.command('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.result?.value) return result.result.value;
        await sleep(300);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
}

async function evaluate(expression) {
    const result = await client.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
}

async function screenshot(name) {
    const result = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(result.data, 'base64'));
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    let targets;
    for (let i = 0; i < 60; i += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) {
                targets = await response.json();
                break;
            }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome CDP page target was not available');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
}

async function listenLocalApi() {
    if (!isLocal) return;
    const app = require('../server');
    db = require('../db');
    server = await new Promise((resolve, reject) => {
        const instance = app.listen(apiPort, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
}

async function loginProduction() {
    const response = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `Production login failed: ${text.slice(0, 300)}`);
    assert.ok(json?.token && json?.user, 'Production login did not return a session');
    return json;
}

async function responseCount(token) {
    const response = await fetch(`${apiBaseUrl}/api/yokoten/all-responses`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `Yokoten response count failed: ${JSON.stringify(json).slice(0, 300)}`);
    return Array.isArray(json?.data) ? json.data.length : 0;
}

async function assessmentCount(token) {
    const year = new Date().getFullYear();
    const response = await fetch(`${apiBaseUrl}/api/safety-culture/assessments?year=${year}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `Safety Culture assessment count failed: ${JSON.stringify(json).slice(0, 300)}`);
    return Array.isArray(json?.data) ? json.data.length : 0;
}

async function ppeInspectionCount(token) {
    const year = new Date().getFullYear();
    const response = await fetch(`${apiBaseUrl}/api/safety-culture/ppe-inspections?year=${year}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `Safety Culture PPE inspection count failed: ${JSON.stringify(json).slice(0, 300)}`);
    return Array.isArray(json?.data) ? json.data.length : 0;
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    await listenLocalApi();
    const session = await loginProduction();
    const beforeResponseCount = await responseCount(session.token);
    const beforeAssessmentCount = await assessmentCount(session.token);
    const beforePpeInspectionCount = await ppeInspectionCount(session.token);
    await connectBrowser();
    if (isLocal) {
        await client.command('Page.addScriptToEvaluateOnNewDocument', {
            source: `window.API_BASE = ${JSON.stringify(`${apiBaseUrl}/api`)};
                window.__uatErrors = [];
                window.addEventListener('error', event => window.__uatErrors.push(String(event.error?.stack || event.message || 'window error')));
                window.addEventListener('unhandledrejection', event => window.__uatErrors.push(String(event.reason?.stack || event.reason || 'unhandled rejection')));`,
        });
    }

    await client.command('Page.navigate', { url: `${baseUrl}/?browserUat=${Date.now()}` });
    await waitFor(`document.readyState === 'complete'`);
    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(session.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(session.user))});
        location.href = ${JSON.stringify(`${baseUrl}/#dashboard`)};
        return true;
    })()`);
    await waitFor(`Boolean(localStorage.getItem('tsh_token')) && location.hash === '#dashboard'`);
    try {
        await waitFor(`document.body.innerText.includes('Department Coverage Overview') && document.body.innerText.toUpperCase().includes('CCCF A (MANUAL)')`);
    } catch (error) {
        const debugState = await evaluate(`(() => ({
            href: location.href,
            hash: location.hash,
            title: document.title,
            tokenPresent: Boolean(localStorage.getItem('tsh_token')),
            errors: window.__uatErrors || [],
            bodyDisplay: getComputedStyle(document.body).display,
            bodyVisibility: getComputedStyle(document.body).visibility,
            bodyText: document.body.innerText.slice(0, 2000),
            bodyHtml: document.body.innerHTML.slice(0, 1000)
        }))()`);
        fs.writeFileSync(path.join(artifactDir, 'dashboard-debug.json'), JSON.stringify(debugState, null, 2));
        await screenshot('dashboard-debug.png');
        throw new Error(`${error.message}; debug artifact: ${artifactDir}`);
    }
    const dashboardState = await evaluate(`(() => ({
        hash: location.hash,
        hasOverview: document.body.innerText.includes('Department Coverage Overview'),
        hasCccfManual: document.body.innerText.toUpperCase().includes('CCCF A (MANUAL)'),
        tableRows: document.querySelectorAll('#db-compliance-wrap tbody tr').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(dashboardState.hash, '#dashboard');
    assert.strictEqual(dashboardState.hasOverview, true);
    assert.strictEqual(dashboardState.hasCccfManual, true);
    assert.ok(dashboardState.tableRows > 0, 'Dashboard browser table is empty');
    assert.strictEqual(dashboardState.horizontalOverflow, false, 'Dashboard has page-level horizontal overflow');
    await screenshot('dashboard.png');
    console.log(`PASS Dashboard browser — ${dashboardState.tableRows} rows`);

    await evaluate(`location.hash = '#yokoten'; true`);
    await waitFor(`location.hash === '#yokoten' && Boolean(document.querySelector('#yok-content [data-yok-card-image]'))`);
    await evaluate(`document.querySelector('#yok-tab-btn-admin')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('.adm-view-btn[data-adm-view="dept"]'))`);
    await evaluate(`document.querySelector('.adm-view-btn[data-adm-view="dept"]')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('[data-yok-card-image="yokoten-admin-dept-matrix"]'))`);
    const yokotenState = await evaluate(`(() => ({
        hash: location.hash,
        hasYokoten: document.body.innerText.toUpperCase().includes('YOKOTEN'),
        hasUnitGap: document.querySelector('[data-yok-card-image="yokoten-admin-dept-matrix"]').innerText.includes('Unit ไม่ครบ'),
        hasOneOfSix: document.querySelector('[data-yok-card-image="yokoten-admin-dept-matrix"]').innerText.includes('1/6'),
        hasProduction1: document.querySelector('[data-yok-card-image="yokoten-admin-dept-matrix"]').innerText.includes('PRODUCTION 1 SEC.'),
        matrixRows: document.querySelectorAll('[data-yok-card-image="yokoten-admin-dept-matrix"] tbody tr').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(yokotenState.hash, '#yokoten');
    assert.strictEqual(yokotenState.hasYokoten, true);
    assert.strictEqual(yokotenState.hasProduction1, true, 'Production 1 matrix row is missing');
    assert.ok(yokotenState.matrixRows > 0, 'Yokoten Department matrix is empty');
    assert.strictEqual(yokotenState.horizontalOverflow, false, 'Yokoten has page-level horizontal overflow');

    await screenshot('yokoten.png');
    console.log(`PASS Yokoten Unit coverage matrix — ${yokotenState.matrixRows} rows; Unit gap present=${yokotenState.hasUnitGap}`);

    await evaluate(`document.querySelector('.yok-admin-coverage-mode[data-coverage-mode="topic"]')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('[data-yok-card-image="yokoten-admin-topic-coverage"]'))`);
    const topicCoverageState = await evaluate(`(() => ({
        topicOptions: document.querySelectorAll('#yok-admin-coverage-topic option').length,
        departmentRows: document.querySelectorAll('[data-yok-card-image="yokoten-admin-topic-coverage"] tbody tr').length,
        headers: [...document.querySelectorAll('[data-yok-card-image="yokoten-admin-topic-coverage"] thead th')].map(cell => cell.textContent.trim()),
        hasCoveredColumn: document.body.innerText.includes('Unit ที่ส่งแล้ว'),
        hasMissingColumn: document.body.innerText.includes('Unit ที่ยังไม่ส่ง'),
        hasCompleteFilter: Boolean(document.querySelector('.yok-admin-coverage-status[data-coverage-status="complete"]')),
        hasPartialFilter: Boolean(document.querySelector('.yok-admin-coverage-status[data-coverage-status="partial"]')),
        hasMissingFilter: Boolean(document.querySelector('.yok-admin-coverage-status[data-coverage-status="missing"]')),
        hasYearFilter: Boolean(document.querySelector('#yok-admin-coverage-year')),
        hasRiskFilter: Boolean(document.querySelector('#yok-admin-coverage-risk')),
        hasTopicExcel: Boolean(document.querySelector('#yok-topic-coverage-export')),
        hasReminderAction: Boolean(document.querySelector('#yok-topic-reminder-all')),
        hasRowReminder: Boolean(document.querySelector('.yok-topic-reminder-btn')),
        hasRespondBehalf: Boolean(document.querySelector('.yok-topic-respond-behalf-btn')),
        hasDeadlineColumn: Boolean(document.querySelector('[data-yok-card-image="yokoten-admin-topic-coverage"] thead th:nth-last-child(3)')),
        incompleteRows: document.querySelectorAll('.yok-topic-reminder-btn').length,
        missingRows: document.querySelectorAll('.yok-topic-respond-behalf-btn').length,
        hasOneOfSix: document.querySelector('[data-yok-card-image="yokoten-admin-topic-coverage"]').innerText.includes('1/6'),
        hasExpectedMissingUnit: document.querySelector('[data-yok-card-image="yokoten-admin-topic-coverage"]').innerText.includes('PD1 Assy 3/2')
    }))()`);
    console.log(`INFO Topic Coverage headers — ${topicCoverageState.headers.join(' | ')}`);
    assert.ok(topicCoverageState.topicOptions > 0, 'Topic Coverage selector is empty');
    assert.ok(topicCoverageState.departmentRows > 0, 'Topic Coverage Department rows are empty');
    assert.ok(topicCoverageState.headers.includes('Unit ที่ส่งแล้ว'), 'Covered Unit column is missing');
    assert.ok(topicCoverageState.headers.includes('Unit ที่ยังไม่ส่ง'), 'Missing Unit column is missing');
    assert.strictEqual(topicCoverageState.hasCompleteFilter, true, 'Complete filter is missing');
    assert.strictEqual(topicCoverageState.hasPartialFilter, true, 'Partial filter is missing');
    assert.strictEqual(topicCoverageState.hasMissingFilter, true, 'Missing filter is missing');
    assert.strictEqual(topicCoverageState.hasYearFilter, true, 'Topic Coverage year filter is missing');
    assert.strictEqual(topicCoverageState.hasRiskFilter, true, 'Topic Coverage risk filter is missing');
    assert.strictEqual(topicCoverageState.hasTopicExcel, true, 'Topic Coverage Excel action is missing');
    assert.strictEqual(topicCoverageState.hasReminderAction, topicCoverageState.incompleteRows > 0, 'Bulk Reminder visibility must match incomplete rows');
    assert.strictEqual(topicCoverageState.hasRowReminder, topicCoverageState.incompleteRows > 0, 'Row Reminder visibility must match incomplete rows');
    assert.strictEqual(topicCoverageState.hasRespondBehalf, topicCoverageState.missingRows > 0, 'Response-on-behalf visibility must match missing rows');
    assert.strictEqual(topicCoverageState.hasDeadlineColumn, true, 'Topic Coverage deadline column is missing');
    const respondDepartment = await evaluate(`document.querySelector('.yok-topic-respond-behalf-btn')?.dataset.department || ''`);
    if (respondDepartment) {
        await evaluate(`document.querySelector('.yok-topic-respond-behalf-btn')?.click(); true`);
        await waitFor(`Boolean(document.querySelector('[data-yok-modal] form.yok-resp-form[data-admin-mode="1"]'))`);
        topicCoverageState.respondBehalfPreselected = await evaluate(`(() => {
            const selected = document.querySelector('[data-yok-modal] .yok-admin-selection-item[data-selection-group="departments"][aria-checked="true"]');
            return selected?.dataset.selectionValue || '';
        })()`);
        assert.strictEqual(topicCoverageState.respondBehalfPreselected, respondDepartment, 'Response-on-behalf did not preselect the missing Department');
        await evaluate(`window.closeModal?.(); true`);
    } else {
        topicCoverageState.respondBehalfPreselected = null;
    }
    await screenshot('yokoten-topic-coverage.png');
    console.log(`PASS Yokoten Topic Coverage — ${topicCoverageState.topicOptions} topics; incomplete ${topicCoverageState.incompleteRows}; missing ${topicCoverageState.missingRows}`);

    await evaluate(`location.hash = '#safety-culture'; true`);
    await waitFor(`location.hash === '#safety-culture' && Boolean(document.querySelector('#sc-tab-btn-assessment'))`);
    await evaluate(`document.querySelector('#sc-tab-btn-assessment')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('[data-sc-card-image="safety-culture-assessment-history"]'))`);
    const assessmentHistoryState = await evaluate(`(() => {
        const table = document.querySelector('[data-sc-card-image="safety-culture-assessment-history"] table');
        const headers = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
        return {
            activeView: document.querySelector('.sc-asmt-view-btn.bg-emerald-600')?.dataset.asmtView || '',
            activeMode: document.querySelector('.sc-asmt-table-mode.bg-white')?.dataset.asmtTableMode || '',
            headers,
            rows: table.querySelectorAll('tbody tr').length,
            pageSize: document.querySelector('#sc-asmt-page-size')?.value || '',
            pageOverflowContained: table.scrollWidth <= table.closest('.overflow-x-auto').scrollWidth || table.closest('.overflow-x-auto').scrollWidth > 0,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
    })()`);
    assert.strictEqual(assessmentHistoryState.activeView, 'history', 'Assessment must default to History');
    assert.strictEqual(assessmentHistoryState.activeMode, 'compact', 'Assessment must default to compact table');
    assert.deepStrictEqual(assessmentHistoryState.headers.slice(0, 7), ['วันที่', 'พื้นที่', 'จุดตรวจ', 'เฉลี่ย', 'ต้องติดตาม', 'ระดับ', 'Note']);
    assert.ok(assessmentHistoryState.rows <= 10, 'Compact Assessment page must contain at most 10 rows');
    assert.strictEqual(assessmentHistoryState.pageSize, '10');
    assert.strictEqual(assessmentHistoryState.horizontalOverflow, false, 'Compact Assessment view has page-level horizontal overflow');
    await screenshot('safety-culture-assessment-history-compact.png');

    await evaluate(`document.querySelector('.sc-asmt-table-mode[data-asmt-table-mode="detailed"]')?.click(); true`);
    await waitFor(`document.querySelector('.sc-asmt-table-mode.bg-white')?.dataset.asmtTableMode === 'detailed'`);
    assessmentHistoryState.detailedHeaders = await evaluate(`[...document.querySelectorAll('[data-sc-card-image="safety-culture-assessment-history"] thead th')].map(cell => cell.textContent.trim())`);
    assert.ok(assessmentHistoryState.detailedHeaders.includes('T1') && assessmentHistoryState.detailedHeaders.includes('T7'), 'Detailed Assessment scores are missing');
    await screenshot('safety-culture-assessment-history-detailed.png');

    await evaluate(`document.querySelector('.sc-asmt-view-btn[data-asmt-view="overview"]')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('[data-sc-card-image="safety-culture-assessment-heatmap"]'))`);
    assessmentHistoryState.overviewReady = await evaluate(`Boolean(document.querySelector('[data-sc-card-image="safety-culture-assessment-monthly-summary"]')) && Boolean(document.querySelector('[data-sc-card-image="safety-culture-assessment-location-followup"]'))`);
    assert.strictEqual(assessmentHistoryState.overviewReady, true, 'Assessment Overview panels are incomplete');
    await screenshot('safety-culture-assessment-overview.png');

    await evaluate(`document.querySelector('.sc-asmt-view-btn[data-asmt-view="setup"]')?.click(); true`);
    await waitFor(`document.body.innerText.includes('ตั้งค่าจุดตรวจ Safety Culture')`);
    assessmentHistoryState.setupReady = true;
    await screenshot('safety-culture-assessment.png');
    console.log(`PASS Safety Culture Assessment layout — compact ${assessmentHistoryState.rows} rows; detailed T1-T7; Overview and Setup ready`);

    await evaluate(`document.querySelector('#sc-tab-btn-ppe')?.click(); true`);
    await waitFor(`typeof window._scAddPPE === 'function' && document.body.innerText.includes('บันทึกผล PPE Inspection')`);
    await evaluate(`window._scAddPPE(); true`);
    await waitFor(`Boolean(document.querySelector('#sc-ppef-stepper'))`);
    const ppeStepOne = await evaluate(`(() => ({
        indicators: document.querySelectorAll('[data-ppe-step-indicator]').length,
        summary: document.querySelector('#sc-ppef-step-summary')?.textContent.trim() || '',
        modalWide: document.querySelector('#modal-container')?.classList.contains('max-w-5xl') || false,
        submitHidden: document.querySelector('#sc-ppef-submit')?.classList.contains('hidden') || false
    }))()`);
    assert.strictEqual(ppeStepOne.indicators, 3, 'PPE form must show three guided steps');
    assert.strictEqual(ppeStepOne.summary, 'ขั้นตอน 1 จาก 3');
    assert.strictEqual(ppeStepOne.modalWide, true, 'PPE form modal must use the wider layout');
    assert.strictEqual(ppeStepOne.submitHidden, true, 'PPE submit must remain hidden before the checklist step');

    const templateReady = await evaluate(`(() => {
        const template = document.querySelector('#sc-ppef-wt');
        if (!template || template.options.length < 2) return false;
        template.value = template.options[1].value;
        template.dispatchEvent(new Event('change', { bubbles: true }));
        const department = document.querySelector('#sc-ppef [name="Department"]');
        if (department?.tagName === 'SELECT' && department.options.length > 1) department.value = department.options[1].value;
        else if (department) department.value = 'UAT READ ONLY';
        document.querySelector('#sc-ppef-next')?.click();
        return true;
    })()`);
    assert.strictEqual(templateReady, true, 'PPE form has no usable work-type template');
    await waitFor(`document.querySelector('#sc-ppef-step-summary')?.textContent.includes('2 จาก 3')`);
    await evaluate(`document.querySelector('#sc-ppef-next')?.click(); true`);
    await waitFor(`document.querySelector('#sc-ppef-step-summary')?.textContent.includes('3 จาก 3') && document.querySelectorAll('.sc-ppe-radio').length > 0`);
    const ppeChecklistState = await evaluate(`(() => {
        const radios = [...document.querySelectorAll('.sc-ppe-radio')];
        const groups = new Set(radios.map(radio => radio.name));
        const defaultNa = radios.filter(radio => radio.value === 'na' && radio.checked).length;
        return {
            groups: groups.size,
            defaultNa,
            submitVisible: !document.querySelector('#sc-ppef-submit')?.classList.contains('hidden'),
            backVisible: !document.querySelector('#sc-ppef-back')?.classList.contains('hidden'),
            result: document.querySelector('#sc-ppef-result')?.textContent.trim() || ''
        };
    })()`);
    assert.ok(ppeChecklistState.groups > 0, 'PPE checklist must contain at least one item');
    assert.strictEqual(ppeChecklistState.defaultNa, ppeChecklistState.groups, 'Every PPE item must still default to N/A');
    assert.strictEqual(ppeChecklistState.submitVisible, true, 'PPE submit must be visible on step 3');
    assert.strictEqual(ppeChecklistState.backVisible, true, 'PPE back navigation must be visible on step 3');
    await screenshot('safety-culture-ppe-form-step-3.png');
    await evaluate(`window.closeModal?.(); true`);
    console.log(`PASS Safety Culture PPE form — 3 steps; ${ppeChecklistState.groups} checklist items default N/A; no submission`);

    const afterResponseCount = await responseCount(session.token);
    assert.strictEqual(afterResponseCount, beforeResponseCount, 'Read-only browser UAT changed Yokoten response data');
    const afterAssessmentCount = await assessmentCount(session.token);
    assert.strictEqual(afterAssessmentCount, beforeAssessmentCount, 'Read-only browser UAT changed Safety Culture assessment data');
    const afterPpeInspectionCount = await ppeInspectionCount(session.token);
    assert.strictEqual(afterPpeInspectionCount, beforePpeInspectionCount, 'Read-only browser UAT changed Safety Culture PPE inspection data');

    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify({
        environment: isLocal ? 'local' : 'production',
        baseUrl,
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
        dashboard: dashboardState,
        yokoten: yokotenState,
        topicCoverage: topicCoverageState,
        safetyCultureAssessment: assessmentHistoryState,
        safetyCulturePpeForm: ppeChecklistState,
        responseCountBefore: beforeResponseCount,
        responseCountAfter: afterResponseCount,
        assessmentCountBefore: beforeAssessmentCount,
        assessmentCountAfter: afterAssessmentCount,
        ppeInspectionCountBefore: beforePpeInspectionCount,
        ppeInspectionCountAfter: afterPpeInspectionCount,
        passed: true,
    }, null, 2));
    console.log(`ARTIFACT ${artifactDir}`);
}

main()
    .catch(error => {
        console.error(`FAIL ${error.stack || error.message || error}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        client?.close();
        if (browser && !browser.killed) browser.kill();
        if (server) await new Promise(resolve => server.close(resolve));
        if (db) await db.end();
        await sleep(500);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
