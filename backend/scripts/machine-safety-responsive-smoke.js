'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const page = read('public/js/pages/machine-safety.js');
const css = read('public/style.css');
const main = read('public/js/main.js');
const index = read('index.html');

assert.match(page, /_viewMode\s*=\s*'card';/, 'the module must start in card view on every viewport');
assert.ok(page.includes('class="msd-page-shell '), 'machine page must use its constrained shell');
assert.ok(page.includes('class="msd-filter-grid ds-filter-bar"'), 'filter controls must use the responsive grid');
assert.ok(page.includes('class="msd-mobile-filter-toggle"'), 'mobile advanced filters need a compact toggle');
assert.ok(page.includes('window._msdToggleFilters'), 'mobile filter toggle handler is missing');
assert.ok(page.includes('class="msd-data-table ds-table'), 'list view must use the scoped data table');
assert.ok(page.includes('class="msd-card-grid '), 'card view must use the responsive card grid');
assert.ok(page.includes('class="msd-pagination '), 'pagination must use the compact responsive layout');

for (const selector of [
    '#machine-safety-page',
    '.msd-page-shell',
    '.msd-filter-grid',
    '.msd-mobile-filter-toggle',
    '.msd-results-scroll',
    '.msd-data-table',
    '@media (max-width: 767px)',
    '@media (max-width: 479px)',
]) {
    assert.ok(css.includes(selector), `missing responsive CSS contract: ${selector}`);
}

assert.match(css, /\.msd-page-shell\s*\{[\s\S]*?max-width:\s*1440px;/);
assert.match(css, /\.msd-results-scroll\s*\{[\s\S]*?overflow-x:\s*auto;/);
assert.match(css, /\.msd-data-table\s*\{[\s\S]*?min-width:\s*1720px;/);
assert.match(css, /@media \(max-width: 479px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);

const releaseMarker = '20260723-machine-safety-responsive';
assert.ok(main.includes(`machine-safety.js?v=${releaseMarker}`), 'main module cache marker is stale');
assert.ok(index.includes(`public/style.css?v=${releaseMarker}`), 'stylesheet cache marker is stale');
assert.ok(index.includes(`public/js/main.js?v=${releaseMarker}`), 'main script cache marker is stale');

for (const [name, source] of Object.entries({ page, css, main, index })) {
    assert.ok(!source.includes('\uFFFD'), `${name} contains a UTF-8 replacement character`);
}

console.log('PASS Machine & Device Safety responsive source contract');
