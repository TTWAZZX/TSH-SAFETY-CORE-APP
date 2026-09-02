'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
    'const cardTemplateAssetCache = new Map()',
    'const CARD_PREVIEW_DPI = 150',
    'function assessCardTemplate(',
    'function compositeCardPreview(',
    'function previewReadinessPanel(',
    'async function openCardTemplatePreview(',
    'COMPOSITE CARD PREVIEW',
    'Print Readiness',
    'เส้นสีส้ม = ขอบตัด',
    'เส้นสีฟ้า = Safe area',
    "API.get(`/bbs/department-cards/me?departmentId=",
    "intent:'activate'",
    "intent:'print'",
    "intent:'issue'",
    "intent:'replace'",
    'data-preview-confirm',
    "assessment.status==='blocked'?'disabled':''"
]) assert.ok(ui.includes(marker), `Phase 10B-4 UI missing ${marker}`);

for (const readiness of [
    'ขนาดบัตร',
    'สัดส่วนรูปพื้นหลัง',
    'ความละเอียดสำหรับพิมพ์',
    'ชนิดไฟล์พื้นหลัง',
    'พื้นที่ QR',
    'พื้นที่ข้อความ',
    'ข้อมูลแผนก',
    'ข้อมูล QR'
]) assert.ok(ui.includes(readiness), `Phase 10B-4 readiness missing ${readiness}`);

const personalTransition = ui.slice(ui.indexOf('async function transitionTemplate('), ui.indexOf('async function performTemplateTransition('));
assert.ok(personalTransition.includes("openCardTemplatePreview('personal'"), 'Personal activation must pass through composite preview');

const departmentTransition = ui.slice(ui.indexOf('async function transitionDepartmentTemplate('), ui.indexOf('async function performDepartmentTemplateTransition('));
assert.ok(departmentTransition.includes("openCardTemplatePreview('department'"), 'Department activation must pass through composite preview');

const departmentPrint = ui.slice(ui.indexOf('async function printDepartmentTemplate('), ui.indexOf('async function executeDepartmentPrint('));
assert.ok(departmentPrint.includes("intent:'print'"), 'Department printing must pass through readiness preview');

const issue = ui.slice(ui.indexOf('async function issueCards('), ui.indexOf('async function replaceCard('));
assert.ok(issue.indexOf("intent:'issue'") < issue.indexOf('openCardPrintPopup()'), 'Personal issue preview must happen before opening the secure print flow');
assert.ok(issue.indexOf('openCardPrintPopup()') < issue.indexOf("API.post('/bbs/admin/cards/issue'"), 'Popup safety must remain before the one-time QR mutation');

const replace = ui.slice(ui.indexOf('async function replaceCard('), ui.indexOf('async function revokeCard('));
assert.ok(replace.indexOf("intent:'replace'") < replace.indexOf('openCardPrintPopup()'), 'Personal replacement must show preview before print');
assert.ok(replace.indexOf('openCardPrintPopup()') < replace.indexOf("API.post(`/bbs/admin/cards/${id}/replace`"), 'Replacement popup safety must remain before QR rotation');

assert.ok(ui.includes("border:.2mm dashed #f97316"), 'Print output must expose the cut boundary');
assert.ok(ui.includes(".safe{position:absolute;inset:4%;border:.2mm dashed #0891b2"), 'Print output must retain a non-printing safe-area guide');
assert.match(main, /bbs-smart-card\.js\?v=20260901-bbs-phase10(?:b4|d[1-5])/);
assert.match(html, /main\.js\?v=20260901-bbs-phase10(?:b4|d[1-5])/);

console.log('BBS Phase 10B-4 Template Preview & Print Readiness contract: PASS');
