'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
    const root = path.resolve(__dirname, '../..');
    const model = await import(pathToFileURL(path.join(root, 'public/js/pages/safety-vote-results-model.mjs')).href);
    const resultHash = 'a'.repeat(64);
    const official = {
        available:true,
        officialState:'published',
        noResult:true,
        snapshot:{ id:22, snapshotNo:2, status:'Published', resultHash },
        groups:[{ title:'รางวัลยอดนิยม', rows:[{ id:1, rank:null, label:'ผลงาน ก', code:'A', value:0, state:'no_result' }] }]
    };
    const preview = model.publicPreview({
        campaign:{ CampaignType:'popular_vote', ResultVisibility:'live' },
        snapshot:{ id:22, status:'Published', published:true },
        published:official
    });
    assert.strictEqual(preview.visible, true);
    assert.strictEqual(preview.noResult, true);
    assert.strictEqual(preview.officialState, 'published');
    assert.strictEqual(preview.rows[0].rank, null);
    assert.strictEqual(preview.rows[0].count, 0);
    assert.strictEqual(preview.rows[0].label, 'ผลงาน ก');
    const oldSnapshot = model.publicPreview({ campaign:{}, snapshot:{ id:21, published:false }, published:official });
    assert.strictEqual(oldSnapshot.visible, false);
    assert.match(oldSnapshot.message, /ไม่ใช่ผลอย่างเป็นทางการ/);

    const workspace = fs.readFileSync(path.join(root, 'public/js/pages/admin-safety-vote-results.js'), 'utf8');
    const adminFoundation = fs.readFileSync(path.join(root, 'public/js/pages/admin-safety-vote-ux1.js'), 'utf8');
    const adminEntry = fs.readFileSync(path.join(root, 'public/js/pages/admin.js'), 'utf8');
    const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert(workspace.includes('/official-results'), 'Admin preview must load the authoritative official-result endpoint');
    assert(!workspace.includes("if (isSecretCampaign(state.campaign) && current?.published)"), 'Official preview must not be limited to secret elections');
    assert(workspace.includes('data-svr-no-result'), 'Admin preview must expose explicit no-result state');
    for (const source of [workspace, adminFoundation, adminEntry, main, html]) assert(source.includes('20261025-result-release-policy-r1'), 'Phase 0/1 cache chain is incomplete');
    console.log('Safety Vote Phase 0/1 workflow and Official Results preview: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
