'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const viewports = [
    { name: '320x568', width: 320, height: 568 },
    { name: '390x844', width: 390, height: 844 },
    { name: '430x932', width: 430, height: 932 }
];

const image = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d1fae5"/><path d="M0 300L220 120l120 100 80-70 220 150" fill="none" stroke="#047857" stroke-width="24"/></svg>';
const imageUrl = `data:image/svg+xml;base64,${Buffer.from(image).toString('base64')}`;
const option = (id, label, checked = false) => `<article class="svp-option"><div class="sv-work-gallery sv-work-gallery--candidate"><figure class="sv-work-gallery__item is-cover"><button type="button" class="svp-gallery-trigger" data-svp-media-state="loaded" aria-label="เปิดภาพ ${label}"><img src="${imageUrl}" alt="${label}"></button><figcaption>ภาพแนวคิด ${label}</figcaption></figure></div><label><input type="radio" name="choice" value="${id}" ${checked ? 'checked' : ''}><span><strong>${label}</strong><small>คำอธิบายแนวคิดสำหรับประกอบการตัดสินใจเลือกคำตอบ</small></span></label></article>`;

const markup = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${css}</style></head><body data-active-page="safety-vote"><main id="main-content"><div class="svp-shell svp-shell--detail" data-sv-participation="choice-review-test"><form class="svp-form"><fieldset class="svp-question"><legend>1. กรุณาเลือกผลงานผู้สมัครที่ท่านชื่นชอบที่สุด</legend><button type="button" class="svp-gallery-trigger svp-question-image" aria-label="ขยายภาพคำถาม"><img src="${imageUrl}" alt="ภาพประกอบคำถาม"></button><p>แตะภาพเพื่อดูขนาดใหญ่ หรือแตะชื่อเพื่อเลือก</p><small>จำเป็น · เลือก 1 รายการ</small><div class="svp-options">${option(1, 'Family Journey', true)}${option(2, 'The Road Home')}</div></fieldset></form><section class="svp-review"><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2>ตรวจคำตอบของคุณอีกครั้ง</h2><ul><li><strong>ผลงานที่เลือก</strong><span>Family Journey</span></li><li><strong>เหตุผลประกอบ</strong><span>ส่งเสริมความปลอดภัยในการเดินทาง</span></li></ul><div class="svp-immutable-warning"><strong>เมื่อยืนยันแล้วจะแก้ไขไม่ได้</strong><span>ระบบจะบันทึกการเข้าร่วมตามกติกาและสิทธิ์เดิมของกิจกรรม</span></div></section></div></main></body></html>`;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        for (const viewport of viewports) {
            const page = await browser.newPage({ viewport });
            await page.setContent(markup, { waitUntil: 'load' });
            await page.locator('.svp-option').nth(1).locator('label').click();
            const result = await page.evaluate(() => {
                const rect = selector => document.querySelector(selector).getBoundingClientRect();
                const options = [...document.querySelectorAll('.svp-option')].map(node => node.getBoundingClientRect());
                const input = document.querySelectorAll('.svp-option input')[1];
                const indicator = getComputedStyle(input.nextElementSibling, '::before');
                const selectedBadge = getComputedStyle(document.querySelectorAll('.svp-option')[1], '::after');
                const reviewRows = [...document.querySelectorAll('.svp-review li')].map(node => node.getBoundingClientRect());
                return {
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                    questionImageHeight: rect('.svp-question-image img').height,
                    imageHeight: rect('.svp-option .svp-gallery-trigger img').height,
                    optionMaxHeight: Math.max(...options.map(item => item.height)),
                    inputHitWidth: input.getBoundingClientRect().width,
                    inputHitHeight: input.getBoundingClientRect().height,
                    indicatorWidth: parseFloat(indicator.width),
                    secondSelected: input.checked,
                    selectedBadge: selectedBadge.content.replace(/["']/g, ''),
                    reviewRowMaxHeight: Math.max(...reviewRows.map(item => item.height)),
                    warningHeight: rect('.svp-immutable-warning').height,
                    labelTouch: Math.min(rect('.svp-option > label').width, rect('.svp-option > label').height)
                };
            });
            assert.strictEqual(result.overflow, false, `${viewport.name}: horizontal overflow`);
            assert(result.questionImageHeight <= 177, `${viewport.name}: question image ${result.questionImageHeight}px`);
            assert(result.imageHeight <= 133, `${viewport.name}: option image ${result.imageHeight}px`);
            assert(result.optionMaxHeight <= 215, `${viewport.name}: option card ${result.optionMaxHeight}px`);
            assert(result.inputHitWidth >= 44 && result.inputHitHeight >= 44, `${viewport.name}: input hit area below 44px`);
            assert(result.indicatorWidth <= 20, `${viewport.name}: visible choice indicator ${result.indicatorWidth}px`);
            assert.strictEqual(result.secondSelected, true, `${viewport.name}: label click did not select choice`);
            assert.strictEqual(result.selectedBadge, 'เลือกแล้ว', `${viewport.name}: selected state is not visible`);
            assert(result.reviewRowMaxHeight <= 70, `${viewport.name}: review row ${result.reviewRowMaxHeight}px`);
            assert(result.warningHeight <= 75, `${viewport.name}: immutable warning ${result.warningHeight}px`);
            assert(result.labelTouch >= 44, `${viewport.name}: choice label target below 44px`);
            results.push({ viewport: viewport.name, ...result });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`Safety Vote mobile choice/media/review browser contract: PASS (${results.length} viewports)`);
    console.log(JSON.stringify(results));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
