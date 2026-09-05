const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const nodeCards=read('backend/routes/bbs-cards.js');
const phpCards=read('api/handlers/bbs_cards.php');
const client=read('public/js/pages/bbs-smart-card.js');

for(const source of [nodeCards,phpCards]){
  assert.match(source,/visual_card_designer_rendering_enabled/,'renderer flag must be server-authoritative');
  assert.match(source,/activePersonalDesignerLayout|bbs_card_active_personal_designer_layout/,'server must select an Active Personal layout');
  assert.match(source,/TokenFingerprint/,'print snapshot must use the existing QR fingerprint');
  assert.match(source,/BBS_Card_Designer_Print_Snapshots/,'print snapshot persistence is required');
  assert.match(source,/designerRender/,'designer render contract must be opt-in');
}
assert.match(nodeCards,/rawQrStored:false/,'Node snapshot metadata must never store a raw QR');
assert.match(phpCards,/rawQrStored'=>false/,'PHP snapshot metadata must never store a raw QR');
assert.doesNotMatch(nodeCards,/StoredName[^\n]{0,100}designerRender/,'Node must not expose stored names in a designer render contract');
assert.doesNotMatch(phpCards,/StoredName[^\n]{0,100}'designerRender'/,'PHP must not expose stored names in a designer render contract');
assert.match(client,/designerPrintResources/,'client must resolve private designer artwork through authorized endpoints');
assert.match(client,/card\.designerRender\?\.layout/,'legacy rendering must remain available when no designer layout is returned');
assert.match(client,/API\.post\('\/bbs\/admin\/cards\/print-log'/,'existing print log workflow must remain authoritative');
console.log('BBS Phase 10F-3 Personal Card Designer server-selected layout, QR lifecycle and legacy fallback contract: PASS');
