'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const evidence = path.join(root, 'backups', 'local', `safety-vote-promotion-carousel-${Date.now()}`);
const candidates = [
    process.env.SAFETY_VOTE_BROWSER,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = candidates.find(candidate => fs.existsSync(candidate));
const image = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#d1fae5"/><text x="800" y="420" text-anchor="middle" font-size="96">FULL BANNER</text></svg>');

(async () => {
    fs.mkdirSync(evidence, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
            const page = await browser.newPage({ viewport });
            await page.setContent(`<style>${css}</style><main><section class="svp-promotion"><div class="svp-promotion__viewport"><article class="svp-promotion__slide is-active" data-svp-promotion-slide="0"><div class="svp-promotion__media" data-sv-auth-media data-svp-media-state="loading" aria-busy="true"><img class="svp-promotion__backdrop" src="${image}" alt=""><span class="svp-auth-media__status"><span></span><span>กำลังโหลดภาพ</span></span><img class="svp-auth-image svp-promotion__foreground" src="${image}" alt="banner"></div><div class="svp-promotion__shade"><h2>กิจกรรม</h2></div></article></div><div class="svp-promotion__controls"><button class="sv-icon-button">←</button><div class="svp-promotion__dots"><button aria-current="true"></button><button aria-current="false"></button></div><span>1/2</span><button class="sv-icon-button">→</button></div></section><figure class="svp-preopen-cover" data-svp-media-state="loading" aria-busy="true"><span class="svp-auth-media__status"><span></span><span>กำลังโหลดภาพ</span></span><img class="svp-auth-image" src="${image}" alt="detail"><figcaption>กิจกรรม</figcaption></figure></main>`);
            await page.locator('img').first().evaluate(node => node.decode());
            const loading = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                foregroundFits: getComputedStyle(document.querySelector('.svp-promotion__foreground')).objectFit === 'contain',
                backdropFills: getComputedStyle(document.querySelector('.svp-promotion__backdrop')).objectFit === 'cover',
                detailFits: getComputedStyle(document.querySelector('.svp-preopen-cover img')).objectFit === 'contain',
                controlsMeetTouchTarget: [...document.querySelectorAll('.svp-promotion__controls button')].every(node => { const rect = node.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; }),
                bannerImageHasArea: (() => { const rect = document.querySelector('.svp-promotion__foreground').getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })(),
                hiddenImages: [...document.querySelectorAll('.svp-auth-image')].every(node => getComputedStyle(node).opacity === '0'),
                loadingVisible: [...document.querySelectorAll('.svp-auth-media__status')].every(node => getComputedStyle(node).visibility !== 'hidden')
            }));
            assert.deepStrictEqual(loading, { overflow: false, foregroundFits: true, backdropFills: true, detailFits: true, controlsMeetTouchTarget: true, bannerImageHasArea: true, hiddenImages: true, loadingVisible: true });
            await page.locator('[data-svp-media-state]').evaluateAll(nodes => nodes.forEach(node => { node.setAttribute('data-svp-media-state', 'loaded'); node.setAttribute('aria-busy', 'false'); }));
            await page.waitForFunction(() => [...document.querySelectorAll('.svp-auth-image')].every(node => getComputedStyle(node).opacity === '1') && [...document.querySelectorAll('.svp-auth-media__status')].every(node => getComputedStyle(node).visibility === 'hidden'), null, { timeout: 5000 });
            const loaded = await page.evaluate(() => ({
                imagesVisible: [...document.querySelectorAll('.svp-auth-image')].every(node => getComputedStyle(node).opacity === '1'),
                placeholdersHidden: [...document.querySelectorAll('.svp-auth-media__status')].every(node => getComputedStyle(node).visibility === 'hidden'),
                busyCleared: [...document.querySelectorAll('[data-svp-media-state]')].every(node => node.getAttribute('aria-busy') === 'false'),
                diagnostics: [...document.querySelectorAll('[data-svp-media-state]')].map(node => ({ state: node.getAttribute('data-svp-media-state'), imageOpacity: getComputedStyle(node.querySelector('.svp-auth-image')).opacity, statusVisibility: getComputedStyle(node.querySelector('.svp-auth-media__status')).visibility }))
            }));
            assert.strictEqual(loaded.imagesVisible, true, JSON.stringify(loaded.diagnostics));
            assert.strictEqual(loaded.placeholdersHidden, true, JSON.stringify(loaded.diagnostics));
            assert.strictEqual(loaded.busyCleared, true);
            await page.screenshot({ path: path.join(evidence, `promotion-${viewport.width}x${viewport.height}.png`), fullPage: true });
            await page.close();
        }
        console.log(`Safety Vote promotion image UX Browser contract: PASS (390x844, 1366x768, ${evidence})`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
