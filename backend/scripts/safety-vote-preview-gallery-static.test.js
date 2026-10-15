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
    [components.includes('ทดลองตอบได้ · ไม่บันทึกคะแนน') && components.includes('disabled>ส่งคำตอบ'), 'preview must be interactive without a submit path'],
    [components.includes('option.previewUrl') && components.includes('option.description'), 'preview must include private image previews and descriptions'],
    [wizard.includes('if ([3, 7].includes(state.step)) hydrateOptionImages()'), 'review step must hydrate authenticated private image blobs'],
    [wizard.includes('bindSafetyVoteImageGallery(container)'), 'wizard preview must bind the shared gallery'],
    [participant.includes('bindSafetyVoteImageGallery(state.page)') && participant.includes('data-sv-gallery-group="question-${id}"'), 'participant page must bind the same question-scoped gallery'],
    [gallery.includes('รูปที่ ${index + 1} จาก ${triggers.length}'), 'gallery must announce image position'],
    [gallery.includes("event.key === 'ArrowLeft'") && gallery.includes("event.key === 'ArrowRight'") && gallery.includes("event.key === 'Escape'"), 'gallery keyboard navigation is incomplete'],
    [gallery.includes("addEventListener('touchstart'") && gallery.includes("addEventListener('touchend'") && gallery.includes('Math.abs(dx) >= 50'), 'gallery swipe navigation is incomplete'],
    [gallery.includes("document.body.style.overflow = 'hidden'") && gallery.includes('restoreTarget.focus()'), 'gallery modal lifecycle or focus restoration is incomplete'],
    [css.includes('.svp-gallery__nav--previous') || css.includes('.svp-gallery__nav'), 'gallery navigation styling is missing'],
    [html.includes('20261015-safety-vote-preview-gallery-r1'), 'top-level cache key was not advanced']
];

for (const [value, message] of checks) assert(value, message);
console.log(`Safety Vote preview/gallery static contract: PASS (${checks.length} assertions)`);
