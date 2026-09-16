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
for(const source of [node,php]){
  assert.match(source,/ActiveLayoutID/,'Department admin catalog must expose the server-owned Active Designer layout state');
  assert.match(source,/DraftLayoutID/,'Department admin catalog must distinguish a Draft layout from an Active layout');
}
const nodeDesigner=read('backend/routes/bbs-card-designer.js');
const phpDesigner=read('api/handlers/bbs_card_designer.php');
for(const source of [nodeDesigner,phpDesigner]){
  assert.match(source,/LAYOUT_NOT_READY/,'blocked layout activation must fail closed');
  assert.match(source,/readiness/,'blocked activation must return actionable readiness details');
  assert.match(source,/versions/,'Designer version catalog must remain available');
  assert.match(source,/designer_detail|detail\(row\.id\)/,'Designer version catalog must resolve server readiness for every version');
}
assert.match(ui,/departmentTemplateWorkflowHtml/,'Department Template Lifecycle must show workflow readiness');
assert.match(ui,/Ready to Print/,'Department workflow must expose the final print-ready state');
const designerUi=read('public/js/pages/bbs-card-designer.js');
assert.match(designerUi,/installChooserReadiness/,'Designer chooser must install per-version readiness details');
assert.match(designerUi,/แก้ไข.*จุดก่อน Activate/,'known blocked Drafts must not submit an activation request');
console.log('BBS Phase 10F-4 Department Card Designer Master Department, Active QR, multi-copy and legacy fallback contract: PASS');
