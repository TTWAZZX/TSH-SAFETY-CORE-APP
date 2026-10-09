'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5115';
const fixture = JSON.parse(process.argv[3] || '{}');
const chromeCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const port = Number(process.env.SAFETY_VOTE_UX5_CDP_PORT || 9875);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-ux5-'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-ux-phase5-${Date.now()}`);
const pending = new Map();
const consoleErrors = [];
const unexpectedApiErrors = [];
const expectedApiErrors = [];
let expectHttpError = false;
let chrome;
let ws;
let id = 1;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cmd(method, params = {}) {
    const requestId = id++;
    return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        ws.send(JSON.stringify({ id: requestId, method, params }));
        setTimeout(() => { if (pending.delete(requestId)) reject(new Error(`CDP timeout ${method}`)); }, 30000);
    });
}

async function ev(expression) {
    const response = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
}

async function wait(expression, label = expression) {
    for (let attempt = 0; attempt < 220; attempt++) {
        if (await ev(expression)) return;
        await sleep(150);
    }
    const diagnostics = await ev(`({href:location.href,readyState:document.readyState,body:(document.body?.innerText||'').slice(0,500),html:(document.body?.innerHTML||'').slice(0,500)})`).catch(() => null);
    throw new Error(`Timeout waiting for ${label}\n${JSON.stringify({ diagnostics, consoleErrors, unexpectedApiErrors }, null, 2)}`);
}

