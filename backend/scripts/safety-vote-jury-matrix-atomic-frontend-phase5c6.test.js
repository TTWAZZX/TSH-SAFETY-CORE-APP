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
const nodePhase3Builder = read('backend/routes/safety-vote-phase3.js');
const phpPhase3Builder = read('api/handlers/safety_vote_phase3.php');
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
    assert(source.includes('optionFileId'), 'Builder saves must merge active option-image bindings from authoritative storage');
    assert(source.includes('CampaignVersionID=?') && source.includes("Status='Active'"), 'Preserved media must remain campaign-version scoped and active');
}
for (const source of [nodePhase3Builder, phpPhase3Builder]) {
    assert(source.includes('2026-10-27-atomic-media-autosave-r1'), 'Authoritative Phase 3 Builder must expose the autosave-safe media contract');
    assert(source.includes('questionFileId') && source.includes('optionFileId'), 'Authoritative Phase 3 Builder must preserve both question and option media');
    assert(source.includes('ImageFileID,ImageAltText'), 'Authoritative Phase 3 Builder must persist question-image bindings');
}
for (const scope of ['question_image', 'option_image', 'work_cover', 'work_gallery']) assert(wizard.includes(scope));
assert(wizard.includes('/media/atomic'));
assert(!wizard.includes("form.append('filePurpose','question_image')"));
assert(!wizard.includes("form.append('filePurpose', 'option_image')"));
assert(!wizard.includes('/questions/${encodeURIComponent(code)}/image'));
assert(wizard.includes("finishMediaMutation(prepared.hadPendingDraft,'อัปโหลดรูปตัวเลือกและบันทึกแล้ว')"));
assert(wizard.includes('flushBuilderBeforeMediaMutation'), 'Atomic media upload must flush pending Builder autosaves before using entity IDs');
assert(wizard.includes('await state.saveChain'), 'Atomic media upload must serialize behind any active Builder save');
assert(wizard.includes('if (!target?.id)'), 'Existing persisted media targets must not be blocked by unrelated incomplete Builder fields');
assert(wizard.includes('contentValidationErrors(state.draft)'), 'New media targets must report the exact Builder validation error');
assert(!wizard.includes('กรุณากรอกข้อมูลคำถามและตัวเลือกให้ครบก่อนเพิ่มรูป'), 'Generic media validation error must not hide the actual incomplete field');
assert(wizard.includes('await loadPrivateImagePreview(option,option.fileId)'), 'Option preview must use the authenticated server-confirmed file');
assert(!wizard.includes('option.previewUrl=URL.createObjectURL(file)'), 'Option preview must not depend on the transient file-input object');
assert(wizard.includes('ขนาดแนะนำ 1600 × 900 พิกเซล (กว้าง × สูง, 16:9 แนวนอน)'), 'Question-image guidance must state the recommended dimensions');
assert(wizard.includes("setSaveState('saved','ลบรูปผลงานและบันทึกแล้ว')"));
assert(workspace.includes('WORK × CRITERIA MATRIX'));
assert(workspace.includes('data-sv-jury-matrix'));
assert(workspace.includes('data-sv-result-binding="submitted_score_rows_to_frozen_result"'));
assert(css.includes('.svj-matrix-contract'));
console.log('Safety Vote Phase 5C + Phase 6 Frontend static integration contract: PASS');
