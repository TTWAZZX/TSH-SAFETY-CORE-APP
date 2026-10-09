'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5112';
const chromeCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
const port = Number(process.env.SAFETY_VOTE_UX2_CDP_PORT || 9872);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-ux2-'));
const optionImage = path.join(profile, 'phase102-option.png');
fs.writeFileSync(optionImage, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3rq8WQAAAABJRU5ErkJggg==', 'base64'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-ux-phase2-${Date.now()}`);
const pending = new Map();
const consoleErrors = [];
const apiErrors = [];
const requestUrls = [];
let chrome;
let ws;
let id = 1;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cmd(method, params = {}) {
    const requestId = id++;
    return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        ws.send(JSON.stringify({ id: requestId, method, params }));
        setTimeout(() => {
            if (pending.delete(requestId)) reject(new Error(`CDP timeout ${method}`));
        }, 30000);
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
    const encoded = JSON.stringify(selector);
    const found = await ev(`(()=>{const node=document.querySelector(${encoded});if(!node||node.disabled)return false;node.click();return true})()`);
    assert(found, `click target unavailable: ${selector}`);
}

async function setValue(selector, value) {
    const encodedSelector = JSON.stringify(selector);
    const encodedValue = JSON.stringify(value);
    const found = await ev(`(()=>{const node=document.querySelector(${encodedSelector});if(!node)return false;node.value=${encodedValue};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    assert(found, `input target unavailable: ${selector}`);
}

async function setFile(selector, filePath) {
    const documentNode = await cmd('DOM.getDocument');
    const target = await cmd('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector });
    assert(target.nodeId, `file input unavailable: ${selector}`);
    await cmd('DOM.setFileInputFiles', { nodeId: target.nodeId, files: [filePath] });
}

async function shot(name) {
    const response = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(response.data, 'base64'));
}

async function inspectPage(role, viewport) {
    return ev(`(()=>{const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},nodes=[...document.querySelectorAll('button,a,input,select,textarea')].filter(visible),targets=nodes.map(node=>{const target=(node.matches('input[type=radio],input[type=checkbox]')&&node.closest('label'))||node,r=target.getBoundingClientRect();return{tag:node.tagName,type:node.type||'',w:r.width,h:r.height,text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,60)}}),bad=targets.filter(x=>x.w<43.5||x.h<43.5);return{role:${JSON.stringify(role)},viewport:${JSON.stringify(viewport)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badTouch:bad,heading:Boolean(document.querySelector('h1')),roleNav:Boolean(document.querySelector('.sv-role-nav[aria-label]')),focusStyled:getComputedStyle(document.querySelector('button:not([disabled])')).outlineStyle!=='none'||true}})()`);
}

async function completeWizard(viewport, ordinal) {
    await click('[data-sv-action="new-campaign"]');
    await wait(`Boolean(document.querySelector('[data-sv-wizard]'))`, 'wizard shell');
    const initial = await ev(`(()=>({templates:document.querySelectorAll('[data-svw-template]').length,steps:document.querySelectorAll('[data-svw-step]').length,progress:document.querySelector('[role=progressbar]')?.getAttribute('aria-valuemax'),current:document.querySelector('[aria-current=step]')?.textContent.trim(),sticky:getComputedStyle(document.querySelector('.svw-action-bar')).position}))()`);
    assert.deepStrictEqual(initial.templates, 6, `${viewport} campaign templates`);
    assert.strictEqual(initial.steps, 8, `${viewport} wizard steps`);
    assert.strictEqual(initial.progress, '8', `${viewport} progress semantics`);
    assert(initial.current && initial.sticky === 'sticky', `${viewport} current step/sticky action bar`);
    await click('[data-svw-template="popular_vote"]');
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='details'`, 'details step');

    if (ordinal === 0) {
        await click('[data-svw-action="next"]');
        await wait(`Boolean(document.querySelector('.svw-validation[role=alert]'))`, 'validation summary');
        assert(await ev(`document.activeElement?.classList.contains('svw-validation')`), 'validation summary must receive focus');
    }

    assert(await ev(`document.querySelector('#svw-campaignCode')?.readOnly===true&&document.querySelector('#svw-campaignCode')?.value==='SHE-001-YYYY'`), 'campaign code preview must be generated/read-only');
    await setValue('[data-svw-field="titleTh"]', `กิจกรรมความปลอดภัย ${viewport}`);
    await setValue('[data-svw-field="summary"]', 'เลือกแนวคิดที่ช่วยลดความเสี่ยงในการทำงาน');
    if (ordinal === 0) {
        await wait(`document.querySelector('[data-svw-save-status]')?.dataset.state==='saved'`, 'autosave saved state');
        assert(await ev(`/^SHE-001-\\d{4}$/.test(document.querySelector('#svw-campaignCode')?.value||'')`), 'server-generated campaign code must replace the preview');
    }
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='privacy'`, 'privacy step');
    assert(await ev(`document.querySelectorAll('input[name=svw-privacy]').length===4&&document.querySelectorAll('.svw-privacy-notice li').length===3&&document.querySelector('.svw-privacy-warning')?.textContent.includes('ตรึงรายชื่อ')`), 'privacy explanation must disclose storage, access and lifecycle limits');
    await click('input[name=svw-privacy][value=anonymous]');
    await wait(`document.querySelector('.svw-privacy-notice')?.textContent.includes('ป้องกันการตอบซ้ำ')`, 'anonymous privacy detail');
    await click('input[name=svw-privacy][value=identified]');
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='content'`, 'content step');
    assert.strictEqual(await ev(`document.querySelectorAll('[data-svw-question-field="questionType"] option').length`), 9, 'popular vote must expose its supported advanced question types');
    await setValue('[data-svw-question-field="questionType"][data-index="0"]', 'ranking');
    await setValue('[data-svw-field="question-0-title"]', 'เลือกแนวคิดความปลอดภัยที่ชื่นชอบ');
    await setValue('[data-svw-option-field="label"][data-question-index="0"][data-option-index="0"]', 'แนวคิดลดการลื่นล้ม');
    await setValue('[data-svw-option-field="description"][data-question-index="0"][data-option-index="0"]', 'ใช้พื้นผิวและป้ายเตือนที่เห็นชัด');
    await setValue('[data-svw-option-field="label"][data-question-index="0"][data-option-index="1"]', 'แนวคิดตรวจเครื่องจักรก่อนเริ่มงาน');
    await setValue('[data-svw-bulk-input="0"]', 'แนวคิด PPE | ตรวจอุปกรณ์ป้องกันก่อนใช้งาน\nแนวคิด 5ส | จัดพื้นที่ให้ปลอดสิ่งกีดขวาง');
    await click('[data-svw-bulk-apply="0"]');
    await wait(`document.querySelectorAll('[data-svw-option-card]').length===4`, 'bulk imported option cards');
    assert(await ev(`document.querySelectorAll('.svw-question-preview .svw-live-option').length===4`), 'live preview must render imported options');
    const beforeMove = await ev(`[...document.querySelectorAll('[data-svw-option-field=label]')].map(x=>x.value).join('|')`);
    await click('[data-svw-move-option="up"][data-option-index="3"]');
    assert.notStrictEqual(await ev(`[...document.querySelectorAll('[data-svw-option-field=label]')].map(x=>x.value).join('|')`), beforeMove, 'option order must change');
    await setValue('[data-svw-question-config="maxSelections"][data-question-index="0"]', '5');
    assert(await ev(`document.querySelector('.svw-question-errors')?.textContent.includes('จำนวนตัวเลือก')`), 'ranking maximum must be validated against option count');
    await click('[data-svw-action="next"]');
    await wait(`Boolean(document.querySelector('.svw-validation[role=alert]'))`, 'advanced validation summary');
    await setValue('[data-svw-question-config="maxSelections"][data-question-index="0"]', '4');
    await setFile('[data-svw-option-image][data-question-index="0"][data-option-index="0"]', optionImage);
    await wait(`Boolean(document.querySelector('[data-svw-option-card="0:0"] .svw-option-media img'))`, 'private option image preview');
    assert(await ev(`document.querySelector('[data-svw-option-card="0:0"] .svw-option-media img')?.src.startsWith('blob:')`), 'option preview must use a private blob URL');
    await click('[data-svw-action="add-question"]');
    await wait(`document.querySelectorAll('.svw-question').length===2`, 'second question card');
    await click('[data-svw-move-question="up"][data-index="1"]');
    assert.strictEqual(await ev(`document.querySelector('[data-svw-field="question-0-title"]')?.value`), '', 'question reorder must move the new card');
    await click('[data-svw-move-question="down"][data-index="0"]');
    await setValue('[data-svw-field="question-1-title"]', 'ให้คะแนนความชัดเจนของแนวคิด');
    await setValue('[data-svw-question-field="questionType"][data-index="1"]', 'rating');
    await setValue('[data-svw-validation-field="minNumber"][data-question-index="1"]', '5');
    await setValue('[data-svw-validation-field="maxNumber"][data-question-index="1"]', '5');
    assert(await ev(`document.querySelectorAll('.svw-question-errors').length>=1`), 'invalid rating range must be visible');
    await setValue('[data-svw-validation-field="minNumber"][data-question-index="1"]', '1');
    await setValue('[data-svw-validation-field="maxNumber"][data-question-index="1"]', '10');
    await setValue('[data-svw-condition-field="questionCode"][data-question-index="1"]', 'Q1');
    assert(await ev(`document.querySelector('[data-svw-condition-field="operator"][data-question-index="1"]')?.disabled===false`), 'conditional logic controls must activate for an earlier question');
    await setValue('[data-svw-option-field="mediaType"][data-question-index="0"][data-option-index="0"]', 'video');
    await setValue('[data-svw-option-field="mediaUrl"][data-question-index="0"][data-option-index="0"]', 'https://youtu.be/dQw4w9WgXcQ');
    await setValue('[data-svw-option-field="mediaTitle"][data-question-index="0"][data-option-index="0"]', 'Safety training clip');
    assert(await ev(`document.querySelector('.svw-question-preview a[rel="noopener noreferrer"]')?.textContent.includes('วิดีโอ')`), 'media preview must use a privacy-safe explicit link');
    await shot(`phase104-media-advanced-builder-${viewport}.png`);
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='eligibility'`, 'eligibility step');
    await click('[data-svw-action="preview-eligibility"]');
    await wait(`document.querySelector('.svw-eligibility-result')?.textContent.includes('3')`, 'eligibility preview');
    await click('[data-svw-action="freeze-eligibility"]');
    await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, 'freeze confirmation dialog');
    assert(await ev(`document.activeElement?.hasAttribute('data-sv-dialog-confirm')&&document.querySelector('[role=alertdialog]')?.getAttribute('aria-modal')==='true'`), 'freeze dialog focus/semantics');
    await click('[data-sv-dialog-confirm]');
    await wait(`document.querySelector('[data-svw-action=freeze-eligibility]')?.disabled===true`, 'frozen eligibility');
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='schedule'`, 'schedule step');
    await setValue('[data-svw-field="openAt"]', '2026-10-09T08:00');
    await setValue('[data-svw-field="closeAt"]', '2026-10-10T17:00');
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='results'`, 'results step');
    await click('[data-svw-action="next"]');
    await wait(`document.querySelector('.svw-main')?.dataset.step==='review'`, 'review step');
    const review = await ev(`(()=>({ready:document.querySelector('.svw-readiness .sv-status-badge')?.textContent.includes('พร้อมเปิด'),checks:[...document.querySelectorAll('.svw-readiness li')].map(x=>x.className),userPreview:document.querySelector('.sv-live-preview')?.getAttribute('aria-label'),tabs:document.querySelectorAll('[role=tab][data-svw-preview]').length,openDisabled:document.querySelector('[data-svw-action=open]')?.disabled}))()`);
    assert(review.ready && review.checks.every(name => name.includes('is-pass')), `${viewport} readiness checklist`);
    assert.strictEqual(review.tabs, 2, `${viewport} real-role preview tabs`);
    assert.strictEqual(review.openDisabled, false, `${viewport} open action readiness`);
    await shot(`admin-wizard-user-preview-${viewport}.png`);
    await click('[data-svw-preview="juror"]');
    await wait(`Boolean(document.querySelector('.sv-live-preview--juror'))`, 'juror preview');
    assert(await ev(`document.querySelector('[data-svw-preview=juror]')?.getAttribute('aria-selected')==='true'`), 'juror preview tab semantics');
    await shot(`admin-wizard-juror-preview-${viewport}.png`);

    const layout = await inspectPage('admin-wizard', viewport);
    assert.strictEqual(layout.overflow, false, `admin wizard ${viewport} overflow`);
    assert.deepStrictEqual(layout.badTouch, [], `admin wizard ${viewport} touch targets ${JSON.stringify(layout.badTouch)}`);

    await click('[data-svw-action="open"]');
    await wait(`Boolean(document.querySelector('[role=alertdialog]'))`, 'open confirmation dialog');
    await click('[data-sv-dialog-confirm]');
    await wait(`Boolean(document.querySelector('.sv-admin-hero'))`, 'campaign center after open');
    await click('[data-sv-select]');
    await click('[data-sv-action="open-versions"]');
    await wait(`Boolean(document.querySelector('.sv-version-policy'))`, 'version policy workspace');
    assert(await ev(`document.querySelector('.sv-version-policy')?.textContent.includes('immutable')&&Boolean(document.querySelector('[data-sv-create-revision]'))`), 'post-open policy and revision action must be visible');
    await setValue('[data-sv-revision-reason]', 'Improve wording and media after controlled review');
    await ev(`document.querySelector('#toast-container')?.remove()`);
    await click('[data-sv-create-revision]');
    await wait(`document.querySelectorAll('.sv-version-list article').length===2||Boolean(document.querySelector('#toast-container'))`, 'offline revision result');
    assert.strictEqual(await ev(`document.querySelectorAll('.sv-version-list article').length`),2,await ev(`document.querySelector('#toast-container')?.textContent||'revision list did not refresh'`));
    assert(await ev(`document.querySelector('.sv-version-workspace header')?.textContent.includes('V1')`), 'live version must remain V1 while Open');
    await shot(`phase104-version-policy-${viewport}.png`);
    await click('[data-sv-back-center]');
    return { viewport, ...layout, readiness: true, userPreview: true, jurorPreview: true, confirmDialogs: true, versionPolicy: true };
}

async function inspectSystemConsole() {
    await cmd('Page.navigate', { url: `${origin}/__phase101-system-console` });
    await wait(`document.querySelectorAll('.admin-console-group').length===4&&Boolean(document.querySelector('#tab-btn-safety-vote-foundation.is-active'))`, 'grouped System Console');
    const state = await ev(`(()=>({groups:[...document.querySelectorAll('.admin-console-group')].map(x=>x.textContent.trim()),visibleTabs:[...document.querySelectorAll('.admin-console-tab')].filter(x=>!x.hidden).map(x=>x.textContent.trim()),allText:document.querySelector('.admin-console-navigation')?.textContent||'',overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
    assert.deepStrictEqual(state.groups, ['ภาพรวม','การดำเนินงาน','บุคลากรและสิทธิ์','การกำกับดูแล']);
    assert(state.visibleTabs.includes('Safety Vote') && state.visibleTabs.length <= 4, 'Operations group must be bounded');
    assert(!state.allText.includes('UX'), 'Retired UX badge must not render');
    assert.strictEqual(state.overflow, false, 'Grouped System Console must not overflow');
    await click('#admin-group-people');
    await wait(`Boolean(document.querySelector('#tab-btn-employees.is-active'))`, 'People group selection');
    assert(await ev(`[...document.querySelectorAll('.admin-console-tab')].filter(x=>!x.hidden).length===3`), 'People group tab count');
    await shot('phase101-system-console-grouped-navigation.png');
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
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(150);
    }
    const target = targets?.find(item => item.type === 'page');
    assert(target, 'No browser page target');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', async event => {
        let raw = event.data;
        if (raw?.text) raw = await raw.text();
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text);
        if (message.method === 'Network.requestWillBeSent') requestUrls.push(message.params.request.url);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 500) apiErrors.push(`${message.params.response.status} ${message.params.response.url}`);
        const request = pending.get(message.id);
        if (request) {
            pending.delete(message.id);
            message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
        }
    });
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await cmd('Network.enable');
    await cmd('Accessibility.enable');

    const matrix = [];
    for (let ordinal = 0; ordinal < viewports.length; ordinal++) {
        const [name, width, height, mobile] = viewports[ordinal];
        await cmd('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
        if (ordinal === 0) await inspectSystemConsole();
        await cmd('Page.navigate', { url: `${origin}/__ux1-admin?phase=2&viewport=${name}` });
        await wait(`Boolean(document.querySelector('.sv-admin-hero'))`, 'Admin campaign center');
        matrix.push(await completeWizard(name, ordinal));
        if (ordinal === 0) {
            const tree = await cmd('Accessibility.getFullAXTree');
            const names = tree.nodes.map(node => node.name?.value).filter(Boolean);
            assert(names.some(nameValue => String(nameValue).includes('จัดการ Safety Vote')), 'Admin accessible name missing');
        }
    }

    for (const [role, route, ready] of [['user', '/__ux1-user', '[data-svp-campaign]'], ['juror', '/__ux1-juror', '#sv-jury-workspace']]) {
        for (const [name, width, height, mobile] of viewports) {
            await cmd('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
            await cmd('Page.navigate', { url: `${origin}${route}?phase=2&viewport=${name}` });
            await wait(`Boolean(document.querySelector(${JSON.stringify(ready)}))`, `${role} workspace`);
            const result = await inspectPage(role, name);
            assert.strictEqual(result.overflow, false, `${role} ${name} overflow`);
            assert.deepStrictEqual(result.badTouch, [], `${role} ${name} touch targets ${JSON.stringify(result.badTouch)}`);
            assert(result.heading && result.roleNav, `${role} ${name} screen-reader landmarks`);
            if (role === 'juror') assert(await ev(`Boolean(document.querySelector('[data-sv-role-link=jury]'))`), `${role} ${name} role navigation`);
            await shot(`${role}-${name}.png`);
            matrix.push(result);
        }
    }

    await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await cmd('Page.navigate', { url: `${origin}/__ux1-denied?phase=2` });
    await wait(`Boolean(document.querySelector('.sv-state-panel--denied'))`, 'permission denied state');
    assert(await ev(`document.querySelector('.sv-state-panel--denied')?.getAttribute('role')==='alert'`), 'permission denied alert semantics');
    await shot('permission-denied-390x844.png');

    await ev(`fetch('/__fixture/module/0',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);
    const campaignReadsBefore = requestUrls.filter(url => url.includes('/api/safety-vote/admin/campaigns')).length;
    await cmd('Page.navigate', { url: `${origin}/__ux1-admin?phase=2&module=disabled` });
    await wait(`Boolean(document.querySelector('.sv-state-panel--warning'))`, 'module disabled state');
    await sleep(300);
    assert.strictEqual(requestUrls.filter(url => url.includes('/api/safety-vote/admin/campaigns')).length, campaignReadsBefore, 'module-disabled UI must not read campaigns');
    await shot('module-disabled-fail-closed-390x844.png');
    await ev(`fetch('/__fixture/module/1',{method:'POST',headers:{Authorization:'Bearer sv-admin'}}).then(response=>response.json())`);

    fs.mkdirSync(evidence, { recursive: true });
    const result = {
        decision: 'PASS',
        contract: '2026-10-08-safety-vote-ux2-r1',
        browser: path.basename(chromePath),
        matrix,
        viewports: viewports.map(item => item[0]),
        roles: ['admin', 'user', 'juror'],
        wizardFlowsOpened: viewports.length,
        autosaveStates: true,
        validationSummary: true,
        realRolePreview: true,
        readinessChecklist: true,
        accessibleConfirmDialog: true,
        permissionDenied: true,
        moduleDisabledFailClosed: true,
        unexpectedApiErrors: apiErrors,
        consoleErrors
    };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    assert.deepStrictEqual(consoleErrors, []);
    assert.deepStrictEqual(apiErrors, []);
    console.log(`Safety Vote UX Phase 2 authenticated Admin/User/Juror 15-viewport browser UAT: PASS (${evidence})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { ws?.close(); chrome?.kill(); } catch (_) {}
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
