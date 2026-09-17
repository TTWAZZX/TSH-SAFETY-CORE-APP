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
    'async function loadActiveDesignerPreview(',
    'function assessDesignerPreview(',
    'function designerCompositeCardPreview(',
    'designerCardFaceHtml({layout,values},side.side,designer.resources,qrDataUrl,{pixelsPerMM',
    'data-renderer-contract="bbs-designer-card-face-v2"',
    'saveDesignerPrintPdf',
    'saveDesignerPrintImages',
    'function mountDesignerOutputActions(',
    'data-card-output-pdf',
    'data-card-output-image="png"',
    'data-card-output-image="jpg"',
    'บันทึก PDF',
    'บันทึก PNG',
    'บันทึก JPG',
    'ACTIVE DESIGNER · V',
    'Legacy Preview · ยังไม่มี Active Designer',
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

const compositeFlow = ui.slice(ui.indexOf('async function openCardTemplatePreview('), ui.indexOf('async function previewDepartmentTemplate('));
assert.ok(compositeFlow.indexOf('loadActiveDesignerPreview(kind,id)') < compositeFlow.indexOf('loadCardTemplateAsset(kind,id)'), 'Composite Preview must resolve Active Designer before Legacy fallback');
assert.ok(compositeFlow.includes('designerCompositeCardPreview(kind,template,designer'), 'Active Designer must drive Composite Preview geometry');
assert.ok(compositeFlow.includes("designer?null:await loadCardTemplateAsset(kind,id)"), 'Legacy image must load only when no Active Designer exists');
assert.ok(ui.includes('mountDesignerOutputActions(popup,{filename:cardOutputFilename(`BBS_Department_'), 'Department Designer output must offer direct PDF save');
assert.ok(ui.includes('mountDesignerOutputActions(popup,{filename:cardOutputFilename(cards.length===1?`BBS_Personal_'), 'Personal Designer output must offer direct PDF save while its issued QR remains available');

assert.ok(ui.includes("border:.2mm dashed #f97316"), 'Print output must expose the cut boundary');
assert.ok(ui.includes('.safe,.designer-safe{position:absolute;border:.2mm dashed #0891b2') && ui.includes('.safe{inset:4%}') && ui.includes('.safe,.designer-safe,.designer-bleed{display:none}'), 'Print output must retain a safe-area guide and hide it when printing');
require('./bbs-runtime-assets').assertBbsRuntimeAssets();


console.log('BBS Phase 10B-4 Template Preview & Print Readiness contract: PASS');
