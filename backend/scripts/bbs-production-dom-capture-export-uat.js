'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.BBS_PROD_EXPORT_UAT_CDP_PORT || 9847);
const evidenceDir = path.resolve(process.argv[2] || path.join(process.cwd(), 'output', `bbs-production-export-${Date.now()}`));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs-export-uat-'));
const errors = [];
let chrome;
let socket;
let commandId = 1;
const pending = new Map();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function command(method, params = {}, timeout = 90000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression, timeout = 90000) {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
}

async function waitFor(expression, timeout = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(350);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function login() {
    const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = null; }
    assert.strictEqual(response.status, 200, `Production login failed: ${text.slice(0, 200)}`);
    assert.ok(json?.token && json?.user, 'Production login did not return a session');
    return json;
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', '--window-size=1440,1200',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let index = 0; index < 80; index++) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(item => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        clearTimeout(item.timer);
        message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chrome connection timeout')), 15000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
    fs.mkdirSync(evidenceDir, { recursive: true });
    await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidenceDir, eventsEnabled: true });
}

function pngInfo(buffer) {
    assert.ok(buffer.length > 24 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a', 'Invalid PNG output');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegInfo(buffer) {
    assert.ok(buffer[0] === 0xff && buffer[1] === 0xd8, 'Invalid JPG output');
    let offset = 2;
    while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        const marker = buffer[offset + 1];
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
            return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2) break;
        offset += 2 + length;
    }
    throw new Error('JPG dimensions are unavailable');
}

