'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
    'ownDrafts: []',
    'function draftRecoveryPanel()',
    'data-bbs-resume',
    'async function switchBbsTab(nextTab)',
    'await saveDraft(false, false)',
    'await saveBatchDraft(false, false)',
    'async function resumeDraft(id)',
    'Only the original observer can resume this Draft.',
    'Existing Draft resumed instead of creating a duplicate.',
    'function openCardPrintPopup()',
    'async function preloadCardBackgrounds(templateIds)',
    'function applyAnalyticsPayload(data)',
    'const data = await analyticsExportData()'
]) {
    assert.ok(ui.includes(marker), `Phase 10C-1 UI missing ${marker}`);
}

assert.doesNotMatch(ui, /state\.draft\s*=\s*state\.tab\s*===\s*['"]start['"]\s*\?/);

const issueStart = ui.indexOf('async function issueCards(');
const issueEnd = ui.indexOf('async function replaceCard(', issueStart);
const issueSource = ui.slice(issueStart, issueEnd);
assert.ok(issueSource.indexOf('openCardPrintPopup()') < issueSource.indexOf("API.post('/bbs/admin/cards/issue'"), 'Issue must open the print window before mutation');
assert.ok(issueSource.indexOf('preloadCardBackgrounds') < issueSource.indexOf("API.post('/bbs/admin/cards/issue'"), 'Issue must validate the private template before mutation');

const replaceStart = ui.indexOf('async function replaceCard(');
const replaceEnd = ui.indexOf('async function revokeCard(', replaceStart);
const replaceSource = ui.slice(replaceStart, replaceEnd);
assert.ok(replaceSource.indexOf('openCardPrintPopup()') < replaceSource.indexOf("API.post(`/bbs/admin/cards/${id}/replace`"), 'Replace must open the print window before mutation');
assert.ok(replaceSource.indexOf('preloadCardBackgrounds') < replaceSource.indexOf("API.post(`/bbs/admin/cards/${id}/replace`"), 'Replace must validate the private template before mutation');

const exportStart = ui.indexOf('async function exportAnalytics(type)');
const exportEnd = ui.indexOf('async function openAnalyticsDrilldown(', exportStart);
const exportSource = ui.slice(exportStart, exportEnd);
assert.ok(exportSource.indexOf('const data = await analyticsExportData()') < exportSource.indexOf("if(type==='excel')"), 'Every analytics output must fetch fresh export data first');
assert.ok(exportSource.includes("if (type === 'print')"), 'Print must pre-open its popup before the async fetch');
assert.ok(exportSource.includes('applyAnalyticsPayload(data)'), 'PDF and Print must render the freshly fetched payload');

assert.match(main, /bbs-smart-card\.js\?v=(?:20260831-bbs-phase10c[123]|20260901-bbs-phase10(?:b4|d[1-5]))/);
assert.match(html, /main\.js\?v=(?:20260831-bbs-phase10c[123]-forklift-renewal-ky-chunk-r1|20260901-bbs-phase10(?:b4|d[1-5])|20260902-bbs-auto-reference-r1)/);

console.log('BBS Phase 10C-1 workflow reliability contract: PASS');
