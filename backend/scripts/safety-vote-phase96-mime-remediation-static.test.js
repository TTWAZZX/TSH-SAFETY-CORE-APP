'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const candidatePath = path.join(root, '.htaccess');
const productionEvidencePath = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009063228', 'htaccess-before-a');
const expectedProductionSha256 = '21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d';
const insertion = '# ES modules must be served with a JavaScript MIME type on shared hosting.\r\nAddType application/javascript .mjs\r\n\r\n';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const before = fs.readFileSync(productionEvidencePath);
const candidate = fs.readFileSync(candidatePath);
assert.strictEqual(sha256(before), expectedProductionSha256, 'Production .htaccess evidence checksum changed');

const beforeText = before.toString('utf8').replace(/\r?\n/g, '\r\n');
const candidateText = candidate.toString('utf8').replace(/\r?\n/g, '\r\n');
assert.strictEqual((candidateText.match(/AddType application\/javascript \.mjs/g) || []).length, 1, 'Candidate must contain exactly one narrow .mjs MIME mapping');
assert.strictEqual(candidateText.replace(insertion, ''), beforeText, 'Candidate changed more than the bounded MIME insertion');
assert(!/AddType\s+application\/javascript\s+\.js(?:\s|$)/i.test(candidateText), 'Candidate must not override ordinary .js MIME handling');
assert(!/<FilesMatch[^>]*mjs/i.test(candidateText), 'Candidate must not broaden file access rules');

const pages = path.join(root, 'public', 'js', 'pages');
const modules = fs.readdirSync(pages).filter(name => name.endsWith('.mjs')).sort();
assert.strictEqual(modules.length, 8, 'Expected Safety Vote .mjs runtime inventory changed');
for (const module of modules) {
  const source = fs.readFileSync(path.join(pages, module), 'utf8');
  assert(source.length > 0, `Empty module: ${module}`);
  const imported = fs.readdirSync(pages).filter(name => name.endsWith('.js')).some(name => fs.readFileSync(path.join(pages, name), 'utf8').includes(`./${module}`));
  assert(imported, `Runtime .mjs is not imported by a JavaScript entrypoint: ${module}`);
}

process.stdout.write(`${JSON.stringify({
  decision: 'PASS_PHASE96_MIME_REMEDIATION_STATIC',
  productionBaselineSha256: expectedProductionSha256,
  candidateSha256: sha256(candidate),
  runtimePathCount: 1,
  mjsInventoryCount: modules.length,
  boundedChange: true,
  productionConnectionAttempted: false
}, null, 2)}\n`);
