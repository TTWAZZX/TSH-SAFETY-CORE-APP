'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceDir = path.join(root, 'backups', 'local', `safety-vote-mobile-all-workflows-${stamp}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const viewports = [
    { name: '320x568', width: 320, height: 568 },
    { name: '390x844', width: 390, height: 844 },
    { name: '430x932', width: 430, height: 932 }
];
const workflows = [
    { key: 'survey', code: 'SURVEY-2026', title: 'แบบสำรวจวัฒนธรรมความปลอดภัย', privacy: 'ระบุตัวตนตามสิทธิ์' },
    { key: 'popular-vote', code: 'POPULAR-2026', title: 'Popular Vote ผลงาน Road Safety', privacy: 'ระบุตัวตนตามสิทธิ์' },
    { key: 'secret-election', code: 'SECRET-2026', title: 'การเลือกตั้งแบบลับ', privacy: 'Secret ballot' },
    { key: 'submission', code: 'SUBMIT-2026', title: 'ส่งผลงานสร้างสรรค์ด้านความปลอดภัย', privacy: 'เจ้าของเห็นเฉพาะผลงานตนเอง' },
    { key: 'nomination', code: 'NOMINATE-2026', title: 'เสนอชื่อ Safety Role Model', privacy: 'ผู้ถูกเสนอชื่อต้องให้ความยินยอม' },
    { key: 'jury', code: 'JURY-2026', title: 'Jury Scoring รอบตัดสิน', privacy: 'Blind judging' }
];

const art = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#d1fae5"/><stop offset="1" stop-color="#bfdbfe"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><path d="M40 430L250 150l150 180 100-130 260 230" fill="none" stroke="#047857" stroke-width="28"/><circle cx="630" cy="120" r="55" fill="#f59e0b"/></svg>';
const artUrl = `data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}`;

const option = (name, checked = false) => `<article class="svp-option"><div class="sv-work-gallery sv-work-gallery--candidate"><figure class="sv-work-gallery__item is-cover"><button type="button" class="svp-gallery-trigger" aria-label="เปิดภาพ ${name}"><img src="${artUrl}" alt="${name}"></button><figcaption>แนวคิด ${name}</figcaption></figure></div><label><input type="radio" name="choice" ${checked ? 'checked' : ''}><span><strong>${name}</strong><small>แนวคิดที่ช่วยลดความเสี่ยงและสร้างพฤติกรรมปลอดภัย</small></span></label></article>`;

