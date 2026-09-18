'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const designer=read('public/js/pages/bbs-card-designer.js');
const page=read('public/js/pages/bbs-smart-card.js');
const main=read('public/js/main.js');
const index=read('index.html');

assert.match(designer,/previewEmployees:\[\]/,'Designer runtime must isolate employee preview rows from saved layout data.');
assert.match(designer,/function previewValues\(\)/,'Designer must resolve real employee preview values.');
assert.match(designer,/\/bbs\/admin\/card-employees\?\$\{query\}/,'Designer must load permission-scoped real employee rows when opened.');
for(const field of ['employee.full_name','employee.department','employee.position','employee.bbs_level'])assert.ok(designer.includes(`'${field}'`),`Preview must map ${field}.`);
assert.match(designer,/REAL EMPLOYEE PREVIEW/,'Personal Designer must expose an employee preview selector.');
assert.match(designer,/does not affect saved output/,'Canvas zoom must be explicitly labelled as display-only.');
assert.match(designer,/function recommendedLayerKeys\(\)/,'Designer must provide the guarded Personal output group.');
for(const key of ['personal-qr','employee-position','employee-department','employee-name'])assert.ok(designer.includes(`'${key}'`),`Recommended group must include ${key}.`);
assert.match(designer,/function scaleSelectedLayers\(factor=\.7\)/,'Designer must implement a persisted 70% group transform.');
assert.match(designer,/function layerScaleAnchor\(element\)/,'Designer must resolve a stable visual anchor per selected layer.');
assert.match(designer,/key==='personal-qr'.*return\{x:1,y:1,label:'bottom-right'\}/,'Personal QR must remain anchored to its bottom-right corner.');
assert.match(designer,/key==='employee-position'.*return\{x:1,y:\.5,label:'right'\}/,'Employee position must remain right anchored.');
assert.match(designer,/key==='employee-name'.*return\{x:0,y:\.5,label:'left'\}/,'Employee name must remain left anchored.');
assert.match(designer,/key==='employee-department'.*return\{x:\.5,y:\.5,label:'center'\}/,'Employee department must preserve its own center.');
assert.match(designer,/num\(element\.xBP\)\+\(oldWidth-width\)\*anchor\.x/,'Layer geometry must scale around each layer own horizontal anchor.');
assert.doesNotMatch(designer,/centerX\+\(num\(element\.xBP\)-centerX\)\*factor/,'Selected layers must never collapse toward one shared center.');
assert.match(designer,/\['fontSizePt','letterSpacingPt','borderWidthPt'\]/,'Typography and stroke dimensions must scale with geometry.');
assert.match(designer,/runtime\.record\.Status==='Draft'/,'Designer mutation controls must remain Draft-only.');
assert.match(designer,/Create editable Draft copy/,'Active layouts must offer an explicit immutable-to-Draft copy action.');
assert.match(designer,/sourceVersionId:Number\(row\.id\)/,'Draft copy must use the server-authoritative same-template clone contract.');
assert.match(page,/previewEmployees:state\.cardEmployees\.filter/,'Admin Personal Designer must receive permission-scoped employee rows.');
assert.match(page,/previewEmployees:String\(kind\)\.toLowerCase\(\)==='personal'/,'Restored Personal Designer sessions must retain real preview rows.');
assert.match(main,/20260918-bbs-designer-real-preview-r1/,'Main module must cache-bust the updated BBS page.');
assert.match(page,/20260918-bbs-designer-real-preview-r1/,'BBS page must cache-bust the updated Designer module.');
assert.match(index,/public\/js\/main\.js\?v=20260918-bbs-designer-real-preview-r1/,'HTML entry point must cache-bust the updated main module.');

console.log('BBS Card Designer real preview and 70% group scale contract passed.');
