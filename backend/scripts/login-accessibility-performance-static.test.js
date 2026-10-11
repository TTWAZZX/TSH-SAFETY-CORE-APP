'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const main = read('public/js/main.js');
const css = read('public/style.css');

let passed = 0;
const check = (name, condition) => {
    assert.ok(condition, name);
    passed += 1;
    console.log(`PASS ${name}`);
};

check('Thai document language and responsive viewport are declared', /<html\s+lang="th"/.test(html) && /name="viewport"[^>]*width=device-width/.test(html));
check('Login is exposed as a named main landmark', /id="login-overlay"[^>]*role="main"[^>]*aria-labelledby="login-heading"/.test(html) && /id="login-heading"/.test(html));
check('Login form is labelled and connected to help and error text', /id="login-form"[^>]*aria-labelledby="login-heading"[^>]*aria-describedby="first-login-hint login-error"/.test(html));
check('Employee ID has an explicit label association', /<label\s+for="login-employee-id"/.test(html));
check('Password has an explicit label association', /<label\s+for="login-password"/.test(html));
check('Password reveal control exposes state and controlled field', /id="toggle-password-btn"[^>]*aria-label="แสดงรหัสผ่าน"[^>]*aria-controls="login-password"[^>]*aria-pressed="false"/.test(html));
check('Password reveal runtime updates accessible state', main.includes("toggleBtn.setAttribute('aria-pressed'") || html.includes("toggleBtn.setAttribute('aria-pressed'"));
check('Login errors use assertive atomic announcement semantics', /id="login-error"[^>]*role="alert"[^>]*aria-live="assertive"[^>]*aria-atomic="true"/.test(html));
check('Critical system announcements escalate live-region semantics', main.includes("loginAnnouncementTone === 'critical' ? 'alert' : 'status'") && main.includes("loginAnnouncementTone === 'critical' ? 'assertive' : 'polite'"));
check('Primary login controls meet the 44px touch-target contract', html.includes('id="toggle-password-btn"') && html.includes('min-w-11') && /id="login-submit-btn"[\s\S]{0,180}min-h-11/.test(html));
check('Unauthenticated Login receives deterministic initial focus', main.includes("document.getElementById('login-employee-id')?.focus()"));
check('Frontend bootstrap handles both pre- and post-DOMContentLoaded execution', main.includes("document.readyState === 'loading'") && main.includes('void bootstrapFrontend()'));
check('Login landmark visibility is synchronized for assistive technology', main.includes("loginOverlay?.setAttribute('aria-hidden', 'false')") && main.includes("loginOverlay?.setAttribute('aria-hidden', 'true')"));
check('Login honors reduced-motion preferences', /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?#login-overlay \*/.test(css));
check('Large third-party scripts do not parser-block the document', [...html.matchAll(/<script\s+([^>]*src="(?:https?:\/\/|public\/js\/fullcalendar)[^"]+"[^>]*)>/g)].every(match => /\bdefer\b/.test(match[1])));
check('Authenticated route modules are lazy-loaded after Login', main.includes('const lazyPage = (modulePath, exportName)') && main.includes('await import(modulePath)') && !main.includes("import { loadAdminPage } from './pages/admin.js"));
check('Desktop background is not applied below its visible breakpoint', main.includes("window.matchMedia('(min-width: 768px)')") && main.includes('backgroundUrl && _loginBrandMediaQuery.matches'));
check('Login performance revision is cache-addressed', html.includes('login-communications-r9-portrait-preview-johnny-admin-workspace-r1') && html.includes('login-a11y-perf-r1'));
check('Browser validation covers five canonical viewports', fs.existsSync(path.join(root, 'backend', 'scripts', 'login-accessibility-performance-browser-uat.js')));

console.log(`PASS Login accessibility and performance static contract: ${passed} checks`);
