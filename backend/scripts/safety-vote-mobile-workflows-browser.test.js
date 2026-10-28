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
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e0e7ff"/><circle cx="320" cy="180" r="110" fill="#4f46e5"/></svg>';
const imageUrl = `data:image/svg+xml;base64,${Buffer.from(image).toString('base64')}`;

const markup = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${css}</style></head><body data-active-page="safety-vote"><main id="main-content">
<div class="svp-shell svp-shell--detail" data-sv-participation="submission-test"><form class="svp-form"><section class="svp-workflow-requirements"><h2>ข้อกำหนดจากผู้จัดกิจกรรม</h2><ul><li><strong>ส่งผลงานเกี่ยวกับ Road Safety</strong><span>ระบุชื่อและรายละเอียดให้ครบถ้วน</span></li></ul></section><section class="svp-question"><h2>ข้อมูลผลงาน</h2><label class="svp-field"><span>ชื่อผลงาน</span><input value="Drive Safe"></label><label class="svp-field"><span>รายละเอียด</span><textarea data-svp-workflow="description" rows="6">รายละเอียดผลงานทดสอบ</textarea></label><section class="sv-work-gallery-editor"><div><h3>รูปผลงาน</h3><p>เพิ่มได้สูงสุด 12 รูป · JPG, PNG หรือ WebP</p></div><label class="sv-button sv-button--secondary"><span>เพิ่มรูปผลงาน</span><input type="file"></label><div class="sv-work-gallery-editor__grid"><article><img src="${imageUrl}" alt=""><label class="svp-field"><span>คำอธิบายภาพ</span><input value="ภาพผลงาน"></label><label class="svp-field"><span>คำบรรยาย</span><input value="แนวคิดที่ 1"></label><button type="button" class="sv-button sv-button--secondary">ลบรูป</button></article><article><img src="${imageUrl}" alt=""><label class="svp-field"><span>คำอธิบายภาพ</span><input value="ภาพที่สอง"></label><button type="button" class="sv-button sv-button--secondary">ลบรูป</button></article></div></section></section></form></div>
<div class="svp-shell svp-shell--detail" data-sv-participation="nomination-test"><form class="svp-form"><section class="svp-question"><h2>ข้อมูลการเสนอชื่อ</h2><div class="sv-people-picker"><label class="sv-people-picker__search"><input placeholder="ค้นหาพนักงาน"></label><div class="sv-people-picker__results"><button type="button"><span><strong>สมชาย ทดสอบ</strong><small>012609 · Safety</small></span><span>เลือก</span></button><button type="button"><span><strong>สมหญิง ทดสอบ</strong><small>012610 · Production</small></span><span>เลือก</span></button></div><p class="sv-people-picker__status">พบ 2 รายการ</p></div><label class="svp-field"><span>เหตุผลประกอบการเสนอชื่อ</span><textarea data-svp-workflow="statement" rows="6">เป็นแบบอย่างด้านความปลอดภัย</textarea></label></section></form></div>
<div class="svj-shell svj-shell--detail" data-sv-jury-workspace="jury-test"><header class="svj-detail-header"><button type="button" class="sv-icon-button">←</button><div><p class="sv-eyebrow">รอบประเมิน #1 · ชุดที่ 1</p><h1>คณะกรรมการให้คะแนนผลงาน</h1><p>การประเมินแบบปกปิดตัวตน</p></div><span class="sv-status-badge">ฉบับร่าง</span></header><section class="svj-blind-notice"><strong>Blind judging</strong><span>ห้ามใช้ข้อมูลนอกหน้าจอเพื่อระบุตัวผู้ส่ง</span></section><main class="svj-main"><section class="svj-matrix-contract"><div><p class="sv-eyebrow">WORK × CRITERIA MATRIX</p><h2>ให้คะแนน 1 ผลงาน ตาม 1 เกณฑ์</h2><p>ต้องกรอกครบทุกช่องก่อนส่ง คะแนนจะถูกใช้ใน Frozen Result</p></div><dl><div><dt>ผลงาน</dt><dd>1</dd></div><div><dt>เกณฑ์</dt><dd>1</dd></div><div><dt>น้ำหนักรวม</dt><dd>100%</dd></div></dl></section><section class="svj-sheet-summary"><div><strong>0/1</strong><span>ให้คะแนนแล้ว</span></div><div class="svj-progress"><span style="width:0"></span></div><p>ยังไม่มีการแก้ไข</p></section><form class="svj-score-form"><fieldset class="svj-candidate"><legend><span>1</span>ผลงาน A</legend><p class="svj-candidate__code">รหัสรายการ WORK-001</p><div class="sv-work-gallery sv-work-gallery--jury"><figure class="sv-work-gallery__item is-cover"><button type="button" class="svp-gallery-trigger"><img src="${imageUrl}" alt="ผลงาน A"></button></figure></div><article class="svj-score-row"><div class="svj-score-row__criterion"><strong>ความคิดสร้างสรรค์</strong><p>พิจารณาความชัดเจนและการนำไปใช้งานจริง</p><small>ช่วงคะแนน 1–5 · น้ำหนัก 100%</small></div><section class="svj-score-entry"><div class="svj-score-entry__heading"><strong>คะแนน</strong><output>3 / 5</output></div><input class="svj-score-slider" type="range" min="1" max="5" value="3"><div class="svj-score-entry__number"><button type="button">−</button><input type="number" value="3"><button type="button">+</button></div><div class="svj-score-quick"><button type="button">1</button><button type="button">2</button><button type="button" aria-pressed="true">3</button><button type="button">4</button><button type="button">5</button></div></section><label class="svj-comment"><span>หมายเหตุ</span><textarea rows="2"></textarea></label></article></fieldset></form></main><footer class="svj-action-bar"><button type="button" class="sv-button sv-button--danger">แจ้ง Conflict / ถอนตัว</button><div><button type="button" class="sv-button sv-button--secondary">บันทึกฉบับร่าง</button><button type="button" class="sv-button sv-button--primary">ตรวจสอบก่อนส่ง</button></div></footer></div>
</main></body></html>`;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        for (const viewport of viewports) {
            const page = await browser.newPage({ viewport });
            await page.setContent(markup, { waitUntil: 'load' });
            const result = await page.evaluate(() => {
                const rect = selector => document.querySelector(selector).getBoundingClientRect();
                const galleryCards = [...document.querySelectorAll('.sv-work-gallery-editor__grid article')].map(node => node.getBoundingClientRect());
                const actionButtons = [...document.querySelectorAll('.svj-action-bar .sv-button')].map(node => node.getBoundingClientRect());
                const quickButtons = [...document.querySelectorAll('.svj-score-quick button')].map(node => node.getBoundingClientRect());
                return {
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                    submissionTextareaHeight: rect('[data-svp-workflow="description"]').height,
                    submissionImageHeight: rect('.sv-work-gallery-editor__grid img').height,
                    submissionCardWidth: Math.max(...galleryCards.map(item => item.width)),
                    galleryScrolls: document.querySelector('.sv-work-gallery-editor__grid').scrollWidth > document.querySelector('.sv-work-gallery-editor__grid').clientWidth,
                    peopleResultsPosition: getComputedStyle(document.querySelector('.sv-people-picker__results')).position,
                    peopleResultsHeight: rect('.sv-people-picker__results').height,
                    nominationTextareaHeight: rect('[data-svp-workflow="statement"]').height,
                    juryHeaderHeight: rect('.svj-detail-header').height,
                    matrixHeight: rect('.svj-matrix-contract').height,
                    juryImageHeight: rect('.sv-work-gallery--jury img').height,
                    quickMin: Math.min(...quickButtons.map(item => Math.min(item.width, item.height))),
                    actionBarHeight: rect('.svj-action-bar').height,
                    actionRowDelta: Math.max(...actionButtons.map(item => item.top)) - Math.min(...actionButtons.map(item => item.top)),
                    actionMin: Math.min(...actionButtons.map(item => Math.min(item.width, item.height)))
                };
            });
            assert.strictEqual(result.overflow, false, `${viewport.name}: horizontal overflow`);
            assert(result.submissionTextareaHeight <= 113, `${viewport.name}: submission textarea ${result.submissionTextareaHeight}px`);
            assert(result.submissionImageHeight <= 113, `${viewport.name}: submission image ${result.submissionImageHeight}px`);
            assert(result.submissionCardWidth < viewport.width - 24, `${viewport.name}: submission card ${result.submissionCardWidth}px`);
            assert.strictEqual(result.galleryScrolls, true, `${viewport.name}: submission gallery is not swipeable`);
            assert.strictEqual(result.peopleResultsPosition, 'static', `${viewport.name}: people results overlay content`);
            assert(result.peopleResultsHeight <= 193, `${viewport.name}: people results ${result.peopleResultsHeight}px`);
            assert(result.nominationTextareaHeight <= 113, `${viewport.name}: nomination textarea ${result.nominationTextareaHeight}px`);
            assert(result.juryHeaderHeight <= 175, `${viewport.name}: jury header ${result.juryHeaderHeight}px`);
            assert(result.matrixHeight <= 205, `${viewport.name}: jury matrix ${result.matrixHeight}px`);
            assert(result.juryImageHeight <= 133, `${viewport.name}: jury image ${result.juryImageHeight}px`);
            assert(result.quickMin >= 44, `${viewport.name}: jury quick-score target ${result.quickMin}px`);
            assert(result.actionBarHeight <= 64, `${viewport.name}: jury action bar ${result.actionBarHeight}px`);
            assert(result.actionRowDelta <= 1, `${viewport.name}: jury actions wrap to multiple rows`);
            assert(result.actionMin >= 44, `${viewport.name}: jury action target ${result.actionMin}px`);
            results.push({ viewport: viewport.name, ...result });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`Safety Vote mobile submission/nomination/jury browser contract: PASS (${results.length} viewports)`);
    console.log(JSON.stringify(results));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
