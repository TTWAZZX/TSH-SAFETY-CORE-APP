'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
    'function accessibilityStyles()',
    'min-height:44px',
    'font-size:16px',
    'function enhanceAccessibility()',
    "tab.setAttribute('role', 'tab')",
    "tab.setAttribute('aria-selected'",
    "panel.setAttribute('role', 'tabpanel')",
    "['ArrowLeft','ArrowRight','Home','End']",
    "region.classList.add('bbs-scroll-region')",
    "th.setAttribute('scope', 'col')",
    'function mountBbsDialog(overlay, label, returnFocus',
    "panel?.setAttribute('aria-modal', 'true')",
    "event.key === 'Escape'",
    "event.key !== 'Tab'",
    "previous?.focus?.({ preventScroll:true })",
    "document.body.dataset.mobileOverlayActive = '1'",
    "overlay.dataset.mobileOverlayDialog = 'true'",
    'function focusSelectorFor(element)',
    'const focusSelector = options.focusSelector || focusSelectorFor(document.activeElement)',
    'function focusValidationTarget(selector)',
    'role="progressbar"',
    'aria-pressed=',
    '<fieldset class=',
    'data-bbs-sticky-actions',
    'role="status" aria-live="polite"'
]) {
    assert.ok(ui.includes(marker), `Phase 10C-2 UI missing ${marker}`);
}

assert.match(main, /bbs-smart-card\.js\?v=(?:20260831-bbs-phase10c[23]|20260901-bbs-phase10(?:b4|d[1-5]))/);
assert.match(html, /main\.js\?v=(?:20260831-bbs-phase10c[23]-forklift-renewal-ky-chunk-r1|20260901-bbs-phase10(?:b4|d[1-5])|20260902-bbs-auto-reference-r1)/);
assert.ok(main.includes("document.querySelector('[data-mobile-overlay-dialog=\"true\"]')"), 'Shared mobile viewport logic must recognize BBS dialogs');
assert.doesNotMatch(ui, /window\.scrollTo\(\{top:0,behavior:'smooth'\}\)/, 'BBS step navigation must scroll the real app container');

const mountStart = ui.indexOf('function mountBbsDialog(overlay, label, returnFocus');
const mountEnd = ui.indexOf('function shell()', mountStart);
const mountSource = ui.slice(mountStart, mountEnd);
assert.ok(mountSource.includes("document.body.style.overflow = 'hidden'"), 'Dialog must lock background scrolling');
assert.ok(mountSource.includes("document.body.style.overflow = previousOverflow"), 'Dialog must restore background scrolling');
assert.ok(mountSource.includes("button.addEventListener('click', close)"), 'Dialog close control must use the shared close path');

const validationStart = ui.indexOf('function validateClient()');
const validationEnd = ui.indexOf('async function submitObservation()', validationStart);
const validationSource = ui.slice(validationStart, validationEnd);
for (const marker of ['data-answer-card', 'bbs-remark-', 'bbs-action-', 'data-bbs-upload-trigger']) {
    assert.ok(validationSource.includes(marker), `Validation focus path missing ${marker}`);
}

console.log('BBS Phase 10C-2 mobile/accessibility contract: PASS');
