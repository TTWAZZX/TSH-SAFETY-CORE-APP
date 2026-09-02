'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
    "cardWorkspace:'overview'",
    'function cardWorkspaceNavigation()',
    'function cardOverviewView()',
    'function personalCardsView()',
    'function departmentCardsAdminView()',
    'data-card-workspace-navigation',
    'data-card-guided-workflow="overview"',
    'data-card-guided-workflow="personal"',
    'data-card-guided-workflow="department"',
    'ภาพรวมและความพร้อม',
    'Personal Card',
    'Department Card',
    'PERSONAL CARD WORKFLOW',
    'DEPARTMENT CARD WORKFLOW',
    'สร้าง Template',
    'ออก QR กลางรายแผนก',
    'กำหนด Owner และ Verifier',
    "state.cardWorkspace = btn.dataset.cardWorkspace"
]) {
    assert.ok(ui.includes(marker), `Phase 10B-2 UI missing ${marker}`);
}

assert.match(ui, /state\.cardWorkspace === 'personal' \? personalCardsView\(\) : state\.cardWorkspace === 'department' \? departmentCardsAdminView\(\) : cardOverviewView\(\)/);
assert.match(ui, /if \(nextTab === 'cards' && state\.tab === 'community'\) state\.cardWorkspace = 'department'/);
assert.match(main, /bbs-smart-card\.js\?v=(?:20260831-bbs-phase10c[123]|20260901-bbs-phase10(?:b4|d[1-5]))/);
assert.match(html, /main\.js\?v=(?:20260831-bbs-phase10c[123]-forklift-renewal-ky-chunk-r1|20260901-bbs-phase10(?:b4|d[1-5])|20260902-bbs-auto-reference-r1)/);

for (const preserved of [
    'id="bbs-template-form"',
    'id="bbs-dept-template-form"',
    'data-bbs-issue',
    'data-bbs-card-replace',
    'data-bbs-card-revoke',
    'data-dept-qr-issue',
    'data-community-handler',
    "API.post('/bbs/admin/card-templates'",
    "API.post('/bbs/admin/department-card-templates'"
]) {
    assert.ok(ui.includes(preserved), `Existing card behavior marker missing ${preserved}`);
}

console.log('BBS Phase 10B-2 Card Management IA/guided workflow contract: PASS');