function participantBody(workflow) {
    if (workflow.key === 'survey') return `<form class="svp-form"><fieldset class="svp-question"><legend>1. คุณรับรู้กติกาความปลอดภัยในพื้นที่ทำงานระดับใด</legend><small>จำเป็น · เลือก 1 รายการ</small><div class="svp-options">${option('เข้าใจชัดเจน', true)}${option('ต้องการข้อมูลเพิ่มเติม')}</div></fieldset><fieldset class="svp-question" data-uat-last-content><legend>2. ข้อเสนอแนะเพิ่มเติม</legend><textarea rows="5" placeholder="ระบุข้อเสนอแนะเพื่อพัฒนาความปลอดภัย">ควรเพิ่มสื่อสั้นที่เข้าถึงได้บนโทรศัพท์</textarea></fieldset></form>`;
    if (workflow.key === 'popular-vote') return `<form class="svp-form"><fieldset class="svp-question"><legend>เลือกผลงานที่ชื่นชอบที่สุด</legend><small>จำเป็น · เลือก 1 รายการ</small><div class="svp-options">${option('Family Journey', true)}${option('The Road Home')}</div></fieldset><section class="svp-review" data-uat-last-content><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2>ตัวเลือกของคุณ</h2><ul><li><strong>ผลงานที่เลือก</strong><span>Family Journey</span></li></ul></section></form>`;
    if (workflow.key === 'secret-election') return `<form class="svp-form"><section class="svp-immutable-warning"><strong>บัตรลงคะแนนลับ</strong><span>ใบรับยืนยันเฉพาะว่าระบบรับบัตรแล้ว และไม่สามารถใช้ค้นหาตัวเลือกของผู้ลงคะแนนได้</span></section><fieldset class="svp-question"><legend>เลือกผู้แทนด้านความปลอดภัย</legend><small>จำเป็น · เลือก 1 รายการ</small><div class="svp-options">${option('ผู้สมัครหมายเลข 1', true)}${option('ผู้สมัครหมายเลข 2')}</div></fieldset><section class="svp-review" data-uat-last-content><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2>บัตรของคุณพร้อมยืนยัน</h2><div class="svp-immutable-warning"><strong>ยืนยันได้เพียงครั้งเดียว</strong><span>เมื่อส่งแล้วจะแก้ไขตัวเลือกไม่ได้ และใบรับจะไม่เปิดเผยคำตอบ</span></div></section></form>`;
    if (workflow.key === 'submission') return `<form class="svp-form"><section class="svp-workflow-requirements"><h2>ข้อกำหนดผลงาน</h2><ul><li>อธิบายแนวคิดและผลต่อความปลอดภัยให้ครบถ้วน</li></ul></section><section class="svp-question"><h2>ข้อมูลผลงาน</h2><label class="svp-field"><span>ชื่อผลงาน</span><input value="Drive Safe, Draw Smart"></label><label class="svp-field"><span>รายละเอียด</span><textarea data-svp-workflow="description" rows="6">สื่อสร้างสรรค์เพื่อส่งเสริมการเดินทางอย่างปลอดภัย</textarea></label><section class="sv-work-gallery-editor" data-uat-last-content><div><h3>รูปผลงาน</h3><p>JPG, PNG หรือ WebP สูงสุด 12 รูป</p></div><label class="sv-button sv-button--secondary"><span>เพิ่มรูปผลงาน</span><input type="file"></label><div class="sv-work-gallery-editor__grid"><article><img src="${artUrl}" alt="ภาพผลงาน"><label class="svp-field"><span>คำอธิบายภาพ</span><input value="ภาพแนวคิดหลัก"></label><button type="button" class="sv-button sv-button--secondary">ลบรูป</button></article><article><img src="${artUrl}" alt="ภาพผลงานที่สอง"><label class="svp-field"><span>คำอธิบายภาพ</span><input value="การนำไปใช้งาน"></label><button type="button" class="sv-button sv-button--secondary">ลบรูป</button></article></div></section></section></form>`;
    return `<form class="svp-form"><section class="svp-question"><h2>ข้อมูลการเสนอชื่อ</h2><div class="sv-people-picker"><label class="sv-people-picker__search"><span>ค้นหาพนักงาน</span><input value="012609" aria-label="ค้นหาพนักงาน"></label><div class="sv-people-picker__results"><button type="button"><span><strong>สมชาย ใจปลอดภัย</strong><small>012609 · Safety</small></span><span>เลือก</span></button><button type="button"><span><strong>สมหญิง รอบคอบ</strong><small>012610 · Production</small></span><span>เลือก</span></button></div><p class="sv-people-picker__status">พบ 2 รายการ</p></div><label class="svp-field" data-uat-last-content><span>เหตุผลประกอบการเสนอชื่อ</span><textarea data-svp-workflow="statement" rows="6">เป็นแบบอย่างด้านพฤติกรรมปลอดภัยและช่วยเหลือเพื่อนร่วมงานอย่างสม่ำเสมอ</textarea></label></section></form>`;
}

function participantMarkup(workflow) {
    return `<div class="svp-shell svp-shell--detail" data-sv-participation="phase6-${workflow.key}"><nav class="sv-role-nav"><a class="sv-role-nav__item" aria-current="page" href="#">กิจกรรมของฉัน</a><a class="sv-role-nav__item" href="#">งานประเมิน</a><a class="sv-role-nav__item" href="#">จัดการ Safety Vote</a></nav><header class="svp-detail-header"><button class="sv-icon-button" aria-label="กลับ">←</button><div><p class="sv-eyebrow">${workflow.code}</p><h1>${workflow.title}</h1><p>กิจกรรมตัวอย่างสำหรับ Browser UAT ทุก workflow บนโทรศัพท์</p></div><div class="svp-detail-header__badges"><span class="sv-status-badge sv-status-badge--open">เปิดรับรายการ</span></div></header><section class="svp-meta"><div><strong>${workflow.title}</strong><span>ปิด 2 พ.ย. 2569 12:00 น.</span></div><div class="svp-privacy-notice"><strong>ความเป็นส่วนตัว</strong><span>${workflow.privacy}</span></div></section><main class="svp-detail-main">${participantBody(workflow)}</main><footer class="svp-action-bar"><button class="sv-button sv-button--secondary">กลับกิจกรรมของฉัน</button><button class="sv-button sv-button--primary">ตรวจคำตอบ</button></footer></div>`;
}

