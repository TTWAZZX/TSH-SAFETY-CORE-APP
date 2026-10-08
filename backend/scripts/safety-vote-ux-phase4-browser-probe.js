'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5114';
const fixture = JSON.parse(process.argv[3] || '{}');
const chromeCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const port = Number(process.env.SAFETY_VOTE_UX4_CDP_PORT || 9874);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-ux4-'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-ux-phase4-${Date.now()}`);
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

async function setValue(selector, value) {
    const changed = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return false;node.value=${JSON.stringify(String(value))};node.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    assert(changed, `input target unavailable: ${selector}`);
}

async function shot(name) {
    const response = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(response.data, 'base64'));
}

async function inspectPage(viewport, screen) {
    return ev(`(()=>{const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},nodes=[...document.querySelectorAll('button,a,input,textarea')].filter(visible),targets=nodes.map(node=>{const r=node.getBoundingClientRect();return{tag:node.tagName,type:node.type||'',w:r.width,h:r.height,text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,60)}}),bad=targets.filter(x=>x.w<43.5||x.h<43.5);return{viewport:${JSON.stringify(viewport)},screen:${JSON.stringify(screen)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badTouch:bad,heading:Boolean(document.querySelector('h1')),roleNav:Boolean(document.querySelector('.sv-role-nav[aria-label]')),workspace:Boolean(document.querySelector('[data-sv-jury-workspace]'))}})()`);
}

async function openAssignment(ordinal, assignmentId) {
    await cmd('Page.navigate', { url: `${origin}/__ux4-juror/${ordinal + 1}?assignment=${assignmentId}` });
    await wait(`Boolean(document.querySelector('[data-sv-jury-workspace].svj-shell--detail'))`, 'juror scoring detail');
    assert.strictEqual(await ev(`document.body.textContent.includes('Alice Real')||document.body.textContent.includes('Bob Real')`), false, 'blind workspace leaked a real candidate name');
    assert(await ev(`document.querySelector('.svj-blind-notice')?.textContent.includes('Blind judging')`), 'blind-mode notice missing');
}

