'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const browserPath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-image-phase1-'));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let browser;
let server;
let client;

class CdpClient {
    constructor(url) {
        this.sequence = 0;
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
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Browser connection timed out')), 10000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }

    command(method, params = {}) {
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, 15000);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const response = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result?.value;
    }

    close() {
        this.socket.close();
    }
}

function contentType(file) {
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    return 'application/octet-stream';
}

async function getJson(url) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (_) {}
        await sleep(100);
    }
    throw new Error(`Cannot reach ${url}`);
}

async function main() {
    assert.ok(fs.existsSync(browserPath), `Edge not found: ${browserPath}`);
    const fixture = path.join(__dirname, 'fixtures', 'card-image-export-phase1.html');
    const utility = path.join(root, 'public', 'js', 'utils', 'card-image-export.js');
    assert.ok(fs.existsSync(fixture), 'Browser fixture is missing');
    assert.ok(fs.existsSync(utility), 'Shared export utility is missing');
    const frontendRoot = path.join(root, 'public', 'js');
    const runtimeReferences = fs.readdirSync(frontendRoot, { recursive: true })
        .filter(file => String(file).endsWith('.js') && String(file).replace(/\\/g, '/') !== 'utils/card-image-export.js')
        .filter(file => fs.readFileSync(path.join(frontendRoot, file), 'utf8').includes('card-image-export'));
    const normalizedReferences = runtimeReferences.map(file => String(file).replace(/\\/g, '/')).sort();
    assert.deepStrictEqual(
        normalizedReferences,
        [
            'pages/accident.js',
            'pages/dashboard.js',
            'pages/fourm.js',
            'pages/machine-safety.js',
            'pages/ojt.js',
            'pages/safety-culture.js',
            'pages/yokoten.js',
        ],
        `Shared export imports must remain inside the approved Phase 2 rollout and pilot set: ${normalizedReferences.join(', ')}`,
    );
    const mainSource = fs.readFileSync(path.join(frontendRoot, 'main.js'), 'utf8');
    const enabledModules = ['dashboard', 'accident', 'machine-safety', 'yokoten', 'fourm', 'safety-culture'];
    enabledModules.forEach(moduleKey => {
        assert.ok(mainSource.includes(`'${moduleKey}'`), `Phase 2C default module is missing: ${moduleKey}`);
    });
    assert.ok(
        mainSource.includes('cardImageExportV2 === undefined'),
        'Phase 2C must preserve an explicit emergency feature-flag override',
    );

    server = http.createServer((request, response) => {
        const file = request.url === '/fixture'
            ? fixture
            : request.url === '/public/js/utils/card-image-export.js' ? utility : null;
        if (!file) {
            response.writeHead(404).end('Not found');
            return;
        }
        response.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const cdpPort = 9832;
    browser = spawn(browserPath, [
        '--headless=new',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        `http://127.0.0.1:${port}/fixture`,
    ], { stdio: 'ignore', windowsHide: true });

    await getJson(`http://127.0.0.1:${cdpPort}/json/version`);
    const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert.ok(page, 'Browser page target was not found');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Runtime.enable');

    let result;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        result = await client.evaluate('window.__phase1Result || null');
        if (result) break;
        await sleep(100);
    }
    assert.ok(result, 'Fixture did not finish');
    assert.strictEqual(result.passed, true, result.error || 'Fixture failed');
    assert.strictEqual(result.checks.length, 19, JSON.stringify(result));
    console.log(`Card image export foundation passed ${result.checks.length}/${result.checks.length}; approved rollout imports ${normalizedReferences.length}/${normalizedReferences.length}`);
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { client?.close(); } catch (_) {}
    if (browser) {
        const exited = new Promise(resolve => browser.once('exit', resolve));
        try { browser.kill(); } catch (_) {}
        await Promise.race([exited, sleep(3000)]);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
        console.warn(`Temporary browser profile cleanup deferred: ${error.message}`);
    }
});
