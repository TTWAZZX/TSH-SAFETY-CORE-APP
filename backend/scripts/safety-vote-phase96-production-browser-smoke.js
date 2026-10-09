'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.SAFETY_VOTE_PHASE96_CDP_PORT || 9836);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv-phase96-'));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase96-browser-smoke-${stamp}`);
const viewports = [[390, 844], [430, 932], [768, 1024], [1366, 768], [1920, 1080]];
const expectLegacy = process.argv.includes('--expect-legacy');
const allowExistingCampaigns = process.argv.includes('--allow-existing-campaigns');
const runtimeErrors = [], apiResponses = [], networkMethods = [];
let browser, client, browserStderr = '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function decodeUser() {
  const parts = token.split('.');
  assert.strictEqual(parts.length, 3, 'Bearer token is not JWT-shaped');
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert(['Admin', 'ADMIN'].includes(String(payload.role || payload.Role)), 'Existing bearer must represent an Admin for Admin/User smoke');
  return payload;
}

class Cdp {
  constructor(url) { this.nextId = 1; this.pending = new Map(); this.socket = new WebSocket(url); }
  async connect() {
    this.socket.addEventListener('message', async event => {
      let raw = event.data;
      if (raw && typeof raw.text === 'function') raw = await raw.text();
      if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
      if (ArrayBuffer.isView(raw)) raw = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('utf8');
      const message = JSON.parse(String(raw));
      if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(String(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime_exception').replaceAll(token, '[REDACTED]').slice(0, 500));
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') runtimeErrors.push('console_error');
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        let safePath = '';
        try { safePath = new URL(message.params?.entry?.url || '').pathname; } catch (_) {}
        runtimeErrors.push(`browser_log_error:${String(message.params?.entry?.text || '').replaceAll(token, '[REDACTED]').slice(0, 300)}${safePath ? ` [${safePath}]` : ''}`);
      }
      if (message.method === 'Network.requestWillBeSent') networkMethods.push({ method: message.params.request.method, url: message.params.request.url });
      if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/api/') && message.params.response.url.includes('safety-vote')) {
        const headers = message.params.response.headers || {};
        apiResponses.push({ status: message.params.response.status, method: message.params.response.requestHeaders?.[':method'] || null, privateNoStore: /private/i.test(String(headers['cache-control'] || headers['Cache-Control'] || '')) && /no-store/i.test(String(headers['cache-control'] || headers['Cache-Control'] || '')) });
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 15000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }
  command(method, params = {}, timeout = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.socket.close(); } catch (_) {} }
}

async function evaluate(expression) {
  const response = await client.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}

async function waitFor(expression, timeout = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Browser condition timed out: ${expression}`);
}

async function connectBrowser(user) {
  browser = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  browser.stderr?.on('data', chunk => { browserStderr += String(chunk); });
  let targets;
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {}
    await sleep(250);
  }
  const page = targets?.find(target => target.type === 'page');
  assert(page?.webSocketDebuggerUrl, `Chrome CDP unavailable: ${browserStderr.slice(-300)}`);
  client = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
  await client.connect();
  for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await client.command(`${domain}.enable`);
  const source = `(() => {
    const token = ${JSON.stringify(token)};
    const user = ${JSON.stringify(user)};
    localStorage.setItem('tsh_token', token);
    localStorage.setItem('tsh_user', JSON.stringify(user));
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (/\\/api\\/session\\/verify(?:$|[?#])/.test(url)) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, user, token, status: null }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' } }));
      }
      const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return Promise.reject(new Error('PHASE96_GET_ONLY_BLOCKED'));
      return nativeFetch(input, init);
    };
  })();`;
  await client.command('Page.addScriptToEvaluateOnNewDocument', { source });
}

async function navigate(url) {
  await client.command('Page.navigate', { url });
  await waitFor(`document.readyState === 'complete'`);
}

