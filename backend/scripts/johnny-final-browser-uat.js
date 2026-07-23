'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EDGE = process.env.JOHNNY_UAT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.JOHNNY_FINAL_UAT_CDP_PORT || 9697);
const CACHE_BUST = '20260709-johnny-final-closeout';

function readEnv() {
  const values = {};
  fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  });
  return values;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`Timed out: ${url}`);
}

class Cdp {
  constructor(url) {
    this.id = 1;
    this.pending = new Map();
    this.ws = new WebSocket(url);
  }
  async connect() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 15000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', (error) => { clearTimeout(timer); reject(error); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeout);
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
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await client.eval(`Boolean(${expression})`, 10000)) return;
    } catch (_) {}
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(client, file) {
  const result = await client.command('Page.captureScreenshot', { format: 'png', fromSurface: true }, 30000);
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
}

async function setViewport(client, width, height, mobile) {
  await client.command('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2.5 : 1,
    mobile,
  });
  await client.command('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  await client.eval('window.dispatchEvent(new Event("resize")); true');
  await sleep(700);
}

async function main() {
  const env = readEnv();
  const baseUrl = (process.env.JOHNNY_UAT_URL || env.PUBLIC_UPLOAD_BASE_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
  const appUrl = `${baseUrl}/index.html?johnnyFinalUat=${Date.now()}#johnny-ai`;
  const employeeId = process.env.SMOKE_ADMIN_EMPLOYEE_ID || env.SMOKE_ADMIN_EMPLOYEE_ID;
  const password = process.env.SMOKE_ADMIN_PASSWORD || env.SMOKE_ADMIN_PASSWORD;
  if (!employeeId || !password) throw new Error('Missing smoke Admin credentials');

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const artifactDir = path.join(ROOT, 'backups', 'local', `johnny-final-browser-uat-${stamp}`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-final-edge-'));
  const browser = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    appUrl,
  ], { stdio: 'ignore', windowsHide: true });

  const result = {
    ok: false,
    appUrl,
    artifactDir,
    cacheBust: CACHE_BUST,
    desktop: {},
    mobile: {},
    failures: [],
  };
  let client;
  try {
    await getJson(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('No browser page target');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');

    await setViewport(client, 1366, 768, false);
    await waitFor(client, `document.getElementById('login-form') && window.__tshLoginReady === true`, 'login form');
    await client.eval(`(() => {
      document.getElementById('login-employee-id').value = ${JSON.stringify(employeeId)};
      document.getElementById('login-password').value = ${JSON.stringify(password)};
      document.getElementById('login-form').requestSubmit();
      return true;
    })()`);
    await waitFor(client, `document.getElementById('app-container') && !document.getElementById('app-container').classList.contains('hidden')`, 'app container');
    await client.eval(`location.hash = '#johnny-ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
    await waitFor(client, `document.querySelector('[data-johnny-mobile-compact="20260709"]')`, 'Johnny page');

    result.desktop = await client.eval(`(() => {
      const resources = performance.getEntriesByType('resource').map((entry) => String(entry.name || ''));
      const emptyQuick = document.querySelector('.johnny-empty-quick');
      const rail = emptyQuick || document.querySelector('.johnny-field-quick-rail');
      const chips = Array.from((rail || document).querySelectorAll('.johnny-field-chip'));
      const railStyle = rail ? getComputedStyle(rail) : null;
      const railRect = rail?.getBoundingClientRect?.() || { width: 0 };
      const chipRects = chips.map((chip) => chip.getBoundingClientRect());
      const totalChipWidth = chipRects.reduce((sum, rect) => sum + rect.width, 0);
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        marker: document.querySelector('.johnny-shell')?.dataset?.johnnyMobileCompact || '',
        johnnyCacheBust: resources.some((src) => src.includes('/public/js/pages/johnny-ai.js') && src.includes('${CACHE_BUST}')),
        styleCacheBust: resources.some((src) => src.includes('/public/style.css') && src.includes('${CACHE_BUST}')),
        railDisplay: railStyle?.display || '',
        railWrap: railStyle?.flexWrap || '',
        railJustify: railStyle?.justifyContent || '',
        railOverflowX: railStyle?.overflowX || '',
        railWidth: railRect.width,
        chipCount: chips.length,
        totalChipWidth,
        hasHorizontalRailScroll: rail ? rail.scrollWidth > rail.clientWidth + 2 : true,
        pageHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    await screenshot(client, path.join(artifactDir, 'johnny-final-desktop.png'));

    await setViewport(client, 390, 844, true);
    await sleep(500);
    result.mobile = await client.eval(`(() => {
      const composer = document.getElementById('johnny-form');
      const messages = document.getElementById('johnny-messages');
      const bottomTab = document.getElementById('bottom-tab-bar');
      const rail = document.querySelector('.johnny-field-quick-wrap .johnny-field-quick-rail');
      const composerRect = composer?.getBoundingClientRect?.() || { bottom: 0, width: 0, height: 0 };
      const messagesRect = messages?.getBoundingClientRect?.() || { top: 0, bottom: 0 };
      const css = (el) => el ? getComputedStyle(el) : null;
      return {
        bodyActivePage: document.body.dataset.activePage || '',
        bottomTabHidden: bottomTab ? ['none', 'hidden'].includes(css(bottomTab).display === 'none' ? 'none' : css(bottomTab).visibility) : true,
        composerFixed: composer ? css(composer).position === 'fixed' : false,
        composerHeight: composerRect.height,
        composerInsideViewport: composerRect.bottom <= window.innerHeight + 2 && composerRect.width <= window.innerWidth,
        messagesVisibleHeight: messagesRect.bottom - messagesRect.top,
        mobileRailOverflowX: rail ? css(rail).overflowX : '',
        mobileRailWrap: rail ? css(rail).flexWrap : '',
        pageHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    await screenshot(client, path.join(artifactDir, 'johnny-final-mobile.png'));

    const checks = [
      ['desktop marker', result.desktop.marker === '20260709'],
      ['desktop johnny cache bust', result.desktop.johnnyCacheBust],
      ['desktop style cache bust', result.desktop.styleCacheBust],
      ['desktop quick rail wraps', result.desktop.railWrap === 'wrap'],
      ['desktop quick rail centered', result.desktop.railJustify === 'center'],
      ['desktop quick rail no internal horizontal scroll', !result.desktop.hasHorizontalRailScroll],
      ['desktop enough quick chips', result.desktop.chipCount >= 6],
      ['desktop no page horizontal overflow', !result.desktop.pageHorizontalOverflow],
      ['mobile active Johnny page', result.mobile.bodyActivePage === 'johnny-ai'],
      ['mobile bottom tab hidden', result.mobile.bottomTabHidden],
      ['mobile composer compact', result.mobile.composerFixed && result.mobile.composerHeight > 0 && result.mobile.composerHeight <= 96],
      ['mobile composer inside viewport', result.mobile.composerInsideViewport],
      ['mobile message area visible', result.mobile.messagesVisibleHeight >= 260],
      ['mobile quick rail remains horizontal', result.mobile.mobileRailWrap === 'nowrap' && ['auto', 'scroll'].includes(result.mobile.mobileRailOverflowX)],
      ['mobile no page horizontal overflow', !result.mobile.pageHorizontalOverflow],
    ];
    result.failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
    result.ok = result.failures.length === 0;
    if (!result.ok) throw new Error(`Johnny final browser UAT failed: ${result.failures.join(', ')}`);
  } finally {
    if (client) client.close();
    browser.kill();
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
