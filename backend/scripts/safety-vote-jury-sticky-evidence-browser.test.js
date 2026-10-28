'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const art = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#d1fae5"/><path d="M80 430L310 190l170 170 120-130 280 200" fill="none" stroke="#047857" stroke-width="42"/><text x="480" y="100" text-anchor="middle" font-size="52" font-family="sans-serif">WORK-1</text></svg>').toString('base64')}`;
const scoreRows = Array.from({ length: 5 }, (_, index) => `<article class="svj-score-row"><div class="svj-score-row__criterion"><strong>เกณฑ์ที่ ${index + 1}</strong><p>รายละเอียดสำหรับพิจารณาผลงานอย่างเป็นระบบ</p><small>ช่วงคะแนน 1–20 · น้ำหนัก 20%</small></div><section class="svj-score-entry"><div class="svj-score-entry__heading"><strong>คะแนน</strong><output>10 / 20</output></div><input class="svj-score-slider" type="range" min="1" max="20" value="10"><div class="svj-score-entry__number"><button>−</button><input value="10"><button>+</button></div><div class="svj-score-quick"><button>1</button><button>5</button><button>10</button><button>15</button><button>20</button></div></section><label class="svj-comment"><span>หมายเหตุ</span><textarea rows="2"></textarea></label></article>`).join('');
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${css}</style></head><body><main class="svj-shell svj-shell--detail" data-sv-jury-workspace="sticky-r1"><div style="height:140px"></div><form class="svj-score-form"><fieldset class="svj-candidate"><legend><span>1</span>Candidate WORK-1</legend><div class="svj-candidate__workspace"><aside class="svj-candidate__evidence"><div class="svj-candidate__meta"><div><span>รหัสผลงาน</span><strong>WORK-1</strong></div><span class="svj-candidate__progress">ให้คะแนนแล้ว 2/5 เกณฑ์</span></div><div class="sv-work-gallery sv-work-gallery--jury"><figure class="sv-work-gallery__item is-cover"><button class="svp-gallery-trigger"><img src="${art}" alt="Candidate WORK-1"></button></figure></div></aside><section class="svj-candidate__criteria"><header><div><span>แบบประเมินผลงาน</span><strong>5 เกณฑ์ · น้ำหนักรวม 100%</strong></div><small>บันทึกร่างได้ทุกเมื่อ</small></header>${scoreRows}</section></div></fieldset></form><div style="height:500px"></div></main></body></html>`;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const evidence = path.join(root, 'backups', 'local', `safety-vote-jury-sticky-${Date.now()}`);
    fs.mkdirSync(evidence, { recursive: true });
    const results = [];
    try {
        for (const viewport of [{ name: '390x844', width: 390, height: 844 }, { name: '1366x768', width: 1366, height: 768 }]) {
            const page = await browser.newPage({ viewport });
            await page.setContent(html, { waitUntil: 'load' });
            const before = await page.evaluate(() => {
                const workspace = getComputedStyle(document.querySelector('.svj-candidate__workspace'));
                return { columns: workspace.gridTemplateColumns, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
            });
            assert.equal(before.overflow, false, `${viewport.name}: horizontal overflow`);
            if (viewport.width >= 1200) assert(before.columns.split(' ').length >= 2, `${viewport.name}: desktop workspace is not split`);
            else assert(!before.columns.includes(' '), `${viewport.name}: mobile workspace must remain one column`);
            await page.evaluate(() => {
                const candidate = document.querySelector('.svj-candidate');
                candidate.scrollIntoView({ block: 'start' });
                window.scrollBy(0, -76);
                const criteria = document.querySelector('.svj-candidate__criteria');
                criteria.scrollTop = criteria.scrollHeight;
            });
            await page.waitForTimeout(100);
            const after = await page.evaluate(() => {
                const evidence = document.querySelector('.svj-candidate__evidence').getBoundingClientRect();
                const image = document.querySelector('.svj-candidate__evidence img').getBoundingClientRect();
                const criteriaNode = document.querySelector('.svj-candidate__criteria'), criterion = document.querySelectorAll('.svj-score-row')[4].getBoundingClientRect();
                return { evidenceTop: evidence.top, evidenceHeight: evidence.height, criteriaOverflow: getComputedStyle(criteriaNode).overflowY, criteriaScrolls: criteriaNode.scrollHeight > criteriaNode.clientHeight, imageVisible: image.bottom > 0 && image.top < innerHeight, criterionVisible: criterion.bottom > 0 && criterion.top < innerHeight };
            });
            if (viewport.width >= 1200) {
                assert.equal(after.criteriaOverflow, 'auto', `${viewport.name}: score panel must scroll independently`);
                assert(after.criteriaScrolls, `${viewport.name}: score panel did not expose its independent scroll`);
                assert(after.imageVisible && after.criterionVisible, `${viewport.name}: artwork and scoring criterion must remain visible together`);
            }
            await page.screenshot({ path: path.join(evidence, `${viewport.name}.png`), fullPage: false });
            results.push({ viewport: viewport.name, ...before, ...after });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`Safety Vote Jury sticky evidence browser: PASS (${evidence})`);
    console.log(JSON.stringify(results));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