function juryMarkup(workflow) {
    return `<div class="svj-shell svj-shell--detail" data-sv-jury-workspace="phase6-jury"><nav class="sv-role-nav"><a class="sv-role-nav__item" href="#">กิจกรรมของฉัน</a><a class="sv-role-nav__item" aria-current="page" href="#">งานประเมิน</a><a class="sv-role-nav__item" href="#">จัดการ Safety Vote</a></nav><header class="svj-detail-header"><button class="sv-icon-button" aria-label="กลับ">←</button><div><p class="sv-eyebrow">${workflow.code}</p><h1>${workflow.title}</h1><p>${workflow.privacy} · Work × Criteria Matrix</p></div><span class="sv-status-badge">ฉบับร่าง</span></header><section class="svj-blind-notice"><strong>Blind judging</strong><span>ประเมินจากหลักฐานในหน้าจอและไม่พยายามระบุตัวผู้ส่ง</span></section><main class="svj-main"><section class="svj-matrix-contract"><div><p class="sv-eyebrow">WORK × CRITERIA MATRIX</p><h2>ให้คะแนน 1 ผลงานตาม 1 เกณฑ์</h2><p>กรอกคะแนนและหมายเหตุให้ครบก่อนตรวจสอบ</p></div><dl><div><dt>ผลงาน</dt><dd>1</dd></div><div><dt>เกณฑ์</dt><dd>1</dd></div><div><dt>น้ำหนัก</dt><dd>100%</dd></div></dl></section><form class="svj-score-form"><fieldset class="svj-candidate"><legend><span>1</span>ผลงาน A</legend><div class="sv-work-gallery sv-work-gallery--jury"><figure class="sv-work-gallery__item is-cover"><button class="svp-gallery-trigger"><img src="${artUrl}" alt="ผลงาน A"></button></figure></div><article class="svj-score-row" data-uat-last-content><div class="svj-score-row__criterion"><strong>ความคิดสร้างสรรค์และการนำไปใช้</strong><p>พิจารณาความชัดเจน ผลลัพธ์ และความสอดคล้องกับ Road Safety</p><small>ช่วงคะแนน 1–5 · น้ำหนัก 100%</small></div><section class="svj-score-entry"><div class="svj-score-entry__heading"><strong>คะแนน</strong><output>4 / 5</output></div><div class="svj-score-quick"><button type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button" aria-pressed="true">4</button><button type="button">5</button></div></section><label class="svj-comment"><span>หมายเหตุ</span><textarea rows="2">แนวคิดชัดเจนและนำไปใช้ได้จริง</textarea></label></article></fieldset></form></main><footer class="svj-action-bar"><button class="sv-button sv-button--danger">ถอนตัว</button><div><button class="sv-button sv-button--secondary">บันทึกร่าง</button><button class="sv-button sv-button--primary">ตรวจสอบก่อนส่ง</button></div></footer></div>`;
}

