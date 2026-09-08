'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const migration=read('backend/migrations/20260908_bbs_layout_presets_safe_trash.sql');
const nodeDesigner=read('backend/routes/bbs-card-designer.js');
const phpDesigner=read('api/handlers/bbs_card_designer.php');
const nodeCards=read('backend/routes/bbs-cards.js');
const phpCards=read('api/handlers/bbs_cards.php');
const nodeCommunity=read('backend/routes/bbs-community.js');
const phpCommunity=read('api/handlers/bbs_community.php');
const ui=read('public/js/pages/bbs-card-designer.js');
const cardUi=read('public/js/pages/bbs-smart-card.js');

assert.match(migration,/CREATE TABLE IF NOT EXISTS BBS_Card_Layout_Presets/);
assert.match(migration,/TemplateKind IN \('Personal','Department'\)/);
for(const table of ['BBS_Card_Templates','BBS_Department_Card_Templates','BBS_Card_Layout_Versions'])assert.match(migration,new RegExp(`TABLE_NAME='${table}'[\\s\\S]*?IsDeleted`));
for(const source of [nodeDesigner,phpDesigner]){
    assert.match(source,/card-layout-presets/);
    assert.match(source,/PRESET_KIND_MISMATCH/);
    assert.match(source,/PRIVATE_ASSET_PRESET_FORBIDDEN|static private images/);
    assert.match(source,/Status='Draft'.*IsDeleted=0|Status='Draft' AND IsDeleted=0/s);
    assert.match(source,/card-designer\/versions\/:id\/restore/);
}
for(const source of [nodeCards,phpCards,nodeCommunity,phpCommunity]){
    assert.match(source,/SAFE_TRASH_REJECTED/);
    assert.match(source,/Status<>'Active'/);
    assert.match(source,/DeletedAt=NULL/);
}
assert.match(ui,/บันทึกเป็น Preset/);
assert.match(ui,/Apply to Draft/);
assert.match(ui,/Master Artwork เดิมจะยังคงอยู่/);
assert.match(ui,/ถังขยะ Designer Draft/);
assert.match(cardUi,/ย้าย Template/);
assert.match(cardUi,/กู้คืน Template/);

console.log('BBS Layout Preset / safe Trash contracts: PASS');
