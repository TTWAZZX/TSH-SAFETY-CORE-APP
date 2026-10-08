'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const origin = process.argv[2] || 'http://127.0.0.1:5095';
const chromePath = process.env.SAFETY_VOTE_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.SAFETY_VOTE_CDP_PORT || 9855);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-sv5-browser-'));
const evidence = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', `safety-vote-phase5-browser-${Date.now()}`);
const errors = [];
const pending = new Map();
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
      if (pending.delete(requestId)) reject(Error('CDP timeout'));
    }, 30000);
  });
}
async function ev(expression) {
  const result = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 120; i++) {
    if (await ev(expression)) return;
    await sleep(200);
  }
  throw Error(`Timeout ${expression}`);
}
async function shot(name) {
  const result = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, name), Buffer.from(result.data, 'base64'));
}

(async () => {
  assert(fs.existsSync(chromePath));
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  let targets;
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        targets = await response.json();
        break;
      }
    } catch {}
    await sleep(150);
  }
  const target = targets?.find(x => x.type === 'page');
  assert(target);
  ws = new WebSocket(target.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', async event => {
    let raw = event.data;
    if (raw?.text) raw = await raw.text();
    const message = JSON.parse(String(raw));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push('console error');
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
    }
  });
  await cmd('Page.enable');
  await cmd('Runtime.enable');

  for (const viewport of [
    { name: 'desktop', width: 1366, height: 768, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true }
  ]) {
    await cmd('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    await cmd('Page.navigate', { url: `${origin}/__phase3-admin-browser?v=${viewport.name}` });
    await wait(`[...document.querySelectorAll('button')].some(x=>x.textContent.includes('Phase 5 Operations'))`);
    await ev(`[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Phase 5 Operations')).click()`);
    await wait(`document.querySelector('#sv-phase5-operations')?.textContent.includes('Campaign Operations Center')`);
    const admin = await ev(`(()=>{const c=[...document.querySelectorAll('button,input,select,textarea')];return{overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,touch:Math.min(...c.map(x=>x.getBoundingClientRect().height)),funnel:document.querySelector('#sv-phase5-operations').textContent.includes('Reconciliation'),exports:document.querySelector('#sv-phase5-operations').textContent.includes('Aggregate Excel')}})()`);
    assert.strictEqual(admin.overflow, false);
    assert.ok(admin.touch >= 44);
    assert.ok(admin.funnel && admin.exports);
    await shot(`admin-${viewport.name}.png`);

    await cmd('Page.navigate', { url: `${origin}/__phase2-browser?v=${viewport.name}` });
    await wait(`document.querySelector('#sv-notification-inbox')?.textContent.includes('Safety Vote Notifications')`);
    const user = await ev(`(()=>{const c=[...document.querySelectorAll('#sv-notification-inbox button,#sv-notification-inbox a')];return{overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,touch:Math.min(...c.map(x=>x.getBoundingClientRect().height)),closing:document.querySelector('#sv-notification-inbox').textContent.includes('closing_reminder')}})()`);
    assert.strictEqual(user.overflow, false);
    assert.ok(user.touch >= 44);
    assert.strictEqual(user.closing, true);
    await shot(`user-${viewport.name}.png`);
  }

  assert.deepStrictEqual(errors, []);
  console.log(`Safety Vote Phase 5 authenticated user/admin desktop/390px browser UAT: PASS (${evidence})`);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    ws?.close();
    chrome?.kill();
  } catch {}
  await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
