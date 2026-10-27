'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const session = fs.readFileSync(path.join(root, 'public', 'js', 'session.js'), 'utf8');
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert(condition, message); };

const criticalStart = index.indexOf('<style id="app-critical-css">');
const tailwindStart = index.indexOf('public/tailwind.production.css?v=20261019-local-production-r1');
const bootstrapStart = index.indexOf('id="app-bootstrap"');
const loginStart = index.indexOf('id="login-overlay"');

check(index.includes('<html lang="th" data-app-bootstrap="loading">'), 'HTML must start in loading state');
check(criticalStart > 0 && criticalStart < tailwindStart, 'Critical CSS must precede compiled Tailwind CSS');
check(!index.includes('https://cdn.tailwindcss.com'), 'Production page must not load the Tailwind browser CDN');
check(index.includes('<link rel="stylesheet" href="public/tailwind.production.css?v=20261019-local-production-r1">'), 'Production page must load compiled local Tailwind CSS');
check(index.includes('.hidden { display: none; }') && index.includes('[hidden] { display: none !important; }'), 'Critical hidden fallback must preserve responsive variants');
check(!index.includes('.hidden, [hidden] { display: none !important; }'), 'Critical CSS must not permanently override responsive hidden utilities');
check(bootstrapStart > 0 && bootstrapStart < loginStart, 'Bootstrap overlay must render before login content');
check(index.includes('role="status"') && index.includes('aria-busy="true"'), 'Bootstrap must expose accessible loading state');
check(index.includes('prefers-reduced-motion: reduce'), 'Reduced motion fallback is required');
check(index.includes('animation: app-surface-enter .18s cubic-bezier(.2, .8, .2, 1) both'), 'Real screen must enter with a bounded 180ms transition');
check(index.includes('@keyframes app-surface-enter'), 'Real screen transition keyframes missing');
check(index.includes('#app-container:not(.hidden) { animation: none; }'), 'Reduced motion must disable the real screen transition');
check(index.includes("root.dataset.appBootstrap = 'error'"), 'Slow bootstrap must expose a retry state');
check(index.includes('const appShellWatchdogMs = 60000;'), 'App-shell watchdog must allow constrained mobile delivery');
check(index.includes("root.dataset.appBootstrap = 'ready'"), 'Successful bootstrap must expose ready state');
check(index.includes('public/js/session.js?v=20261019-app-bootstrap-timeout-r1'), 'Session cache key must match timeout release');
check(index.includes('public/js/main.js?v=20261027-safety-vote-option-image-r1'), 'Main module cache key must match current release');
check(main.includes("__TSH_APP_BOOTSTRAP__?.setMessage('กำลังโหลดการตั้งค่าองค์กร…')"), 'Branding phase message missing');
check(main.includes("__TSH_APP_BOOTSTRAP__?.setMessage('กำลังตรวจสอบการเข้าสู่ระบบ…')"), 'Session phase message missing');
check(main.includes('APP_BOOTSTRAP_TIMEOUTS = Object.freeze({ branding: 4000, session: 8000 })'), 'Bounded bootstrap timeouts missing');
check(main.includes("return { source: 'default', timedOut: timedOut || err?.name === 'AbortError' }"), 'Branding timeout must fall back safely');
check(main.includes('preserveOnFailure: true') && main.includes('throwOnFailure: true'), 'Session timeout must preserve the existing session');
check(session.includes('const signal = options?.signal;') && session.includes('signal,'), 'Session verification must forward AbortSignal');
check(session.includes("if (throwOnFailure && !err?.invalidSession) throw err;"), 'Transient session failures must reach bootstrap error handling');
check(session.includes("const aborted = err?.name === 'AbortError';") && session.includes('!preserveOnFailure && !aborted'), 'Timeout must not clear the stored session');
check(main.includes('window.__TSH_APP_BOOTSTRAP__?.complete();'), 'Bootstrap completion handoff missing');
check(main.includes('window.__TSH_APP_BOOTSTRAP__?.fail(message);'), 'Bootstrap failure handoff missing');
check(main.includes("import { loadVendorsForPage } from './utils/vendor-loader.js?v=20261019-route-vendors-r1'"), 'Route vendor loader import missing');
check(main.includes('await loadVendorsForPage(hash);'), 'Route vendor loading handoff missing');
check(main.includes('function _resolveBrandAssetUrl(value)') && main.includes("new URL(`uploads/${storedName}`, document.baseURI)"), 'Brand uploads must follow the current application base path');
check(main.includes("if (AppState.isAdmin)")
    && main.includes("apiFetch('/safety-vote/admin/health'")
    && main.includes("apiFetch('/safety-vote/me/campaigns'"),
'Safety Vote navigation must use role-appropriate discovery endpoints');

console.log(`App Critical CSS and Bootstrap Loading static contract: PASS (${assertions} assertions)`);
