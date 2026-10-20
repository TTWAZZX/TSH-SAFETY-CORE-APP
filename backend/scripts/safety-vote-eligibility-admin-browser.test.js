'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const candidates = [process.env.SAFETY_VOTE_BROWSER, path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const executablePath = candidates.find(candidate => fs.existsSync(candidate));

function markup() {
    const modes = ['ไม่รับผู้มีสิทธิ์ใหม่หลังเปิด', 'ให้แอดมินตรวจสอบและอนุมัติ', 'เพิ่มอัตโนมัติเมื่อเข้าเงื่อนไข'];
    const rows = Array.from({ length: 8 }, (_, index) => `<tr><td><strong>01${2600 + index}</strong><span>ผู้สมัคร ${index + 1}</span></td><td>Production<span>Line ${index + 1}</span></td><td>Operator</td><td><span class="sve-account ${index % 2 ? '' : 'is-ready'}">${index % 2 ? 'ยังไม่พร้อม' : 'พร้อม'}</span></td></tr>`).join('');
    return `<style>${css}</style><div class="sve-shell"><header class="sve-hero"><button class="sv-icon-button">←</button><div><p class="sv-eyebrow">จัดการผู้มีสิทธิ์ตามสถานะ</p><h1>แคมเปญทดสอบ Responsive</h1><p>SHE-001-2026 · Version 1</p></div><span class="sv-status-badge">Open</span></header><main class="sve-layout"><section class="sve-panel"><div class="sve-heading"><div><h2>นโยบายผู้มีสิทธิ์ใหม่</h2></div><span>พร้อมใช้งาน</span></div><fieldset class="sve-mode-fieldset"><legend>นโยบายรับผู้มีสิทธิ์ใหม่</legend><div class="sve-mode-grid">${modes.map((label, index) => `<label class="sve-mode-card ${index === 1 ? 'is-selected' : ''}"><input type="radio" ${index === 1 ? 'checked' : ''}><strong>${label}</strong><span>คำอธิบายนโยบายที่ยาวพอสำหรับทดสอบการตัดบรรทัดบนหน้าจอขนาดเล็ก</span></label>`).join('')}</div></fieldset><form class="sve-policy-form"><label><span>เหตุผลการตั้งค่า</span><textarea></textarea></label><button>บันทึกนโยบาย</button></form></section><section class="sve-panel"><div class="sve-heading"><div><h2>Snapshot ปัจจุบัน</h2></div></div><div class="sve-snapshot"><div><strong>Snapshot #2</strong><span>เกิดจากการเพิ่มผู้มีสิทธิ์</span></div><dl>${['ผู้มีสิทธิ์','บัญชีพร้อม','ข้อมูลที่ควรติดตาม','ตรึงเมื่อ'].map((label, index) => `<div><dt>${label}</dt><dd>${index ? '125' : '2,547'}</dd></div>`).join('')}</dl></div></section><section class="sve-panel sve-panel--full"><div class="sve-heading"><div><h2>ตรวจสอบผู้เข้าเงื่อนไขใหม่</h2></div></div><div class="sve-preview-kpis">${modes.concat('การนำออก').map((label, index) => `<div><strong>${index + 1}</strong><span>${label}</span></div>`).join('')}</div><div class="sve-table-wrap"><table><thead><tr><th>พนักงาน</th><th>หน่วยงาน</th><th>ตำแหน่ง</th><th>บัญชี</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="sve-panel sve-panel--full"><div class="sve-heading"><div><h2>ประวัติ Eligibility Amendment</h2></div><span>1 รายการ</span></div><div class="sve-history"><article><div><strong>เพิ่ม 8 คน</strong><small>20 ต.ค. 2569 12:00 น.</small></div><p>เพิ่มพนักงานใหม่ตามประกาศกิจกรรม</p><dl>${['ต้นทาง','ผลลัพธ์','สถานะ','After hash'].map(label => `<div><dt>${label}</dt><dd>ข้อมูลทดสอบ</dd></div>`).join('')}</dl></article></div></section></main><footer class="sve-action-bar"><button>กลับศูนย์จัดการ</button><button>รีเฟรช</button></footer></div>`;
}