async function inspectUser(width, height) {
  await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await navigate(`${baseUrl}/index.html?phase96=${stamp}#safety-vote`);
  if (expectLegacy) await waitFor(`Boolean(document.querySelector('#safety-vote-page .mx-auto.max-w-6xl'))`);
  else if (allowExistingCampaigns) await waitFor(`Boolean(document.querySelector('.svp-shell[data-sv-participation]'))`);
  else await waitFor(`Boolean(document.querySelector('.svp-shell[data-sv-participation] .svp-empty'))`);
  if (expectLegacy) return evaluate(`(() => { const page=document.querySelector('#safety-vote-page .mx-auto.max-w-6xl'); return { featureFlag: window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true, shell: Boolean(page), navigation: true, emptyState: Boolean(page && !page.querySelector('[data-sv-open]')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }; })()`);
  return evaluate(`(() => { const shell=document.querySelector('.svp-shell[data-sv-participation]'); const nav=shell?.querySelector('.sv-role-nav'); return { featureFlag: window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true, shell: Boolean(shell), navigation: Boolean(nav), emptyState: Boolean(shell?.querySelector('.svp-empty')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }; })()`);
}

async function inspectAdmin(width, height) {
  await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await navigate(`${baseUrl}/index.html?phase96=${stamp}#admin`);
  await waitFor(`typeof window._adminTab === 'function' && Boolean(document.querySelector('#admin-content-area'))`);
  await evaluate(`window._adminTab('safety-vote-foundation')`);
  if (expectLegacy) await waitFor(`Boolean(document.querySelector('#admin-content-area .animate-fade-in'))`);
  else if (allowExistingCampaigns) await waitFor(`Boolean(document.querySelector('.sv-ux-shell[data-sv-ux-version]'))`);
  else await waitFor(`Boolean(document.querySelector('.sv-ux-shell[data-sv-ux-version] .sv-empty-state'))`);
  if (expectLegacy) return evaluate(`(() => { const shell=document.querySelector('#admin-content-area .animate-fade-in'); return { featureFlag: window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true, shell: Boolean(shell), navigation: true, userNavigation: true, adminCurrent: true, emptyState: Boolean(shell && !shell.querySelector('[onclick^="window._svSelect"]')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }; })()`);
  return evaluate(`(() => { const shell=document.querySelector('.sv-ux-shell[data-sv-ux-version]'); const nav=shell?.querySelector('.sv-role-nav'); return { featureFlag: window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true, shell: Boolean(shell), navigation: Boolean(nav), userNavigation: Boolean(nav?.querySelector('[data-sv-role-link="user"]')), adminCurrent: nav?.querySelector('[data-sv-role-link="admin"]')?.getAttribute('aria-current') === 'page', emptyState: Boolean(shell?.querySelector('.sv-empty-state')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }; })()`);
}

