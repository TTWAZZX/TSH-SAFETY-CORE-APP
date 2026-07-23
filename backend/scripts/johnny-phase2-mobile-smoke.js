'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CACHE_BUST = '20260708-johnny-phase2-mobile';
const PHASE2_MARKER = 'JOHNNY_PHASE2_MOBILE_FIELD_UX';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function includesAll(text, markers, label) {
    const missing = markers.filter(marker => !text.includes(marker));
    assert(!missing.length, `${label} missing marker(s): ${missing.join(', ')}`);
}

function main() {
    const johnny = read('public/js/pages/johnny-ai.js');
    const style = read('public/style.css');
    const index = read('index.html');
    const mainJs = read('public/js/main.js');
    const manifest = JSON.parse(read('deploy-manifest.json'));

    includesAll(johnny, [
        PHASE2_MARKER,
        'FIELD_USE_PROMPTS',
        'fieldQuickPromptsHtml',
        'johnny-field-quick-rail',
        'johnny-field-composer',
        'johnny-composer-help',
        'johnny-risk-preview-card',
        'johnny-image-result-card',
        'johnny-copy-answer',
        'copyJohnnyAnswer',
        'updateComposerMode',
        'data-johnny-phase2',
    ], 'Johnny Phase 2 frontend');

    includesAll(style, [
        '.johnny-field-quick-rail',
        '.johnny-field-chip',
        '.johnny-message-wrap',
        '.johnny-field-composer',
        '.johnny-image-result-card',
        '.johnny-risk-preview-card',
        'scroll-padding-bottom: 9.25rem',
        'max-width: min(92vw, 42rem)',
    ], 'Johnny Phase 2 mobile CSS');

    includesAll(index, [
        `public/style.css?v=${CACHE_BUST}`,
        `public/js/main.js?v=${CACHE_BUST}`,
    ], 'Johnny Phase 2 cache bust in index.html');

    includesAll(mainJs, [
        `./pages/johnny-ai.js?v=${CACHE_BUST}`,
    ], 'Johnny Phase 2 dynamic import cache bust');

    assert(manifest.cacheBust === CACHE_BUST, `manifest cacheBust mismatch: ${manifest.cacheBust}`);
    assert(String(manifest.runtime || '').includes('johnny-phase2-mobile'), `manifest runtime mismatch: ${manifest.runtime}`);

    console.log(JSON.stringify({
        ok: true,
        phase: 'johnny-phase2-mobile',
        cacheBust: CACHE_BUST,
        marker: PHASE2_MARKER,
        checks: {
            frontendMarkers: 12,
            cssMarkers: 8,
            cacheBust: true,
            manifest: true,
        },
    }, null, 2));
}

try {
    main();
} catch (err) {
    console.error(JSON.stringify({
        ok: false,
        phase: 'johnny-phase2-mobile',
        error: err.message,
    }, null, 2));
    process.exit(1);
}
