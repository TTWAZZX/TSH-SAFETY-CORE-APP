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
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#d1fae5"/><path d="M0 500L260 170l180 190 100-110 260 250" fill="none" stroke="#047857" stroke-width="32"/></svg>';
const imageUrl = `data:image/svg+xml;base64,${Buffer.from(image).toString('base64')}`;

const markup = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${css}</style></head><body data-active-page="safety-vote"><main>
<div class="svp-shell svp-shell--detail" data-sv-participation="results-states-test">
  <section class="svp-official-results" data-svp-official-results="available">
    <div class="svp-official-results__header"><div><p class="sv-eyebrow">Official results</p><div class="svp-official-results__title-line"><h2>Immutable result snapshot</h2><span class="svp-official-results__state">Published</span></div><p>Aggregate results without individual identity or ballot detail.</p></div><dl><div><dt>Eligible</dt><dd>30,563</dd></div><div><dt>Joined</dt><dd>12,400</dd></div><div><dt>Turnout</dt><dd>40.57%</dd></div></dl></div>
    <article class="svp-official-results__question"><h3>Overall ranking</h3><div class="svp-official-results__ranking"><div class="svp-official-results__rank" data-result-state="winner"><span class="svp-official-results__rank-no">1</span><div><strong>Family Journey</strong><span>8,240 points</span><span class="svp-official-results__bar"><i style="width:82%"></i></span></div></div><div class="svp-official-results__rank"><span class="svp-official-results__rank-no">2</span><div><strong>The Road Home</strong><span>4,160 points</span><span class="svp-official-results__bar"><i style="width:42%"></i></span></div></div></div></article>
    <details class="svp-result-integrity" open><summary>Snapshot integrity #1</summary><dl><div><dt>Status</dt><dd>Published</dd></div><div><dt>Result SHA-256</dt><dd><code>0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef</code></dd></div></dl></details>
  </section>
  <section class="svp-aux svp-public-work-gallery"><h2>Public Work Gallery</h2><div class="sv-work-gallery"><figure class="sv-work-gallery__item is-cover"><button class="svp-gallery-trigger"><img src="${imageUrl}" alt="Work one"></button><figcaption>Cover image</figcaption></figure><figure class="sv-work-gallery__item"><button class="svp-gallery-trigger"><img src="${imageUrl}" alt="Work two"></button><figcaption>Gallery image</figcaption></figure></div></section>
  <section class="svp-receipt"><span class="svp-receipt__icon">✓</span><p class="sv-eyebrow">Accepted</p><h2>Submission complete</h2><p>Your response is immutable.</p><dl><div><dt>Receipt</dt><dd>SV-2026-000001</dd></div><div><dt>Received</dt><dd>28 Oct 2026 10:00</dd></div><div><dt>Status</dt><dd>Accepted</dd></div></dl><div class="svp-privacy-receipt"><strong>Privacy-safe receipt</strong><p>This receipt does not show submitted answers.</p></div></section>
  <section class="svp-state svp-state--warning"><h2>Campaign is not open</h2><p>You can read the campaign details while participation remains unavailable.</p><button class="sv-button sv-button--secondary">Back to activities</button></section>
  <section class="svp-official-results svp-official-results--pending"><p class="sv-eyebrow">Results</p><h2>No publishable result yet</h2><p>Only a governed immutable snapshot will appear here.</p></section>
