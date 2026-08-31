'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ui = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'bbs-smart-card.js'),
    'utf8'
);

for (const marker of [
    'team-management',
    '\u0e1c\u0e39\u0e49\u0e15\u0e23\u0e27\u0e08 / \u0e17\u0e35\u0e21',
    'bbs-inspector-enroll-form',
    'data-inspector-toggle-self',
    'data-inspector-toggle-kpi',
    'bbs-inspector-team-add',
    'data-inspector-remove',
    'Team Coverage'
]) {
    assert.ok(ui.includes(marker), `UI missing ${marker}`);
}

assert.match(ui, /state\.inspectorSelf\?\.enabled&&\(state\.context\?\.permissions\?\.configure\|\|state\.inspectorSelf\?\.enrollment\)/);
assert.match(ui, /inspector team management is unavailable/);
console.log('BBS Phase 9 Admin/self-service team UI contract: PASS');
