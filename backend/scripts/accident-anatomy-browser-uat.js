const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const browserPath = process.env.ACCIDENT_ANATOMY_BROWSER_PATH
    || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = Number(process.env.ACCIDENT_ANATOMY_CDP_PORT || 9876);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-accident-anatomy-'));
const errors = [];
let browser;
let cdp;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
    constructor(url) {
        this.id = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }

    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (message.method === 'Runtime.exceptionThrown') {
                errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
            }
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
                errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Edge CDP connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }

    command(method, params = {}, timeout = 30000) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP timeout: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    close() {
        try { this.socket.close(); } catch {}
    }
}

async function evaluate(expression) {
    const result = await cdp.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}

(async () => {
    assert.ok(fs.existsSync(browserPath), `Microsoft Edge not found: ${browserPath}`);
    browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
        '--disable-extensions', '--no-first-run', '--remote-allow-origins=*',
        '--window-size=1000,900', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    let targets;
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Edge page target unavailable');
    cdp = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await cdp.connect();
    await cdp.command('Runtime.enable');
    await cdp.command('Page.enable');

    const source = fs.readFileSync(path.join(__dirname, '../../public/js/utils/accident-anatomy.js'), 'utf8').replace(/export /g, '');
    const atlasData = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../../public/images/accident/anatomy-atlas-v2.png')).toString('base64')}`;
    const fixture = [
        { bodyPart: 'เท้า / นิ้วเท้า', bodySide: 'Left', label: 'เท้า / นิ้วเท้า · ซ้าย', cnt: 3 },
        { bodyPart: 'หลัง / เอว', bodySide: 'Midline', label: 'หลัง / เอว · กึ่งกลาง', cnt: 2 },
        { bodyPart: 'มือ / นิ้วมือ', bodySide: 'Bilateral', label: 'มือ / นิ้วมือ · ทั้งสองข้าง', cnt: 1 },
    ];
    await evaluate(`(() => {
        const policy = window.trustedTypes?.createPolicy('accident-anatomy-uat', { createHTML: value => value });
        const trusted = value => policy ? policy.createHTML(value) : value;
        document.head.innerHTML = trusted('<meta name="viewport" content="width=device-width,initial-scale=1">');
        document.body.style.margin = '0';
        document.body.style.fontFamily = 'Arial, sans-serif';
        document.body.innerHTML = trusted('<main id="host" style="max-width:760px;margin:auto;padding:16px"></main>');
        (0, eval)(${JSON.stringify(source)});
        const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
        window.__openedReport = 0;
        document.getElementById('host').innerHTML = trusted(renderAccidentAnatomy(${JSON.stringify(fixture)}, esc, 'ไม่มีข้อมูล', {
            reports: [{ id: 91, AccidentDate: '2026-03-12', Department: 'HR', Area: 'Factory 1', AccidentType: 'First Aid', InjuryType: 'บาดจากเครื่องจักร', BodyPart: 'เท้า / นิ้วเท้า', BodySide: 'Left', LostDays: 0 }],
            onOpenReport: id => { window.__openedReport = id; },
        }));
        document.querySelector('[data-anatomy-image]').src = ${JSON.stringify(atlasData)};
        return true;
    })()`);
    await sleep(150);

    const desktop = await evaluate(`(() => {
        const root = document.querySelector('[data-acc-anatomy]');
        const stage = root.querySelector('[data-anatomy-stage]');
        return {
            root: Boolean(root),
            svg: root.querySelectorAll('svg').length,
            images: root.querySelectorAll('img').length,
            imageWidth: root.querySelector('[data-anatomy-image]').naturalWidth,
            imageHeight: root.querySelector('[data-anatomy-image]').naturalHeight,
            heatLayers: root.querySelectorAll('[data-anatomy-heat]').length,
            markers: root.querySelectorAll('[data-anatomy-marker]').length,
            leftFootHeat: root.querySelectorAll('[data-anatomy-heat="0"][data-body-side="Left"]').length,
            leftFootMarkers: root.querySelectorAll('[data-anatomy-marker="0"][data-body-side="Left"]').length,
            rows: root.querySelectorAll('[data-anatomy-row]').length,
            touch: Math.min(...[...root.querySelectorAll('[data-anatomy-view]')].map(button => button.getBoundingClientRect().height)),
            stageRatio: stage.getBoundingClientRect().height / stage.getBoundingClientRect().width,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
    })()`);
    assert.strictEqual(desktop.root, true);
    assert.strictEqual(desktop.svg, 0);
    assert.strictEqual(desktop.images, 1);
    assert.strictEqual(desktop.imageWidth, 1254);
    assert.strictEqual(desktop.imageHeight, 1254);
    assert.strictEqual(desktop.heatLayers, 7, 'Left, midline and bilateral heat layers must map to the intended anatomy points');
    assert.strictEqual(desktop.markers, 5, 'Each ranking row must render at most one count marker per available view');
    assert.strictEqual(desktop.rows, 3);
    assert.strictEqual(desktop.leftFootHeat, 2);
    assert.strictEqual(desktop.leftFootMarkers, 2);
    assert.ok(desktop.touch >= 44);
    assert.ok(desktop.stageRatio > 1.8 && desktop.stageRatio < 2.0);
    assert.strictEqual(desktop.overflow, false);

    await evaluate(`document.querySelector('[data-anatomy-row="0"]').click()`);
    const drawerState = await evaluate(`(() => ({
        text: document.querySelector('[data-anatomy-detail]').textContent,
        reportButtons: document.querySelectorAll('[data-anatomy-open-report]').length,
    }))()`);
    assert.match(drawerState.text, /First Aid1/);
    assert.match(drawerState.text, /บาดจากเครื่องจักร/);
    assert.strictEqual(drawerState.reportButtons, 1);
    await evaluate(`document.querySelector('[data-anatomy-open-report]').click()`);
    assert.strictEqual(await evaluate(`window.__openedReport`), 91);

    await evaluate(`document.querySelector('[data-anatomy-row="1"]').click()`);
    const backState = await evaluate(`(() => ({
        label: document.querySelector('[data-anatomy-view-label]').textContent,
        imageLeft: document.querySelector('[data-anatomy-image]').style.left,
        imageAlt: document.querySelector('[data-anatomy-image]').alt,
        detail: document.querySelector('[data-anatomy-detail]').textContent,
        selected: document.querySelector('[data-anatomy-row="1"]').getAttribute('aria-pressed'),
    }))()`);
    assert.strictEqual(backState.label, 'BACK VIEW');
    assert.strictEqual(backState.imageLeft, '-100%');
    assert.strictEqual(backState.imageAlt, 'โมเดลกายวิภาคสามมิติ ด้านหลัง');
    assert.strictEqual(backState.selected, 'true');
    assert.match(backState.detail, /หลัง \/ เอว · กึ่งกลาง/);
    assert.match(backState.detail, /2 เคส · 33\.3%/);

    await evaluate(`document.querySelector('[data-anatomy-view="both"]').click()`);
    const bothState = await evaluate(`(() => ({
        label: document.querySelector('[data-anatomy-view-label]').textContent,
        imageWidth: document.querySelector('[data-anatomy-image]').style.width,
        visibleLayers: [...document.querySelectorAll('[data-anatomy-layer-view]')].filter(layer => layer.style.display !== 'none').length,
    }))()`);
    assert.strictEqual(bothState.label, 'FRONT + BACK');
    assert.strictEqual(bothState.imageWidth, '100%');
    assert.ok(bothState.visibleLayers >= 10);

    await evaluate(`document.querySelector('[data-anatomy-zoom="in"]').click()`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-anatomy-zoom-label]').textContent`), '125%');
    await evaluate(`document.querySelector('[data-anatomy-zoom="reset"]').click()`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-anatomy-zoom-label]').textContent`), '100%');

    await evaluate(`document.querySelector('[data-anatomy-fullscreen]').click()`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-acc-anatomy]').dataset.anatomyFullscreenOpen`), 'true');
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await sleep(50);
    assert.strictEqual(await evaluate(`document.querySelector('[data-acc-anatomy]').dataset.anatomyFullscreenOpen`), 'false');

    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(100);
    const mobile = await evaluate(`(() => {
        const root = document.querySelector('[data-acc-anatomy]');
        return {
            columns: getComputedStyle(root.querySelector('.acc-anatomy-layout')).gridTemplateColumns.split(' ').length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
            stageWidth: root.querySelector('[data-anatomy-stage]').getBoundingClientRect().width,
        };
    })()`);
    assert.strictEqual(mobile.columns, 1);
    assert.strictEqual(mobile.overflow, false);
    assert.ok(mobile.stageWidth <= 200.5);
    assert.deepStrictEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
    console.log('Accident anatomy browser UAT: PASS (left/right anatomy, local 3D atlas, front/back interaction, 44px controls, responsive)');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { cdp?.close(); } catch {}
    try { browser?.kill(); } catch {}
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
