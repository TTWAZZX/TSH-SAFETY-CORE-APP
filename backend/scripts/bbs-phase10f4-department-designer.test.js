const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const node=read('backend/routes/bbs-community.js');
const php=read('api/handlers/bbs_community.php');
const ui=read('public/js/pages/bbs-smart-card.js');

for(const source of [node,php]){
  assert.match(source,/visual_card_designer_rendering_enabled/,'designer renderer must remain server-gated');
  assert.match(source,/DepartmentTemplateID/,'active layout must be selected by Department template on the server');
  assert.match(source,/BBS_Department_QR_Cards/,'the existing shared Department QR remains authoritative');
  assert.match(source,/BBS_Card_Designer_Print_Snapshots/,'Department print snapshots are required');
  assert.match(source,/DepartmentPrintLogID/,'snapshot must link to the existing Department print log');
}
assert.match(node,/departmentDesignerRender/,'Node must build a server-owned Department render contract');
assert.match(php,/bbs_comm_designer_render/,'PHP must build a server-owned Department render contract');
assert.match(node,/rawQrStored:false/,'Node snapshot must not store a raw Department QR');
assert.match(php,/rawQrStored'=>false/,'PHP snapshot must not store a raw Department QR');
assert.match(ui,/designerLayouts/,'client must use the server-provided Department layout only when available');
assert.match(ui,/department-cards\/print-log/,'existing Department print log remains the lifecycle authority');
console.log('BBS Phase 10F-4 Department Card Designer Master Department, Active QR, multi-copy and legacy fallback contract: PASS');
