'use strict';
const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    let file2Attempts = 0;
    await page.route('http://localhost:5000/api/safety-vote/files/**', async route => {
        const file2 = route.request().url().endsWith('/2');
        if (file2 && file2Attempts++ === 0) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'temporary failure' });
        return route.fulfill({ status: 200, contentType: 'image/png', body: png });
    });
    await page.goto('http://localhost/tsh-safety-core/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        document.body.innerHTML = '<div id="ok" data-sv-auth-media><img data-sv-auth-file="1" alt="ภาพหนึ่ง"></div><div id="retry" data-sv-auth-media><img data-sv-auth-file="2" alt="ภาพสอง"></div>';
        const module = await import('/tsh-safety-core/public/js/utils/safety-vote-auth-image.js?v=browser-smoke');
        await module.hydrateSafetyVoteImages(document);
        window.__hydrateSafetyVoteImages = module.hydrateSafetyVoteImages;
    });
    assert.strictEqual(await page.locator('#ok').getAttribute('data-svp-media-state'), 'loaded');
    assert.strictEqual(await page.locator('#retry').getAttribute('data-svp-media-state'), 'error');
    assert.strictEqual(await page.locator('#retry [data-sv-auth-status]').textContent(), 'โหลดภาพไม่สำเร็จ');
    await page.locator('#retry [data-sv-auth-retry]').click();
    await page.waitForFunction(() => document.querySelector('#retry')?.dataset.svpMediaState === 'loaded');
    assert((await page.locator('#ok img').getAttribute('src')).startsWith('blob:'));
    assert((await page.locator('#retry img').getAttribute('src')).startsWith('blob:'));
    assert.deepStrictEqual(errors, []);
    await browser.close();
    console.log('Safety Vote authenticated image browser smoke: PASS (loading, failure, retry, fade-ready blob)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
