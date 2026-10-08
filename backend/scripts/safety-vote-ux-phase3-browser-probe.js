'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5113';
const chromeCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const port = Number(process.env.SAFETY_VOTE_UX3_CDP_PORT || 9873);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-ux3-'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-ux-phase3-${Date.now()}`);
const pending = new Map();
const consoleErrors = [];
const apiErrors = [];
const ballotRequests = [];
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
    for (let attempt = 0; attempt < 200; attempt++) {
        if (await ev(expression)) return;
        await sleep(150);
    }
    throw new Error(`Timeout waiting for ${label}`);
}

async function click(selector) {
    const found = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true})()`);
    assert(found, `click target unavailable: ${selector}`);
}

async function clickText(selector, text) {
    const found = await ev(`(()=>{const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>(item.textContent||'').includes(${JSON.stringify(text)}));if(!node||node.disabled)return false;node.click();return true})()`);
    assert(found, `text click target unavailable: ${text}`);
}

async function shot(name) {
    const response = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(response.data, 'base64'));
}

async function inspectPage(viewport, screen) {
    return ev(`(()=>{const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},nodes=[...document.querySelectorAll('button,a,input,select,textarea')].filter(visible),targets=nodes.map(node=>{const target=(node.matches('input[type=radio],input[type=checkbox]')&&node.closest('label'))||node,r=target.getBoundingClientRect();return{tag:node.tagName,type:node.type||'',w:r.width,h:r.height,text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,60)}}),bad=targets.filter(x=>x.w<43.5||x.h<43.5);return{viewport:${JSON.stringify(viewport)},screen:${JSON.stringify(screen)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badTouch:bad,heading:Boolean(document.querySelector('h1')),roleNav:Boolean(document.querySelector('.sv-role-nav[aria-label]')),participation:Boolean(document.querySelector('[data-sv-participation]'))}})()`);
}

async function submitPopular(viewport, ordinal) {
    await clickText('[data-svp-campaign]', 'โหวตแนวคิดความปลอดภัย');
    await wait(`Boolean(document.querySelector('[data-svp-form]'))`, 'popular ballot form');
    if (ordinal === 0) {
        await click('[data-svp-action="review"]');
        await wait(`Boolean(document.querySelector('.svp-validation[role=alert]'))`, 'validation summary');
        assert(await ev(`document.activeElement?.classList.contains('svp-validation')`), 'validation summary must receive focus');
    }
    const alternate = await ev(`document.querySelectorAll('.svp-option input')[1]?.value`);
    await click('.svp-option input');
    await click('[data-svp-action="review"]');
    await wait(`Boolean(document.querySelector('.svp-review'))`, 'review before submit');
    assert(await ev(`document.querySelector('.svp-immutable-warning')?.textContent.includes('แก้ไขไม่ได้')`), 'immutable warning missing');
    const layout = await inspectPage(viewport, 'review');
    assert.strictEqual(layout.overflow, false, `${viewport} review overflow`);
    assert.deepStrictEqual(layout.badTouch, [], `${viewport} review touch targets ${JSON.stringify(layout.badTouch)}`);
    await shot(`user-review-${viewport}.png`);
    await click('[data-svp-action="confirm"]');
    await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, 'immutable confirmation dialog');
    assert(await ev(`document.querySelector('[role=alertdialog]')?.getAttribute('aria-modal')==='true'&&document.activeElement?.hasAttribute('data-sv-dialog-confirm')`), 'dialog semantics/focus are incomplete');
    await click('[data-sv-dialog-confirm]');
    await wait(`Boolean(document.querySelector('.svp-receipt'))`, 'privacy-safe receipt');
    const receipt = await ev(`document.querySelector('.svp-receipt dd')?.textContent.trim()`);
    const receiptText = await ev(`document.querySelector('.svp-receipt')?.textContent`);
    assert(receipt && !receiptText.includes('แนวคิด ก ลดการลื่นล้ม'), 'receipt must not disclose the selected answer');
    await shot(`user-receipt-${viewport}.png`);

    const request = ballotRequests.at(-1);
    assert(request?.headers?.['Idempotency-Key'] || request?.headers?.['idempotency-key'], 'captured submit is missing Idempotency-Key');
    const key = request.headers['Idempotency-Key'] || request.headers['idempotency-key'];
    const authorization = request.headers.Authorization || request.headers.authorization;
    const replay = await ev(`fetch(${JSON.stringify(request.url)},{method:'POST',headers:{'Content-Type':'application/json','Authorization':${JSON.stringify(authorization)},'Idempotency-Key':${JSON.stringify(key)}},body:${JSON.stringify(request.postData)}}).then(async response=>({status:response.status,data:await response.json()}))`);
    assert.strictEqual(replay.status, 200, `${viewport} exact replay status`);
    assert.strictEqual(replay.data.data.replayed, true, `${viewport} exact replay marker`);
    assert.strictEqual(replay.data.data.receiptCode, receipt, `${viewport} exact replay receipt`);
    const changed = JSON.parse(request.postData);
    changed.answers[0].optionIds = [Number(alternate)];
    const conflict = await ev(`fetch(${JSON.stringify(request.url)},{method:'POST',headers:{'Content-Type':'application/json','Authorization':${JSON.stringify(authorization)},'Idempotency-Key':${JSON.stringify(key)}},body:${JSON.stringify(JSON.stringify(changed))}}).then(async response=>({status:response.status,data:await response.json()}))`);
    assert.strictEqual(conflict.status, 409, `${viewport} changed replay must conflict`);
    assert.strictEqual(conflict.data.code, 'IDEMPOTENCY_CONFLICT', `${viewport} changed replay code`);
    return { ...layout, receiptSafe: true, replaySafe: true, conflictSafe: true };
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
        if (message.method === 'Network.requestWillBeSent' && message.params.request.method === 'POST' && message.params.request.url.includes('/ballot/submit')) ballotRequests.push(message.params.request);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 500) apiErrors.push(`${message.params.response.status} ${message.params.response.url}`);
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
        await cmd('Page.navigate', { url: `${origin}/__ux3-user/${ordinal + 1}?viewport=${name}` });
        await wait(`Boolean(document.querySelector('[data-sv-participation] .svp-hero'))`, 'My Activities list');
        const list = await inspectPage(name, 'activities');
        assert.strictEqual(list.overflow, false, `${name} list overflow`);
        assert.deepStrictEqual(list.badTouch, [], `${name} list touch targets ${JSON.stringify(list.badTouch)}`);
        assert(list.heading && list.roleNav && list.participation, `${name} landmarks/navigation`);
        assert.strictEqual(await ev(`document.querySelectorAll('[data-svp-campaign]').length`), 4, `${name} eligible activity count`);

        if (ordinal === 0) {
            await clickText('[data-svp-campaign]', 'ส่งผลงานลดความเสี่ยง');
            await wait(`document.querySelector('[data-svp-workflow=title]')!==null`, 'submission-adaptive workspace');
            assert(await ev(`document.querySelector('.svp-privacy-notice')?.textContent.includes('ข้อมูลลับ')`), 'submission privacy notice');
            await click('[data-svp-action="back-list"]');
            await clickText('[data-svp-campaign]', 'เสนอชื่อคนต้นแบบความปลอดภัย');
            await wait(`document.querySelector('[data-svp-workflow=nomineeEmployeeId]')!==null`, 'nomination-adaptive workspace');
            await click('[data-svp-action="back-list"]');
        }

        matrix.push(await submitPopular(name, ordinal));
        await click('[data-svp-action="back-list"]');
        await wait(`Boolean(document.querySelector('.svp-hero'))`, 'activities after receipt');

        if (ordinal === 0) {
            await clickText('[data-svp-campaign]', 'เลือกตั้งตัวแทนความปลอดภัยแบบลับ');
            await wait(`Boolean(document.querySelector('[data-svp-form]'))`, 'secret ballot form');
            await click('.svp-option input');
            await click('[data-svp-action="review"]');
            await click('[data-svp-action="confirm"]');
            await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, 'secret immutable confirmation');
            await click('[data-sv-dialog-confirm]');
            await wait(`Boolean(document.querySelector('.svp-receipt'))`, 'secret receipt');
            const text = await ev(`document.querySelector('.svp-receipt')?.textContent`);
            assert(text.includes('ค้นหาบัตรไม่ได้') && !text.includes('ผู้สมัคร สมชาย') && !text.includes('ผู้สมัคร สมหญิง'), 'secret receipt must be accepted-only and non-linkable');
            await shot('secret-receipt-390x844.png');
            const tree = await cmd('Accessibility.getFullAXTree');
            assert(tree.nodes.some(node => String(node.name?.value || '').includes('ส่งรายการสำเร็จ')), 'receipt accessible name missing');
        }
    }

    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await cmd('Page.navigate', { url: `${origin}/__ux3-user/6?permission=denied` });
    await wait(`Boolean(document.querySelector('.svp-state--denied'))`, 'permission denied state');
    assert(await ev(`document.querySelector('.svp-state--denied')?.getAttribute('role')==='alert'`), 'permission denial must be announced');
    await shot('permission-denied-390x844.png');

    const errorsBeforeFailClosedProbe = apiErrors.length;
    await ev(`fetch('/__fixture/module/0',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    await cmd('Page.navigate', { url: `${origin}/__ux3-user/1?module=disabled` });
    await wait(`Boolean(document.querySelector('.svp-state--warning'))`, 'module-disabled fail-closed state');
    assert(await ev(`document.querySelector('.svp-state--warning')?.textContent.includes('fail-closed')`), 'fail-closed wording missing');
    await shot('module-disabled-fail-closed-390x844.png');
    await ev(`fetch('/__fixture/module/1',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    const expectedFailClosedErrors = apiErrors.splice(errorsBeforeFailClosedProbe);
    assert(expectedFailClosedErrors.length >= 1 && expectedFailClosedErrors.every(item => item.startsWith('503 ')), 'module-disabled probe must fail closed with 503 only');

    fs.mkdirSync(evidence, { recursive: true });
    const result = {
        decision: 'PASS', contract: '2026-10-08-safety-vote-ux3-r1', browser: path.basename(chromePath),
        viewports: viewports.map(item => item[0]), roles: ['user'], matrix,
        adaptiveCampaignTypes: ['popular_vote', 'secret_election', 'submission_challenge', 'nomination'],
        validationSummary: true, reviewBeforeSubmit: true, immutableConfirmation: true,
        exactReplaySafe: true, changedPayloadConflict: true, privacySafeReceipt: true,
        permissionDenied: true, moduleDisabledFailClosed: true, expectedFailClosedErrors,
        unexpectedApiErrors: apiErrors, consoleErrors
    };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(evidence, 'result.json'))).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    assert.deepStrictEqual(consoleErrors, []);
    assert.deepStrictEqual(apiErrors, []);
    console.log(`Safety Vote UX Phase 3 authenticated User five-viewport browser UAT: PASS (${evidence}, result SHA-256 ${digest})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { ws?.close(); chrome?.kill(); } catch (_) {}
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
