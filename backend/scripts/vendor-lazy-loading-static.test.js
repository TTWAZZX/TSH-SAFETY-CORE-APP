'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public', 'js', 'utils', 'vendor-loader.js'), 'utf8');
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert(condition, message); };

for (const asset of [
    'xlsx.full.min.js',
    'chart.js',
    'chartjs-plugin-datalabels',
    'html2canvas.min.js',
    'jspdf.umd.min.js',
    'qrcode.min.js',
    'public/js/fullcalendar.js',
    'flatpickr.min.css',
    'npmcdn.com/flatpickr',
]) {
    check(!index.includes(asset), `${asset} must not block Login bootstrap`);
    check(loader.includes(asset), `${asset} must remain available through the route loader`);
}

for (const page of ['dashboard', 'admin', 'policy', 'committee', 'kpi', 'patrol', 'cccf', 'yokoten', 'machine-safety', 'forklift', 'ojt', 'training', 'accident', 'safety-culture', 'bbs-smart-card', 'hiyari', 'ky', 'fourm', 'search']) {
    check(loader.includes(`${page.includes('-') ? `'${page}'` : page}: [`), `Vendor contract missing for ${page}`);
}

check(loader.indexOf("await loadScript('chart');") < loader.indexOf("await loadScript('chartLabels');"), 'Chart must load before its labels plugin');
check(loader.indexOf("loadScript('flatpickr')") < loader.indexOf("await loadScript('flatpickrTh');"), 'Flatpickr core must load before Thai locale');
check(loader.includes('const loaded = new Map();'), 'Vendor requests must be deduplicated');
check(loader.includes("script.dataset.vendor = key") && loader.includes("link.dataset.vendor = key"), 'Lazy assets must be observable in Browser UAT');
check(loader.includes('export async function loadVendor(name)'), 'Feature-level vendor loading must remain available');
check(loader.includes('loaded.delete(key)') && loader.includes('script.remove()') && loader.includes('link.remove()'), 'Failed vendor requests must be retryable');

console.log(`Route vendor lazy-loading static contract: PASS (${assertions} assertions)`);
