'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dependencyManifest, projectRoot } = require('./production-dependency-closure');

const target = path.join(projectRoot, 'production-dependency-manifest.json');
const generated = dependencyManifest();
const serialized = `${JSON.stringify(generated, null, 2)}\n`;

if (process.argv.includes('--write')) {
    fs.writeFileSync(target, serialized);
    process.stdout.write(`Production dependency manifest written: ${path.relative(projectRoot, target)}\n`);
} else {
    assert.ok(fs.existsSync(target), 'production-dependency-manifest.json is missing');
    assert.equal(fs.readFileSync(target, 'utf8'), serialized, 'Production dependency manifest is stale; run this command with --write');
    process.stdout.write('Production dependency manifest: PASS\n');
}
