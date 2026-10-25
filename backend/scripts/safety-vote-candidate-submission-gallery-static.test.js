'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const rules = require('../services/safety-vote-gallery');

assert.deepStrictEqual(rules.OWNER_TYPES, ['candidate', 'submission']);
assert.strictEqual(rules.MAX_ITEMS, 12);
assert.strictEqual(rules.metadata({ altText: '  ภาพผลงาน  ', caption: ' รายละเอียด ' }).value.altText, 'ภาพผลงาน');
assert.strictEqual(rules.metadata({ altText: '' }).ok, false);
assert.strictEqual(rules.reorder([{ id: 1, altText: 'หนึ่ง', isCover: true }, { id: 2, altText: 'สอง' }]).ok, true);
assert(rules.reorder([{ id: 1, altText: 'หนึ่ง', isCover: true }, { id: 2, altText: 'สอง', isCover: true }]).errors.includes('GALLERY_COVER_DUPLICATE'));
assert(rules.reorder([{ id: 1, altText: 'หนึ่ง' }, { id: 1, altText: 'ซ้ำ' }]).errors.includes('GALLERY_ITEM_DUPLICATE_OR_INVALID'));

const migration = read('backend/migrations/20261024_safety_vote_candidate_submission_gallery.sql');
assert(migration.includes('CREATE TABLE IF NOT EXISTS SafetyVote_GalleryItems'));
assert(migration.includes('OwnerType') && migration.includes('OwnerID') && migration.includes('FileID'));
assert(migration.includes('AltText') && migration.includes('IsCover') && migration.includes('RowVersion'));
assert(migration.includes('candidate_submission_gallery_contract'));

for (const relative of ['backend/routes/safety-vote-gallery.js', 'api/handlers/safety_vote_gallery.php']) {
    const source = read(relative);
    assert(source.includes('ownerType') && (source.includes('`${ownerType}_gallery`') || source.includes("$ownerType.'_gallery'")));
    assert(source.includes('GALLERY_SETUP_REQUIRED') && source.includes('ALT_TEXT_REQUIRED'));
    assert(source.includes('GALLERY_LIMIT_REACHED') && source.includes('GALLERY_VERSION_CONFLICT'));
    assert(source.includes('image/jpeg') && source.includes('image/png') && source.includes('image/webp'));
    assert(source.includes('blind') && source.includes('caption'));
    assert(source.includes('SAFETY_VOTE_MANAGE') && source.includes('SAFETY_VOTE_SUBMISSION_REVIEW'));
}

const nodeRoute = read('backend/routes/safety-vote-gallery.js');
assert(!nodeRoute.includes('router.use(ready)'), 'gallery readiness gate must not intercept unrelated Safety Vote routes');
assert(nodeRoute.includes("rules.int(req.params.id) !== Number(owner.CampaignID)"));
assert(nodeRoute.includes("path.dirname(path.resolve(file.path)) === privateDir"));
assert(nodeRoute.includes("owner.CampaignStatus !== 'Draft'"));
assert(nodeRoute.includes("['Draft', 'RevisionRequested'].includes(owner.Status)"));

const phpRoute = read('api/handlers/safety_vote_gallery.php');
assert(phpRoute.includes("(int)$candidate['CampaignID']!==(int)$candidateUpload['id']"));
assert(phpRoute.includes("in_array($submission['Status'],['Draft','RevisionRequested'],true)"));

const participant = read('public/js/pages/safety-vote-page-ux1.js');
assert(participant.includes('submissionGalleryEditor') && participant.includes('candidateGalleryMarkup'));
assert(participant.includes('/gallery/options/') && participant.includes('/submissions/${state.workflowDraftId}/gallery'));
assert(participant.includes('clearObjectUrls(true)') && participant.includes('data-sv-image-gallery'));

const jury = read('public/js/pages/safety-vote-jury-workspace.js');
assert(jury.includes('candidateGallery(candidate)'));
assert(jury.includes('/gallery/candidates/') && jury.includes('hydrateSafetyVoteImages(state.page)'));

const admin = read('public/js/pages/admin-safety-vote.js');
assert(admin.includes('submissionGalleryMarkup'));
assert(admin.includes('/gallery/submissions/') && admin.includes('hydrateSafetyVoteImages(container)'));
const currentReview = read('public/js/pages/admin-safety-vote-review.js');
assert(currentReview.includes('submissionGalleryMarkup'));
assert(currentReview.includes('/gallery/submissions/') && currentReview.includes('bindSafetyVoteImageGallery(container)'));
assert(currentReview.includes('candidateGalleryMarkup') && currentReview.includes('/candidates/${Number(form.dataset.svrCandidateUpload)}/gallery'));

const coreNode = read('backend/routes/safety-vote.js');
const corePhp = read('api/handlers/safety_vote.php');
assert(coreNode.includes("String(file.FilePurpose||'').toLowerCase()==='candidate_gallery'"));
assert(corePhp.includes("strtolower((string)($file['FilePurpose']??''))==='candidate_gallery'"));

console.log('Safety Vote candidate/submission gallery: PASS (private media, ownership, blind jury, participant/juror/reviewer viewer)');
