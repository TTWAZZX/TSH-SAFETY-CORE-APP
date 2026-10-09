'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const candidateCommit = '021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b';
const candidateTree = '0cf097bc429ad0f4ae348b820fd9504c5ff538a4';
const candidateManifestPath = path.join(root, 'docs', 'safety-vote-phase94-candidate-manifest.json');
const rollbackRoot = path.join(root, 'backups', 'production', 'safety-vote-phase95-preflight-20261009035440');
const rollbackPackage = path.join(rollbackRoot, 'rollback-package');
const rollbackManifestPath = path.join(rollbackPackage, 'rollback-manifest.json');
const rollbackArchivePath = path.join(rollbackRoot, 'safety-vote-phase95-runtime-rollback.zip');
const expected = {
  candidateManifestSha256: '3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c',
  runtimeSha256: 'd4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc',
  rollbackManifestSha256: '31ba29f6a718f5f778921e0dc2175c5ab5d8c783717eeb24feec4ad911acebbd',
  rollbackArchiveSha256: 'df5132fb7079427d17a3ff1a2b851e284a865b4aa1fae7d2b49f03d50396a394',
  rollbackArchiveBytes: 306679
};
const confirmation = 'DEPLOY_PHASE95A_41_PATHS_MODULE_DISABLED';
const rollbackConfirmation = 'ROLLBACK_PHASE95A_41_PATHS_TO_VERIFIED_REMOTE_BEFORE';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase95a-deploy-${stamp}`);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
let mutationStarted = false;
let rollbackManifest = null;
let runtime = [];

function safeRelative(relative) {
  assert(typeof relative === 'string' && relative.length > 0, 'Empty runtime path');
  assert(!path.posix.isAbsolute(relative) && !relative.includes('\\') && !relative.split('/').includes('..'), `Unsafe runtime path: ${relative}`);
  return relative;
}

function under(base, relative) {
  const target = path.resolve(base, ...safeRelative(relative).split('/'));
  const prefix = path.resolve(base) + path.sep;
  assert(target.startsWith(prefix), `Path escaped guarded root: ${relative}`);
  return target;
}

function run(program, args, binary = false) {
  return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout: 90000, windowsHide: true });
}

function ftps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', safeRelative(remotePath)];
  if (localPath) args.push('-LocalPath', localPath);
  const result = run('powershell.exe', args);
  return { ok: result.status === 0, status: result.status };
}

function inventory(parent) {
  const remote = parent || '.';
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', 'list', '-RemotePath', remote === '.' ? '' : safeRelative(remote)];
  const result = run('powershell.exe', args);
  assert.strictEqual(result.status, 0, `FTPS inventory failed: ${parent || '<root>'}`);
  return String(result.stdout || '');
}

function inventoryHas(output, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s])${escaped}(?:[\\r\\n]|$)`, 'm').test(output);
}

function existsRemote(relative) {
  const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
  return inventoryHas(inventory(parent), path.posix.basename(relative));
}

function downloadVerified(relative, baseA, baseB, expectedSha) {
  const a = under(baseA, relative);
  const b = under(baseB, relative);
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.mkdirSync(path.dirname(b), { recursive: true });
  assert(ftps('download', relative, a).ok, `Download A failed: ${relative}`);
  assert(ftps('download', relative, b).ok, `Download B failed: ${relative}`);
  const shaA = fileSha(a), shaB = fileSha(b);
  assert.strictEqual(shaA, shaB, `Double-download mismatch: ${relative}`);
  assert.strictEqual(shaA, expectedSha, `Remote SHA-256 mismatch: ${relative}`);
  return { path: relative, bytes: fs.statSync(a).size, sha256: shaA, doubleDownloadMatched: true };
}

function writeResult(name, value) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const target = path.join(evidenceRoot, name);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return fileSha(target);
}

function validateLocalInputs() {
  assert.strictEqual(fileSha(candidateManifestPath), expected.candidateManifestSha256, 'Candidate manifest checksum mismatch');
  assert.strictEqual(fileSha(rollbackManifestPath), expected.rollbackManifestSha256, 'Rollback manifest checksum mismatch');
  assert.strictEqual(fileSha(rollbackArchivePath), expected.rollbackArchiveSha256, 'Rollback archive checksum mismatch');
  assert.strictEqual(fs.statSync(rollbackArchivePath).size, expected.rollbackArchiveBytes, 'Rollback archive byte count mismatch');
  const manifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  rollbackManifest = JSON.parse(fs.readFileSync(rollbackManifestPath, 'utf8'));
  assert.strictEqual(manifest.sourceCommit, candidateCommit, 'Candidate commit mismatch');
  assert.strictEqual(manifest.sourceTree, candidateTree, 'Candidate tree mismatch');
  assert.strictEqual(manifest.immutable, true, 'Candidate must be immutable');
  assert.strictEqual(manifest.digests.runtimeScopeSha256, expected.runtimeSha256, 'Runtime digest mismatch');
  runtime = manifest.groups.runtime;
  assert.strictEqual(runtime.length, 41, 'Runtime allowlist must contain 41 paths');
  const paths = runtime.map(file => safeRelative(file.path));
  assert.strictEqual(new Set(paths).size, 41, 'Runtime allowlist contains duplicates');
  const rollbackPaths = [...rollbackManifest.restoreFiles, ...rollbackManifest.removeOnRollback].map(file => safeRelative(file.path));
  assert.strictEqual(rollbackPaths.length, 41, 'Rollback coverage must contain 41 paths');
  assert.deepStrictEqual([...rollbackPaths].sort(), [...paths].sort(), 'Rollback coverage differs from runtime allowlist');
  assert.strictEqual(rollbackManifest.candidateCommit, candidateCommit, 'Rollback candidate mismatch');
  assert.strictEqual(rollbackManifest.candidateRuntimeSha256, expected.runtimeSha256, 'Rollback runtime digest mismatch');
  assert.strictEqual(rollbackManifest.externalIntegrationsRemainDisabled, true, 'Rollback integration posture mismatch');
  const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
  const cookie = String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim();
  assert.strictEqual(Number(Boolean(token)) + Number(Boolean(cookie)), 1, 'Exactly one existing Production authentication input is required');
  return manifest;
}

