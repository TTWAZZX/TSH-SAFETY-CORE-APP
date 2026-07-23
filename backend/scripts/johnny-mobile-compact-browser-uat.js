'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EDGE = process.env.JOHNNY_UAT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.JOHNNY_MOBILE_COMPACT_UAT_CDP_PORT || 9695);
const CACHE_BUST = '20260709-johnny-final-closeout';

function readEnv() {
  const values = {};
  fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  });
  return values;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
      this.ws.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
    });
    this.ws.addEventListener('message', event => {
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

async function setMobileViewport(client) {
  await client.command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2.5,
    mobile: true,
  });
  await client.command('Emulation.setTouchEmulationEnabled', { enabled: true });
  await client.eval('window.dispatchEvent(new Event("resize")); true');
  await sleep(700);
}

async function main() {
  const env = readEnv();
  const baseUrl = (process.env.JOHNNY_UAT_URL || env.PUBLIC_UPLOAD_BASE_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
  const appUrl = `${baseUrl}/index.html?johnnyMobileCompactUat=${Date.now()}#johnny-ai`;
  const employeeId = process.env.SMOKE_ADMIN_EMPLOYEE_ID || env.SMOKE_ADMIN_EMPLOYEE_ID;
  const password = process.env.SMOKE_ADMIN_PASSWORD || env.SMOKE_ADMIN_PASSWORD;
  if (!employeeId || !password) throw new Error('Missing smoke Admin credentials');

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const artifactDir = path.join(ROOT, 'backups', 'production', `johnny-mobile-compact-browser-uat-${stamp}`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-mobile-compact-edge-'));
  const browser = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    appUrl,
  ], { stdio: 'ignore', windowsHide: true });

  const result = { ok: false, appUrl, artifactDir, cacheBust: CACHE_BUST, mobile: {}, failures: [] };
  let client;
  try {
    await getJson(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
    const page = targets.find(target => target.type === 'page');
    if (!page) throw new Error('No browser page target');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');

    await setMobileViewport(client);
    await waitFor(client, `document.getElementById('login-form') && window.__tshLoginReady === true`, 'login form');
    await client.eval(`(() => {
      document.getElementById('login-employee-id').value = ${JSON.stringify(employeeId)};
      document.getElementById('login-password').value = ${JSON.stringify(password)};
      document.getElementById('login-form').requestSubmit();
      return true;
    })()`);
    await waitFor(client, `document.getElementById('app-container') && !document.getElementById('app-container').classList.contains('hidden')`, 'app container');
    await client.eval(`location.hash = '#johnny-ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
    await waitFor(client, `document.querySelector('[data-johnny-mobile-compact="20260709"]')`, 'Johnny mobile compact page');

    result.mobile = await client.eval(`(() => {
      const resources = performance.getEntriesByType('resource').map(entry => String(entry.name || ''));
      const composer = document.getElementById('johnny-form');
      const messages = document.getElementById('johnny-messages');
      const tabs = document.querySelector('.johnny-tabs');
      const headerTitle = document.querySelector('#johnny-chat-panel section > div:first-child > div');
      const emptyQuick = document.querySelector('.johnny-empty-quick');
      const bottomTab = document.getElementById('bottom-tab-bar');
      const composerRect = composer?.getBoundingClientRect?.() || { bottom: 0, width: 0, height: 0 };
      const messagesRect = messages?.getBoundingClientRect?.() || { bottom: 0, top: 0 };
      const css = selector => selector ? getComputedStyle(selector) : null;
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        bodyActivePage: document.body.dataset.activePage || '',
        mobileMarker: document.querySelector('.johnny-shell')?.dataset?.johnnyMobileCompact || '',
        johnnyCacheBust: resources.some(src => src.includes('/public/js/pages/johnny-ai.js') && src.includes('${CACHE_BUST}')),
        styleCacheBust: resources.some(src => src.includes('/public/style.css') && src.includes('${CACHE_BUST}')),
        bottomTabHidden: bottomTab ? ['none', 'hidden'].includes(css(bottomTab).display === 'none' ? 'none' : css(bottomTab).visibility) : true,
        tabHeight: tabs?.getBoundingClientRect?.().height || 0,
        headerTitleHidden: headerTitle ? css(headerTitle).display === 'none' : false,
        emptyQuickHidden: emptyQuick ? css(emptyQuick).display === 'none' : false,
        composerFixed: composer ? css(composer).position === 'fixed' : false,
        composerHeight: composerRect.height,
        composerInsideViewport: composerRect.bottom <= window.innerHeight + 2 && composerRect.width <= window.innerWidth,
        messagesVisibleHeight: messagesRect.bottom - messagesRect.top,
        fieldChipCount: document.querySelectorAll('.johnny-field-quick-wrap .johnny-field-chip').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    await screenshot(client, path.join(artifactDir, 'johnny-mobile-compact.png'));

    const checks = [
      ['mobile active page', result.mobile.bodyActivePage === 'johnny-ai'],
      ['mobile compact marker', result.mobile.mobileMarker === '20260709'],
      ['johnny cache bust', result.mobile.johnnyCacheBust],
      ['style cache bust', result.mobile.styleCacheBust],
      ['bottom tab hidden', result.mobile.bottomTabHidden],
      ['tabs compact', result.mobile.tabHeight > 0 && result.mobile.tabHeight <= 58],
      ['chat title hidden', result.mobile.headerTitleHidden],
      ['empty quick hidden', result.mobile.emptyQuickHidden],
      ['composer fixed', result.mobile.composerFixed],
      ['composer compact', result.mobile.composerHeight > 0 && result.mobile.composerHeight <= 96],
      ['composer inside viewport', result.mobile.composerInsideViewport],
      ['messages visible', result.mobile.messagesVisibleHeight >= 260],
      ['quick rail available', result.mobile.fieldChipCount >= 4],
      ['no horizontal overflow', !result.mobile.horizontalOverflow],
    ];
    result.failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
    result.ok = result.failures.length === 0;
    if (!result.ok) throw new Error(`Johnny mobile compact browser UAT failed: ${result.failures.join(', ')}`);
  } finally {
    if (client) client.close();
    browser.kill();
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
