'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5116';
const fixture = JSON.parse(process.argv[3] || '{}');
const chromeCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const port = Number(process.env.SAFETY_VOTE_UX6_CDP_PORT || 9876);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-ux6-'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-ux-phase6-${Date.now()}`);
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
async function wait(expression, label = expression) { for (let attempt = 0; attempt < 240; attempt++) { if (await ev(expression)) return; await sleep(150); } const diagnostics = await ev(`({href:location.href,body:(document.body?.innerText||'').slice(0,800),html:(document.body?.innerHTML||'').slice(0,500)})`).catch(() => null); throw new Error(`Timeout waiting for ${label}\n${JSON.stringify({ diagnostics, consoleErrors, unexpectedApiErrors }, null, 2)}`); }
async function click(selector) { const found = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true})()`); assert(found, `click target unavailable: ${selector}`); }
async function fill(selector, value) { const changed = await ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return false;node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); assert(changed, `fill target unavailable: ${selector}`); }
async function shot(name) { const response = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, name), Buffer.from(response.data, 'base64')); }
async function inspectPage(viewport, screen) { return ev(`(()=>{const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},nodes=[...document.querySelectorAll('button,a,input,select,textarea')].filter(visible),targets=nodes.map(node=>{const r=node.getBoundingClientRect();return{tag:node.tagName,w:r.width,h:r.height,text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,70)}});return{viewport:${JSON.stringify(viewport)},screen:${JSON.stringify(screen)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badTouch:targets.filter(x=>x.w<43.5||x.h<43.5),heading:Boolean(document.querySelector('h1')),roleNav:Boolean(document.querySelector('.sv-role-nav[aria-label]')),workspace:Boolean(document.querySelector('[data-sv-results]')),exactHash:Boolean(document.querySelector('.svr-exact-hash code'))}})()`); }
async function navigate(mode, campaign, overrides = {}) {
    const query = new URLSearchParams({ campaign: String(campaign.id), code: campaign.code, type: overrides.type || campaign.type, privacy: overrides.privacy || campaign.privacy, status: overrides.status || campaign.status || 'Closed' });
    await cmd('Page.navigate', { url: `${origin}/__ux6-admin/${mode}?${query}` });
}
async function confirm(selector, label) { await click(selector); await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, `${label} dialog`); assert(await ev(`document.querySelector('[role=alertdialog]')?.getAttribute('aria-modal')==='true'&&document.activeElement?.hasAttribute('data-sv-dialog-confirm')`), `${label} dialog semantics/focus`); await click('[data-sv-dialog-confirm]'); }
async function reason(selector, text, label) { await click(selector); await wait(`Boolean(document.querySelector('[data-sv-dialog="reason"]'))`, `${label} reason dialog`); assert(await ev(`document.querySelector('[data-sv-dialog="reason"]')?.querySelector('[aria-modal=true]')!==null&&document.activeElement?.id==='sv-dialog-reason'`), `${label} reason focus`); await fill('#sv-dialog-reason', text); await click('[data-sv-dialog-confirm]'); }
async function hashReason(selector, reasonText, label) {
    await click(selector); await wait(`Boolean(document.querySelector('[data-sv-dialog="hash-reason"]'))`, `${label} exact-hash dialog`);
    const hash = await ev(`document.querySelector('.sv-hash-review code')?.textContent.trim()`);
    assert(/^[a-f0-9]{64}$/.test(hash), `${label} exact hash missing`);
    assert(await ev(`document.querySelector('[data-sv-dialog-confirm]')?.disabled===true&&document.activeElement?.id==='sv-dialog-hash'`), `${label} must start disabled with hash focus`);
    await fill('#sv-dialog-hash', '0'.repeat(64)); await fill('#sv-dialog-reason', reasonText);
    assert(await ev(`document.querySelector('[data-sv-dialog-confirm]')?.disabled===true`), `${label} mismatched hash must remain disabled`);
    await fill('#sv-dialog-hash', hash);
    assert(await ev(`document.querySelector('[data-sv-dialog-confirm]')?.disabled===false`), `${label} exact hash and reason should enable confirm`);
    await click('[data-sv-dialog-confirm]');
    return hash;
}

const viewports = [['390x844',390,844,true],['430x932',430,932,true],['768x1024',768,1024,true],['1366x768',1366,768,false],['1920x1080',1920,1080,false]];

(async () => {
    assert(chromePath, 'Chrome or Edge is required');
    assert(fixture.secret?.id && fixture.standard?.id && fixture.viewer?.id, 'Guarded Phase 6 fixtures are required');
    chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-sandbox','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 100; attempt++) { try { const response = await fetch(`http://127.0.0.1:${port}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {} await sleep(150); }
    const target = targets?.find(item => item.type === 'page'); assert(target, 'No browser page target');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', async event => {
        let raw = event.data; if (raw?.text) raw = await raw.text(); const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && !message.params.response.url.endsWith('/favicon.ico')) { const item = `${message.params.response.status} ${message.params.response.url}`, expectedPartial = message.params.response.status === 403 && message.params.response.url.includes('/stages'); (expectHttpError || expectedPartial ? expectedApiErrors : unexpectedApiErrors).push(item); }
        const request = pending.get(message.id); if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    });
    await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('Accessibility.enable');

    const matrix = [];
    for (const [name, width, height, mobile] of viewports) {
        await cmd('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
        await navigate('full', fixture.secret);
        await wait(`Boolean(document.querySelector('[data-sv-results]'))`, `${name} result workspace`);
        const layout = await inspectPage(name, 'secret-result-review');
        assert.strictEqual(layout.overflow, false, `${name} horizontal overflow`); assert.deepStrictEqual(layout.badTouch, [], `${name} touch targets ${JSON.stringify(layout.badTouch)}`);
        assert(layout.heading && layout.roleNav && layout.workspace && layout.exactHash, `${name} landmarks/exact hash`);
        const body = await ev(`document.body.textContent`);
        assert(!body.includes('SV-VOTER') && !body.includes('ผู้สมัครลับ') && !body.includes('Voter One'), `${name} protected identity/choice leaked`);
        assert(body.includes('ไม่แสดงรายละเอียดก่อนเผยแพร่') && body.includes('Exact Result SHA-256'), `${name} visibility/hash wording`);
        await shot(`result-review-${name}.png`); matrix.push({ ...layout, prePublicationProtected: true, exactHashReview: true });
    }

    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await navigate('full', fixture.secret);
    await wait(`Boolean(document.querySelector('[data-svr-action="calculate"]'))`, 'secret recount action');
    await reason('[data-svr-action="calculate"]', 'ตรวจนับซ้ำตามกระบวนการควบคุม', 'secret recount');
    await wait(`document.querySelectorAll('[data-svr-snapshot]').length===2`, 'new recount snapshot');
    assert(!await ev(`document.body.textContent.includes('ผู้สมัครลับ')`), 'recount response leaked candidate label');
    await shot('secret-recount-confirmed-390x844.png');

    await navigate('cert1', fixture.secret);
    await wait(`Boolean(document.querySelector('[data-svr-action="certify"]:not([disabled])'))`, 'first certifier workspace');
    const secretHash = await hashReason('[data-svr-action="certify"]', 'ตรวจสอบหลักฐานครบถ้วนโดยผู้รับรองคนที่หนึ่ง', 'first secret certification');
    await wait(`document.querySelector('.svr-receipt')?.textContent.includes('รอผู้รับรองอิสระคนที่สอง')`, 'first certification receipt');
    await shot('secret-first-certifier-390x844.png');

    await navigate('cert2', fixture.secret);
    await wait(`Boolean(document.querySelector('[data-svr-action="certify"]:not([disabled])'))`, 'second certifier workspace');
    const secondHash = await hashReason('[data-svr-action="certify"]', 'ตรวจสอบหลักฐานครบถ้วนโดยผู้รับรองคนที่สอง', 'second secret certification');
    assert.strictEqual(secondHash, secretHash, 'independent certifiers must certify the same exact result hash');
    await wait(`Boolean(document.querySelector('[data-svr-action="publish"]:not([disabled])'))`, 'dual-certified publish readiness');
    await confirm('[data-svr-action="publish"]', 'secret publication');
    await wait(`document.querySelector('.svr-publication.is-visible')?.textContent.includes('2 คะแนน/บัตร')`, 'published secret preview');
    assert(await ev(`document.querySelector('.svr-receipt')?.textContent.includes('เผยแพร่ผลแล้ว')`), 'publication receipt missing');
    await shot('secret-dual-certified-published-390x844.png');

    await navigate('full', fixture.standard);
    await wait(`Boolean(document.querySelector('[data-svr-action="freeze"]:not([disabled])'))`, 'standard freeze readiness');
    assert(!await ev(`['47 คน','13 คน','12 ใบ'].some(value=>document.body.textContent.includes(value))`), 'pre-threshold standard counts leaked');
    await confirm('[data-svr-action="freeze"]', 'standard freeze');
    await wait(`Boolean(document.querySelector('[data-svr-action="certify"]:not([disabled])'))`, 'standard certification readiness');
    await hashReason('[data-svr-action="certify"]', 'ตรวจสอบผลมาตรฐานครบถ้วนและยืนยัน hash', 'standard certification');
    await wait(`Boolean(document.querySelector('[data-svr-action="publish"]:not([disabled])'))`, 'standard publication readiness');
    await confirm('[data-svr-action="publish"]', 'standard publication');
    await wait(`document.querySelector('.svr-receipt')?.textContent.includes('เผยแพร่ผลแล้ว')`, 'standard publication receipt');
    await shot('standard-frozen-certified-published-390x844.png');

    expectHttpError = true;
    await navigate('viewer', fixture.viewer);
    await wait(`Boolean(document.querySelector('[data-sv-results]'))`, 'partial capability workspace');
    expectHttpError = false;
    assert(await ev(`document.querySelector('.svr-partial-list')?.textContent.includes('บริบท Stage')&&document.querySelector('.svr-partial-list')?.textContent.includes('SHE governance')`), 'partial capability messages missing');
    expectHttpError = true;
    await hashReason('[data-svr-action="certify"]', 'พยายามรับรองโดยบัญชีไม่มีสิทธิ์', 'denied certification');
    await wait(`Boolean(document.querySelector('.svr-message.is-error'))`, 'certification permission error');
    expectHttpError = false;
    await shot('partial-and-action-denied-390x844.png');

    expectHttpError = true; await navigate('denied', fixture.viewer); await wait(`Boolean(document.querySelector('.svp-state--denied'))`, 'result permission denied'); expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--denied')?.getAttribute('role')==='alert'`), 'denied state semantics missing'); await shot('permission-denied-390x844.png');

    await ev(`fetch('/__fixture/module/0',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    expectHttpError = true; await navigate('full', fixture.secret); await wait(`Boolean(document.querySelector('.svp-state--warning'))`, 'module-disabled fail-closed'); expectHttpError = false;
    assert(await ev(`document.querySelector('.svp-state--warning')?.textContent.includes('fail-closed')`), 'module-disabled wording missing'); await shot('module-disabled-fail-closed-390x844.png');
    await ev(`fetch('/__fixture/module/1',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);

    const tree = await cmd('Accessibility.getFullAXTree');
    assert(tree.nodes.some(node => String(node.name?.value || '').includes('Safety Vote ยังไม่เปิดให้ใช้งาน')), 'accessible module-disabled heading missing');
    fs.mkdirSync(evidence, { recursive: true });
    const result = { decision:'PASS', contract:'2026-10-08-safety-vote-ux6-r1', browser:path.basename(chromePath), viewports:viewports.map(item=>item[0]), roles:['admin','certifier-primary','certifier-secondary','result-view-only','denied'], matrix, exactHashReentry:true, mismatchedHashBlocked:true, dualCertification:true, standardFreezeCertificationPublication:true, reasonedRecount:true, prePublicationProtected:true, publishedServerPreview:true, partialCapabilityState:true, permissionDenied:true, moduleDisabledFailClosed:true, expectedApiErrors, unexpectedApiErrors, consoleErrors };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(evidence, 'result.json'))).digest('hex'); fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/stages')), 'partial stage permission evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/release-verification')), 'partial governance permission evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('403 ') && item.includes('/certify')), 'certification denial evidence missing');
    assert(expectedApiErrors.some(item => item.startsWith('503 ')), 'module-disabled evidence missing');
    assert.deepStrictEqual(unexpectedApiErrors, []); assert.deepStrictEqual(consoleErrors, []);
    console.log(`Safety Vote UX Phase 6 authenticated five-viewport result/certifier Browser UAT: PASS (${evidence}, result SHA-256 ${digest})`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { try { ws?.close(); chrome?.kill(); } catch (_) {} await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {}); });
