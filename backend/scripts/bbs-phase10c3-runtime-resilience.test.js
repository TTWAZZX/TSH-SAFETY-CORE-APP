'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
    'loadErrors:{}',
    'loadedAt:{}',
    "const operationLocks = new WeakSet()",
    'async function trackSectionLoad(section, loader)',
    'function sectionRecoveryView(section, content)',
    'async function withBusy(control, task',
    'function bindBusy(control, eventName, handler, label)',
    "control.setAttribute('aria-busy', 'true')",
    "target.disabled = true",
    "control.removeAttribute('aria-busy')",
    'async function retrySection(section)',
    "data-bbs-retry=\"${section}\"",
    "role=\"alert\"",
    'กำลังแสดงข้อมูลล่าสุดที่โหลดสำเร็จ',
    'ยังไม่มีข้อมูลที่ยืนยันได้',
    'async function loadCoreData()',
    "trackSectionLoad('community', loadCommunity)",
    "trackSectionLoad('inspectors', loadInspectorData)",
    "trackSectionLoad('core', loadCoreData)",
    "trackSectionLoad('cards', loadCardAdmin)",
    'data-bbs-page-reload',
    'ลองเชื่อมต่อใหม่'
]) {
    assert.ok(ui.includes(marker), `Phase 10C-3 UI missing ${marker}`);
}

for (const section of ['core', 'history', 'community', 'inspectors', 'actions', 'analytics', 'cards']) {
    assert.ok(ui.includes(`sectionRecoveryView('${section}'`) || ui.includes(`${section}:load`), `Recovery path missing ${section}`);
}

for (const busyLabel of ['กำลังส่ง...', 'กำลังบันทึก...', 'กำลังอัปโหลด...', 'กำลังออกบัตร...', 'กำลังออก QR...', 'กำลังแต่งตั้ง...']) {
    assert.ok(ui.includes(busyLabel), `Busy feedback missing ${busyLabel}`);
}

require('./bbs-runtime-assets').assertBbsRuntimeAssets();


const loadInspectorStart = ui.indexOf('async function loadInspectorData()');
const loadInspectorEnd = ui.indexOf('async function appointInspector', loadInspectorStart);
const inspectorSource = ui.slice(loadInspectorStart, loadInspectorEnd);
assert.ok(inspectorSource.includes('throw error;'), 'Inspector load failure must reach section recovery');
assert.ok(!inspectorSource.includes("state.tab='workspace'"), 'Inspector failure must not silently navigate away');

const loadDataStart = ui.indexOf('async function loadData()');
const loadDataEnd = ui.indexOf('async function uploadCardTemplate', loadDataStart);
const loadDataSource = ui.slice(loadDataStart, loadDataEnd);
assert.ok(loadDataSource.includes('Promise.all(['), 'Independent section loads should run without serial page blocking');
assert.ok(!loadDataSource.includes('await loadCommunity();'), 'Community failure must not reject the whole page load');

for (const forbidden of ['fetch(', 'XMLHttpRequest', 'localStorage.clear()', 'sessionStorage.clear()']) {
    assert.ok(!ui.slice(ui.indexOf('async function trackSectionLoad'), ui.indexOf('function workspaceView')).includes(forbidden), `Recovery layer must not introduce ${forbidden}`);
}

console.log('BBS Phase 10C-3 runtime resilience contract: PASS');