function documentMarkup(workflow) {
    const content = workflow.key === 'jury' ? juryMarkup(workflow) : participantMarkup(workflow);
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body data-active-page="safety-vote"><main id="main-content">${content}</main></body></html>`;
}

async function createContactSheet(browser, viewport, files, position) {
    const page = await browser.newPage({ viewport: { width: 940, height: 1200 } });
    const cards = files.map(file => {
        const src = `data:image/png;base64,${fs.readFileSync(file.path).toString('base64')}`;
        return `<figure><figcaption>${file.workflow} · ${viewport.name} · ${position}</figcaption><img src="${src}" alt="${file.workflow}"></figure>`;
    }).join('');
    await page.setContent(`<style>body{margin:0;padding:20px;background:#dfe7f1;font:700 14px Arial;color:#10213e}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;padding:10px;background:#fff;border-radius:14px;box-shadow:0 4px 14px #10213e22}figcaption{padding:0 0 8px}img{display:block;width:100%;height:auto;border:1px solid #cbd5e1}</style><div class="grid">${cards}</div>`, { waitUntil: 'load' });
    const output = path.join(evidenceDir, `contact-sheet-${viewport.name}-${position}.png`);
    await page.screenshot({ path: output, fullPage: true });
    await page.close();
    return output;
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const results = [];
    const screenshots = [];
    try {
        for (const viewport of viewports) {
            for (const workflow of workflows) {
                const page = await browser.newPage({ viewport });
                await page.setContent(documentMarkup(workflow), { waitUntil: 'load' });
                const topScreenshot = path.join(evidenceDir, `${workflow.key}-${viewport.name}-top.png`);
                await page.screenshot({ path: topScreenshot });
                screenshots.push({ viewport: viewport.name, workflow: workflow.key, position: 'top', path: topScreenshot });
                await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
                await page.waitForTimeout(40);
                const metrics = await page.evaluate(() => {
                    const visible = node => {
                        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && style.pointerEvents !== 'none' && rect.width > 0 && rect.height > 0;
                    };
                    const controls = [...document.querySelectorAll('button,a[href],input:not([type="hidden"]):not([type="file"]):not([type="range"]),select,textarea,summary')].filter(visible);
                    const undersized = controls.map(node => { const rect = node.getBoundingClientRect(); return { tag: node.tagName, label: (node.getAttribute('aria-label') || node.textContent || node.value || '').trim().slice(0, 50), width: rect.width, height: rect.height }; }).filter(item => item.width < 44 || item.height < 44);
                    const actionBar = document.querySelector('.svp-action-bar,.svj-action-bar');
                    const last = document.querySelector('[data-uat-last-content]');
                    const actionRect = actionBar.getBoundingClientRect(), lastRect = last.getBoundingClientRect();
                    return {
                        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                        controlCount: controls.length,
                        undersized,
                        actionTop: actionRect.top,
                        actionBottom: actionRect.bottom,
                        actionHeight: actionRect.height,
                        actionInsideViewport: actionRect.top >= 0 && actionRect.bottom <= innerHeight + 1,
                        lastContentBottom: lastRect.bottom,
                        fixedOverlap: lastRect.bottom > actionRect.top + 1
                    };
                });
                assert(metrics.overflow <= 1, `${workflow.key} ${viewport.name}: horizontal overflow ${metrics.overflow}px`);
                assert.strictEqual(metrics.undersized.length, 0, `${workflow.key} ${viewport.name}: touch targets below 44px ${JSON.stringify(metrics.undersized)}`);
                assert.strictEqual(metrics.actionInsideViewport, true, `${workflow.key} ${viewport.name}: fixed action bar outside viewport`);
                assert.strictEqual(metrics.fixedOverlap, false, `${workflow.key} ${viewport.name}: fixed action bar overlaps final content (${metrics.lastContentBottom}px > ${metrics.actionTop}px)`);
                const bottomScreenshot = path.join(evidenceDir, `${workflow.key}-${viewport.name}-bottom.png`);
                await page.screenshot({ path: bottomScreenshot });
                screenshots.push({ viewport: viewport.name, workflow: workflow.key, position: 'bottom', path: bottomScreenshot });
                results.push({ viewport: viewport.name, workflow: workflow.key, ...metrics, screenshotTop: path.relative(root, topScreenshot).replaceAll('\\', '/'), screenshotBottom: path.relative(root, bottomScreenshot).replaceAll('\\', '/') });
                await page.close();
            }
            const topFiles = screenshots.filter(item => item.viewport === viewport.name && item.position === 'top');
            const bottomFiles = screenshots.filter(item => item.viewport === viewport.name && item.position === 'bottom');
            await createContactSheet(browser, viewport, topFiles, 'top');
            await createContactSheet(browser, viewport, bottomFiles, 'bottom');
        }
    } finally {
        await browser.close();
    }
    const report = {
        contract: 'Safety Vote mobile all-workflow Browser UAT',
        generatedAt: new Date().toISOString(),
        viewports: viewports.map(item => item.name),
        workflows: workflows.map(item => item.key),
        checks: ['horizontal overflow <= 1px', 'visible touch targets >= 44x44px', 'fixed action bar inside viewport', 'final content not overlapped'],
        results
    };
    fs.writeFileSync(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Safety Vote mobile all-workflow Browser UAT: PASS (${results.length} workflow/viewports)`);
    console.log(`Evidence: ${evidenceDir}`);
    console.log(JSON.stringify(results.map(({ viewport, workflow, overflow, controlCount, actionHeight, fixedOverlap }) => ({ viewport, workflow, overflow, controlCount, actionHeight, fixedOverlap }))));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
