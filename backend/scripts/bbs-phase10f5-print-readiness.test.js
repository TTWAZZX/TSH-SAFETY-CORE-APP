const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const nodeReadiness=read('backend/services/bbs-card-designer.js');
const phpReadiness=read('api/lib/bbs_card_designer.php');
const ui=read('public/js/pages/bbs-smart-card.js');

for(const source of [nodeReadiness,phpReadiness]){
  for(const token of ['QR_TOO_SMALL','DPI_LOW','BLEED_LOW_','SAFE_MARGIN_LOW_','BACKGROUND_RESOLUTION_LOW_']) assert.match(source,new RegExp(token),'print readiness parity is missing '+token);
}
assert.match(ui,/data-duplex-flip/,'print output must retain Duplex flip metadata');
assert.match(ui,/backRotation/,'print output must apply the configured Back rotation');
assert.match(ui,/designer-cut/,'print output must include a cut-line guide');
assert.match(ui,/designer-safe/,'print output must include a safe-area guide');
assert.match(ui,/designer-bleed/,'print output must include a bleed guide');
assert.match(ui,/designerPrintResources/,'private print artwork must be loaded through authorized endpoints');
assert.match(ui,/card\.designerRender\?\.layout/,'legacy print must remain available if designer rendering is disabled or lacks an Active layout');
console.log('BBS Phase 10F-5 print readiness, duplex, cut/safe/bleed and legacy fallback contract: PASS');
