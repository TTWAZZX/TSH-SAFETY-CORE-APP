'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {createPrintReceipt,readPrintReceipt}=require('../services/bbs-card-print-receipt');
const root=path.resolve(__dirname,'../..');
const secret='test-only-bbs-print-receipt-cross-runtime-key';
process.env.JWT_SECRET=secret;
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
function php(input){const run=spawnSync(process.env.PHP_BIN||'C:/xampp/php/php.exe',[path.join(__dirname,'bbs-print-receipt-php-probe.php')],{input:JSON.stringify({secret,...input}),encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);}
(async()=>{
    const source=fs.readFileSync(path.join(root,'public/js/utils/bbs-card-print.js'),'utf8');
    const {designerElementCss,renderDesignerElement,planDesignerSheets,designerPrintDocument}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
    const card=(overrides={})=>({designerRender:{layout:{layoutVersionId:1,widthMM:85.6,heightMM:54,duplexFlip:'LongEdge',backRotation:0,sides:[{side:'Front',backgroundUrl:'/front',bleedMM:1},{side:'Back',backgroundUrl:'/back',bleedMM:1}],elements:[],...overrides},values:{}}});
    const resources=new Map([['/front',png],['/back',png]]);
    check('Front/back are separate sheets with matching mirrored positions',()=>{const [front,back]=planDesignerSheets([card(),card()]);assert.equal(front.side,'Front');assert.equal(back.side,'Back');for(let i=0;i<front.slots.length;i++){assert.ok(Math.abs(front.slots[i].x+back.slots[i].x+front.slots[i].cellWidth-210)<.0001);assert.equal(front.slots[i].y,back.slots[i].y);}});
    check('Short-edge flip mirrors vertical page position',()=>{const [front,back]=planDesignerSheets([card({duplexFlip:'ShortEdge'})]);assert.equal(front.slots[0].x,back.slots[0].x);assert.ok(Math.abs(front.slots[0].y+back.slots[0].y+front.slots[0].cellHeight-297)<.0001);});
    check('Incomplete sheets do not shift the back of the last card',()=>{const sheets=planDesignerSheets(Array.from({length:11},()=>card()));assert.equal(sheets.length,4);assert.equal(sheets[2].slots.length,sheets[3].slots.length);assert.equal(sheets[2].slots[0].cardIndex,sheets[3].slots[0].cardIndex);});
    check('Portrait card dimensions control placement',()=>{const sheets=planDesignerSheets([card({widthMM:54,heightMM:85.6})]);assert.equal(sheets[0].slots[0].width,54);assert.equal(sheets[0].slots[0].height,85.6);});
    check('Front-only cards leave blank reverse slots in a duplex batch',()=>{const single=card({sides:[{side:'Front',backgroundUrl:'/front',bleedMM:1}]});const sheets=planDesignerSheets([card(),single]);assert.equal(sheets[1].slots[1].blank,true);assert.equal(planDesignerSheets([single]).length,1);});
    check('Oversized cards and unsupported paper fail before printing',()=>{assert.throws(()=>planDesignerSheets([card({widthMM:500})]),/does not fit/);assert.throws(()=>planDesignerSheets([card()],'Letter'),/Choose/);});
    check('A5 and A6 are physically laid out without a fixed CR80 grid',()=>{for(const paper of ['A5','A6']){const sheets=planDesignerSheets([card()],paper);assert.equal(sheets[0].paperSize,paper);assert.ok(sheets[0].slots[0].x+sheets[0].slots[0].cellWidth<=sheets[0].width-8+.0001);}});
    const shape={elementType:'Shape',visible:true,xBP:100,yBP:200,widthBP:3000,heightBP:2000,style:{shapeType:'Ellipse',backgroundColor:'#ff0000',borderColor:'#112233',borderWidthPt:3,opacity:.5}};
    check('Shapes retain fill, outline, ellipse and opacity in print',()=>{const output=renderDesignerElement(shape,{},resources,()=>png);for(const token of ['background-color:#ff0000','border:3pt solid #112233','border-radius:50%','opacity:0.5'])assert.ok(output.includes(token),token);});
    check('Canvas physical font and border scale use the same style projector',()=>{const canvas=designerElementCss(shape,{pixelsPerMM:2}),print=designerElementCss(shape);assert.ok(Math.abs(Number(canvas.match(/border:([0-9.]+)px/)[1])-2.1166666666666667)<1e-9);assert.ok(print.includes('border:3pt'));});
    check('Font, alignment, line height, letter spacing and image fit survive',()=>{const output=designerElementCss({...shape,elementType:'DynamicImage',style:{fontFamily:'Tahoma',fontSizePt:18,fontWeight:'400',fontStyle:'italic',textAlign:'right',verticalAlign:'bottom',lineHeight:1.8,letterSpacingPt:2,objectFit:'Cover',objectPositionXBP:1200,objectPositionYBP:3400,borderRadiusBP:500}});for(const token of ['font-family:Tahoma','font-size:18pt','font-weight:400','font-style:italic','text-align:right','justify-content:flex-end','line-height:1.8','letter-spacing:2pt','object-fit:cover','object-position:12% 34%','border-radius:5%'])assert.ok(output.includes(token),token);});
    check('Text is escaped and CSS cannot insert markup',()=>{const output=renderDesignerElement({...shape,elementType:'StaticText',staticText:'<script>alert(1)</script>',style:{color:'red;position:fixed',fontFamily:'</style><script>'}}, {},resources,()=>png);assert.ok(output.includes('&lt;script&gt;'));assert.ok(!output.includes('<script>'));assert.ok(!output.includes('red;position'));});
    check('Unavailable required image blocks output',()=>{assert.throws(()=>renderDesignerElement({...shape,elementType:'StaticImage',assetUrl:'/missing',required:true},{},resources,()=>png),/required card image/);});
    check('HTML has real page breaks, Back rotation, and valid closing script',()=>{const output=designerPrintDocument([card({backRotation:180})],resources,()=>png);assert.ok(output.includes('break-after:page'));assert.ok(output.includes('rotate(180deg)'));assert.ok(output.includes('</script>'));assert.ok(!output.includes('<\\/script>'));});
    check('Missing artwork and incompatible flip jobs are blocked',()=>{assert.throws(()=>designerPrintDocument([card()],new Map(),()=>png),/background is unavailable/);assert.throws(()=>designerPrintDocument([card(),card({duplexFlip:'ShortEdge'})],resources,()=>png),/different duplex/);});
    const expected={kind:'Personal',subjectId:42,actorId:'ADMIN-TEST',fingerprint:'abcdef012345'};
    const snapshot={layout:{layoutVersionId:7,widthMM:85.6,heightMM:54},values:{'employee.full_name':'พนักงานทดสอบ','card.personal_qr':{kind:'PersonalQr',fingerprint:expected.fingerprint}}};
    const receipt=createPrintReceipt({...expected,snapshot},1000);
    check('Receipt freezes the original layout and Thai data',()=>{snapshot.layout.layoutVersionId=8;assert.equal(readPrintReceipt(receipt,expected,1001).layoutVersionId,7);assert.equal(readPrintReceipt(receipt,expected,1001).snapshot.values['employee.full_name'],'พนักงานทดสอบ');});
    check('Node-issued receipt is verified byte-for-byte by PHP',()=>{const result=php({action:'read',receipt,expected,now:1001}).result;assert.deepEqual(result,readPrintReceipt(receipt,expected,1001));});
    check('PHP-issued Department receipt is verified by Node',()=>{const department={kind:'Department',subjectId:9,actorId:'ADMIN-TEST',fingerprint:'012345abcdef'},snap={layout:{layoutVersionId:2},values:{'department.community_qr':{kind:'DepartmentQr',fingerprint:department.fingerprint}}};const signed=php({action:'create',...department,snapshot:snap,now:1000}).result;assert.deepEqual(readPrintReceipt(signed,department,1001).snapshot,snap);});
    for(const [name,changed,now,code] of [
        ['different user',{...expected,actorId:'OTHER'},1001,'BBS_PRINT_RECEIPT_SCOPE'],
        ['different card',{...expected,subjectId:43},1001,'BBS_PRINT_RECEIPT_SCOPE'],
        ['different kind',{...expected,kind:'Department'},1001,'BBS_PRINT_RECEIPT_SCOPE'],
        ['changed QR',{...expected,fingerprint:'changed'},1001,'BBS_PRINT_RECEIPT_QR_CHANGED'],
        ['expired receipt',expected,90000,'BBS_PRINT_RECEIPT_EXPIRED'],
    ])check('Node/PHP both reject '+name,()=>{assert.throws(()=>readPrintReceipt(receipt,changed,now),error=>error.code===code);assert.equal(php({action:'read',receipt,expected:changed,now}).code,code);});
    check('Tampered receipt is rejected by Node and PHP',()=>{const modified=(receipt[0]==='a'?'b':'a')+receipt.slice(1);assert.throws(()=>readPrintReceipt(modified,expected,1001),error=>error.code==='BBS_PRINT_RECEIPT_INVALID');assert.equal(php({action:'read',receipt:modified,expected,now:1001}).code,'BBS_PRINT_RECEIPT_INVALID');});
    console.log('BBS integration print behavior and Node/PHP receipt parity: '+checks+' checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
