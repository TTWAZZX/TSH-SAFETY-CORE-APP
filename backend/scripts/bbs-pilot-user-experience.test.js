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
assert.ok(previewFlow.includes("kind==='department'&&!state.context?.permissions?.configure"), 'Non-Admin Department preview must select the scoped server snapshot.');
assert.ok(previewFlow.includes('departmentContext?.designerLayouts?.[id]'));

assert.ok(main.includes("result.data?.mode !== 'observation'"), 'Personal QR observation intent must not be covered by the verification dialog.');
assert.ok(ui.includes("if(entry.communityDepartment&&state.tab==='community')focusCommunityReportFromQr()"), 'Department QR must focus the Community report form.');
assert.ok(ui.includes("if(entry.qrVerification&&!entry.qrEmployee)showPersonalQrVerification"), 'Personal observation QR must enter the inspection flow directly.');

assert.ok(print.includes('Math.max(600'), 'Direct PNG/JPG output must render at no less than 600 DPI.');
assert.ok(print.includes('Math.max(450'), 'Direct PDF output must render at no less than 450 DPI.');
assert.ok(print.includes('targetWidth/rect.width'), 'Raster output must render directly to its target pixel grid.');

console.log('BBS controlled-pilot user experience, QR routing and high-resolution output contract: PASS');
