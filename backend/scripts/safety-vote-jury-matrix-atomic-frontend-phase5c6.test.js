'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const nodePhase4 = read('backend/routes/safety-vote-phase4.js');
const phpPhase4 = read('api/handlers/safety_vote_phase4.php');
const phpRules = read('api/lib/safety_vote_phase4.php');
const nodeBuilder = read('backend/routes/safety-vote-phase2.js');
const phpBuilder = read('api/handlers/safety_vote_phase2.php');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const workspace = read('public/js/pages/safety-vote-jury-workspace.js');
const css = read('public/style.css');

for (const source of [nodePhase4, phpRules]) {
    assert(source.includes('2026-10-25-jury-work-criteria-matrix-r1'));
    assert(source.includes('submitted_score_rows_to_frozen_result'));
    assert(source.includes('matrixHash'));
}
assert(phpPhase4.includes('sv4_jury_matrix'));
assert(phpPhase4.includes("'matrix'=>$matrix"));
for (const source of [nodeBuilder, phpBuilder]) {
    assert(source.includes('ImageFileID,ImageAltText'));
    assert(source.includes('mediaContract'));
    assert(source.includes('serverConfirmed'));
}
for (const scope of ['question_image', 'option_image', 'work_cover', 'work_gallery']) assert(wizard.includes(scope));
assert(wizard.includes('/media/atomic'));
assert(!wizard.includes("form.append('filePurpose','question_image')"));
assert(!wizard.includes("form.append('filePurpose', 'option_image')"));
assert(!wizard.includes('/questions/${encodeURIComponent(code)}/image'));
assert(wizard.includes("setSaveState('saved','อัปโหลดรูปตัวเลือกและบันทึกแล้ว')"));
assert(wizard.includes("setSaveState('saved','ลบรูปผลงานและบันทึกแล้ว')"));
assert(workspace.includes('WORK × CRITERIA MATRIX'));
assert(workspace.includes('data-sv-jury-matrix'));
assert(workspace.includes('data-sv-result-binding="submitted_score_rows_to_frozen_result"'));
assert(css.includes('.svj-matrix-contract'));
console.log('Safety Vote Phase 5C + Phase 6 Frontend static integration contract: PASS');