async function anonymousGate() {
  const response = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { method: 'GET', redirect: 'manual', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  const cache = response.headers.get('cache-control') || '';
  return { method: 'GET', status: response.status, denied: response.status === 401, privateNoStore: /private/i.test(cache) && /no-store/i.test(cache), bodyRecorded: false };
}

async function main() {
  assert(token, 'Existing Production bearer token is required');
  assert(!String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim(), 'Ambiguous authentication inputs');
  assert(fs.existsSync(chromePath), 'Chrome executable not found');
  const user = decodeUser();
  const anonymous = await anonymousGate();
  assert(anonymous.denied && anonymous.privateNoStore, 'Anonymous denial gate failed');
  await connectBrowser(user);
  const checks = [];
  for (const [width, height] of (expectLegacy ? [[1366, 768]] : viewports)) {
    const userPage = await inspectUser(width, height);
    const adminPage = await inspectAdmin(width, height);
    assert(userPage.featureFlag === !expectLegacy && userPage.shell && userPage.navigation && (allowExistingCampaigns || userPage.emptyState) && !userPage.overflow, `User page failed at ${width}x${height}`);
    assert(adminPage.featureFlag === !expectLegacy && adminPage.shell && adminPage.navigation && adminPage.userNavigation && adminPage.adminCurrent && (allowExistingCampaigns || adminPage.emptyState) && !adminPage.overflow, `Admin page failed at ${width}x${height}`);
    checks.push({ viewport: `${width}x${height}`, userPage, adminPage });
  }
  const nonGet = networkMethods.filter(item => item.url.startsWith(baseUrl) && !['GET', 'HEAD', 'OPTIONS'].includes(item.method));
  assert.deepStrictEqual(nonGet, [], 'A non-GET Production request escaped the browser guard');
  assert.strictEqual(runtimeErrors.length, 0, 'Browser console/runtime error detected');
  assert(apiResponses.length > 0, 'No Safety Vote API responses observed');
  assert(apiResponses.every(item => item.status === 200 && item.privateNoStore), 'Safety Vote API status/privacy policy failed');
  const result = {
    contract: '2026-10-09-safety-vote-phase9.6-browser-r1', generatedAt: new Date().toISOString(),
    credential: { bearerPresent: true, valueRecorded: false, hashRecorded: false, roleEligible: true },
    viewports: checks, anonymousDenial: anonymous,
    api: { responsesObserved: apiResponses.length, allStatus200: true, allPrivateNoStore: true, responseBodiesRecorded: false },
    browser: { consoleErrors: 0, runtimeExceptions: 0, horizontalOverflow: false },
    constraints: { loginAttempted: false, nonGetProductionRequests: 0, businessDataWritten: false, campaignCreated: false, permissionChanged: false, emailOrNotificationSent: false, secretRecorded: false },
    existingCampaignsAllowed: allowExistingCampaigns,
    decision: expectLegacy ? 'PASS_PHASE96_ROLLBACK_LEGACY_UI_GET_ONLY_SMOKE' : 'PASS_PHASE96_AUTHENTICATED_GET_ONLY_BROWSER_SMOKE'
  };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const resultPath = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const digest = sha256(fs.readFileSync(resultPath));
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${digest}  result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, viewports: checks.length, api: result.api, browser: result.browser, anonymousDenial: anonymous, constraints: result.constraints, resultSha256: digest }, null, 2)}\n`);
}

main().catch(async error => {
  let state = null;
  try { state = client ? await evaluate(`({ hash: location.hash, ready: document.readyState, featureFlag: window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true, loginReady: window.__tshLoginReady === true, loginHidden: document.querySelector('#login-overlay')?.classList.contains('hidden') ?? null, appHidden: document.querySelector('#app-container')?.classList.contains('hidden') ?? null, userPageHidden: document.querySelector('#safety-vote-page')?.classList.contains('hidden') ?? null, loadingHidden: document.querySelector('#loading-overlay')?.classList.contains('hidden') ?? null, hasSafetyUnitGate: Boolean(document.querySelector('#safety-unit-gate-page')), hasUserUx: Boolean(document.querySelector('.svp-shell')), hasLegacyUser: Boolean(document.querySelector('#safety-vote-page .mx-auto.max-w-6xl')), hasAdminUx: Boolean(document.querySelector('.sv-ux-shell')), hasLegacyAdmin: Boolean(document.querySelector('#admin-content-area .animate-fade-in')) })`) : null; } catch (_) {}
  process.stderr.write(`Safety Vote Phase 9.6 browser smoke failed: ${error.message}; state=${JSON.stringify(state)}; runtimeErrors=${JSON.stringify(runtimeErrors.slice(0, 3))}; productionRequests=${networkMethods.filter(x=>x.url.startsWith(baseUrl)).length}\n`); process.exitCode = 1;
}).finally(async () => {
  try { client?.close(); } catch (_) {}
  try { browser?.kill(); } catch (_) {}
  await sleep(300);
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
});
