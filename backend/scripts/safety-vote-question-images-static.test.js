'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeService = require('../services/safety-vote-phase3');

const valid = nodeService.normalizeBuilder([{
    questionCode: 'Q1', questionType: 'rating', title: 'ความคิดสร้างสรรค์',
    imageFileId: 41, imageAltText: 'ภาพผลงานต้นแบบบนโต๊ะจัดแสดง',
    minSelections: 1, maxSelections: 1, validation: { minNumber: 1, maxNumber: 5 }, options: []
}], 'identified');
assert.strictEqual(valid.ok, true);
assert.strictEqual(valid.questions[0].imageFileId, 41);
assert.strictEqual(valid.questions[0].imageAltText, 'ภาพผลงานต้นแบบบนโต๊ะจัดแสดง');

const missingAlt = nodeService.normalizeBuilder([{
    questionCode: 'Q1', questionType: 'rating', title: 'ความคิดสร้างสรรค์',
    imageFileId: 41, minSelections: 1, maxSelections: 1,
    validation: { minNumber: 1, maxNumber: 5 }, options: []
}], 'identified');
assert.strictEqual(missingAlt.ok, false);
assert(missingAlt.errors.some(item => item.codes.includes('IMAGE_ALT_TEXT_REQUIRED')));

const migration = read('backend/migrations/20261024_safety_vote_question_images.sql');
assert(migration.includes('ImageFileID') && migration.includes('ImageAltText'));
assert(migration.includes('ADD COLUMN IF NOT EXISTS'));

for (const relative of ['backend/routes/safety-vote-phase3.js', 'api/handlers/safety_vote_phase3.php']) {
    const source = read(relative);
    assert(source.includes('QUESTION_IMAGE_INVALID'));
    assert(source.includes("FilePurpose='question_image'"));
    assert(source.includes('IMAGE_ALT_TEXT_REQUIRED'));
    assert(source.includes('CampaignVersionID'));
}

const phpService = read('api/lib/safety_vote_phase3.php');
assert(phpService.includes("'imageFileId'=>$imageFileId"));
assert(phpService.includes("'IMAGE_ALT_TEXT_REQUIRED'"));

const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
assert(wizard.includes("form.append('filePurpose','question_image')"));
assert(wizard.includes('data-svw-question-image-alt'));
assert(wizard.includes('data-sv-image-gallery'));

const participant = read('public/js/pages/safety-vote-page-ux1.js');
assert(participant.includes('questionControlWithImage'));
assert(participant.includes('data-sv-auth-file'));

const gallery = read('public/js/pages/safety-vote-image-gallery.js');
assert(gallery.includes("event.key === 'Escape'"));
assert(gallery.includes("event.key === 'ArrowLeft'"));
assert(gallery.includes('touchend'));

console.log('Safety Vote question images: PASS (Node/PHP contract, private ownership, alt text, responsive central viewer)');
