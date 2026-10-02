const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../../public/js/utils/accident-anatomy.js'), 'utf8').replace(/export /g, '');
const context = { setTimeout: () => {} };
vm.createContext(context);
vm.runInContext(source, context);
for (const [label, expected] of [
    ['เท้า / นิ้วเท้า', 'foot'],
    ['มือ / นิ้วมือ', 'hand'],
    ['หลัง / เอว', 'back'],
    ['หน้าอก / ซี่โครง', 'chest'],
    ['ศีรษะ / หน้าผาก', 'head'],
    ['ตา / ใบหน้า', 'face'],
    ['คอ / บ่า', 'neck'],
    ['แขน / ข้อศอก', 'arm'],
    ['ขา / เข่า', 'leg'],
    ['ทั่วร่างกาย', 'whole'],
    ['อื่นๆ', null],
]) {
    assert.equal(context.anatomyRegion(label), expected, label);
}

const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
const html = context.renderAccidentAnatomy([
    { bodyPart: 'เท้า / นิ้วเท้า', bodySide: 'Left', label: 'เท้า / นิ้วเท้า · ซ้าย', cnt: 2 },
    { bodyPart: 'หลัง / เอว', bodySide: 'Midline', label: 'หลัง / เอว · กึ่งกลาง', cnt: 1 },
    { bodyPart: '<script>alert(1)</script>', bodySide: 'Not Applicable', cnt: 1 },
], escapeHtml);
assert(html.includes('data-region="foot"'));
assert(html.includes('data-anatomy-view="front"'));
assert(html.includes('data-anatomy-view="back"'));
assert(html.includes('data-anatomy-view="both"'));
assert(html.includes('data-anatomy-fullscreen'));
assert(html.includes('data-anatomy-stage'));
assert(html.includes('data-anatomy-canvas'));
assert.strictEqual((html.match(/data-anatomy-zoom=/g) || []).length, 4, 'Anatomy must expose zoom in/out, fit and reset controls');
assert(html.includes('Mouse wheel / Pinch / Drag'));
assert(html.includes('Heatmap legend from low to high'));
assert(html.includes('#bae6fd') && html.includes('#312e81'), 'Colorblind-friendly five-step heat scale is required');
assert(html.includes('data-anatomy-detail'));
assert(html.includes('aria-live="polite"'));
assert(html.includes('data-anatomy-image'));
assert(html.includes('public/images/accident/anatomy-atlas-v2.png'));
assert(html.includes('data-anatomy-heat="0"'));
assert(html.includes('data-body-side="Left"'));
assert.strictEqual((html.match(/data-anatomy-marker="0"/g) || []).length, 2, 'Left foot must have one count marker per front/back view');
assert.strictEqual((html.match(/data-anatomy-heat="0"/g) || []).length, 2, 'Left foot must illuminate one anatomical side per front/back view');
assert(html.includes('left:59%;top:94%'), 'Front view patient-left foot must be on the viewer right');
assert(html.includes('left:41%;top:94%'), 'Back view patient-left foot must be on the viewer left');
assert(html.includes('50.0%'));
assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(html.includes('<img'));
assert(!html.includes('<svg'));
assert(!html.includes('http://'));
assert(!html.includes('https://'));
assert(!html.includes('OPENAI_API_KEY'));

assert(source.includes('data-anatomy-apply-filter'));
assert(source.includes('data-anatomy-view-reports'));
assert(source.includes('options.onOpenReport'));

const empty = context.renderAccidentAnatomy([], escapeHtml, 'ไม่มีข้อมูลทดสอบ');
assert(!empty.includes('Waiting data'));
assert(!empty.includes('data-anatomy-marker='));
assert(empty.includes('ไม่มีข้อมูลทดสอบ'));
assert(empty.includes('โมเดลกายวิภาคสามมิติ'));
console.log('Anatomy mapping, left/right placement, local 3D atlas, escaping, interaction hooks and empty state: PASS');