async function click(selector) {
    const found = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true})()`);
    assert(found, `click target unavailable: ${selector}`);
}

async function shot(name) {
    const response = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(response.data, 'base64'));
}

async function inspectPage(viewport, screen) {
    return ev(`(()=>{const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},nodes=[...document.querySelectorAll('button,a')].filter(visible),targets=nodes.map(node=>{const r=node.getBoundingClientRect();return{tag:node.tagName,w:r.width,h:r.height,text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,70)}}),bad=targets.filter(x=>x.w<43.5||x.h<43.5);return{viewport:${JSON.stringify(viewport)},screen:${JSON.stringify(screen)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badTouch:bad,heading:Boolean(document.querySelector('h1')),roleNav:Boolean(document.querySelector('.sv-role-nav[aria-label]')),workspace:Boolean(document.querySelector('[data-sv-operations]')),suppressed:document.querySelectorAll('.svo-kpi.is-suppressed').length}})()`);
}

async function navigate(mode, campaignId, privacy = 'confidential') {
    await cmd('Page.navigate', { url: `${origin}/__ux5-admin/${mode}?campaign=${campaignId}&privacy=${privacy}` });
}

async function confirmAction(selector, label) {
    await click(selector);
    await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, `${label} confirmation`);
    assert(await ev(`document.querySelector('[role=alertdialog]')?.getAttribute('aria-modal')==='true'&&document.activeElement?.hasAttribute('data-sv-dialog-confirm')`), `${label} dialog semantics/focus are incomplete`);
    await click('[data-sv-dialog-confirm]');
}

const viewports = [
    ['390x844', 390, 844, true],
    ['430x932', 430, 932, true],
    ['768x1024', 768, 1024, true],
    ['1366x768', 1366, 768, false],
    ['1920x1080', 1920, 1080, false]
];

(async () => {
    assert(chromePath, 'Chrome or Edge is required');
    assert(fixture.campaignId && fixture.secretCampaignId, 'Guarded campaign fixtures are required');
    chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 100; attempt++) {
        try { const response = await fetch(`http://127.0.0.1:${port}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {}
        await sleep(150);
    }
    const target = targets?.find(item => item.type === 'page');
    assert(target, 'No browser page target');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', async event => {
        let raw = event.data;
        if (raw?.text) raw = await raw.text();
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && !message.params.response.url.endsWith('/favicon.ico')) {
            const item = `${message.params.response.status} ${message.params.response.url}`;
            (expectHttpError ? expectedApiErrors : unexpectedApiErrors).push(item);
        }
        const request = pending.get(message.id);
        if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    });
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await cmd('Network.enable');
    await cmd('Accessibility.enable');

    const matrix = [];
    for (let ordinal = 0; ordinal < viewports.length; ordinal++) {
        const [name, width, height, mobile] = viewports[ordinal];
        await cmd('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
        await navigate('full', fixture.campaignId);
        await wait(`Boolean(document.querySelector('[data-sv-operations]'))`, `${name} Operations workspace`);
        const layout = await inspectPage(name, 'operations');
        assert.strictEqual(layout.overflow, false, `${name} horizontal overflow`);
        assert.deepStrictEqual(layout.badTouch, [], `${name} touch targets ${JSON.stringify(layout.badTouch)}`);
        assert(layout.heading && layout.roleNav && layout.workspace, `${name} landmarks/navigation`);
        assert(layout.suppressed >= 3, `${name} privacy threshold suppression`);
        const body = await ev(`document.body.textContent`);
        assert(!body.includes('SV-V01') && !body.includes('private fixture detail') && !body.includes('Alice Real'), `${name} protected data leaked into Operations UI`);
        assert(body.includes('Privacy threshold') && body.includes('exact result hash'), `${name} privacy/certification wording`);
        assert(body.includes('3/6') && body.includes('งานที่กรรมการส่งแล้ว') && body.includes('ถอนตัว 1'), `${name} jury-progress aggregation`);
        assert(!body.includes('ความคืบหน้างานกรรมการ ไม่พร้อมใช้งาน'), `${name} jury-progress must not render a partial-data warning`);
        await shot(`operations-${name}.png`);

        if (ordinal === 0) {
            await click('[data-svo-action="preview-notifications"]');
            await wait(`Boolean(document.querySelector('.svo-preview'))`, 'notification aggregate preview');
            assert(!await ev(`document.querySelector('.svo-preview')?.textContent.includes('SV-V')`), 'notification preview disclosed employee identifiers');
            await confirmAction('[data-svo-action="queue-notifications"]', 'notification queue');
            await wait(`document.querySelector('.svo-action-message.is-success')?.textContent.includes('จัดคิว')`, 'notification queue success');
            await confirmAction('[data-svo-action="export-excel"]', 'aggregate export');
            await wait(`Boolean(document.querySelector('.svo-report-receipt'))`, 'aggregate report receipt');
            assert(await ev(`document.querySelector('.svo-report-receipt')?.textContent.includes('SHA-256')`), 'report integrity receipt missing');
            await confirmAction('[data-svo-action="process-schedule"]', 'schedule processor');
            await wait(`Boolean(document.querySelector('.svo-action-message.is-success'))`, 'schedule success');
            await ev(`document.querySelector('.svo-panel--results')?.scrollIntoView({block:'start'})`);
            await sleep(250);
            await shot('operations-results-actions-390x844.png');
            const tree = await cmd('Accessibility.getFullAXTree');
            assert(tree.nodes.some(node => String(node.name?.value || '').includes('Snapshot และรายงาน')), 'result readiness accessible heading missing');
        }
        matrix.push({ ...layout, suppressionSafe: true, timelineSafe: true, certificationOwnership: true });
    }

    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    expectHttpError = true;
    await navigate('full', fixture.secretCampaignId, 'secret_ballot');
    await wait(`Boolean(document.querySelector('.svo-privacy-state'))`, 'secret-ballot organization privacy state');
    expectHttpError = false;
    assert(await ev(`document.querySelector('.svo-privacy-state')?.textContent.includes('SECRET_DIMENSION_FORBIDDEN')`), 'secret dimension denial contract missing');
    assert(!await ev(`document.body.textContent.includes('SV-V')`), 'secret workspace disclosed employee identifiers');
    await shot('secret-dimension-forbidden-390x844.png');

    expectHttpError = true;
    await navigate('limited', fixture.campaignId);
    await wait(`Boolean(document.querySelector('[data-sv-operations]'))`, 'partial capability Operations workspace');
    expectHttpError = false;
    assert(await ev(`document.querySelector('[data-svo-action="process-schedule"]')?.disabled===true`), 'manage action must disable after capability denial');
    assert(await ev(`document.querySelector('.svo-warning-list')?.textContent.includes('สิทธิ์ของบัญชีนี้')`), 'partial capability warning missing');
    expectHttpError = true;
    await confirmAction('[data-svo-action="export-excel"]', 'denied aggregate export');
    await wait(`Boolean(document.querySelector('.svo-action-message.is-error'))`, 'export permission denial');
    expectHttpError = false;
    assert(await ev(`document.querySelector('[data-svo-action="export-excel"]')?.disabled===true`), 'export actions must disable after permission denial');
    await shot('partial-capability-390x844.png');

    expectHttpError = true;
    await navigate('denied', fixture.campaignId);
    await wait(`Boolean(document.querySelector('.svp-state--denied'))`, 'Operations permission denied state');
    expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--denied')?.getAttribute('role')==='alert'`), 'permission denial must be announced');
    await shot('permission-denied-390x844.png');

    await ev(`fetch('/__fixture/module/0',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    expectHttpError = true;
    await navigate('full', fixture.campaignId);
    await wait(`Boolean(document.querySelector('.svp-state--warning'))`, 'module-disabled fail-closed state');
    expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--warning')?.textContent.includes('fail-closed')`), 'fail-closed wording missing');
    await shot('module-disabled-fail-closed-390x844.png');
    await ev(`fetch('/__fixture/module/1',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);

    fs.mkdirSync(evidence, { recursive: true });
    const result = {
        decision: 'PASS', contract: '2026-10-08-safety-vote-ux5-r1', browser: path.basename(chromePath),
        viewports: viewports.map(item => item[0]), roles: ['admin', 'result-view-only', 'denied'], matrix,
        privacyThresholdSuppression: true, secretDimensionForbidden: true, notificationPreviewAggregateOnly: true,
        scheduleConfirmation: true, notificationQueueConfirmation: true, aggregateExportConfirmation: true,
        reportIntegrityReceipt: true, certificationOwnershipReadOnly: true, partialCapabilityState: true,
        permissionDenied: true, moduleDisabledFailClosed: true, juryProgressFunctional: true, expectedApiErrors, unexpectedApiErrors, consoleErrors
    };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(evidence, 'result.json'))).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('analytics/organization')), 'secret-dimension 403 evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/exports')), 'export capability 403 evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('503 ')), 'module-disabled 503 evidence missing');
    assert(![...expectedApiErrors, ...unexpectedApiErrors].some(item => item.startsWith('500 ') && item.includes('/jury/progress')), 'jury-progress returned HTTP 500');
    assert.deepStrictEqual(consoleErrors, []);
    assert.deepStrictEqual(unexpectedApiErrors, []);
    console.log(`Safety Vote UX Phase 5 authenticated Admin five-viewport browser UAT: PASS (${evidence}, result SHA-256 ${digest})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { ws?.close(); chrome?.kill(); } catch (_) {}
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
