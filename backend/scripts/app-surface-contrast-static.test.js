'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const checks = [];

function check(name, condition) {
    checks.push({ name, pass: Boolean(condition) });
    assert.ok(condition, name);
}

check('workspace uses the shared surface class', index.includes('class="app-workspace flex-1 flex flex-col overflow-hidden"'));
check('obsolete pale inline workspace gradient is removed', !index.includes('linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 60%, #f8fafc 100%)'));
check('cache key includes the surface revision', index.includes('surface-r1'));
check('shared canvas token is present', css.includes('--app-canvas: #e3ece8'));
check('shared deep canvas token is present', css.includes('--app-canvas-deep: #d8e6e0'));
check('shared border token is present', css.includes('--app-border: #c2d1cb'));
check('shared strong border token is present', css.includes('--app-border-strong: #a9bdb4'));
check('core Tailwind slate borders are normalized', css.includes('#main-content .border-slate-100') && css.includes('#main-content .border-slate-200'));
check('core neutral inset surfaces are normalized', css.includes('#main-content .bg-slate-50'));
check('design-system primitives use the shared surface hierarchy', css.includes('.ds-surface') && css.includes('.ds-table-wrap'));
check('Safety Vote shells inherit the application canvas', /:is\(\.sv-ux-shell,[\s\S]*?\.sv-planning\)\s*\{\s*background:\s*transparent;/u.test(css));
check('Safety Vote cards use shared borders and shadows', css.includes('.sv-campaign-card') && css.includes('.svw-card') && css.includes('.svo-panel') && css.includes('box-shadow: var(--app-shadow-card)'));
check('surface enforcement follows module-specific styles', css.lastIndexOf('Core surface standard — final cascade enforcement') > css.lastIndexOf('Safety Vote typography alignment'));
check('status-specific semantic colors remain defined', css.includes('.sv-state-panel--warning') && css.includes('.sv-state-panel--denied') && css.includes('.sv-status-badge--open'));
check('mobile canvas remains explicitly standardized', /@media \(max-width: 767px\)[\s\S]*?--app-canvas: #e1ebe6/u.test(css));

console.log(JSON.stringify({
    marker: 'APP_SURFACE_CONTRAST_STANDARD',
    mode: 'static-no-db-no-network',
    passed: checks.filter(item => item.pass).length,
    total: checks.length,
    checks,
}, null, 2));