(async () => {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    const session = await login();
    await connectChrome();
    await command('Page.navigate', { url: `${baseUrl}/index.html?bbs_export_uat=${Date.now()}` });
    await waitFor(`document.readyState==='complete'`);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(session.token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(session.user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`Boolean(document.querySelector('[data-bbs-shell]'))`);
    await evaluate(`document.querySelector('[data-bbs-group="admin"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-card-workspace-navigation]'))`);
    await evaluate(`document.querySelector('[data-card-workspace="personal"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-list-search="cards"]'))`);
    await evaluate(`(()=>{const input=document.querySelector('[data-list-search="cards"]');input.value='002671';input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await waitFor(`[...document.querySelectorAll('[data-bbs-card-preview]')].some(button=>button.closest('article')?.textContent.includes('002671'))`);
    const selected = await evaluate(`(()=>{const button=[...document.querySelectorAll('[data-bbs-card-preview]')].find(item=>item.closest('article')?.textContent.includes('002671'));const article=button.closest('article'),text=article.textContent,employeeName=article.querySelector('.font-bold')?.childNodes?.[0]?.textContent?.trim()||'';button.click();return{text,employeeName};})()`);
    assert.ok(selected.text.includes('002671'), 'Employee 002671 card row was not selected');
    await waitFor(`document.querySelectorAll('[data-designer-preview-side] .designer-card[data-card-side]').length===2`);
    const preview = await evaluate(`(()=>{const cards=[...document.querySelectorAll('[data-designer-preview-side] .designer-card[data-card-side]')],front=cards[0];return{count:cards.length,sides:cards.map(card=>card.dataset.cardSide),employeeText:front.innerText,textGeometry:[...front.querySelectorAll('.designer-text')].map(node=>{const box=node.getBoundingClientRect(),span=node.querySelector('span')?.getBoundingClientRect(),style=getComputedStyle(node);return{text:node.innerText,box:{x:box.x,y:box.y,width:box.width,height:box.height},span:span&&{x:span.x,y:span.y,width:span.width,height:span.height},fontSize:style.fontSize,lineHeight:style.lineHeight,justify:style.justifyContent,overflow:style.overflow};}),backgrounds:cards.map(card=>getComputedStyle(card.querySelector('.designer-background')).backgroundImage.slice(0,40)),images:[...document.images].filter(image=>cards.some(card=>card.contains(image))).map(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight}))};})()`);
    assert.strictEqual(preview.count, 2, 'Expected Front and Back Designer previews');
    assert.ok(preview.sides.includes('Front') && preview.sides.includes('Back'), 'Designer preview sides are incomplete');
    assert.ok(selected.employeeName && preview.employeeText.includes(selected.employeeName), 'Preview is not bound to the selected employee 002671');
    assert.ok(preview.backgrounds.every(value => value.includes('data:image/')), 'A Designer background is missing');
    assert.ok(preview.images.every(image => image.complete && image.width > 0 && image.height > 0), 'A preview image failed to decode');
    const screenshotBox = await evaluate(`(()=>{const rect=document.querySelector('[data-designer-preview-side="Front"] .designer-card').getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height,scale:devicePixelRatio};})()`);
    const browserShot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: screenshotBox.x, y: screenshotBox.y, width: screenshotBox.width, height: screenshotBox.height, scale: 1 } });
    fs.writeFileSync(path.join(evidenceDir, 'browser-native-preview-front.png'), Buffer.from(browserShot.data, 'base64'));

    const pixelAudit = await evaluate(`(async()=>{const card=document.querySelector('[data-designer-preview-side="Front"] .designer-card');const rect=card.getBoundingClientRect();const canvas=await html2canvas(card,{scale:1,useCORS:true,backgroundColor:'#ffffff',logging:false,width:rect.width,height:rect.height});const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let samples=0,nonWhite=0,colored=0;for(let i=0;i<data.length;i+=64){samples++;const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a>0&&(r<245||g<245||b<245))nonWhite++;if(a>0&&(Math.max(r,g,b)-Math.min(r,g,b)>18))colored++;}return{width:canvas.width,height:canvas.height,samples,nonWhiteRatio:nonWhite/samples,coloredRatio:colored/samples};})()`);
    assert.ok(pixelAudit.nonWhiteRatio > 0.55, `Captured Front is unexpectedly blank (${pixelAudit.nonWhiteRatio})`);
    assert.ok(pixelAudit.coloredRatio > 0.20, `Captured Front has no artwork colour (${pixelAudit.coloredRatio})`);

    if (process.env.BBS_EXPORT_SCALE_PROBE === '1') {
        const probes = await evaluate(`(async()=>{const card=document.querySelector('[data-designer-preview-side="Front"] .designer-card'),rect=card.getBoundingClientRect(),outputs=[];for(const scale of [1,4.428125]){for(const fixed of [false,true]){const canvas=await html2canvas(card,{scale,useCORS:true,backgroundColor:'#ffffff',logging:false,width:rect.width,height:rect.height,onclone:fixed?clone=>{clone.querySelectorAll('.designer-text>span').forEach(node=>{node.style.transform='translateY(-.5em)';});}:undefined});outputs.push({scale,fixed,width:canvas.width,height:canvas.height,data:canvas.toDataURL('image/png').split(',')[1]});}}return outputs;})()`, 180000);
        for (const probe of probes) fs.writeFileSync(path.join(evidenceDir, `probe-${probe.fixed?'fixed':'base'}-scale-${probe.scale}-${probe.width}x${probe.height}.png`), Buffer.from(probe.data, 'base64'));
    }

    const exportResult = await evaluate(`(async()=>{const module=await import('./public/js/utils/bbs-card-print.js?v=20260921-bbs-dom-capture-r2');const cards=[...document.querySelectorAll('[data-designer-preview-side] .designer-card[data-card-side]')];const sheet=document.createElement('section');sheet.className='bbs-print-sheet';sheet.dataset.pageWidthMm='210';sheet.dataset.pageHeightMm='297';Object.assign(sheet.style,{position:'fixed',left:'0',top:'0',width:'210mm',height:'297mm',zIndex:'-5',background:'#fff'});cards.forEach((source,index)=>{const clone=source.cloneNode(true);Object.assign(clone.style,{position:'absolute',left:'8mm',top:(8+index*90)+'mm',transform:'none'});sheet.appendChild(clone);});document.body.appendChild(sheet);await document.fonts.ready;await module.saveDesignerPrintImages(document,{filename:'BBS_Production_002671_DOM_Capture',format:'png',dpi:600});await module.saveDesignerPrintImages(document,{filename:'BBS_Production_002671_DOM_Capture',format:'jpg',dpi:600});await module.saveDesignerPrintPdf(document,{filename:'BBS_Production_002671_DOM_Capture.pdf',dpi:600});sheet.remove();return{contract:module.DESIGNER_RASTER_EXPORT_CONTRACT};})()`, 180000);
    assert.strictEqual(exportResult.contract, 'bbs-designer-dom-capture-v2');

    const deadline = Date.now() + 120000;
    let files = [];
    while (Date.now() < deadline) {
        files = fs.readdirSync(evidenceDir).filter(name => !name.endsWith('.crdownload'));
        if (files.filter(name => /\.png$/i.test(name)).length >= 2 && files.filter(name => /\.jpg$/i.test(name)).length >= 2 && files.some(name => /\.pdf$/i.test(name))) break;
        await sleep(500);
    }
    const pngs = files.filter(name => /^BBS_Production_.*\.png$/i.test(name));
    const jpgs = files.filter(name => /^BBS_Production_.*\.jpg$/i.test(name));
    const pdf = files.find(name => /\.pdf$/i.test(name));
    assert.strictEqual(pngs.length, 2, `Expected 2 PNG files, got ${pngs.length}`);
    assert.strictEqual(jpgs.length, 2, `Expected 2 JPG files, got ${jpgs.length}`);
    assert.ok(pdf, 'PDF output was not downloaded');
    const artifacts = [...pngs, ...jpgs, pdf].filter(Boolean).map(name => {
        const buffer = fs.readFileSync(path.join(evidenceDir, name));
        const dimensions = /\.png$/i.test(name) ? pngInfo(buffer) : /\.jpg$/i.test(name) ? jpegInfo(buffer) : null;
        if (dimensions) assert.deepStrictEqual(dimensions, { width: 1417, height: 2008 }, `${name} dimensions differ from 60x85 mm at 600 DPI`);
        if (/\.pdf$/i.test(name)) assert.ok(buffer.length > 100000 && buffer.subarray(0, 5).toString() === '%PDF-', 'PDF output is invalid or unexpectedly small');
        assert.ok(buffer.length > 100000, `${name} is unexpectedly small`);
        return { name, bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), dimensions };
    });
    assert.deepStrictEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
    const report = { success: true, employeeId: '002671', rendererContract: exportResult.contract, preview, pixelAudit, artifacts, consoleErrors: errors.length, businessWrites: 0 };
    fs.writeFileSync(path.join(evidenceDir, 'uat-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    if (chrome && !chrome.killed) chrome.kill();
    await sleep(300);
    fs.rmSync(profileDir, { recursive: true, force: true });
});