function participantBadgeMarkup() {
    const badges = [
        ['initial_snapshot', 'มีสิทธิ์เข้าร่วม'],
        ['automatic_rule_match', 'ได้รับสิทธิ์อัตโนมัติ'],
        ['admin_amendment', 'แอดมินเพิ่มสิทธิ์ให้'],
        ['public_listing', 'ดูรายละเอียดเท่านั้น']
    ];
    return `<style>${css}</style><div class="svp-shell"><section class="svp-card-grid">${badges.map(([origin, label], index) => `<button class="svp-campaign-card"><span class="svp-campaign-card__top"><span class="sv-status-badge">${index === 1 ? 'ส่งแล้ว' : 'เปิดรับการเข้าร่วม'}</span></span><b class="svp-auto-eligibility-chip svp-eligibility-chip is-${origin}">${label}</b><strong>แคมเปญทดสอบ ${index + 1}</strong><span>โหวตยอดนิยม</span></button>`).join('')}</section><header class="svp-detail-header"><button class="sv-icon-button">←</button><div><p class="sv-eyebrow">SHE-001-2026</p><h1>รายละเอียดแคมเปญ</h1><p>สถานะกิจกรรมและแหล่งที่มาของสิทธิ์ต้องแสดงแยกจากกัน</p></div><div class="svp-detail-header__badges"><span class="sv-status-badge">ส่งแล้ว</span><b class="svp-auto-eligibility-chip svp-eligibility-chip is-initial_snapshot">มีสิทธิ์เข้าร่วม</b></div></header></div>`;
}

(async () => {
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
            const page = await browser.newPage({ viewport });
            await page.setContent(markup());
            const result = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                targets: [...document.querySelectorAll('button,input:not([type="radio"]),textarea,.sve-mode-card')].filter(node => getComputedStyle(node).display !== 'none').map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
                columns: getComputedStyle(document.querySelector('.sve-layout')).gridTemplateColumns.split(' ').length,
                historyColumns: getComputedStyle(document.querySelector('.sve-history article dl')).gridTemplateColumns.split(' ').length,
            }));
            assert.equal(result.overflow, false, `${viewport.width}px has horizontal overflow`);
            assert(result.targets.every(target => target.height >= 44), `${viewport.width}px has a target below 44px`);
            assert.equal(result.columns, viewport.width <= 900 ? 1 : 2, `${viewport.width}px workspace columns`);
            assert.equal(result.historyColumns, viewport.width <= 640 ? 1 : viewport.width <= 900 ? 2 : 4, `${viewport.width}px history columns`);
            await page.close();

            const participantPage = await browser.newPage({ viewport });
            await participantPage.setContent(participantBadgeMarkup());
            const participantResult = await participantPage.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                labels: [...document.querySelectorAll('.svp-eligibility-chip')].map(node => node.textContent.trim()),
                backgrounds: [...document.querySelectorAll('.svp-card-grid .svp-eligibility-chip')].map(node => getComputedStyle(node).backgroundColor),
                detailBadgeCount: document.querySelectorAll('.svp-detail-header__badges > *').length,
                detailBadgeColumn: getComputedStyle(document.querySelector('.svp-detail-header__badges')).gridColumnStart
            }));
            assert.equal(participantResult.overflow, false, `${viewport.width}px participant eligibility badges overflow`);
            for (const label of ['มีสิทธิ์เข้าร่วม', 'ได้รับสิทธิ์อัตโนมัติ', 'แอดมินเพิ่มสิทธิ์ให้', 'ดูรายละเอียดเท่านั้น']) assert(participantResult.labels.includes(label), `${viewport.width}px missing ${label}`);
            assert.equal(new Set(participantResult.backgrounds).size, 4, `${viewport.width}px eligibility origins must remain visually distinct`);
            assert.equal(participantResult.detailBadgeCount, 2, `${viewport.width}px detail must show status and eligibility separately`);
            if (viewport.width <= 767) assert.equal(participantResult.detailBadgeColumn, '2', `${viewport.width}px detail badges must align below the title`);
            await participantPage.close();
        }
        console.log('Safety Vote eligibility Admin/User Browser contract: PASS (390, 768, 1366, 1920; responsive, distinct eligibility-origin badges, no overflow, 44px Admin targets)');
    } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
