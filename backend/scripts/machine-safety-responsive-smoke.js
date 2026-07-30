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

assert.ok(page.includes("return window.matchMedia?.('(max-width: 767px)').matches ? 'card' : 'list';"), 'desktop/mobile default view contract is missing');
assert.ok(page.includes('class="msd-page-shell '), 'machine page must use its full-width shell');
assert.ok(page.includes('class="msd-filter-grid ds-filter-bar"'), 'filter controls must use the responsive grid');
assert.ok(page.includes('class="msd-mobile-filter-toggle"'), 'mobile advanced filters need a compact toggle');
assert.ok(page.includes('window._msdToggleFilters'), 'mobile filter toggle handler is missing');
assert.ok(page.includes('class="msd-data-table ds-table'), 'list view must use the scoped data table');
assert.ok(page.includes('class="msd-clickable-row '), 'list rows must expose the detail interaction');
assert.ok(page.includes('tabindex="0" role="button"'), 'list rows must be keyboard accessible');
assert.ok(page.includes("event.key==='Enter'||event.key===' '"), 'list row keyboard activation is missing');
assert.ok(page.includes('onclick="window._msdOpenDetail(${m.id}'), 'list rows must open the complete detail modal');
assert.ok(page.includes('max-w-4xl'), 'detail modal must have room for the complete machine record');
assert.ok(page.includes('window._msdEditFromDetail'), 'Admin edit must remain available in the detail modal');
assert.ok(page.includes('window._msdDeleteFromDetail'), 'Admin delete must remain available in the detail modal');
assert.ok(page.includes('เครื่องจักร</th>'), 'compact Machine column is missing');
assert.ok(page.includes('แผนก / พื้นที่'), 'compact Department/Area column is missing');
assert.ok(page.includes('ภาพรวมความพร้อม'), 'combined readiness column is missing');
assert.ok(page.includes('class="msd-card-grid '), 'card view must use the responsive card grid');
assert.ok(page.includes('class="msd-pagination '), 'pagination must use the compact responsive layout');

for (const selector of [
    '#machine-safety-page',
    '.msd-page-shell',
    '.msd-filter-grid',
    '.msd-mobile-filter-toggle',
    '.msd-results-scroll',
    '.msd-data-table',
    '.msd-clickable-row',
    '@media (max-width: 767px)',
    '@media (max-width: 479px)',
]) {
    assert.ok(css.includes(selector), `missing responsive CSS contract: ${selector}`);
}

assert.match(css, /\.msd-page-shell\s*\{[\s\S]*?max-width:\s*none;/);
assert.match(css, /\.msd-results-scroll\s*\{[\s\S]*?overflow-x:\s*auto;/);
assert.match(css, /\.msd-data-table\s*\{[\s\S]*?min-width:\s*760px;/);
assert.match(css, /\.msd-clickable-row:hover\s*\{[\s\S]*?background:/);
assert.match(css, /\.msd-clickable-row:focus-visible\s*\{[\s\S]*?outline:/);
assert.match(css, /@media \(max-width: 479px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);

const releaseMarker = '20260724-machine-safety-row-detail';
assert.ok(main.includes(`machine-safety.js?v=${releaseMarker}`), 'main module cache marker is stale');
assert.ok(index.includes(`public/style.css?v=${releaseMarker}`), 'stylesheet cache marker is stale');
assert.ok(index.includes(`public/js/main.js?v=${releaseMarker}`), 'main script cache marker is stale');

for (const [name, source] of Object.entries({ page, css, main, index })) {
    assert.ok(!source.includes('\uFFFD'), `${name} contains a UTF-8 replacement character`);
}

console.log('PASS Machine & Device Safety row-detail responsive source contract');
