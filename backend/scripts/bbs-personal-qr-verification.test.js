const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const node=read('backend/routes/bbs-cards.js');
const php=read('api/handlers/bbs_cards.php');
const main=read('public/js/main.js');
const ui=read('public/js/pages/bbs-smart-card.js');

for(const source of [node,php]){
  assert.match(source,/kind.{0,8}Personal/,'Personal QR resolve/claim must identify the card kind');
  assert.match(source,/verification/,'authenticated Personal QR claim must return a verification result');
  assert.match(source,/employeeName/,'verification result must identify the server-resolved card owner');
  assert.match(source,/templateName/,'verification result must identify the server-resolved Active template');
  assert.match(source,/issuedAt/,'verification result must expose the factual issue time');
  assert.match(source,/QR_SCOPE_DENIED/,'verification must retain the existing permission boundary');
  assert.match(source,/inspection/,'the card owner must enter the inspection workspace instead of the generic workspace');
  assert.match(source,/observation/,'an authorized scanner must enter the card owner observation directly');
}

const nodeVerification=node.match(/const verification=\{[^\n]+/i)?.[0]||'';
const phpVerification=php.match(/\$verification=\[[^\n]+/i)?.[0]||'';
assert.doesNotMatch(nodeVerification,/rawToken|TokenHash/i,'Node verification must not expose QR secrets');
assert.doesNotMatch(phpVerification,/rawToken|TokenHash/i,'PHP verification must not expose QR secrets');
assert.match(main,/bbs_qr_verification/,'the authenticated QR result must survive navigation to BBS');
assert.match(ui,/showPersonalQrVerification/,'BBS must show an explicit Personal Card verification result');
assert.match(ui,/ตรวจสอบบัตรสำเร็จ/,'the verification result must be understandable to the scanner');
assert.match(ui,/ข้อมูลนี้ตรวจจากสถานะบัตรและเจ้าของบัตรบนเซิร์ฟเวอร์/,'the UI must explain the server-authoritative verification source');

console.log('BBS Personal QR authenticated verification contract: PASS');
