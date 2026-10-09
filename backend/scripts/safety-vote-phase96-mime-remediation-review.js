'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, 'docs', 'safety-vote-phase96-mime-remediation-manifest.json');
const expectedManifestSha256 = '73cb28d24e81782e88d7bf34548290a9a337c6a74afc7aa5283d6a4646168ab4';
const deployedRuntimeCommit = '021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function gitBlob(commit, relative) {
  const result = spawnSync('git', ['show', `${commit}:${relative}`], { cwd: root, encoding: null, windowsHide: true });
  assert.strictEqual(result.status, 0, `Missing Git object: ${relative}`);
  return result.stdout;
}

function main() {
  assert.strictEqual(process.argv[2], '--validate-local', 'Review candidate supports --validate-local only; Production execution is intentionally unavailable');
  assert.strictEqual(process.argv.length, 3, 'Unexpected arguments');
  const manifestBytes = fs.readFileSync(manifestPath);
  assert.strictEqual(sha256(manifestBytes), expectedManifestSha256, 'Manifest checksum mismatch');
  const manifest = JSON.parse(manifestBytes);
  assert.strictEqual(manifest.mode, 'review_only_local');
  assert.strictEqual(manifest.runtimeAllowlist.length, 1);
  assert.strictEqual(manifest.runtimeAllowlist[0].path, '.htaccess');
  assert.strictEqual(manifest.constraints.productionConnectionAuthorized, false);
  assert.strictEqual(manifest.constraints.deploymentAuthorized, false);
  assert.strictEqual(manifest.constraints.pushAuthorized, false);

  const tree = spawnSync('git', ['rev-parse', `${manifest.sourceCommit}^{tree}`], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(tree.status, 0);
  assert.strictEqual(tree.stdout.trim(), manifest.sourceTree, 'Candidate tree mismatch');
  const candidate = gitBlob(manifest.sourceCommit, '.htaccess');
  assert.strictEqual(candidate.length, manifest.runtimeAllowlist[0].bytes);
  assert.strictEqual(sha256(candidate), manifest.runtimeAllowlist[0].sha256);
  assert(candidate.includes(Buffer.from('AddType application/javascript .mjs\n')));

  const rollbackFile = path.join(root, ...manifest.productionBefore.evidencePath.split('/'));
  const rollback = fs.readFileSync(rollbackFile);
  assert.strictEqual(rollback.length, manifest.productionBefore.bytes);
  assert.strictEqual(sha256(rollback), manifest.productionBefore.sha256);
  assert.strictEqual(sha256(Buffer.from(rollback)), manifest.rollback.restoreFiles[0].sha256, 'Rollback memory-restore drill failed');

  for (const probe of manifest.mimeProbes) {
    const blob = gitBlob(deployedRuntimeCommit, probe.path);
    assert.strictEqual(blob.length, probe.bytes, `Probe byte mismatch: ${probe.path}`);
    assert.strictEqual(sha256(blob), probe.sha256, `Probe checksum mismatch: ${probe.path}`);
  }

  process.stdout.write(`${JSON.stringify({
    decision: 'MIME_REMEDIATION_CANDIDATE_READY_FOR_REVIEW_NOT_AUTHORIZED',
    manifestSha256: expectedManifestSha256,
    candidate: { commit: manifest.sourceCommit, tree: manifest.sourceTree, runtimePaths: 1, sha256: manifest.runtimeAllowlist[0].sha256 },
    rollback: { files: 1, bytes: rollback.length, sha256: sha256(rollback), localDrillPassed: true },
    mimeProbes: manifest.mimeProbes.length,
    productionConnectionAttempted: false,
    deployPerformed: false,
    pushPerformed: false
  }, null, 2)}\n`);
}

main();
