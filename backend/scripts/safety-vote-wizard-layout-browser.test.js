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
    const steps = Array.from({ length: 8 }, (_, index) => `<button ${index === 0 ? 'aria-current="step"' : ''}><span>${index + 1}</span><span>ขั้นตอน ${index + 1}</span></button>`).join('');
    const templates = Array.from({ length: 6 }, (_, index) => `<button class="svw-template ${index === 1 ? 'is-selected' : ''}"><span class="svw-template__mark">${index === 1 ? '✓' : '○'}</span><strong>ประเภท ${index + 1}</strong><span>${index % 2 ? 'รายละเอียดสองบรรทัดเพื่อทดสอบความสูงของการ์ด' : 'รายละเอียด'}</span><small>ตั้งค่าและเปิดได้ใน wizard</small></button>`).join('');
    return `<style>${css}</style><div class="svw-shell"><header class="svw-header"><button>←</button><div><h1>ประเภทแคมเปญ</h1></div><div class="svw-progress-copy">ขั้น 1 จาก 8</div></header><div class="svw-progress"><span style="width:12.5%"></span></div><section class="svw-readiness-summary"><div><strong>ความพร้อม 5/6</strong><span>ระบบจะอัปเดตตามข้อมูลที่กรอก</span></div><div class="sv-readiness-meter"><span style="width:83%"></span></div></section><div class="svw-layout"><nav class="svw-step-nav">${steps}</nav><main class="svw-main"><section class="svw-card"><div class="svw-template-grid">${templates}</div></section></main></div><div class="svw-save-status">โหลดฉบับร่างล่าสุดแล้ว</div><footer class="svw-action-bar"><button>ย้อนกลับ</button><div><button>ถัดไป</button></div></footer></div>`;
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
                    templateHeights: [...document.querySelectorAll('.svw-template')].map(node => node.getBoundingClientRect().height)
                };
            });
            assert.equal(layout.overflow, false, `${viewport.width}px has horizontal overflow`);
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
