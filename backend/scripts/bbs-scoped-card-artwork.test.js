'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const resolver=require('../services/bbs-card-artwork');
const migration=read('backend/migrations/20260911_bbs_scoped_card_artwork.sql');
const php=read('api/lib/bbs_card_artwork.php');
const nodeDesigner=read('backend/routes/bbs-card-designer.js');
const nodeCards=read('backend/routes/bbs-cards.js');
const nodeCommunity=read('backend/routes/bbs-community.js');
const phpDesigner=read('api/handlers/bbs_card_designer.php');
const phpCards=read('api/handlers/bbs_cards.php');
const phpCommunity=read('api/handlers/bbs_community.php');
const ui=read('public/js/pages/bbs-smart-card.js');

for(const marker of ['BBS_Card_Artwork_Slots','BBS_Card_Artwork_Versions','ArtworkVersionID','ArtworkRole','PreviewDepartmentID','PreviewSafetyUnitID','SafetyUnitID'])assert.ok(migration.includes(marker),`Scoped Artwork migration missing ${marker}`);
for(const marker of ['GlobalBack','ScopedFront','BACK:GLOBAL','FRONT:','Safety Unit does not belong'])assert.ok(php.includes(marker),`PHP Artwork resolver missing ${marker}`);
for(const source of [migration,nodeDesigner,phpDesigner])for(const marker of ['CardArtwork','ScopedFront','GlobalBack'])assert.ok(source.includes(marker),`Logical Artwork binding missing ${marker}`);
for(const source of [nodeCards,phpCards,nodeCommunity,phpCommunity])for(const marker of ['artworkVersionId','resolve'])assert.ok(source.includes(marker),`Issue/print resolver contract missing ${marker}`);
assert.ok(nodeCards.includes("kind:'Personal'"));assert.ok(phpCards.includes("'kind'=>'Personal'"));
assert.ok(nodeCommunity.includes("kind:'Department'"));assert.ok(phpCommunity.includes("'kind'=>'Department'"));
assert.ok(nodeCommunity.includes('/artwork/${Number(artwork.ArtworkVersionID)}/file'));
assert.ok(phpCommunity.includes("'/artwork/'.(int)$artwork['ArtworkVersionID'].'/file'"));
assert.equal(resolver.globalBackSlotKey(),'BACK:GLOBAL');
assert.equal(resolver.scopedFrontSlotKey('Personal',7),'FRONT:Personal:D7');
assert.equal(resolver.scopedFrontSlotKey('Department',7,11),'FRONT:Department:D7:U11');
assert.deepEqual(resolver.artworkCandidateKeys({kind:'Personal',departmentId:7,safetyUnitId:11}),{front:['FRONT:Personal:D7:U11','FRONT:Personal:D7'],back:['BACK:GLOBAL']});
const rows=[
    {SlotKey:'FRONT:Personal:D7',Status:'Active',id:1},
    {SlotKey:'FRONT:Personal:D7:U11',Status:'Active',id:2},
    {SlotKey:'BACK:GLOBAL',Status:'Active',id:3},
    {SlotKey:'FRONT:Department:D7:U11',Status:'Active',id:4},
];
let selected=resolver.selectResolvedArtwork(rows,{kind:'Personal',departmentId:7,safetyUnitId:11});
assert.equal(selected.front.id,2);assert.equal(selected.back.id,3);assert.deepEqual(selected.missing,[]);
selected=resolver.selectResolvedArtwork(rows,{kind:'Personal',departmentId:7,safetyUnitId:12});
assert.equal(selected.front.id,1,'Department Front must be the fallback when Unit Front is absent');
selected=resolver.selectResolvedArtwork(rows,{kind:'Department',departmentId:7,safetyUnitId:12});
assert.equal(selected.front,null,'Artwork must never cross Personal/Department kinds');assert.deepEqual(selected.missing,['Front']);
assert.throws(()=>resolver.artworkCandidateKeys({kind:'Personal'}),/Department/);
for(const marker of ['function resolveTemplateArtwork(','function updateTemplateArtworkMatch(','data-template-artwork-match','data-template-kind="Personal"','data-template-kind="Department"','data-template-artwork-preview','Artwork พร้อมสำหรับ Designer Draft','ใช้ภาพค่าเริ่มต้นระดับแผนก'])assert.ok(ui.includes(marker),`Template Artwork match UI missing ${marker}`);
console.log('BBS Scoped Front and Global Back foundation contract: PASS');
