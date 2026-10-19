'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const app = require('../server');
const appUrl = process.env.APP_BOOTSTRAP_UAT_URL || 'http://127.0.0.1/tsh-safety-core/index.html';
const evidenceDir = path.join(__dirname, '..', '..', 'backups', 'local', `vendor-lazy-loading-${new Date().toISOString().replace(/[:.]/g, '')}`);

async function main() {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
        const apiBase = `http://127.0.0.1:${server.address().port}/api`;
        await page.addInitScript(base => { window.API_BASE = base; localStorage.clear(); sessionStorage.clear(); }, apiBase);
        await page.goto(`${appUrl}?vendor_lazy_uat=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.documentElement.dataset.appBootstrap === 'ready', null, { timeout: 60000 });
        assert.deepEqual(await page.locator('[data-vendor]').count(), 0, 'Login loaded route-only vendors');

        await page.evaluate(async () => {
            const loader = await import('./public/js/utils/vendor-loader.js?browser-uat=1');
            await loader.loadVendorsForPage('kpi');
        });
        const kpi = await page.evaluate(() => ({
            assets: [...document.querySelectorAll('[data-vendor]')].map(node => node.dataset.vendor).sort(),
            globals: {
                Chart: typeof window.Chart,
                ChartDataLabels: typeof window.ChartDataLabels,
                XLSX: typeof window.XLSX,
                html2canvas: typeof window.html2canvas,
                jspdf: typeof window.jspdf,
                flatpickr: typeof window.flatpickr,
            },
        }));
        for (const [name, type] of Object.entries(kpi.globals)) assert.notEqual(type, 'undefined', `${name} did not load for KPI`);
        assert(kpi.assets.includes('flatpickrCss') && kpi.assets.includes('flatpickrTh'), 'Flatpickr CSS/Thai locale missing');

        await page.evaluate(async () => {
            const loader = await import('./public/js/utils/vendor-loader.js?browser-uat=1');
            await loader.loadVendorsForPage('admin');
        });
        const admin = await page.evaluate(() => ({
            assets: [...document.querySelectorAll('[data-vendor]')].map(node => node.dataset.vendor).sort(),
            fullcalendar: typeof window.FullCalendar,
            qrcode: typeof window.qrcode,
        }));
        assert.notEqual(admin.fullcalendar, 'undefined', 'FullCalendar did not load for Admin');
        assert.equal(admin.qrcode, 'function', 'QR generator did not load for Admin');
        assert.equal(admin.assets.filter(name => name === 'xlsx').length, 1, 'Vendor deduplication failed');

        const report = { contract: '2026-10-19-route-vendors-r1', loginVendorCount: 0, kpi, admin };
        fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Route vendor Browser UAT: PASS (${admin.assets.length} unique assets)`);
        console.log(`Evidence: ${evidenceDir}`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
