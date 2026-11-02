'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const expected = Object.freeze([
    'AGENTS.md','CHANGELOG.md','api/handlers/patrol.php',
    'backend/migrations/20261102_patrol_extra_advance.rollback.sql','backend/migrations/20261102_patrol_extra_advance.sql',
    'backend/package.json','backend/routes/patrol.js','backend/scripts/patrol-checkin-v2-browser-uat.js',
    'backend/scripts/patrol-extra-advance-local-uat.js','backend/scripts/patrol-extra-advance-preflight.js',
    'backend/scripts/patrol-extra-advance-production-deploy.js','backend/scripts/patrol-extra-advance.test.js',
    'backend/scripts/production-deployment-policy.js','docs/safety-patrol-extra-advance.md','index.html','package.json','public/js/main.js','public/js/pages/patrol.js',
]);
const forbidden = /(^|\/)(?:\.env(?:\.|$)|config\.local|uploads?|backups?|credentials?|secrets?)(?:\/|$)/i;
const secretPatterns = [/(?:BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/, /AKIA[0-9A-Z]{16}/, /(?:password|secret|token)\s*[:=]\s*['"][^'"]{16,}['"]/i];
const run = args => { const result=spawnSync('git',args,{cwd:root,encoding:null,windowsHide:true}); assert.equal(result.status,0,String(result.stderr||'git failed')); return result.stdout; };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const names = run(['diff','--cached','--name-only','--diff-filter=ACMR']).toString('utf8').trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(names,[...expected].sort(),'Staged release scope differs from the reviewed allowlist');
assert.equal(names.filter(name=>forbidden.test(name)).length,0,'Forbidden local/config/upload/backup path is staged');
const files = names.map(name => { const bytes=run(['show',`:${name}`]); const text=bytes.toString('utf8'); for(const pattern of secretPatterns)assert(!pattern.test(text),`Potential secret pattern in ${name}`); return {path:name,bytes:bytes.length,sha256:sha(bytes)}; });
const manifest={contract:'2026-11-02-patrol-extra-advance-r1',generatedAt:new Date().toISOString(),branch:run(['branch','--show-current']).toString('utf8').trim(),baseCommit:run(['rev-parse','HEAD']).toString('utf8').trim(),files};
const stamp=manifest.generatedAt.replace(/[-:TZ.]/g,'').slice(0,14),dir=path.join(root,'backups','local',`patrol-extra-advance-preflight-${stamp}`);fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,'candidate-manifest.json');fs.writeFileSync(target,`${JSON.stringify(manifest,null,2)}\n`);const manifestSha256=sha(fs.readFileSync(target));fs.writeFileSync(path.join(dir,'result.json'),`${JSON.stringify({decision:'PASS_PATROL_EXTRA_ADVANCE_WORKING_TREE_PREFLIGHT',manifestSha256,fileCount:files.length},null,2)}\n`);console.log(JSON.stringify({decision:'PASS_PATROL_EXTRA_ADVANCE_WORKING_TREE_PREFLIGHT',evidence:path.relative(root,dir).replace(/\\/g,'/'),manifestSha256,fileCount:files.length},null,2));
