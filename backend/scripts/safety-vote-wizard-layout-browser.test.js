'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const candidates = [
    process.env.SAFETY_VOTE_BROWSER,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = candidates.find(candidate => fs.existsSync(candidate));
const close = (left, right, tolerance = 1) => Math.abs(left - right) <= tolerance;

function markup() {
    const steps = Array.from({ length: 9 }, (_, index) => `<button ${index === 4 ? 'aria-current="step"' : ''}><span>${index + 1}</span><span>ขั้นตอน ${index + 1}</span></button>`).join('');
    const templates = Array.from({ length: 6 }, (_, index) => `<button class="svw-template ${index === 1 ? 'is-selected' : ''}"><span class="svw-template__mark">${index === 1 ? '✓' : '○'}</span><strong>ประเภท ${index + 1}</strong><span>${index % 2 ? 'รายละเอียดสองบรรทัดเพื่อทดสอบความสูงของการ์ด' : 'รายละเอียด'}</span><small>ตั้งค่าและเปิดได้ใน wizard</small></button>`).join('');
    const criteria = Array.from({ length: 3 }, (_, index) => `<article class="svw-jury-criterion"><div class="svw-jury-criterion__head"><strong>เกณฑ์ ${index + 1}</strong><div><button>↑</button><button>↓</button><button>×</button></div></div><div class="svw-form-grid"><label class="svw-field"><span>ชื่อเกณฑ์</span><input value="ความคิดสร้างสรรค์"></label><label class="svw-field"><span>คะแนนต่ำสุด</span><input value="1"></label><label class="svw-field"><span>คะแนนสูงสุด</span><input value="5"></label><label class="svw-field"><span>น้ำหนัก</span><input value="${index ? 30 : 40}"></label></div></article>`).join('');
    const jury = `<div class="svw-jury-builder"><section class="svw-jury-section"><div class="svw-section-heading"><h3>เกณฑ์การให้คะแนน</h3><div class="svw-jury-weight is-valid">รวมน้ำหนัก 100%</div></div><div class="svw-jury-criteria">${criteria}</div></section><section class="svw-jury-section"><div class="sv-people-picker"><label class="sv-people-picker__label" for="jury-person">ค้นหาและเลือกกรรมการ</label><div class="sv-people-picker__control"><input id="jury-person" role="combobox" aria-expanded="true" aria-controls="jury-results" value="กรรม"><button type="button" class="sv-people-picker__clear">ล้าง</button></div><div id="jury-results" class="sv-people-picker__results" role="listbox"><button type="button" role="option"><strong>กรรมการตัวอย่าง</strong><span>E002 · Safety · SHE</span></button><button type="button" role="option"><strong>กรรมการสำรอง</strong><span>E003 · Operations</span></button></div></div><div class="svw-jury-assigned"><article><span><strong>กรรมการตัวอย่าง</strong><small>E001</small></span><span>Draft</span><button class="sv-button">ถอนสิทธิ์</button></article></div></section></div>`;
    return `<style>${css}</style><div class="svw-shell"><header class="svw-header"><button>←</button><div><h1>เกณฑ์และกรรมการ</h1></div><div class="svw-progress-copy">ขั้น 5 จาก 9</div></header><div class="svw-progress"><span style="width:55.56%"></span></div><section class="svw-readiness-summary"><div><strong>ความพร้อม 6/7</strong><span>ระบบจะอัปเดตตามข้อมูลที่กรอก</span></div><div class="sv-readiness-meter"><span style="width:86%"></span></div></section><div class="svw-layout"><nav class="svw-step-nav">${steps}</nav><main class="svw-main"><section class="svw-card"><div class="svw-template-grid">${templates}</div>${jury}</section></main></div><div class="svw-save-status">โหลดฉบับร่างล่าสุดแล้ว</div><footer class="svw-action-bar"><button>ย้อนกลับ</button><div><button>ถัดไป</button></div></footer></div>`;
}

(async () => {
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
            const page = await browser.newPage({ viewport });
            await page.setContent(markup());
            const layout = await page.evaluate(() => {
                const rect = selector => { const value = document.querySelector(selector).getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
                return {
                    overflow: document.documentElement.scrollWidth > innerWidth + 1,
                    shell: rect('.svw-shell'), header: rect('.svw-header'), readiness: rect('.svw-readiness-summary'), layout: rect('.svw-layout'), nav: rect('.svw-step-nav'), main: rect('.svw-main'), card: rect('.svw-card'), action: rect('.svw-action-bar'),
                    templateHeights: [...document.querySelectorAll('.svw-template')].map(node => node.getBoundingClientRect().height),
                    juryButtons: [...document.querySelectorAll('.svw-jury-section .sv-button')].map(node => node.getBoundingClientRect()),
                    peopleTargets: [...document.querySelectorAll('.sv-people-picker input,.sv-people-picker button')].map(node => node.getBoundingClientRect())
                };
            });
            assert.equal(layout.overflow, false, `${viewport.width}px has horizontal overflow`);
            assert(layout.juryButtons.every(rect => rect.height >= 44), `${viewport.width}px has a Jury action below 44px`);
            assert(layout.peopleTargets.length >= 4 && layout.peopleTargets.every(rect => rect.height >= 44 && rect.width <= layout.card.width + 1), `${viewport.width}px People Picker targets are not responsive or touch-safe`);
            for (const surface of ['readiness', 'layout', 'action']) {
                assert(close(layout[surface].left, layout.header.left), `${surface} left edge is off-grid at ${viewport.width}px`);
                assert(close(layout[surface].right, layout.header.right), `${surface} right edge is off-grid at ${viewport.width}px`);
            }
            if (viewport.width >= 1024) {
                assert(close(layout.nav.top, layout.main.top), `desktop columns do not share a top edge at ${viewport.width}px`);
                assert(close(layout.nav.bottom, layout.main.bottom), `desktop columns do not share a bottom edge at ${viewport.width}px`);
                assert(close(layout.main.height, layout.card.height), `desktop content card does not fill its column at ${viewport.width}px`);
                const uniqueHeights = [...new Set(layout.templateHeights.map(value => Math.round(value)))];
                assert(uniqueHeights.length === 1, `template cards are uneven at ${viewport.width}px: ${uniqueHeights.join(',')}`);
            }
            await page.close();
        }
        console.log('Safety Vote wizard layout Browser contract: PASS (390, 768, 1366, 1920)');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