async function completeAndSubmit(viewport, ordinal, assignmentId) {
    await openAssignment(ordinal, assignmentId);
    assert.strictEqual(await ev(`document.querySelectorAll('[data-svj-score]').length`), 4, `${viewport} scoring control count`);
    if (ordinal === 0) {
        await click('[data-svj-action="review"]');
        await wait(`Boolean(document.querySelector('.svp-validation[role=alert]'))`, 'validation summary');
        assert(await ev(`document.activeElement?.classList.contains('svp-validation')`), 'validation summary must receive focus');
        await setValue('[data-svj-score]', 8);
        await wait(`document.querySelector('[data-svj-save-status]')?.dataset.state==='local'`, 'local autosave state');
        await openAssignment(ordinal, assignmentId);
        assert.strictEqual(await ev(`document.querySelector('[data-svj-score]')?.value`), '8', 'local draft was not recovered after navigation');
    }
    const controls = await ev(`[...document.querySelectorAll('[data-svj-score]')].map(node=>node.dataset.svjScore)`);
    for (let index = 0; index < controls.length; index++) await setValue(`[data-svj-score="${controls[index]}"]`, 7 + (index % 3));
    await wait(`document.querySelector('[data-svj-save-status]')?.dataset.state==='saved'`, 'server autosave state');
    await click('[data-svj-action="review"]');
    await wait(`Boolean(document.querySelector('.svj-review'))`, 'review before submit');
    assert(await ev(`document.querySelector('.svp-immutable-warning')?.textContent.includes('แก้ไขไม่ได้')`), 'immutable warning missing');
    const layout = await inspectPage(viewport, 'review');
    assert.strictEqual(layout.overflow, false, `${viewport} review overflow`);
    assert.deepStrictEqual(layout.badTouch, [], `${viewport} review touch targets ${JSON.stringify(layout.badTouch)}`);
    assert(layout.heading && layout.roleNav && layout.workspace, `${viewport} landmarks/navigation`);
    await shot(`juror-review-${viewport}.png`);
    await click('[data-svj-action="confirm"]');
    await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, 'immutable confirmation dialog');
    assert(await ev(`document.querySelector('[role=alertdialog]')?.getAttribute('aria-modal')==='true'&&document.activeElement?.hasAttribute('data-sv-dialog-confirm')`), 'immutable dialog semantics/focus are incomplete');
    await click('[data-sv-dialog-confirm]');
    await wait(`Boolean(document.querySelector('.svj-receipt'))`, 'privacy-safe receipt');
    const receipt = await ev(`document.querySelector('.svj-receipt')?.textContent || ''`);
    assert(!receipt.includes('Candidate A01') && !receipt.includes('Candidate B01') && !receipt.includes('ความปลอดภัย') && !receipt.includes('ความเป็นไปได้'), 'receipt disclosed candidate, criterion or score detail');
    assert(await ev(`sessionStorage.getItem('safety-vote-jury-draft:${assignmentId}')===null`), 'submitted local draft was not cleared');
    await shot(`juror-receipt-${viewport}.png`);
    expectHttpError = true;
    const duplicate = await ev(`fetch('/api/safety-vote/jury/assignments/${assignmentId}/submit',{method:'POST',headers:{Authorization:'Bearer sv-jury-${String(ordinal + 1).padStart(2, '0')}','Content-Type':'application/json'},body:'{}'}).then(async response=>({status:response.status,data:await response.json()}))`);
    expectHttpError = false;
    assert.strictEqual(duplicate.status, 409, `${viewport} duplicate submit status`);
    assert.strictEqual(duplicate.data.code, 'SCORE_SHEET_LOCKED', `${viewport} duplicate submit guard`);
    await openAssignment(ordinal, assignmentId);
    await wait(`Boolean(document.querySelector('.svj-receipt'))`, 'authoritative submitted receipt after reload');
    const tree = await cmd('Accessibility.getFullAXTree');
    assert(tree.nodes.some(node => String(node.name?.value || '').includes('ส่งแบบประเมินสำเร็จ')), `${viewport} receipt accessible name missing`);
    return { ...layout, blindSafe: true, serverAutosave: true, immutableSubmit: true, duplicateSubmitBlocked: true, privacySafeReceipt: true };
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
    assert.strictEqual(fixture.assignmentIds?.length, 5, 'Five guarded assignments are required');
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
            (expectHttpError || [409, 503].includes(message.params.response.status) ? expectedApiErrors : unexpectedApiErrors).push(item);
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
        matrix.push(await completeAndSubmit(name, ordinal, fixture.assignmentIds[ordinal]));
    }

    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await openAssignment(0, fixture.recuseId);
    await click('[data-svj-action="recuse"]');
    await wait(`Boolean(document.querySelector('[data-sv-dialog=reason]'))`, 'recusal reason dialog');
    assert(await ev(`document.querySelector('[data-sv-dialog=reason] [role=dialog]')?.getAttribute('aria-modal')==='true'&&document.activeElement?.id==='sv-dialog-reason'`), 'recusal dialog semantics/focus are incomplete');
    await click('[data-sv-dialog-confirm]');
    assert(await ev(`document.querySelector('#sv-dialog-reason')?.getAttribute('aria-invalid')==='true'&&document.activeElement?.id==='sv-dialog-reason'`), 'empty recusal reason must fail validation and retain focus');
    await setValue('#sv-dialog-reason', 'มีส่วนเกี่ยวข้องโดยตรงกับรายการนี้');
    await shot('juror-recusal-dialog-390x844.png');
    await click('[data-sv-dialog-confirm]');
    await wait(`Boolean(document.querySelector('[data-svj-view=recused][aria-selected=true]'))`, 'recused queue view');
    assert(await ev(`sessionStorage.getItem('safety-vote-jury-draft:${fixture.recuseId}')===null`), 'recused local draft was not cleared');

    expectHttpError = true;
    await cmd('Page.navigate', { url: `${origin}/__ux4-juror/6?assignment=${fixture.assignmentIds[0]}` });
    await wait(`Boolean(document.querySelector('.svp-state--denied'))`, 'unassigned direct-link denial');
    expectHttpError = false;
    assert(!await ev(`document.body.textContent.includes('Candidate A01')||document.body.textContent.includes('ความปลอดภัย')`), 'unassigned direct link disclosed protected detail');
    await shot('unassigned-direct-link-denied-390x844.png');

    expectHttpError = true;
    await cmd('Page.navigate', { url: `${origin}/__ux4-juror/7` });
    await wait(`Boolean(document.querySelector('.svp-state--denied'))`, 'jury permission denial');
    expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--denied')?.getAttribute('role')==='alert'`), 'permission denial must be announced');
    await shot('permission-denied-390x844.png');

    expectHttpError = true;
    await ev(`fetch('/__fixture/module/0',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    await cmd('Page.navigate', { url: `${origin}/__ux4-juror/6` });
    await wait(`Boolean(document.querySelector('.svp-state--warning'))`, 'module-disabled fail-closed state');
    assert(await ev(`document.querySelector('.svp-state--warning')?.textContent.includes('fail-closed')`), 'fail-closed wording missing');
    await shot('module-disabled-fail-closed-390x844.png');
    await ev(`fetch('/__fixture/module/1',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    expectHttpError = false;

    assert.strictEqual(await ev(`Object.keys(sessionStorage).filter(key=>key.startsWith('safety-vote-jury-draft:')).length`), 0, 'browser session left juror draft residue');
    fs.mkdirSync(evidence, { recursive: true });
    const result = {
        decision: 'PASS', contract: '2026-10-08-safety-vote-ux4-r1', browser: path.basename(chromePath),
        viewports: viewports.map(item => item[0]), roles: ['juror'], matrix,
        blindPresentation: true, localDraftRecovery: true, serverAutosave: true,
        validationSummary: true, reviewBeforeSubmit: true, immutableConfirmation: true,
        duplicateSubmitBlocked: true, recusalDialog: true, privacySafeReceipt: true,
        unassignedDirectLinkDenied: true, permissionDenied: true, moduleDisabledFailClosed: true,
        browserDraftResidue: 0, expectedApiErrors, unexpectedApiErrors, consoleErrors
    };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(evidence, 'result.json'))).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    assert(expectedApiErrors.some(item => item.startsWith('409 ')), 'duplicate-submit 409 evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('404 ')), 'unassigned direct-link 404 evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('403 ')), 'permission-denied 403 evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('503 ')), 'module-disabled 503 evidence missing');
    assert.deepStrictEqual(consoleErrors, []);
    assert.deepStrictEqual(unexpectedApiErrors, []);
    console.log(`Safety Vote UX Phase 4 authenticated Juror five-viewport browser UAT: PASS (${evidence}, result SHA-256 ${digest})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { ws?.close(); chrome?.kill(); } catch (_) {}
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
