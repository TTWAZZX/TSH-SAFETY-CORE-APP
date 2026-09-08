'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
process.env.JWT_SECRET=process.env.JWT_SECRET||'bbs-personal-duplex-test-secret';
const designer=require('../services/bbs-card-designer');
const {createPrintReceipt,readPrintReceipt,PrintReceiptError}=require('../services/bbs-card-print-receipt');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const catalog=designer.catalog();
assert.ok(catalog.dataSources.Personal.includes('card.personal_qr'));
assert.ok(catalog.dataSources.Personal.includes('department.community_qr'));
assert.ok(!catalog.dataSources.Department.includes('card.personal_qr'),'Department templates must remain separate from Personal templates');

const parent={WidthMM:60,HeightMM:85,BackgroundStoredName:'personal.png',OriginalName:'personal.png',MimeType:'image/png',FileSize:100,IncludeEmployeeID:1};
const legacy=designer.legacyLayout(parent,'Personal');
const layout={...legacy,sides:legacy.sides.map((side,index)=>({...side,storageClass:'DesignerAsset',backgroundAssetId:index+1,masterArtworkId:index+101,masterArtworkKind:'Personal',masterArtworkSide:side.side}))};
assert.deepEqual(layout.sides.map(side=>side.side),['Front','Back']);
assert.ok(layout.elements.some(element=>element.side==='Front'&&element.elementType==='QR'&&element.dataSourceKey==='card.personal_qr'));
assert.ok(layout.elements.some(element=>element.side==='Back'&&element.elementType==='QR'&&element.dataSourceKey==='department.community_qr'));
assert.notEqual(designer.assessLayout(layout).status,'Blocked');

const withoutBackQr={...layout,elements:layout.elements.filter(element=>element.dataSourceKey!=='department.community_qr')};
assert.equal(designer.assessLayout(withoutBackQr).status,'Blocked');
assert.ok(designer.assessLayout(withoutBackQr).items.some(item=>item.code==='DEPARTMENT_QR_BACK_MISSING'));
const departmentOnFront={...layout,elements:layout.elements.map(element=>element.dataSourceKey==='department.community_qr'?{...element,side:'Front'}:element)};
assert.ok(designer.assessLayout(departmentOnFront).items.some(item=>item.code==='DEPARTMENT_QR_BACK_MISSING'));

const snapshot={layout:{layoutVersionId:91},values:{'card.personal_qr':{kind:'PersonalQr',fingerprint:'personal1234'},'department.community_qr':{kind:'DepartmentQr',fingerprint:'department1'}}};
const receipt=createPrintReceipt({kind:'Personal',subjectId:44,actorId:'ADMIN',snapshot},1000);
assert.deepEqual(readPrintReceipt(receipt,{kind:'Personal',subjectId:44,actorId:'ADMIN',fingerprint:'personal1234',departmentFingerprint:'department1'},1001).snapshot,snapshot);
assert.throws(()=>readPrintReceipt(receipt,{kind:'Personal',subjectId:44,actorId:'ADMIN',fingerprint:'personal1234',departmentFingerprint:'rotated'},1001),error=>error instanceof PrintReceiptError&&error.code==='BBS_PRINT_RECEIPT_DEPARTMENT_QR_CHANGED');

const nodeCards=read('backend/routes/bbs-cards.js'),phpCards=read('api/handlers/bbs_cards.php'),phpDesigner=read('api/lib/bbs_card_designer.php'),client=read('public/js/pages/bbs-smart-card.js'),editor=read('public/js/pages/bbs-card-designer.js');
for(const source of [nodeCards,phpCards])for(const marker of ['PERSONAL_CARD_DEPARTMENT_QR_REQUIRED','PERSONAL_CARD_LAYOUT_QR_REQUIRED','department.community_qr','DepartmentQrFingerprint'])assert.ok(source.includes(marker),`Server parity missing ${marker}`);
assert.ok(phpDesigner.includes("'Personal'=>['employee.full_name'")&&phpDesigner.includes("'department.community_qr'"));
for(const marker of ['function personalDuplexPreview(','function legacyPersonalPrintDocument(','ด้านหน้า · Personal QR','ด้านหลัง · Department QR'])assert.ok(client.includes(marker),`Client duplex preview/print missing ${marker}`);
assert.ok(editor.includes("runtime.side==='Back'?'department.community_qr':'card.personal_qr'"));
console.log('BBS Personal Card Front Personal QR and Back Department QR contract: PASS');
