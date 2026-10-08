'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5117';
const fixture = JSON.parse(process.argv[3] || '{}');
const chromeCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const port = Number(process.env.SAFETY_VOTE_UX7_CDP_PORT || 9877);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-ux7-'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-ux-phase7-${Date.now()}`);
const pending = new Map(), consoleErrors = [], unexpectedApiErrors = [], expectedApiErrors = [];
let expectHttpError = false, chrome, ws, id = 1;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cmd(method, params = {}) {
    const requestId = id++;
    return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject }); ws.send(JSON.stringify({ id: requestId, method, params }));
        setTimeout(() => { if (pending.delete(requestId)) reject(new Error(`CDP timeout ${method}`)); }, 30000);
    });
}
async function ev(expression) { const response = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result?.value; }
async function wait(expression, label = expression) { for (let attempt = 0; attempt < 240; attempt++) { if (await ev(expression)) return; await sleep(150); } const diagnostics = await ev(`({href:location.href,body:(document.body?.innerText||'').slice(0,1200)})`).catch(() => null); throw new Error(`Timeout waiting for ${label}\n${JSON.stringify({ diagnostics, consoleErrors, unexpectedApiErrors }, null, 2)}`); }
async function click(selector) { const found = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true})()`); assert(found, `click target unavailable: ${selector}`); }
async function fill(selector, value) { const changed = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return false;node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); assert(changed, `fill target unavailable: ${selector}`); }
async function shot(name) { const response = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, name), Buffer.from(response.data, 'base64')); }
async function navigate(mode = 'full') { const query = new URLSearchParams({ campaign: String(fixture.id), code: fixture.code, type: 'secret_election', privacy: 'secret_ballot', status: 'Published' }); await cmd('Page.navigate', { url: `${origin}/__ux7-admin/${mode}?${query}` }); }
async function inspectPage(viewport) { return ev(`(()=>{const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},nodes=[...document.querySelectorAll('button,a,input,select,textarea')].filter(visible),targets=nodes.map(node=>{const r=node.getBoundingClientRect();return{tag:node.tagName,w:r.width,h:r.height,text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,70)}});return{viewport:${JSON.stringify(viewport)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badTouch:targets.filter(x=>x.w<43.5||x.h<43.5),heading:Boolean(document.querySelector('h1')),roleNav:Boolean(document.querySelector('.sv-role-nav[aria-label]')),workspace:Boolean(document.querySelector('[data-sv-governance]')),sticky:Boolean(document.querySelector('.svg-action-bar')),hold:document.body.textContent.includes('HOLD'),productionDenied:document.body.textContent.includes('Production connected: ไม่')&&document.body.textContent.includes('Deploy authorized: ไม่')}})()`); }
async function typedConfirmation(actionSelector, { reference = '', wrong = 'WRONG', expected, label }) {
    await click(actionSelector); await wait(`Boolean(document.querySelector('[data-sv-dialog="typed-confirmation"]'))`, `${label} dialog`);
    assert(await ev(`document.querySelector('[data-sv-dialog="typed-confirmation"] [role=alertdialog]')?.getAttribute('aria-modal')==='true'`), `${label} dialog semantics`);
    if (reference) { assert(await ev(`document.activeElement?.id==='sv-dialog-reference'`), `${label} reference focus`); await fill('#sv-dialog-reference', reference); }
    else assert(await ev(`document.activeElement?.id==='sv-dialog-confirmation'`), `${label} confirmation focus`);
    await fill('#sv-dialog-confirmation', wrong);
    assert(await ev(`document.querySelector('[data-sv-dialog-confirm]')?.disabled===true`), `${label} wrong confirmation must remain disabled`);
    await fill('#sv-dialog-confirmation', expected);
    assert(await ev(`document.querySelector('[data-sv-dialog-confirm]')?.disabled===false`), `${label} exact confirmation should enable action`);
    await click('[data-sv-dialog-confirm]');
}

const viewports = [['390x844',390,844,true],['430x932',430,932,true],['768x1024',768,1024,true],['1366x768',1366,768,false],['1920x1080',1920,1080,false]];

(async () => {
    assert(chromePath, 'Chrome or Edge is required');
    assert(fixture.id && fixture.code && /^[a-f0-9]{64}$/.test(fixture.resultHash), 'Guarded Phase 7 fixture is required');
    chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-sandbox','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 100; attempt++) { try { const response = await fetch(`http://127.0.0.1:${port}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {} await sleep(150); }
    const target = targets?.find(item => item.type === 'page'); assert(target, 'No browser page target');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', async event => {
        let raw = event.data; if (raw?.text) raw = await raw.text(); const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && !message.params.response.url.endsWith('/favicon.ico')) { const item = `${message.params.response.status} ${message.params.response.url}`; (expectHttpError ? expectedApiErrors : unexpectedApiErrors).push(item); }
        const request = pending.get(message.id); if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    });
    await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('Accessibility.enable');

    const matrix = [];
    for (const [name, width, height, mobile] of viewports) {
        await cmd('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
        await navigate('full'); await wait(`Boolean(document.querySelector('[data-sv-governance]'))`, `${name} governance workspace`);
        const layout = await inspectPage(name);
        assert.strictEqual(layout.overflow, false, `${name} horizontal overflow`); assert.deepStrictEqual(layout.badTouch, [], `${name} touch targets ${JSON.stringify(layout.badTouch)}`);
        assert(layout.heading && layout.roleNav && layout.workspace && layout.sticky && layout.hold && layout.productionDenied, `${name} landmarks/HOLD/authorization`);
        const body = await ev(`document.body.textContent`);
        assert(body.includes('hash ตรงกัน') && body.includes('ยังขาด SHE acceptance') && body.includes('Voter-choice metrics: ปิด'), `${name} verification/acceptance/privacy wording`);
        assert(!body.includes('SV-VOTER') && !body.includes('ผู้สมัครลับ') && !body.includes('ballot-1'), `${name} protected identity/choice leaked`);
        await shot(`governance-review-${name}.png`); matrix.push(layout);
    }

    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await navigate('full'); await wait(`Boolean(document.querySelector('[data-svg-action="accept-she"]:not([disabled])'))`, 'SHE acceptance action');
    await typedConfirmation('[data-svg-action="accept-she"]', { reference: 'local-evidence://ux7/she-owner', expected: `I ACCEPT SHE_OWNER ${fixture.code}`, label: 'SHE acceptance' });
    await wait(`document.querySelector('.svg-acceptance-list')?.textContent.includes('local-evidence://ux7/she-owner')`, 'persisted SHE acceptance');
    assert(await ev(`!document.body.textContent.includes('ยังขาด acceptance: she_owner')`), 'preflight should reload accepted SHE evidence');
    await shot('she-acceptance-confirmed-390x844.png');

    await fill('[data-svg-adapter]', 'dashboard'); await click('[data-svg-action="preview-handoff"]');
    await wait(`Boolean(document.querySelector('.svg-preview'))`, 'handoff preview');
    const preview = await ev(`(()=>{const root=document.querySelector('.svg-preview');return{safe:root.textContent.includes('External mutation: false')&&root.textContent.includes('voter identity: false')&&root.textContent.includes('ballot choice: false'),hash:root.querySelector('dd code')?.textContent,confirmation:root.querySelector('p code')?.textContent}})()`);
    assert(preview.safe && preview.confirmation?.startsWith('CONFIRM CERTIFIED HANDOFF'), 'privacy-safe handoff preview is incomplete');
    await shot('handoff-preview-no-external-mutation-390x844.png');
    await typedConfirmation('[data-svg-action="confirm-handoff"]', { expected: preview.confirmation, label: 'fixture handoff' });
    await wait(`document.querySelector('.svg-message.is-success')?.textContent.includes('ไม่มี external delivery')`, 'fixture handoff receipt');
    assert(await ev(`document.querySelector('.svg-timeline')?.textContent.includes('FIXTURE-')&&document.querySelector('.svg-kpis')?.textContent.includes('Delivered')`), 'handoff timeline/observability refresh missing');
    await shot('fixture-handoff-receipt-390x844.png');

    expectHttpError = true; await navigate('audit'); await wait(`Boolean(document.querySelector('[data-sv-governance]'))`, 'audit-only partial workspace'); expectHttpError = false;
    assert(await ev(`document.querySelector('.svg-partial')?.textContent.includes('Release preflight')&&document.querySelector('.svg-partial')?.textContent.includes('Adapter catalog')&&[...document.querySelectorAll('[data-svg-action="accept-she"]')].every(x=>x.disabled)`), 'audit-only partial capability state missing');
    await shot('audit-only-partial-390x844.png');

    expectHttpError = true; await navigate('denied'); await wait(`Boolean(document.querySelector('.svp-state--denied'))`, 'governance permission denied'); expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--denied')?.getAttribute('role')==='alert'`), 'denied state semantics missing'); await shot('permission-denied-390x844.png');

    await ev(`fetch('/__fixture/module/0',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    expectHttpError = true; await navigate('full'); await wait(`Boolean(document.querySelector('.svp-state--warning'))`, 'module-disabled fail-closed'); expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--warning')?.textContent.includes('fail-closed')`), 'module-disabled wording missing'); await shot('module-disabled-fail-closed-390x844.png');
    await ev(`fetch('/__fixture/module/1',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);

    const tree = await cmd('Accessibility.getFullAXTree');
    assert(tree.nodes.some(node => String(node.name?.value || '').includes('Safety Vote ยังไม่เปิดให้ใช้งาน')), 'accessible module-disabled heading missing');
    fs.mkdirSync(evidence, { recursive: true });
    const result = { decision:'PASS', contract:'2026-10-08-safety-vote-ux7-r1', browser:path.basename(chromePath), viewports:viewports.map(item=>item[0]), roles:['admin','audit-view-only','denied'], matrix, immutableVerification:true, exactSheAcceptance:true, privacySafeTimeline:true, noExternalPreview:true, fixtureOnlyConfirmation:true, externalDelivery:false, releaseDecision:'HOLD', permissionDenied:true, partialCapabilityState:true, moduleDisabledFailClosed:true, expectedApiErrors, unexpectedApiErrors, consoleErrors };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(evidence, 'result.json'))).digest('hex'); fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/release-preflight')), 'preflight capability denial evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/admin/integrations/catalog')), 'catalog capability denial evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/release-verification')), 'audit denial evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('503 ')), 'module-disabled evidence missing');
    assert.deepStrictEqual(unexpectedApiErrors, []); assert.deepStrictEqual(consoleErrors, []);
    console.log(`Safety Vote UX Phase 7 authenticated five-viewport governance Browser UAT: PASS (${evidence}, result SHA-256 ${digest})`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { try { ws?.close(); chrome?.kill(); } catch (_) {} await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {}); });
