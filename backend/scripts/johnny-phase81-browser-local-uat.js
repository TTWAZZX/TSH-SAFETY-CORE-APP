'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const EDGE = process.env.JOHNNY_UAT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = Number(process.env.JOHNNY_PHASE81_CDP_PORT || 9699);
const baseUrl = String(process.env.JOHNNY_UAT_URL || '').replace(/\/+$/, '');
const phase83Mode = process.env.JOHNNY_PHASE83_ANSWER_VERIFICATION === '1';
const phase82Mode = phase83Mode || process.env.JOHNNY_PHASE82_MULTI_SOURCE === '1';
const browserPhaseTag = phase83Mode ? 'phase83' : (phase82Mode ? 'phase82' : 'phase81');
if (!baseUrl) throw new Error('JOHNNY_UAT_URL is required; Production fallback is forbidden');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(baseUrl).hostname)) throw new Error('Phase 8.1 Browser UAT refuses non-loopback URLs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (_) {}
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
    constructor(url) {
        this.id = 1;
        this.pending = new Map();
        this.events = [];
        this.ws = new WebSocket(url);
    }
    async connect() {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 15000);
            this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.ws.addEventListener('error', reject, { once: true });
        });
        this.ws.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (!message.id) { this.events.push(message); return; }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP command timed out: ${method}`)); }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression, timeout = 30000) {
        const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed');
        return result.result?.value;
    }
    close() { this.ws.close(); }
}

async function waitFor(client, expression, label, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try { if (await client.eval(`Boolean(${expression})`, 10000)) return; } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function setViewport(client, width, height, mobile) {
    await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2.5 : 1, mobile });
    await client.command('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await client.eval('window.dispatchEvent(new Event("resize")); true');
    await sleep(400);
}

async function screenshot(client, destination) {
    const capture = await client.command('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(destination, Buffer.from(capture.data, 'base64'));
}

async function submitDrawer(client, message, expectedText) {
    await client.eval(`(() => {
        const input=document.getElementById('johnny-global-input');
        input.value=${JSON.stringify(message)};
        document.getElementById('johnny-global-form').requestSubmit();
        return true;
    })()`);
    await waitFor(client, `document.getElementById('johnny-global-messages')?.innerText.includes(${JSON.stringify(expectedText)})`, `drawer answer ${expectedText}`);
    return client.eval(`(() => {
        const messages=Array.from(document.querySelectorAll('.johnny-global-message.is-assistant'));
        const last=messages[messages.length-1];
        return {
            text:last?.querySelector('.johnny-global-bubble')?.innerText || '',
            source:last?.querySelector('.johnny-global-source')?.innerText || '',
            citationCount:last?.querySelectorAll('.johnny-global-citation').length || 0,
        };
    })()`);
}

async function main() {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const artifactDir = path.join(ROOT, 'backups', 'local', `johnny-${browserPhaseTag}-browser-${stamp}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `johnny-${browserPhaseTag}-edge-`));
    const browser = spawn(EDGE, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
        `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    const result = { success: false, baseUrl, artifactDir, workspace: {}, drawer: {}, apiCases: {}, failures: [] };
    let client;
    try {
        await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
        const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const page = targets.find(target => target.type === 'page');
        if (!page) throw new Error('No Edge page target');
        client = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
        await client.connect();
        await client.command('Page.enable');
        await client.command('Runtime.enable');
        await client.command('Network.enable');
        await client.command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${baseUrl}/api`)};` });
        await client.command('Page.navigate', { url: `${baseUrl}/index.html?johnnyPhase81=${Date.now()}#johnny-ai` });
        await waitFor(client, `document.getElementById('login-form') && window.__tshLoginReady === true`, 'login form');
        await setViewport(client, 1366, 768, false);
        await client.eval(`(() => {
            document.getElementById('login-employee-id').value='PHASE81-ADMIN';
            document.getElementById('login-password').value='Phase81Only!';
            document.getElementById('login-form').requestSubmit();
            return true;
        })()`);
        await waitFor(client, `document.getElementById('app-container') && !document.getElementById('app-container').classList.contains('hidden')`, 'authenticated app');
        await client.eval(`location.hash='#johnny-ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
        await waitFor(client, `document.getElementById('johnny-form') && document.getElementById('johnny-input')`, 'Johnny workspace');
        await client.eval(`(() => {
            document.getElementById('johnny-input').value='How do I use the Dashboard?';
            document.getElementById('johnny-form').requestSubmit();
            return true;
        })()`);
        await waitFor(client, `document.getElementById('johnny-messages')?.innerText.includes('Dashboard') && document.querySelector('.johnny-answer-feedback')`, 'workspace pure usage answer');
        result.workspace = await client.eval(`(() => ({
            route:location.hash,
            answerVisible:document.getElementById('johnny-messages').innerText.includes('Dashboard'),
            sourceText:document.getElementById('johnny-messages').innerText,
            overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
        }))()`);
        await screenshot(client, path.join(artifactDir, 'workspace-pure-usage-desktop.png'));

        await client.eval(`location.hash='#dashboard'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
        await waitFor(client, `document.getElementById('johnny-global-launcher') && !document.getElementById('johnny-global-launcher').hidden`, 'drawer launcher');
        await client.eval(`document.getElementById('johnny-global-launcher').click(); true`);
        await waitFor(client, `document.body.classList.contains('johnny-global-open')`, 'drawer open');
        result.drawer.mixed = await submitDrawer(client, 'According to company policy, how do I open the Accident reporting screen?', 'direct supervisor');
        await screenshot(client, path.join(artifactDir, 'drawer-mixed-policy-ui-desktop.png'));

        await setViewport(client, 390, 844, true);
        await client.eval(`document.getElementById('johnny-global-new').click(); true`);
        result.drawer.emergency = await submitDrawer(client, 'Emergency: what should I do immediately if chemical splashes into my eyes?', '15 minutes');
        result.drawer.mobile = await client.eval(`(() => {
            const panel=document.getElementById('johnny-global-panel'); const rect=panel.getBoundingClientRect();
            const controls=Array.from(panel.querySelectorAll('button,textarea,select')).filter(el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';});
            return { withinViewport:rect.left>=-1&&rect.right<=innerWidth+1&&rect.top>=-1&&rect.bottom<=innerHeight+1, minControlHeight:Math.min(...controls.map(el=>el.getBoundingClientRect().height)), overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth };
        })()`);
        await screenshot(client, path.join(artifactDir, 'drawer-emergency-mobile-390.png'));

        result.apiCases = await client.eval(`(async () => {
            const token=localStorage.getItem('tsh_token');
            const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
            const ping=await fetch('/__phase81/ping').then(r=>r.json());
            const scoped=await fetch('/api/johnny/chat',{method:'POST',headers,body:JSON.stringify({message:'Who is the final approver in this selected document?',documentId:ping.scopedDocumentId})}).then(r=>r.json());
            const live=await fetch('/api/johnny/chat',{method:'POST',headers,body:JSON.stringify({message:'How many open Safety Patrol issues are in the system this year?'})}).then(r=>r.json());
            return {
                scoped:{sourceType:scoped.data?.sourceType,answer:scoped.data?.answer,citationIds:(scoped.data?.citations||[]).map(c=>Number(c.documentId))},
                live:{sourceType:live.data?.sourceType,answer:live.data?.answer,sources:(live.data?.sources||[]).map(s=>s.type)},
            };
        })()`, 45000);

        const shared = await client.eval(`(async()=>({feedback:(await fetch('/shared/johnny-answer-feedback.json')).status,usage:(await fetch('/shared/johnny-system-usage-knowledge.json')).status}))()`);
        result.cleanup = await client.eval(`(async()=>{
            const token=localStorage.getItem('tsh_token');
            const response=await fetch('/api/johnny/conversations',{method:'DELETE',headers:{Authorization:'Bearer '+token}});
            const history=await fetch('/api/johnny/conversations',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
            return {status:response.status,remaining:Array.isArray(history.data)?history.data.length:-1};
        })()`);
        const apiFailures = client.events.filter(event => event.method === 'Network.responseReceived')
            .map(event => event.params.response)
            .filter(response => response.url.includes('/api/johnny/') && Number(response.status) >= 400)
            .map(response => ({ status: response.status, url: response.url }));
        result.apiFailures = apiFailures;
        const checks = [
            ['workspace pure usage visible', result.workspace.route === '#johnny-ai' && result.workspace.answerVisible],
            ['workspace no overflow', !result.workspace.overflow],
            ['mixed policy answer and citations visible', /supervisor|SHE/i.test(result.drawer.mixed.text) && result.drawer.mixed.citationCount >= 2],
            ['emergency answer and safety citation visible', /15 minutes/i.test(result.drawer.emergency.text) && result.drawer.emergency.citationCount >= 1],
            ['mobile drawer viewport', result.drawer.mobile.withinViewport && !result.drawer.mobile.overflow],
            ['mobile controls 44px', result.drawer.mobile.minControlHeight >= 44],
            ['scoped document browser API', result.apiCases.scoped.sourceType === 'company_document' && /Plant Manager/i.test(result.apiCases.scoped.answer || '') && result.apiCases.scoped.citationIds.length > 0 && new Set(result.apiCases.scoped.citationIds).size === 1],
            ['live system data browser API', result.apiCases.live.sourceType === 'system_data' && /2 open|2 open or in-progress/i.test(result.apiCases.live.answer || '') && result.apiCases.live.sources.join(',') === 'system_data'],
            ['shared contracts denied', shared.feedback === 404 && shared.usage === 404],
            ['no failed Johnny API', apiFailures.length === 0],
            ['cleanup zero conversations', result.cleanup.status === 200 && result.cleanup.remaining === 0],
        ];
        result.sharedContractAccess = shared;
        result.failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
        result.success = result.failures.length === 0;
        if (!result.success) throw new Error(`Browser UAT failed: ${result.failures.join(', ')}`);
        console.log(`Johnny ${phase83Mode ? 'Phase 8.3' : (phase82Mode ? 'Phase 8.2' : 'Phase 8.1')} Browser UAT: PASS; evidence=${artifactDir}`);
    } catch (error) {
        if (client) {
            try {
                result.diagnostic = await client.eval(`(() => ({
                    href:location.href,
                    readyState:document.readyState,
                    title:document.title,
                    loginForm:Boolean(document.getElementById('login-form')),
                    loginReady:window.__tshLoginReady === true,
                    bodyText:String(document.body?.innerText || '').slice(0,500),
                    scripts:Array.from(document.scripts).map(item=>item.src).filter(Boolean).slice(-10),
                }))()`);
                result.runtimeEvents = client.events.filter(event => ['Runtime.exceptionThrown','Runtime.consoleAPICalled'].includes(event.method)).slice(-30);
                result.failedResources = client.events.filter(event => event.method === 'Network.loadingFailed').slice(-30);
            } catch (_) {}
        }
        result.failures.push(error.message || String(error));
        throw error;
    } finally {
        if (client) client.close();
        if (process.platform === 'win32' && browser.pid) spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else browser.kill();
        fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
        const resolved = path.resolve(profileDir);
        if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
            try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }); } catch (_) {}
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => { console.error(error.stack || error.message); process.exit(1); });
