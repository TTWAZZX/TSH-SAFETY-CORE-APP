'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const marker = 'Safety Vote typography alignment';
const start = css.indexOf(marker);
assert(start >= 0, 'Safety Vote typography contract is missing');

const endMarker = 'Core surface standard — final cascade enforcement';
const end = css.indexOf(endMarker, start);
const contract = css.slice(start, end >= 0 ? end : undefined);
const requiredScopes = [
    '.sv-ux-shell',
    '.svw-shell',
    '.svp-shell',
    '.svj-shell',
    '.svo-shell',
    '.svr-shell',
    '.svg-shell',
    '.sv-planning',
    '.sv-dialog-layer'
];

for (const scope of requiredScopes) {
    assert(contract.includes(scope), `Typography scope is missing: ${scope}`);
}

assert(contract.includes("font-family: 'Kanit', sans-serif"), 'Safety Vote must inherit the core Kanit typeface');
assert(contract.includes('font-size: .875rem'), 'Safety Vote body text must use the core 14px scale');
assert(contract.includes('font-weight: 400'), 'Body copy weight must be regular');
assert(contract.includes('font-weight: 600'), 'Controls and subheadings must use semibold weight');
assert(contract.includes('font-weight: 700'), 'Primary headings must use bold weight');
assert(contract.includes(':is(button, input, select, textarea)'), 'Form controls must be typography-aligned');
assert(contract.includes('font: inherit'), 'Form controls must inherit the Safety Vote typography contract');
assert(contract.includes('@media (max-width: 600px)'), 'Mobile heading scale is missing');
assert(!contract.includes('!important'), 'Typography alignment must not rely on important overrides');
assert(html.includes('public/style.css?v=20261010-safety-vote-ux8-r1-typography-r1'), 'Typography cache key is missing');
assert(css.includes('min-height: 44px'), 'Existing accessible touch target contract must remain present');

console.log(`Safety Vote typography alignment static contract: PASS (${requiredScopes.length + 10} assertions)`);