function stageCandidate(manifest) {
  const staging = path.join(evidenceRoot, 'candidate-staging');
  const records = [];
  for (const file of runtime) {
    const result = run('git', ['show', `${candidateCommit}:${file.path}`], true);
    assert.strictEqual(result.status, 0, `Immutable Git blob unavailable: ${file.path}`);
    assert.strictEqual(sha256(result.stdout), file.sha256, `Immutable Git blob checksum mismatch: ${file.path}`);
    const target = under(staging, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result.stdout);
    records.push({ path: file.path, bytes: result.stdout.length, sha256: file.sha256 });
  }
  assert.strictEqual(manifest.groups.runtime.length, records.length);
  return { staging, records };
}

function revalidateRemoteBefore() {
  const restore = new Map(rollbackManifest.restoreFiles.map(file => [file.path, file]));
  const absent = new Set(rollbackManifest.removeOnRollback.map(file => file.path));
  const a = path.join(evidenceRoot, 'remote-before-a');
  const b = path.join(evidenceRoot, 'remote-before-b');
  const records = [];
  for (const file of runtime) {
    if (restore.has(file.path)) {
      assert(existsRemote(file.path), `Expected remote-before file is absent: ${file.path}`);
      records.push(downloadVerified(file.path, a, b, restore.get(file.path).sha256));
    } else {
      assert(absent.has(file.path), `No rollback classification: ${file.path}`);
      assert(!existsRemote(file.path), `Expected-absent path now exists: ${file.path}`);
      records.push({ path: file.path, absent: true, absenceRevalidated: true });
    }
  }
  return records;
}

function deploymentOrder() {
  const score = relative => relative === 'api/index.php' ? 50
    : relative === 'index.html' ? 40
      : relative.startsWith('api/handlers/') ? 30
        : relative.startsWith('api/lib/') ? 20
          : relative.startsWith('api/private/') ? 10 : 0;
  return [...runtime].sort((a, b) => score(a.path) - score(b.path) || a.path.localeCompare(b.path));
}

function deploy(staging) {
  const uploaded = [];
  for (const file of deploymentOrder()) {
    mutationStarted = true;
    assert(ftps('upload', file.path, under(staging, file.path)).ok, `Upload failed: ${file.path}`);
    uploaded.push(file.path);
  }
  const expectedByPath = new Map(runtime.map(file => [file.path, file.sha256]));
  const a = path.join(evidenceRoot, 'deployed-download-a');
  const b = path.join(evidenceRoot, 'deployed-download-b');
  const verified = runtime.map(file => downloadVerified(file.path, a, b, expectedByPath.get(file.path)));
  return { uploaded, verified };
}

function verifyDeployedCandidate(label = 'current-deployment') {
  const expectedByPath = new Map(runtime.map(file => [file.path, file.sha256]));
  const a = path.join(evidenceRoot, `${label}-a`);
  const b = path.join(evidenceRoot, `${label}-b`);
  return runtime.map(file => downloadVerified(file.path, a, b, expectedByPath.get(file.path)));
}

function rollback() {
  const restored = [];
  const removed = [];
  for (const file of rollbackManifest.restoreFiles) {
    const source = under(path.join(rollbackPackage, 'runtime-before'), file.path);
    assert.strictEqual(fileSha(source), file.sha256, `Rollback source checksum mismatch: ${file.path}`);
    assert(ftps('upload', file.path, source).ok, `Rollback upload failed: ${file.path}`);
    restored.push(file.path);
  }
  for (const file of rollbackManifest.removeOnRollback) {
    if (existsRemote(file.path)) assert(ftps('delete', file.path, null).ok, `Rollback delete failed: ${file.path}`);
    assert(!existsRemote(file.path), `Rollback path residue remains: ${file.path}`);
    removed.push(file.path);
  }
  const a = path.join(evidenceRoot, 'rollback-download-a');
  const b = path.join(evidenceRoot, 'rollback-download-b');
  const verified = rollbackManifest.restoreFiles.map(file => downloadVerified(file.path, a, b, file.sha256));
  return { pass: true, restored, removed, verified, remoteRuntimeResidue: 0 };
}

