'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const model = read('public/js/pages/safety-vote-wizard-model.mjs');
const style = read('public/style.css');
const nodeRoute = read('backend/routes/safety-vote.js');
const phpRoute = read('api/handlers/safety_vote.php');

for (const marker of [
    'data-svw-option-card', 'data-svw-add-option', 'data-svw-move-option',
    'data-svw-move-question', 'data-svw-option-image', 'data-svw-bulk-input',
    'data-svw-bulk-apply', 'svw-question-preview', 'hydrateOptionImages'
]) assert(wizard.includes(marker), `Missing Phase 10.2 builder marker: ${marker}`);

assert(!wizard.includes('data-svw-field="question-${index}-options"'), 'Legacy line-based option textarea is still active');
assert.match(wizard, /accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(wizard, /file\.size > 10 \* 1024 \* 1024/);
assert.match(wizard, /filePurpose', 'option_image'/);
assert.match(wizard, /Removed from question option card builder/);
assert.match(wizard, /split\('\|'\)/);
assert.match(wizard, /next\.length>100/);
assert.match(model, /fileId: Number\(option\.fileId \|\| 0\) \|\| null/);

for (const selector of ['.svw-option-card', '.svw-option-media', '.svw-bulk-import', '.svw-question-preview', '.svw-live-option']) {
    assert(style.includes(selector), `Missing Phase 10.2 style: ${selector}`);
}

for (const source of [nodeRoute, phpRoute]) {
    assert(source.includes('image/jpeg') && source.includes('image/png') && source.includes('image/webp'), 'Private image MIME contract is incomplete');
    assert(/Status(?:'\])?\s*!==\s*'Draft'/.test(source), 'Draft-only file mutation gate is missing');
}

for (const file of ['public/js/pages/safety-vote-campaign-wizard.js', 'public/js/pages/safety-vote-wizard-model.mjs']) {
    const checked = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
    assert.strictEqual(checked.status, 0, checked.stderr || `${file} syntax failed`);
}

console.log('Safety Vote Phase 10.2 static contract: PASS (card builder, private images, reorder, preview and bounded bulk import)');
