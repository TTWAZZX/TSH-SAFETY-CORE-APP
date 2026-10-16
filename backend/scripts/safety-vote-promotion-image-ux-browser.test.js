'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const candidates = [
    process.env.SAFETY_VOTE_BROWSER,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = candidates.find(candidate => fs.existsSync(candidate));
const image = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#d1fae5"/><text x="800" y="420" text-anchor="middle" font-size="96">FULL BANNER</text></svg>');

(async () => {
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
            const page = await browser.newPage({ viewport });
            await page.setContent(`<style>${css}</style><main><section class="svp-promotion"><article data-svp-media-state="loading" aria-busy="true"><span class="svp-auth-media__status"><span></span><span>กำลังโหลดภาพ</span></span><img class="svp-auth-image" src="${image}" alt="banner"><div class="svp-promotion__shade"><h2>กิจกรรม</h2></div></article></section><figure class="svp-preopen-cover" data-svp-media-state="loading" aria-busy="true"><span class="svp-auth-media__status"><span></span><span>กำลังโหลดภาพ</span></span><img class="svp-auth-image" src="${image}" alt="detail"><figcaption>กิจกรรม</figcaption></figure></main>`);
            await page.locator('img').first().evaluate(node => node.decode());
            const loading = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                fits: [...document.querySelectorAll('.svp-promotion img,.svp-preopen-cover img')].every(node => getComputedStyle(node).objectFit === 'contain'),
                hiddenImages: [...document.querySelectorAll('.svp-auth-image')].every(node => getComputedStyle(node).opacity === '0'),
                loadingVisible: [...document.querySelectorAll('.svp-auth-media__status')].every(node => getComputedStyle(node).visibility !== 'hidden')
            }));
            assert.deepStrictEqual(loading, { overflow: false, fits: true, hiddenImages: true, loadingVisible: true });
            await page.locator('[data-svp-media-state]').evaluateAll(nodes => nodes.forEach(node => { node.setAttribute('data-svp-media-state', 'loaded'); node.setAttribute('aria-busy', 'false'); }));
            await page.waitForFunction(() => [...document.querySelectorAll('.svp-auth-image')].every(node => getComputedStyle(node).opacity === '1') && [...document.querySelectorAll('.svp-auth-media__status')].every(node => getComputedStyle(node).visibility === 'hidden'), null, { timeout: 2500 });
            const loaded = await page.evaluate(() => ({
                imagesVisible: [...document.querySelectorAll('.svp-auth-image')].every(node => getComputedStyle(node).opacity === '1'),
                placeholdersHidden: [...document.querySelectorAll('.svp-auth-media__status')].every(node => getComputedStyle(node).visibility === 'hidden'),
                busyCleared: [...document.querySelectorAll('[data-svp-media-state]')].every(node => node.getAttribute('aria-busy') === 'false'),
                diagnostics: [...document.querySelectorAll('[data-svp-media-state]')].map(node => ({ state: node.getAttribute('data-svp-media-state'), imageOpacity: getComputedStyle(node.querySelector('.svp-auth-image')).opacity, statusVisibility: getComputedStyle(node.querySelector('.svp-auth-media__status')).visibility }))
            }));
            assert.strictEqual(loaded.imagesVisible, true, JSON.stringify(loaded.diagnostics));
            assert.strictEqual(loaded.placeholdersHidden, true, JSON.stringify(loaded.diagnostics));
            assert.strictEqual(loaded.busyCleared, true);
            await page.close();
        }
        console.log('Safety Vote promotion image UX Browser contract: PASS (390x844, 1366x768)');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
