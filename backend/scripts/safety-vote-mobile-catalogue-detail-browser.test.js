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

const longCopy = 'กิจกรรม DRIVE SAFE, DRAW SMART เปิดโอกาสให้ผู้เข้าร่วมเลือกแนวคิดที่ชื่นชอบ พร้อมอ่านรายละเอียด กติกา และกำหนดการทั้งหมดก่อนยืนยันคำตอบอย่างปลอดภัย';
const markup = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${css}</style></head>
<body data-active-page="safety-vote"><main id="main-content">
<div class="svp-shell" data-sv-participation="catalogue-test">
  <header class="svp-hero"><div><p class="sv-eyebrow">Safety Vote</p><h1>กิจกรรมของฉัน</h1><p>${longCopy}</p></div><div class="svp-hero__count"><strong>7</strong><span>กิจกรรม</span></div></header>
  <section class="svp-toolbar"><label><input type="search" placeholder="ค้นหากิจกรรม"></label><div class="svp-tabs"><button type="button" aria-selected="true">ทั้งหมด <span>7</span></button><button type="button">เข้าร่วมได้ <span>3</span></button></div></section>
  <section class="svp-card-grid"><button type="button" class="svp-campaign-card">
    <span class="svp-campaign-card__cover svp-campaign-card__cover--fallback">SV</span>
    <span class="svp-campaign-card__top"><span class="sv-status-badge sv-status-badge--open"><span class="sv-status-dot"></span>เปิดรับการเข้าร่วม</span><span>ระบุตัวตน</span></span>
    <b class="svp-auto-eligibility-chip">มีสิทธิ์เข้าร่วม</b>
    <strong>โครงการรณรงค์ ส่งเสริม และป้องกันการเกิดอุบัติเหตุบนท้องถนน ปีที่ 3</strong>
    <span>Popular Vote · ทำได้สูงสุด 1 ครั้ง</span><p>${longCopy}</p><small>ปิด 2 พ.ย. 2569 12:00 น.</small>
  </button></section>
</div>
<div class="svp-shell svp-shell--detail" data-sv-participation="detail-test">
  <header class="svp-detail-header"><button type="button" class="sv-icon-button">←</button><div><p class="sv-eyebrow">SHE-003-2026</p><h1>โครงการรณรงค์ ส่งเสริม และป้องกันการเกิดอุบัติเหตุบนท้องถนน ปีที่ 3</h1><p>${longCopy}</p></div><div class="svp-detail-header__badges"><span class="sv-status-badge">เปิดรับการเข้าร่วม</span><b class="svp-auto-eligibility-chip">มีสิทธิ์เข้าร่วม</b></div></header>
  <section class="svp-meta"><div><strong>Popular Vote</strong><span>ปิด 2 พ.ย. 2569</span></div><div class="svp-privacy-notice"><strong>ระบุตัวตนตามสิทธิ์</strong><span>ระบบเชื่อมคำตอบกับบัญชีเพื่อรองรับการติดตามรายบุคคลตามสิทธิ์</span></div></section>
  <main class="svp-detail-main"><section class="svp-campaign-intro"><div><p class="sv-eyebrow">ก่อนเข้าร่วม</p><h2>รายละเอียดกิจกรรม</h2><p>${longCopy} ${longCopy}</p></div><dl><div><dt>ผู้จัดกิจกรรม</dt><dd>012609</dd></div><div><dt>ระยะเวลาโดยประมาณ</dt><dd>3–5 นาที</dd></div><div><dt>เปิดกิจกรรม</dt><dd>26 ต.ค. 2569 07:50 น.</dd></div><div><dt>ปิดกิจกรรม</dt><dd>2 พ.ย. 2569 12:00 น.</dd></div></dl><details><summary>กติกาและข้อกำหนด</summary><p>${longCopy}</p></details></section></main>
</div></main></body></html>`;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        for (const viewport of viewports) {
            const page = await browser.newPage({ viewport });
            await page.setContent(markup, { waitUntil: 'load' });
            const result = await page.evaluate(() => {
                const rect = selector => document.querySelector(selector).getBoundingClientRect();
                const card = rect('.svp-campaign-card');
                const cover = rect('.svp-campaign-card__cover');
                const cardTitle = rect('.svp-campaign-card > strong');
                const metaItems = [...document.querySelectorAll('.svp-meta > div')].map(node => node.getBoundingClientRect());
                const introItems = [...document.querySelectorAll('.svp-campaign-intro dl > div')].map(node => node.getBoundingClientRect());
                const introSummary = document.querySelector('.svp-campaign-intro > div > p:last-child');
                return {
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                    heroHeight: rect('.svp-hero').height,
                    cardHeight: card.height,
                    horizontalCard: cover.right < cardTitle.left,
                    coverWidth: cover.width,
                    detailHeaderHeight: rect('.svp-detail-header').height,
                    metaTwoColumns: Math.abs(metaItems[0].top - metaItems[1].top) <= 1 && metaItems[1].left > metaItems[0].left,
                    introTwoColumns: Math.abs(introItems[0].top - introItems[1].top) <= 1 && introItems[1].left > introItems[0].left,
                    introSummaryHeight: introSummary.getBoundingClientRect().height,
                    introSummaryClamped: introSummary.scrollHeight > introSummary.clientHeight,
                    campaignTouch: Math.min(card.width, card.height),
                    backTouch: Math.min(rect('.svp-detail-header .sv-icon-button').width, rect('.svp-detail-header .sv-icon-button').height)
                };
            });
            assert.strictEqual(result.overflow, false, `${viewport.name}: horizontal overflow`);
            assert(result.heroHeight <= 120, `${viewport.name}: catalogue hero ${result.heroHeight}px`);
            assert(result.cardHeight <= 190, `${viewport.name}: catalogue card ${result.cardHeight}px`);
            assert.strictEqual(result.horizontalCard, true, `${viewport.name}: campaign card is not horizontal`);
            assert(result.coverWidth <= 90, `${viewport.name}: campaign cover ${result.coverWidth}px`);
            assert(result.detailHeaderHeight <= 190, `${viewport.name}: detail header ${result.detailHeaderHeight}px`);
            assert.strictEqual(result.metaTwoColumns, true, `${viewport.name}: detail meta is not compact`);
            assert.strictEqual(result.introTwoColumns, true, `${viewport.name}: campaign intro facts are not two columns`);
            assert(result.introSummaryHeight <= 55, `${viewport.name}: campaign intro summary ${result.introSummaryHeight}px`);
            assert.strictEqual(result.introSummaryClamped, true, `${viewport.name}: campaign intro summary is not clamped`);
            assert(result.campaignTouch >= 44 && result.backTouch >= 44, `${viewport.name}: touch target below 44px`);
            results.push({ viewport: viewport.name, ...result });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`Safety Vote mobile catalogue/detail/intro browser contract: PASS (${results.length} viewports)`);
    console.log(JSON.stringify(results));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
