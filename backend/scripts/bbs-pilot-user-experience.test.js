'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('public/js/pages/bbs-smart-card.js');
const main=read('public/js/main.js');
const print=read('public/js/utils/bbs-card-print.js');

assert.ok(ui.includes('data-bbs-compact-header class="relative overflow-hidden'), 'BBS workspace header must remain in normal document flow.');
assert.ok(!ui.includes('data-bbs-compact-header class="sticky top-0'), 'BBS workspace header must not cover mobile content while scrolling.');
assert.ok(ui.includes('bottom:calc(4.75rem + env(safe-area-inset-bottom))!important'), 'Mobile action controls must clear the fixed application navigation.');

const scopedPreview=ui.slice(ui.indexOf('async function loadScopedDepartmentDesignerPreview'),ui.indexOf('async function departmentPrintContext'));
assert.ok(scopedPreview.includes('side.backgroundUrl'));
assert.ok(!scopedPreview.includes('/bbs/admin/'), 'Ordinary Department preview must use server-authorized resource URLs.');
const previewFlow=ui.slice(ui.indexOf('async function openCardTemplatePreview'),ui.indexOf('async function previewDepartmentTemplate'));
assert.ok(previewFlow.includes("kind==='department'?departmentContext?.designerLayouts?.[id]:null"), 'Every Department output preview must select the scoped server snapshot.');
assert.ok(previewFlow.includes('departmentContext?.designerLayouts?.[id]'));
assert.ok(previewFlow.includes("kind==='department'?await loadScopedDepartmentDesignerPreview"), 'Department preview must never fall back to the Admin Designer read contract.');
assert.ok(previewFlow.includes(":await loadActiveDesignerPreview(kind,id)"), 'Personal preview must retain its separate Admin Designer read contract.');

assert.ok(main.includes("!['observation','inspection'].includes(result.data?.mode)"), 'Personal QR inspection intents must not be covered by the verification dialog.');
assert.ok(main.includes("result.data?.mode === 'inspection'"), 'Scanning your own Personal Card must open the inspection workspace without creating self-observation.');
assert.ok(ui.includes("else if(openInspection)"), 'The Personal Card inspection intent must select the inspection tab.');
assert.ok(ui.includes("if(entry.communityDepartment&&state.tab==='community')focusCommunityReportFromQr()"), 'Department QR must focus the Community report form.');
assert.ok(ui.includes('data-community-qr-entry'), 'Department QR entry must remain visible as a server-scoped Community form intent.');
assert.ok(ui.includes("if(entry.qrVerification&&!entry.qrEmployee)showPersonalQrVerification"), 'Personal observation QR must enter the inspection flow directly.');

assert.ok(print.includes('Math.max(600'), 'Direct PNG/JPG output must render at no less than 600 DPI.');
assert.ok(print.includes("pdf.addImage(cardCanvas.toDataURL('image/png'),'PNG',x,y,widthMM,heightMM"), 'Direct PDF output must place source-native card faces at exact physical positions.');
assert.ok((print.match(/Math\.max\(600/g)||[]).length>=2, 'Direct PDF and PNG/JPG output must render at no less than 600 DPI.');
assert.ok(print.includes("DESIGNER_RASTER_EXPORT_CONTRACT='bbs-designer-dom-capture-v3'"), 'Raster output must identify the Print-DOM capture export contract.');
assert.ok(print.includes('Math.round(widthMM/25.4*outputDpi)'), 'Physical millimetres and DPI must determine the exact output pixel grid.');
assert.ok(print.includes('renderer(card,{scale:renderScale'), 'Raster output must capture the same card DOM used by browser Print.');
assert.ok(print.includes('renderScale=targetWidth/rect.width'), 'Raster output must increase capture density without rebuilding the layout.');
assert.ok(print.includes('paintOriginalBackground(context,backgroundImage'), 'Raster output must paint original artwork directly at the final pixel grid.');
assert.ok(!print.includes('nativePixelCss')&&!print.includes('createNativeDesignerCard'), 'Export must never rewrite inline styles or Base64 artwork.');

console.log('BBS controlled-pilot user experience, QR routing and high-resolution output contract: PASS');
