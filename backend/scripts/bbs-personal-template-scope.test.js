'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..','..');
const node=fs.readFileSync(path.join(root,'backend','routes','bbs-cards.js'),'utf8');
const php=fs.readFileSync(path.join(root,'api','handlers','bbs_cards.php'),'utf8');
const phpCard=fs.readFileSync(path.join(root,'api','lib','bbs_card.php'),'utf8');
const ui=fs.readFileSync(path.join(root,'public','js','pages','bbs-smart-card.js'),'utf8');

for(const source of [node,php]){
    assert.ok(source.includes('PERSONAL_TEMPLATE_LEVEL_INELIGIBLE'),'Activation must reject an ineligible Personal Template level');
    assert.ok(source.includes('repair-personal-level'),'Legacy unusable templates need an explicit guarded repair route');
    assert.ok(source.includes('PERSONAL_TEMPLATE_LEVEL_REPAIR_BLOCKED'),'Repair must preserve templates that already have card history');
    assert.ok(source.includes('PERSONAL_TEMPLATE_LEVEL_CONFLICT'),'Repair must reject an overlapping Active target scope');
    assert.ok(source.includes('PERSONAL_TEMPLATE_SCOPE_MISMATCH'),'Issue must return a stable scope mismatch code');
    assert.ok(source.includes('SafetyUnitID'),'Personal issue scope must include Unit identity');
}

assert.match(node,/validPersonalTemplateLevel\(level\)[\s\S]*levelRank\('Group Leader'\)/);
assert.match(php,/bbs_card_valid_personal_template_level\(\?string \$level\)[\s\S]*bbs_phase1_level_rank\('Group Leader'\)/);
assert.match(node,/COUNT\(\*\) count FROM BBS_Cards WHERE TemplateID=\?/);
assert.match(php,/COUNT\(\*\) count FROM BBS_Cards WHERE TemplateID=\?/);
assert.match(node,/LEFT JOIN Master_SafetyUnits mu[\s\S]*mu\.id SafetyUnitID/);
assert.match(php,/LEFT JOIN master_safetyunits mu[\s\S]*mu\.id SafetyUnitID/);
assert.ok(phpCard.includes("$fields[]='Unit'"),'PHP mismatch detail must identify Unit');

for(const marker of [
    'function personalCardEligibleLevels()',
    'function personalTemplateScopeMismatch(',
    'function installPersonalIssueCompatibility()',
    'data-bbs-template-level-repair',
    'แก้เป็น Group Leader',
    'ทุกระดับที่ออก Personal Card ได้',
    'ระดับ Template:',
    'Unit Template:'
])assert.ok(ui.includes(marker),`Personal Card issue UX missing ${marker}`);

assert.match(ui,/function personalTemplateMatchesEmployee\(template,employee\)\{return personalTemplateLevelEligible\(template\)&&personalTemplateScopeMismatch\(template,employee\)\.length===0;\}/);
assert.match(ui,/option\.disabled=disabled/);
assert.match(ui,/button\.disabled=!employees\.length\|\|!select\.value/);

console.log('BBS Personal Template scope and issue compatibility contract: PASS');
