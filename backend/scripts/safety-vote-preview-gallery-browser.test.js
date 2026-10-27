'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const downloadedChrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (fs.existsSync(downloadedChrome) ? downloadedChrome : undefined);

(async () => {
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
            const page = await browser.newPage({ viewport });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent(`<main id="root"><button id="before">ก่อนเปิด</button><div id="gallery-root"><button data-sv-image-gallery data-sv-gallery-group="q1" data-sv-gallery-label="ผู้สมัคร 1"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60'%3E%3Crect width='80' height='60' fill='red'/%3E%3C/svg%3E" alt="ผู้สมัคร 1"></button><button data-sv-image-gallery data-sv-gallery-group="q1" data-sv-gallery-label="ผู้สมัคร 2"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60'%3E%3Crect width='80' height='60' fill='green'/%3E%3C/svg%3E" alt="ผู้สมัคร 2"></button><button data-sv-image-gallery data-sv-gallery-group="q1" data-sv-gallery-label="ผู้สมัคร 3"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60'%3E%3Crect width='80' height='60' fill='blue'/%3E%3C/svg%3E" alt="ผู้สมัคร 3"></button><button data-sv-image-gallery data-sv-gallery-group="q2" data-sv-gallery-label="คนละคำถาม"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60'%3E%3C/svg%3E" alt="คนละคำถาม"></button></div></main>`);
            await page.addStyleTag({ path: path.join(root, 'public', 'style.css') });
            const source = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'safety-vote-image-gallery.js'), 'utf8').replaceAll('export ', '');
            await page.addScriptTag({ content: `${source}\nwindow.bindSafetyVoteImageGallery = bindSafetyVoteImageGallery;` });
            await page.evaluate(() => window.bindSafetyVoteImageGallery(document.querySelector('#gallery-root')));

            const second = page.locator('[data-sv-gallery-group="q1"]').nth(1);
            await second.focus(); await second.click();
            assert.strictEqual(await page.locator('#sv-gallery-title').textContent(), 'ผู้สมัคร 2');
            assert.strictEqual(await page.locator('#sv-gallery-position').textContent(), 'รูปที่ 2 จาก 3');
            const layout = await page.evaluate(() => {
                const nav = document.querySelector('[data-sv-gallery-next]').getBoundingClientRect();
                const dialog = document.querySelector('[data-sv-image-gallery-dialog] section').getBoundingClientRect();
                return {
                    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
                    navWidth: nav.width,
                    navHeight: nav.height,
                    dialogInsideViewport: dialog.left >= 0 && dialog.right <= innerWidth
                };
            });
            assert.strictEqual(layout.noHorizontalOverflow, true);
            assert.strictEqual(layout.dialogInsideViewport, true);
            assert.ok(layout.navWidth >= 44 && layout.navHeight >= 44, 'gallery navigation targets must be at least 44px');
            await page.keyboard.press('ArrowRight');
            assert.strictEqual(await page.locator('#sv-gallery-position').textContent(), 'รูปที่ 3 จาก 3');
            await page.keyboard.press('ArrowLeft');
            assert.strictEqual(await page.locator('#sv-gallery-position').textContent(), 'รูปที่ 2 จาก 3');
            await page.locator('[data-sv-gallery-stage]').evaluate(stage => {
                const touch = (clientX, clientY) => new Touch({ identifier: 1, target: stage, clientX, clientY });
                stage.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, changedTouches: [touch(250, 100)] }));
                stage.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [touch(100, 105)] }));
            });
            assert.strictEqual(await page.locator('#sv-gallery-position').textContent(), 'รูปที่ 3 จาก 3');
            await page.keyboard.press('Escape');
            assert.strictEqual(await page.locator('[data-sv-image-gallery-dialog]').count(), 0);
            assert.strictEqual(await second.evaluate(element => document.activeElement === element), true);

            const single = page.locator('[data-sv-gallery-group="q2"]');
            await single.click();
            const singleLayout = await page.evaluate(() => {
                const stage = document.querySelector('[data-sv-gallery-stage]').getBoundingClientRect();
                const image = document.querySelector('[data-sv-gallery-stage] img').getBoundingClientRect();
                return {
                    single: document.querySelector('[data-sv-gallery-stage]').classList.contains('is-single'),
                    controlsHidden: [...document.querySelectorAll('.svp-gallery__nav')].every(node => node.hidden),
                    imageWidthRatio: image.width / stage.width,
                    centered: Math.abs((image.left + image.width / 2) - (stage.left + stage.width / 2)) < 2
                };
            });
            assert.strictEqual(singleLayout.single, true);
            assert.strictEqual(singleLayout.controlsHidden, true);
            assert.ok(singleLayout.imageWidthRatio > .8, 'single gallery image must use the large-image stage');
            assert.strictEqual(singleLayout.centered, true);
            await page.keyboard.press('Escape');
            assert.deepStrictEqual(errors, []);
            await page.close();
        }
        console.log(`Safety Vote preview/gallery Browser contract: PASS (keyboard, swipe, focus restore; ${os.platform()})`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
