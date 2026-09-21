'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('public/js/pages/bbs-smart-card.js');
const node=read('backend/routes/bbs-cards.js');
const php=read('api/handlers/bbs_cards.php');

const newIssue=ui.indexOf('ออกบัตร Personal ใหม่');
const issued=ui.indexOf('บัตร Personal ที่ออกแล้ว');
const batchControls=ui.indexOf('${personalBatchPrintControls()}',issued);
assert.ok(newIssue>=0&&issued>newIssue,'Personal issue and issued-card workspaces must remain visibly separate');
assert.ok(batchControls>issued,'Batch sheet and duplex controls must live under issued Personal cards');
assert.equal(ui.slice(newIssue,issued).includes('${personalBatchPrintControls()}'),false,'New-card issuance must not own issued-card batch print controls');
for(const token of ['state.personalReprint','data-card-print-select','data-card-print-select-page','data-bbs-card-batch-replace-print','replaceSelectedCards','/bbs/admin/cards/replace-batch'])assert.ok(ui.includes(token),`Issued-card batch UI contract missing: ${token}`);
assert.match(ui,/Personal QR เดิมของทุกใบจะถูกยกเลิก/,'Admin must receive an explicit QR-rotation warning before mutation');
assert.match(ui,/selected\.length>100/,'Client must cap a replacement batch at 100 cards');

for(const [runtime,source] of [['Node',node],['PHP',php]]){
  assert.ok(source.includes('/admin/cards/replace-batch'),`${runtime} batch replacement route is required`);
  assert.match(source,/BBS_CARD_BATCH_REPLACE/,`${runtime} must write one explicit batch replacement audit event`);
  assert.match(source,/BATCH_CARD_STATE_CHANGED/,`${runtime} must fail closed when any selected card is stale`);
  assert.match(source,/FOR UPDATE/,`${runtime} must lock selected cards before QR rotation`);
  assert.match(source,/ReplacedByCardID/,`${runtime} must preserve the old-to-new card chain`);
  assert.match(source,/count\([^\n]*ids\)>100|ids\.length>100/,`${runtime} must cap a replacement batch at 100 cards`);
}

const nodeRoute=node.match(/router\.post\('\/admin\/cards\/replace-batch'[\s\S]*?(?=\nrouter\.)/)?.[0]||'';
assert.match(nodeRoute,/beginTransaction/,'Node batch replacement must be transactional');
assert.match(nodeRoute,/rollback/,'Node batch replacement must roll back the whole batch on failure');
assert.match(nodeRoute,/issueWithin/,'Node batch replacement must use the canonical secure issuance path');
const phpRoute=php.match(/if\(\$method==='POST'&&\$path==='\/bbs\/admin\/cards\/replace-batch'\)[\s\S]*?(?=\n\s*\$revoke=)/)?.[0]||'';
assert.match(phpRoute,/beginTransaction/,'PHP batch replacement must be transactional');
assert.match(phpRoute,/rollBack/,'PHP batch replacement must roll back the whole batch on failure');
assert.match(phpRoute,/bbs_card_issue/,'PHP batch replacement must use the canonical secure issuance path');

console.log('BBS issued-card batch Replace + Print contract: PASS');
