'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const nodeCards=read('backend/routes/bbs-cards.js');
const phpCards=read('api/handlers/bbs_cards.php');
const nodeCommunity=read('backend/routes/bbs-community.js');
const phpCommunity=read('api/handlers/bbs_community.php');
const ui=read('public/js/pages/bbs-smart-card.js');

for(const source of [nodeCards,phpCards]){
  assert.match(source,/PrintCount/,'Personal card catalogs must show print counts');
  assert.match(source,/LastPrintedAt/,'Personal card catalogs must show the last print time');
  assert.match(source,/reprintRequiresReplace[^\n]{0,30}(true|=>true)/i,'Personal reprint must require secure replacement');
  assert.match(source,/BBS_Card_Designer_Print_Snapshots/,'Personal detail must identify Designer snapshots');
  const detail=source.match(/(?:router\.get\('\/admin\/cards\/:id'|\$cardDetail=route_params)[\s\S]*?(?=router\.|\$revoke=|\n\s*if\(\$method===|$)/)?.[0]||'';
  assert.doesNotMatch(detail,/SELECT[^\n]*(TokenHash|SnapshotJSON)|rawToken/i,'Personal detail must not expose QR secrets or snapshot payloads');
}

for(const source of [nodeCommunity,phpCommunity]){
  assert.match(source,/department-card-output-history/,'Department output history route must exist in both runtimes');
  assert.match(source,/bbs_list_query|listQuery/,'Department output history must be paged server-side');
  assert.match(source,/departmentId/,'Department output history must support Department filtering');
  assert.match(source,/QRGeneration/,'Department output history must identify the QR generation used');
  assert.match(source,/SnapshotID/,'Department output history must identify the immutable print snapshot');
  const history=source.match(/department-card-output-history[\s\S]*?(?=router\.|\n\s*if\(\$method===|$)/)?.[0]||'';
  assert.doesNotMatch(history,/SnapshotJSON|TokenHash|rawToken/i,'Department output history must expose metadata only');
}

for(const token of ['บัตร Personal ที่ออกแล้ว','บัตร Department ที่ออกและพิมพ์แล้ว','Replace + Reprint','department-prints','openPersonalCardDetail','loadDepartmentPrintRows'])assert.ok(ui.includes(token),`UI contract missing: ${token}`);
assert.match(ui,/ระบบไม่เก็บหรือเปิดเผย Personal QR ดิบ/,'UI must explain why old Personal cards cannot be downloaded again');
assert.match(ui,/พิมพ์ใหม่ได้เฉพาะ Template และ QR ที่ยัง Active/,'Department output history must fail closed for inactive sources');

console.log('BBS issued-card catalog and secure reprint contract: PASS');
