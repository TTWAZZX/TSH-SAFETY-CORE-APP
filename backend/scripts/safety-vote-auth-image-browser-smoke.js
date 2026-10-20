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
        if (route.request().url().endsWith('/3')) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'FILE_NOT_FOUND' }) });
        if (file2 && file2Attempts++ === 0) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'temporary failure' });
        return route.fulfill({ status: 200, contentType: 'image/png', body: png });
    });
    await page.goto('http://localhost/tsh-safety-core/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        document.body.innerHTML = '<div id="ok" data-sv-auth-media><img data-sv-auth-file="1" alt="ภาพหนึ่ง"></div><div id="retry" data-sv-auth-media><img data-sv-auth-file="2" alt="ภาพสอง"></div><div id="missing" data-sv-auth-media><img data-sv-auth-file="3" alt="ภาพสาม"></div>';
        const module = await import('/tsh-safety-core/public/js/utils/safety-vote-auth-image.js?v=browser-smoke');
        await module.hydrateSafetyVoteImages(document);
        window.__hydrateSafetyVoteImages = module.hydrateSafetyVoteImages;
    });
    assert.strictEqual(await page.locator('#ok').getAttribute('data-svp-media-state'), 'loaded');
    assert.strictEqual(await page.locator('#retry').getAttribute('data-svp-media-state'), 'error');
    assert.strictEqual(await page.locator('#retry [data-sv-auth-status]').textContent(), 'โหลดภาพไม่สำเร็จ');
    assert.strictEqual(await page.locator('#missing').getAttribute('data-svp-media-state'), 'unavailable');
    assert.strictEqual(await page.locator('#missing [data-sv-auth-status]').textContent(), 'ไม่พบไฟล์ต้นฉบับ');
    assert.strictEqual(await page.locator('#missing [data-sv-auth-retry]').count(), 0);
    await page.locator('#retry [data-sv-auth-retry]').click();
    await page.waitForFunction(() => document.querySelector('#retry')?.dataset.svpMediaState === 'loaded');
    assert((await page.locator('#ok img').getAttribute('src')).startsWith('blob:'));
    assert((await page.locator('#retry img').getAttribute('src')).startsWith('blob:'));
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => {
        document.body.innerHTML = '<main style="padding:24px"><div class="svp-review"><ul><li class="svp-review__row" id="response-row"><strong class="svp-review__question" id="response-question">กรุณาเลือกผลงานผู้สมัครที่ท่านชื่นชอบที่สุด</strong><span class="svp-submitted-answers" id="response-answers"><span class="svp-submitted-answer svp-submitted-answer--with-image"><button class="svp-submitted-answer__image" type="button"><span style="display:block;width:100%;height:100%;background:#d1fae5"></span></button><span class="svp-submitted-answer__content"><small>คำตอบที่เลือก</small><span class="svp-submitted-answer__label">2. 012686</span></span></span></span></li></ul></div></main>';
    });
    const desktop = await page.evaluate(() => {
        const row = document.querySelector('#response-row').getBoundingClientRect();
        const question = document.querySelector('#response-question').getBoundingClientRect();
        const answers = document.querySelector('#response-answers').getBoundingClientRect();
        const image = document.querySelector('.svp-submitted-answer__image').getBoundingClientRect();
        const content = document.querySelector('.svp-submitted-answer__content').getBoundingClientRect();
        return { row, question, answers, image, content, scrollWidth: document.documentElement.scrollWidth };
    });
    assert(desktop.answers.x > desktop.question.x, 'desktop answer must follow the question column');
    assert(desktop.image.right <= desktop.content.x, 'desktop thumbnail and answer label must not overlap');
    assert(desktop.scrollWidth <= 1366, 'desktop response layout must not overflow horizontally');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
        const question = document.querySelector('#response-question').getBoundingClientRect();
        const answers = document.querySelector('#response-answers').getBoundingClientRect();
        return { question, answers, scrollWidth: document.documentElement.scrollWidth };
    });
    assert(mobile.answers.y >= mobile.question.bottom, 'mobile answer must stack below the question');
    assert(mobile.scrollWidth <= 390, 'mobile response layout must not overflow horizontally');
    assert.deepStrictEqual(errors, []);
    await browser.close();
    console.log('Safety Vote authenticated image browser smoke: PASS (loading, unavailable, retry, balanced responsive response layout)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
