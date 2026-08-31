'use strict';
const assert=require('assert');const fs=require('fs');const path=require('path');
const file=fs.readFileSync(path.join(__dirname,'..','..','public','js','pages','bbs-smart-card.js'),'utf8');
for(const pattern of [
    /\['actions','Corrective Action'\]/,
    /function actionsView\(/,
    /data-action-filter=/,
    /\/bbs\/actions\/summary/,
    /\/bbs\/actions\/\$\{id\}\/transition/,
    /\/bbs\/actions\/\$\{id\}\/evidence/,
    /\/bbs\/actions\/reminders\/queue/,
    /\/bbs\/admin\/action-sla-rules/,
    /Pending Verification/,
    /After evidence|After อย่างน้อย/,
])assert.match(file,pattern,`Missing Phase 5 UI contract: ${pattern}`);
assert.doesNotMatch(file,/innerHTML\s*=\s*`[^`]*\$\{error\?\.message\}/s,'Raw error.message must not be injected into innerHTML');
console.log('BBS Phase 5 Actions tab, filters, lifecycle, evidence, SLA and reminder UI contract: PASS');