</div>
<div class="svr-shell"><header class="svr-hero"><button class="sv-icon-button">←</button><div><p class="sv-eyebrow">Result governance</p><h1>Campaign result dashboard</h1><p>Review immutable snapshots and exact hash before governance actions.</p></div><span class="sv-status-badge">Frozen</span></header><main class="svr-grid"><section class="svr-panel svr-panel--dashboard"><div class="svr-panel__heading"><div><p class="sv-eyebrow">Dashboard</p><h2>Result overview</h2></div><span>Snapshot #1</span></div><div class="svr-kpi-grid">${['Eligible','Joined','Accepted','Rejected','Turnout','Rows'].map((label,index)=>`<article><span>${label}</span><strong>${index + 1}</strong></article>`).join('')}</div><div class="svr-ranking-list"><div class="svr-ranking-row"><span class="svr-rank">1</span><div class="svr-ranking-main"><strong>Family Journey</strong><span class="svr-result-bar"><i style="width:82%"></i></span></div><div class="svr-ranking-value"><strong>8,240</strong><small>points</small></div></div></div></section></main><div class="svr-receipt"><strong>Snapshot frozen</strong><code>0123456789abcdef0123456789abcdef</code></div><footer class="svr-action-bar"><button class="sv-button sv-button--secondary">Back</button><div><button class="sv-button sv-button--secondary">Recount</button><button class="sv-button sv-button--secondary">Freeze</button><button class="sv-button sv-button--primary">Certify result</button><button class="sv-button sv-button--primary">Publish</button></div></footer></div>
</main>
<div class="svp-gallery"><div class="svp-gallery__backdrop"></div><section role="dialog"><header class="svp-gallery__header"><div><h2>Family Journey</h2><p>Image 1 of 2</p></div><button class="sv-icon-button">×</button></header><div class="svp-gallery__stage"><button class="svp-gallery__nav">←</button><img src="${imageUrl}" alt="Expanded work"><button class="svp-gallery__nav">→</button></div><footer class="svp-gallery__actions"><div><strong>Family Journey</strong><span>Not selected</span></div><button class="sv-button sv-button--secondary">Select</button><button class="sv-button sv-button--primary">Confirm</button></footer></section></div>
</body></html>`;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        for (const viewport of viewports) {
            const page = await browser.newPage({ viewport });
            await page.setContent(markup, { waitUntil: 'load' });
            const result = await page.evaluate(() => {
                const rect = selector => document.querySelector(selector).getBoundingClientRect();
                const rankingRows = [...document.querySelectorAll('.svp-official-results__rank')].map(node => node.getBoundingClientRect());
                const galleryItems = [...document.querySelectorAll('.svp-public-work-gallery .sv-work-gallery__item')].map(node => node.getBoundingClientRect());
                const galleryButtons = [...document.querySelectorAll('.svp-gallery button')].map(node => node.getBoundingClientRect());
                const resultActions = [...document.querySelectorAll('.svr-action-bar .sv-button')].map(node => node.getBoundingClientRect());
                const publicGallery = document.querySelector('.svp-public-work-gallery .sv-work-gallery');
                return {
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                    resultPanelPadding: parseFloat(getComputedStyle(document.querySelector('.svp-official-results')).paddingTop),
                    resultKpiColumns: getComputedStyle(document.querySelector('.svp-official-results__header dl')).gridTemplateColumns.split(' ').length,
                    resultRankMaxHeight: Math.max(...rankingRows.map(item => item.height)),
                    integrityTouch: rect('.svp-result-integrity summary').height,
                    publicGalleryScrolls: publicGallery.scrollWidth > publicGallery.clientWidth,
                    publicGalleryCardMax: Math.max(...galleryItems.map(item => item.width)),
                    receiptHeight: rect('.svp-receipt').height,
                    receiptColumns: getComputedStyle(document.querySelector('.svp-receipt dl')).gridTemplateColumns.split(' ').length,
                    stateHeight: rect('.svp-state').height,
                    pendingHeight: rect('.svp-official-results--pending').height,
                    modalHeight: rect('.svp-gallery section').height,
                    modalStageHeight: rect('.svp-gallery__stage').height,
                    modalButtonMin: Math.min(...galleryButtons.map(item => Math.min(item.width, item.height))),
                    adminHeroHeight: rect('.svr-hero').height,
                    adminKpiColumns: getComputedStyle(document.querySelector('.svr-kpi-grid')).gridTemplateColumns.split(' ').length,
                    adminActionHeight: rect('.svr-action-bar').height,
                    adminActionRowDelta: Math.max(...resultActions.map(item => item.top)) - Math.min(...resultActions.map(item => item.top)),
                    adminActionMin: Math.min(...resultActions.map(item => item.height))
                };
            });
            assert.strictEqual(result.overflow, false, `${viewport.name}: horizontal overflow`);
            assert(result.resultPanelPadding <= 13, `${viewport.name}: result padding ${result.resultPanelPadding}px`);
            assert.strictEqual(result.resultKpiColumns, 3, `${viewport.name}: result KPI columns`);
            assert(result.resultRankMaxHeight <= 62, `${viewport.name}: result rank ${result.resultRankMaxHeight}px`);
            assert(result.integrityTouch >= 44, `${viewport.name}: integrity target ${result.integrityTouch}px`);
            assert.strictEqual(result.publicGalleryScrolls, true, `${viewport.name}: public gallery is not swipeable`);
            assert(result.publicGalleryCardMax < viewport.width - 30, `${viewport.name}: gallery card ${result.publicGalleryCardMax}px`);
            assert.strictEqual(result.receiptColumns, 2, `${viewport.name}: receipt columns`);
            assert(result.receiptHeight <= 330, `${viewport.name}: receipt ${result.receiptHeight}px`);
            assert(result.stateHeight <= 175, `${viewport.name}: state ${result.stateHeight}px`);
            assert(result.pendingHeight <= 145, `${viewport.name}: pending state ${result.pendingHeight}px`);
            assert(Math.abs(result.modalHeight - viewport.height) <= 1, `${viewport.name}: modal is not full height`);
            assert(result.modalStageHeight >= viewport.height * .55, `${viewport.name}: modal stage ${result.modalStageHeight}px`);
            assert(result.modalButtonMin >= 44, `${viewport.name}: modal target ${result.modalButtonMin}px`);
            assert(result.adminHeroHeight <= 145, `${viewport.name}: admin result hero ${result.adminHeroHeight}px`);
            assert.strictEqual(result.adminKpiColumns, 3, `${viewport.name}: admin KPI columns`);
            assert(result.adminActionHeight <= 64, `${viewport.name}: admin action bar ${result.adminActionHeight}px`);
            assert(result.adminActionRowDelta <= 1, `${viewport.name}: admin actions wrap`);
            assert(result.adminActionMin >= 44, `${viewport.name}: admin action target ${result.adminActionMin}px`);
            results.push({ viewport: viewport.name, ...result });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`Safety Vote mobile results/gallery/receipt/states browser contract: PASS (${results.length} viewports)`);
    console.log(JSON.stringify(results));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