function main() {
  assert.strictEqual(process.argv[2], '--execute', 'Execution requires --execute');
  assert.strictEqual(process.argv[3], confirmation, 'Exact deployment confirmation is required');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const manifest = validateLocalInputs();
  const candidate = stageCandidate(manifest);
  const remoteBefore = revalidateRemoteBefore();
  const deployment = deploy(candidate.staging);
  const result = {
    contract: '2026-10-09-safety-vote-phase9.5a-r1', generatedAt: new Date().toISOString(),
    candidate: { commit: candidateCommit, tree: candidateTree, manifestSha256: expected.candidateManifestSha256, runtimeSha256: expected.runtimeSha256, runtimeFiles: runtime.length },
    rollbackPackage: { manifestSha256: expected.rollbackManifestSha256, archiveSha256: expected.rollbackArchiveSha256, archiveBytes: expected.rollbackArchiveBytes, revalidated: true },
    remoteBefore, deployment,
    constraints: { migrationPerformed: false, loginAttempted: false, businessDataWritten: false, emailOrNotificationSent: false, moduleOpened: false, integrationsOpened: false, pushPerformed: false },
    rollback: { attempted: false }, decision: 'PASS_RUNTIME_DEPLOYED_HOLD_FOR_PROTECTED_POSTCHECK_AND_AUTHENTICATED_SMOKE'
  };
  const resultSha256 = writeResult('result.json', result);
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha256}  result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, rollbackPackage: result.rollbackPackage, remoteBeforeFiles: remoteBefore.length, uploaded: deployment.uploaded.length, doubleDownloadVerified: deployment.verified.length, constraints: result.constraints, resultSha256 }, null, 2)}\n`);
}

function rollbackOnly() {
  assert.strictEqual(process.argv[2], '--rollback', 'Rollback requires --rollback');
  assert.strictEqual(process.argv[3], rollbackConfirmation, 'Exact rollback confirmation is required');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const manifest = validateLocalInputs();
  stageCandidate(manifest);
  const deployedCandidate = verifyDeployedCandidate('pre-rollback-candidate');
  mutationStarted = true;
  const rollbackResult = rollback();
  const result = {
    contract: '2026-10-09-safety-vote-phase9.5a-r1', generatedAt: new Date().toISOString(),
    candidate: { commit: candidateCommit, tree: candidateTree, runtimeFiles: runtime.length },
    deployedCandidateVerified: deployedCandidate.length,
    rollback: rollbackResult,
    secretValueRecorded: false,
    decision: 'PASS_RUNTIME_ROLLED_BACK_TO_VERIFIED_REMOTE_BEFORE'
  };
  const resultSha256 = writeResult('rollback-result.json', result);
  fs.writeFileSync(path.join(evidenceRoot, 'rollback-result.sha256'), `${resultSha256}  rollback-result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, deployedCandidateVerified: deployedCandidate.length, restored: rollbackResult.restored.length, removed: rollbackResult.removed.length, remoteRuntimeResidue: rollbackResult.remoteRuntimeResidue, resultSha256 }, null, 2)}\n`);
}

try {
  if (process.argv[2] === '--validate-local') {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const manifest = validateLocalInputs();
    const candidate = stageCandidate(manifest);
    process.stdout.write(`${JSON.stringify({ decision: 'PASS_LOCAL_VALIDATION_NO_PRODUCTION_CONNECTION', candidateCommit, candidateTree, runtimeFiles: candidate.records.length, rollbackPackageRevalidated: true, authenticationInputPresent: true }, null, 2)}\n`);
  } else if (process.argv[2] === '--rollback') {
    rollbackOnly();
  } else {
    main();
  }
} catch (error) {
  let rollbackResult = { attempted: false };
  if (mutationStarted && rollbackManifest && process.argv[2] !== '--rollback') {
    try { rollbackResult = { attempted: true, ...rollback() }; }
    catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: String(rollbackError.message || rollbackError) }; }
  }
  const failure = {
    contract: '2026-10-09-safety-vote-phase9.5a-r1', generatedAt: new Date().toISOString(),
    error: String(error.message || error), mutationStarted, rollback: rollbackResult,
    secretValueRecorded: false,
    decision: process.argv[2] === '--rollback'
      ? 'HOLD_ROLLBACK_FAILED'
      : (rollbackResult.attempted && !rollbackResult.pass ? 'HOLD_DEPLOYMENT_FAILED_ROLLBACK_FAILED' : 'HOLD_DEPLOYMENT_FAILED_SAFE_STATE')
  };
  const digest = writeResult('failure.json', failure);
  process.stderr.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: failure.decision, error: failure.error, rollback: rollbackResult.attempted ? { attempted: true, pass: rollbackResult.pass } : { attempted: false }, failureSha256: digest }, null, 2)}\n`);
  process.exitCode = 1;
}
