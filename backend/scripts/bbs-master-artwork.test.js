'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const designer=require('../services/bbs-card-designer');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const migration=read('backend/migrations/20260908_bbs_card_master_artwork.sql');
const node=read('backend/routes/bbs-card-designer.js');
const php=read('api/handlers/bbs_card_designer.php');
const page=read('public/js/pages/bbs-smart-card.js');
const editor=read('public/js/pages/bbs-card-designer.js');

for(const marker of ['BBS_Card_Master_Artwork','uq_bbs_master_artwork_active_slot','MasterArtworkID','fk_bbs_layout_asset_master_artwork'])assert.ok(migration.includes(marker),`Migration missing ${marker}`);
for(const source of [node,php])for(const marker of ['/admin/card-master-artwork','BBS_CARD_MASTER_ARTWORK_ACTIVATE','MasterArtworkID','MasterArtworkKind','MasterArtworkSide'])assert.ok(source.includes(marker),`Server parity missing ${marker}`);
for(const source of [node,php])for(const marker of ['CardArtwork','ScopedFront','GlobalBack','logical'])assert.ok(source.includes(marker),`Logical Artwork binding contract missing ${marker}`);
for(const source of [node,php])for(const marker of ['master-artwork-rebase','BBS_CARD_LAYOUT_MASTER_ARTWORK_REBASE','One or more static assets do not belong to this Draft.'])assert.ok(source.includes(marker),`Master rebase contract missing ${marker}`);
for(const marker of ['function masterArtworkView(','data-master-artwork-upload','GLOBAL BACK','SCOPED FRONT','data-template-scope-form'])assert.ok(page.includes(marker),`Card Artwork UI missing ${marker}`);
assert.ok(editor.includes('Scoped Front'));
assert.ok(editor.includes('Global Back'));
assert.ok(editor.includes('masterArtworkRebaseNeeded'));
assert.ok(editor.includes('dataset.masterArtworkRebaseNote'));
assert.ok(editor.includes('/master-artwork-rebase'));

const parent={WidthMM:60,HeightMM:85,BackgroundStoredName:'legacy.png',OriginalName:'legacy.png',MimeType:'image/png',FileSize:100,IncludeEmployeeID:1};
for(const kind of ['Personal','Department']){
    const legacy=designer.legacyLayout(parent,kind);
    assert.deepEqual(legacy.sides.map(side=>side.side),['Front','Back']);
    assert.equal(designer.assessLayout(legacy).status,'Blocked');
    const isolated={...legacy,sides:legacy.sides.map(side=>({...side,storageClass:'CardArtwork',backgroundAssetId:null,artworkRole:side.side==='Front'?'ScopedFront':'GlobalBack',backgroundStoredName:`logical:${side.side==='Front'?'ScopedFront':'GlobalBack'}`,backgroundMimeType:'application/x-bbs-card-artwork'}))};
    assert.notEqual(designer.assessLayout(isolated).status,'Blocked');
    const crossedRole={...isolated,sides:isolated.sides.map(side=>side.side==='Back'?{...side,artworkRole:'ScopedFront'}:side)};
    assert.ok(designer.assessLayout(crossedRole).items.some(item=>item.code==='CARD_ARTWORK_BACK_REQUIRED'));
}

console.log('BBS legacy Master Artwork compatibility and logical binding contract: PASS');
