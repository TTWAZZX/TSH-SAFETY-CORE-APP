'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pageIds = [...html.matchAll(/<div id="([a-z0-9-]+-page)" class="page-content h-full hidden"/g)].map(match => match[1]);
const checks = [];

function check(name, condition, detail = '') {
    checks.push({ name, pass: Boolean(condition), ...(detail ? { detail } : {}) });
    assert.ok(condition, `${name}${detail ? `: ${detail}` : ''}`);
}

check('all application pages use the shared page-content shell', pageIds.length === 23, `${pageIds.length}/23`);
check('page identifiers are unique', new Set(pageIds).size === pageIds.length);
check('shared page shell fills available width', css.includes('#main-content > .page-content {') && css.includes('max-width: none;'));
check('active page removes legacy outer margins', css.includes('#main-content > .page-content:not(.hidden)') && css.includes('margin: 0 !important'));
check('direct page root removes width caps', css.includes('> :first-child:not(.fixed):not([role="dialog"])'));
check('legacy max-width wrappers are normalized only at page root', css.includes('> [class*="max-w-"][class*="mx-auto"]'));
check('dialogs remain excluded from root normalization', css.includes(':not([role="dialog"])'));
check('Safety Vote uses the global horizontal gutter', css.includes('#safety-vote-page > :is(.sv-ux-shell') && css.includes('padding-right: 0 !important'));
check('Safety Vote and System Console exceptions are neutralized', css.includes('body[data-active-page="safety-vote"]') && css.includes('body[data-active-page="admin"]'));
check('System Console nested content removes duplicate horizontal padding', css.includes('#admin-page .admin-console-content'));
check('mobile shell keeps the same full-width contract', /@media \(max-width: 767px\)[\s\S]*?#main-content > \.page-content:not\(\.hidden\)/u.test(css));
check('stylesheet cache key includes compact full-width revision', html.includes('surface-r1-fullwidth-r1-compact-r1'));
check('main content uses compact responsive project gutters', html.includes('id="main-content" class="flex-1 overflow-x-hidden overflow-y-auto p-2 md:p-2 relative"'));
check('compact density keeps a bounded desktop gutter', css.includes('--app-page-gutter: .5rem'));
check('compact density keeps a bounded mobile gutter', css.includes('--app-page-gutter-mobile: .5rem'));
check('large page spacing utilities are normalized', css.includes(':is(.space-y-6, .space-y-5)'));
check('large card padding utilities are normalized', css.includes('#main-content > .page-content .p-8'));

console.log(JSON.stringify({
    marker: 'APP_FULLWIDTH_PAGE_SHELL',
    mode: 'static-no-db-no-network',
    pages: pageIds,
    passed: checks.filter(item => item.pass).length,
    total: checks.length,
    checks,
}, null, 2));
