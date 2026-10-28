'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const components = read('public/js/pages/safety-vote-ux-components.js');
const participant = read('public/js/pages/safety-vote-page-ux1.js');
const gallery = read('public/js/pages/safety-vote-image-gallery.js');
const css = read('public/style.css');
const html = read('index.html');

const checks = [
    [!components.includes('questions.slice(0, 2)') && !components.includes('options.slice(0, 3)'), 'final preview must render every question and option'],
    [components.includes('ไม่บันทึกข้อมูลใน Preview') && components.includes('Preview เท่านั้น ระบบจะไม่ส่งข้อมูลหรือเพิ่มสถิติ') && components.includes('disabled>${escHtml(actionLabel)}'), 'preview must be interactive without a submit path'],
    [components.includes('option.previewUrl') && components.includes('option.description'), 'preview must include private image previews and descriptions'],
    [wizard.includes('if ([3,8].includes(state.step)) hydrateOptionImages()') && wizard.includes('if ([3,8].includes(state.step)) hydrateQuestionImages()'), 'content and nine-step review must hydrate authenticated private image blobs'],
    [wizard.includes('bindSafetyVoteImageGallery(container)'), 'wizard preview must bind the shared gallery'],
    [participant.includes('bindSafetyVoteImageGallery(state.page)') && participant.includes('data-sv-gallery-group="question-cover-${Number(question.id)}"'), 'participant page must bind the same question-scoped gallery'],
    [gallery.includes('รูปที่ ${index + 1} จาก ${triggers.length}'), 'gallery must announce image position'],
    [gallery.includes("event.key === 'ArrowLeft'") && gallery.includes("event.key === 'ArrowRight'") && gallery.includes("event.key === 'Escape'"), 'gallery keyboard navigation is incomplete'],
    [gallery.includes('Math.max(0, Math.min(triggers.length - 1, index + delta))') && gallery.includes('next.disabled = index === triggers.length - 1'), 'gallery navigation must stop at the first and last image'],
    [gallery.includes("addEventListener('touchstart'") && gallery.includes("addEventListener('touchend'") && gallery.includes('Math.abs(dx) >= 50'), 'gallery swipe navigation is incomplete'],
    [gallery.includes("document.body.style.overflow = 'hidden'") && gallery.includes('restoreTarget.focus()'), 'gallery modal lifecycle or focus restoration is incomplete'],
    [participant.includes("choice ? 'campaign-choice-options'") && participant.includes('data-sv-gallery-choice-value'), 'participant option images must share one campaign gallery and expose their choice'],
    [participant.includes("null, 'campaign-public-works'"), 'public work images must share one campaign gallery'],
    [gallery.includes('data-sv-gallery-select') && gallery.includes('data-sv-gallery-confirm') && gallery.includes("input.dispatchEvent(new Event('change'"), 'gallery selection and confirmation controls are incomplete'],
    [css.includes('.svp-gallery__nav--previous') || css.includes('.svp-gallery__nav'), 'gallery navigation styling is missing'],
    [/202610(?:1[56]-safety-vote-(?:preview-gallery|preview-parity)|24-(?:safety-vote-(?:question-images|gallery|people-picker)|eligibility-individual-add)|27-safety-vote-gallery-lightbox|28-safety-vote-(?:campaign-gallery|official-topn|jury-scoring))-r1|20261027-safety-vote-(?:gallery-(?:choice-r2|bounded-r3)|jury-work-media-r[12]|preview-parity-r1|jury-score-ux-r1)/.test(html), 'top-level cache key was not advanced']
];

for (const [value, message] of checks) assert(value, message);
console.log(`Safety Vote preview/gallery static contract: PASS (${checks.length} assertions)`);
