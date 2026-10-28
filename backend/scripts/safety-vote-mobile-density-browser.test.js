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

const markup = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><style>${css}</style></head>
<body data-active-page="safety-vote"><main id="main-content">
<div class="svp-shell svp-shell--detail" data-sv-participation="mobile-density-test">
  <nav class="sv-role-nav" aria-label="พื้นที่ Safety Vote ตามบทบาท">
    <a class="sv-role-nav__item" href="#" aria-current="page">กิจกรรมของฉัน</a>
    <a class="sv-role-nav__item" href="#">งานประเมิน (1)</a>
    <a class="sv-role-nav__item" href="#">จัดการ Safety Vote</a>
  </nav>
  <div class="sv-journey">
    <nav class="sv-breadcrumbs"><a href="#">กิจกรรมของฉัน</a><span>/</span><span>กิจกรรมทดสอบ</span></nav>
    <nav class="sv-journey-steps" aria-label="ขั้นตอน Safety Vote"><ol>
      <li class="is-complete"><button type="button"><span>1</span><strong>รายละเอียด</strong></button></li>
      <li class="is-current"><button type="button" aria-current="step"><span>2</span><strong>การเข้าร่วม</strong></button></li>
      <li><button type="button"><span>3</span><strong>เสร็จสิ้น</strong></button></li>
    </ol></nav>
  </div>
  <section style="min-height:900px"><h1>กิจกรรมทดสอบ</h1><p>พื้นที่เนื้อหา</p></section>
  <footer class="svp-action-bar">
    <button type="button" class="sv-button sv-button--secondary">กลับกิจกรรมของฉัน</button>
    <button type="button" class="sv-button sv-button--primary">ตรวจคำตอบ</button>
  </footer>
</div>
<button type="button" class="johnny-global-launcher"><span class="johnny-global-launcher-label">Johnny</span></button>
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
                const roleNav = rect('.sv-role-nav');
                const roleItems = [...document.querySelectorAll('.sv-role-nav__item')].map(item => item.getBoundingClientRect());
                const journey = rect('.sv-journey');
                const journeyButtons = [...document.querySelectorAll('.sv-journey-steps button')].map(item => item.getBoundingClientRect());
                const actionBar = rect('.svp-action-bar');
                const actionButtons = [...document.querySelectorAll('.svp-action-bar .sv-button')].map(item => item.getBoundingClientRect());
                const launcher = rect('.johnny-global-launcher');
                const shellStyle = getComputedStyle(document.querySelector('.svp-shell'));
                return {
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                    roleNavContained: roleNav.left >= -1 && roleNav.right <= innerWidth + 1,
                    roleItemMin: Math.min(...roleItems.map(item => Math.min(item.width, item.height))),
                    roleNavHeight: roleNav.height,
                    journeyHeight: journey.height,
                    journeyButtonMin: Math.min(...journeyButtons.map(item => Math.min(item.width, item.height))),
                    breadcrumbDisplay: getComputedStyle(document.querySelector('.sv-breadcrumbs')).display,
                    actionBarHeight: actionBar.height,
                    actionButtonMin: Math.min(...actionButtons.map(item => Math.min(item.width, item.height))),
                    actionRowDelta: Math.max(...actionButtons.map(item => item.top)) - Math.min(...actionButtons.map(item => item.top)),
                    launcherGap: actionBar.top - launcher.bottom,
                    shellPaddingLeft: parseFloat(shellStyle.paddingLeft),
                    shellPaddingBottom: parseFloat(shellStyle.paddingBottom)
                };
            });
            assert.strictEqual(result.overflow, false, `${viewport.name}: horizontal overflow`);
            assert.strictEqual(result.roleNavContained, true, `${viewport.name}: role navigation leaves viewport`);
            assert(result.roleItemMin >= 44, `${viewport.name}: role target ${result.roleItemMin}px`);
            assert(result.roleNavHeight <= 64, `${viewport.name}: role navigation too tall ${result.roleNavHeight}px`);
            assert.strictEqual(result.breadcrumbDisplay, 'none', `${viewport.name}: redundant breadcrumb remains visible`);
            assert(result.journeyButtonMin >= 44, `${viewport.name}: journey target ${result.journeyButtonMin}px`);
            assert(result.journeyHeight <= 48, `${viewport.name}: journey too tall ${result.journeyHeight}px`);
            assert(result.actionButtonMin >= 44, `${viewport.name}: action target ${result.actionButtonMin}px`);
            assert(result.actionRowDelta <= 1, `${viewport.name}: action buttons wrap to multiple rows`);
            assert(result.actionBarHeight <= 58, `${viewport.name}: action bar too tall ${result.actionBarHeight}px`);
            assert(result.launcherGap >= 7, `${viewport.name}: Johnny overlaps action bar (${result.launcherGap}px)`);
            assert.strictEqual(result.shellPaddingLeft, 8, `${viewport.name}: shell gutter is not tokenized to 8px`);
            assert(result.shellPaddingBottom >= 64, `${viewport.name}: shell does not reserve action-bar space`);
            results.push({ viewport: viewport.name, ...result });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`Safety Vote participant mobile density browser contract: PASS (${results.length} viewports)`);
    console.log(JSON.stringify(results));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
