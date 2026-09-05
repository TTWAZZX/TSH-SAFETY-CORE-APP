'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { listQuery, pagination, searchText } = require('../services/bbs-list-query');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const parsed = listQuery({ paged:'1', page:'3', pageSize:'999' });
assert.deepStrictEqual(parsed, { paged:true, page:3, pageSize:100, offset:200 });
assert.deepStrictEqual(pagination(41, 2, 20), { page:2, pageSize:20, total:41, totalPages:3, hasPrevious:true, hasNext:true });
assert.strictEqual(pagination(0, 9, 20).page, 1, 'empty lists must clamp to page 1');
assert.strictEqual(searchText(`  ${'x'.repeat(150)}  `).length, 120, 'search input must be bounded');

const pairs = [
    ['backend/routes/bbs-observations.js','api/handlers/bbs_observations.php'],
    ['backend/routes/bbs-actions.js','api/handlers/bbs_actions.php'],
    ['backend/routes/bbs-cards.js','api/handlers/bbs_cards.php'],
    ['backend/routes/bbs-community.js','api/handlers/bbs_community.php'],
];
for (const [nodeFile, phpFile] of pairs) {
    const node = read(nodeFile), php = read(phpFile);
    for (const token of ['pageSize','pagination','COUNT(*)']) {
        assert(node.includes(token), `${nodeFile} missing ${token}`);
        assert(php.includes(token), `${phpFile} missing ${token}`);
    }
}

const observations = read('backend/routes/bbs-observations.js');
for (const token of ['ObservedDepartmentID','ObservedSafetyUnitID','ObserverNameSnapshot LIKE']) assert(observations.includes(token));
const actions = read('backend/routes/bbs-actions.js');
for (const token of ['YEAR(ca.CreatedAt)','o.ObservedDepartmentID','o.ObservedSafetyUnitID','a.ItemPromptSnapshot LIKE']) assert(actions.includes(token));
const cards = read('backend/routes/bbs-cards.js');
for (const token of ['/admin/card-employees','/admin/cards',"['Active','Revoked','Replaced']",'md.id=?']) assert(cards.includes(token));
const community = read('backend/routes/bbs-community.js');
for (const token of ['goodPage','riskyPage','actionStatus','priority','viewRisky']) assert(community.includes(token));

const ui = read('public/js/pages/bbs-smart-card.js');
for (const token of ['data-list-page','data-list-search','data-history-filter','data-action-list-filter','data-card-filter','data-card-employee-filter','community-good','community-risky']) assert(ui.includes(token), `UI missing ${token}`);
assert(ui.includes("paged:'1'"), 'frontend list requests must explicitly opt into the paged contract');
assert(ui.includes('min-h-11'), 'mobile pager controls must retain a 44px touch target');

const main = read('public/js/main.js');
require('./bbs-runtime-assets').assertBbsRuntimeAssets();

console.log('BBS Phase 10D-3 scalable list contract tests passed.');
