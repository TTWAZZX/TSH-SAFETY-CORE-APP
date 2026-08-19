'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const release = '20260819-fourm-white-screen-hotfix';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function fetchBytes(relativePath) {
    const response = await fetch(`${base}/${relativePath}`, {
        headers: { 'cache-control': 'no-cache' },
    });
    assert.strictEqual(response.status, 200, `${relativePath} returned HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

async function main() {
    const [indexBytes, mainBytes, fourmBytes] = await Promise.all([
        fetchBytes(`index.html?fourm_hotfix=${release}`),
        fetchBytes(`public/js/main.js?v=${release}`),
        fetchBytes(`public/js/pages/fourm.js?v=${release}`),
    ]);

    const indexText = indexBytes.toString('utf8');
    const mainText = mainBytes.toString('utf8');
    assert.match(indexText, new RegExp(`main\\.js\\?v=${release}`));
    assert.match(mainText, new RegExp(`fourm\\.js\\?v=${release}`));

    const expected = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'fourm.js'));
    assert.strictEqual(sha256(fourmBytes), sha256(expected), 'Production fourm.js does not match local hotfix');

    console.log('PASS Production 4M white-screen static smoke (HTTP 200, cache markers, SHA-256)');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
