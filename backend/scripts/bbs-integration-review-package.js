'use strict';
// Local, review-only packaging. Never connects to Production or changes settings.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'output/bbs-admin-review-20260905');
const baseline=path.join(root,'backups/production/reconcile-bbs-20260905/runtime');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedFiles=['api/handlers/patrol.php','public/js/pages/patrol.js','api/handlers/workflow_phase6.php','public/js/pages/cccf.js'];
const guards=protectedFiles.map(file=>{assert.equal(read(path.join(root,file)),read(path.join(baseline,file)),`${file} differs from verified Production`);return {file,sha256:sha(path.join(root,file)),productionSha256:sha(path.join(baseline,file)),normalizedMatch:true};});
for(const file of ['index.html','public/js/main.js']){
  const strip=s=>s.replace(/20260905-bbs-integration-r1/g,'CACHE').replace(/20260904-cccf-c1c4/g,'CACHE');
  // Ignore only cache query values: all imports, paths and application content remain compared.
  const normalize=s=>s.replace(/([?&]v=)[A-Za-z0-9._-]+/g,'$1CACHE');
  assert.equal(normalize(read(path.join(root,file))),normalize(read(path.join(baseline,file))),`${file} has changes beyond cache versions`);
}
const files=['index.html','public/js/main.js','public/js/pages/bbs-smart-card.js','public/js/pages/bbs-card-designer.js','public/js/utils/bbs-card-print.js','api/handlers/bbs_cards.php','api/handlers/bbs_community.php','api/lib/bbs_card_print_receipt.php'];
fs.mkdirSync(out,{recursive:true});
const manifest=files.map(file=>{
 const source=path.join(root,file),target=path.join(out,'candidate',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
 const old=path.join(baseline,file);let rollbackSha256=null;
 if(fs.existsSync(old)){const dest=path.join(out,'rollback-reference',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(old,dest);rollbackSha256=sha(dest);}
 assert.equal(sha(source),sha(target));return {file,sha256:sha(target),bytes:fs.statSync(target).size,rollbackSha256,newFile:!fs.existsSync(old)};
});
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({status:'REVIEW_ONLY_NOT_DEPLOYED',target:'https://dev.tshpcl.com/safety/tsh-safety-core',requiredFlags:{staged_admin_only:1,pilot_scope_only:0,visual_card_designer_enabled:0,visual_card_designer_rendering_enabled:0},files:manifest,protectedFiles:guards},null,2)+'\n');
fs.copyFileSync(path.join(root,'docs/bbs-integration-review-20260905.md'),path.join(out,'REVIEW.md'));
console.log('PASS: 4 Patrol/CCCF runtime files match Production; 2 shared entry files differ only in cache versions.');
console.log('Review package: '+out+' (8 runtime files, SHA-256 manifest, rollback references; no secrets/uploads/database included).');
