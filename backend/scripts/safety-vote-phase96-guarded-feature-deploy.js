'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const candidateCommit = '47411cbdd3773e9f2e87472732596178313372f2';
const candidateTree = '78a0531eece0c04e6a21b8e0a42a483779f23888';
const remoteBeforeCommit = '39c0018b9c0e5fdec22ac03edf1c8feeb61ec42a';
const runtimePath = 'index.html';
const confirmation = 'DEPLOY_PHASE96_SAFETY_VOTE_UX_FLAG_INDEX_ONLY';
const protectedEvidence = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009061532');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase96-feature-deploy-${stamp}`);
const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
let mutationStarted = false;
let rollbackSource = '';
let beforeSha = '';

function run(program, args, binary = false) {
  return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout: 90000, windowsHide: true });
}

function gitBlob(commit) {
  const result = run('git', ['show', `${commit}:${runtimePath}`], true);
  assert.strictEqual(result.status, 0, `Immutable Git blob unavailable at ${commit}`);
  return result.stdout;
}

function ftps(action, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', runtimePath];
  if (localPath) args.push('-LocalPath', localPath);
  const result = run('powershell.exe', args);
  return { ok: result.status === 0, status: result.status };
}

function download(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert(ftps('download', target).ok, 'Production index download failed');
  return { bytes: fs.statSync(target).size, sha256: fileSha(target) };
}

function doubleDownload(prefix, expectedSha) {
  const a = path.join(evidenceRoot, `${prefix}-a`, runtimePath);
  const b = path.join(evidenceRoot, `${prefix}-b`, runtimePath);
  const first = download(a), second = download(b);
  assert.strictEqual(first.sha256, second.sha256, `${prefix} double-download mismatch`);
  assert.strictEqual(first.sha256, expectedSha, `${prefix} remote drift detected`);
  return { path: runtimePath, bytes: first.bytes, sha256: first.sha256, doubleDownloadMatched: true, firstPath: a };
}

async function authenticatedGate() {
  assert(token, 'Existing Production bearer token is required');
  assert(!String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim(), 'Ambiguous authentication inputs');
  const records = [];
  for (const relative of ['/api/index.php?route=safety-vote/admin/health', '/api/index.php?route=safety-vote/admin/campaigns']) {
    const response = await fetch(`${baseUrl}${relative}`, { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    const body = await response.json().catch(() => null);
    assert.strictEqual(response.status, 200, `Authenticated GET failed: ${relative}`);
    assert.strictEqual(body?.success, true, `Authenticated response failed: ${relative}`);
    assert(/private/i.test(response.headers.get('cache-control') || '') && /no-store/i.test(response.headers.get('cache-control') || ''), 'Privacy cache policy missing');
    records.push({ path: relative, method: 'GET', status: response.status, cacheControlPrivateNoStore: true, responseBodyRecorded: false });
    if (relative.includes('/health')) {
      assert.strictEqual(body.data?.ready, true);
      assert.strictEqual(body.data?.moduleEnabled, true);
    } else {
      assert.strictEqual(Number(body.data?.total), 0);
      assert.strictEqual(body.data?.rows?.length, 0);
    }
  }
  return records;
}

function validateProtectedPreflight() {
  const result = JSON.parse(fs.readFileSync(path.join(protectedEvidence, 'result.json'), 'utf8'));
  const sqlA = fs.readFileSync(path.join(protectedEvidence, 'database-download-a', 'safety-vote-phase82-scoped.sql'), 'utf8');
  const sqlB = fs.readFileSync(path.join(protectedEvidence, 'database-download-b', 'safety-vote-phase82-scoped.sql'), 'utf8');
  assert.strictEqual(result.production?.schema?.tableCount, 39);
  assert.strictEqual(result.production?.schema?.businessRowCount, 0);
  assert.strictEqual(result.production?.schema?.settings?.moduleEnabled, '1');
  assert(Object.values(result.production?.providers || {}).every(provider => provider.configured === false), 'External provider is configured');
  assert.strictEqual(result.helper?.zeroResidue, true);
  assert.strictEqual(result.helper?.htaccessRestored, true);
  assert.strictEqual(sha256(sqlA), sha256(sqlB), 'Protected backup double-download mismatch');
  assert(/'phase7_integrations_enabled','0'/.test(sqlA), 'Integrations are not proven disabled');
  return { source: path.relative(root, protectedEvidence).replaceAll('\\', '/'), tables: 39, businessRows: 0, moduleEnabled: true, integrationsEnabled: false, configuredExternalProviders: 0, zeroResidue: true };
}

function prepareCandidateAndRollback() {
  const candidate = gitBlob(candidateCommit);
  const prior = gitBlob(remoteBeforeCommit);
  assert.strictEqual(run('git', ['rev-parse', `${candidateCommit}^{tree}`]).stdout.trim(), candidateTree, 'Candidate tree mismatch');
  assert(candidate.includes(Buffer.from('safetyVoteUxV1: true')), 'Candidate feature flag missing');
  const candidateSha = sha256(candidate), expectedBeforeSha = sha256(prior);
  assert.notStrictEqual(candidateSha, expectedBeforeSha, 'Candidate must differ from remote-before');
  const candidatePath = path.join(evidenceRoot, 'candidate', runtimePath);
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  fs.writeFileSync(candidatePath, candidate);
  const remoteBefore = doubleDownload('remote-before', expectedBeforeSha);
  rollbackSource = path.join(evidenceRoot, 'rollback-package', 'runtime-before', runtimePath);
  fs.mkdirSync(path.dirname(rollbackSource), { recursive: true });
  fs.copyFileSync(remoteBefore.firstPath, rollbackSource);
  beforeSha = expectedBeforeSha;
  const manifest = { contract: '2026-10-09-safety-vote-phase9.6-r1', candidateCommit, candidateTree, runtimeAllowlist: [{ path: runtimePath, sha256: candidateSha }], restoreFiles: [{ path: runtimePath, sha256: expectedBeforeSha }], removeOnRollback: [], externalIntegrationsRemainDisabled: true };
  const manifestPath = path.join(evidenceRoot, 'rollback-package', 'rollback-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { candidatePath, candidateSha, expectedBeforeSha, remoteBefore, rollback: { manifestSha256: fileSha(manifestPath), runtimeSha256: fileSha(rollbackSource), files: 1, verified: true } };
}

function rollback() {
  assert.strictEqual(fileSha(rollbackSource), beforeSha, 'Rollback source checksum changed');
  assert(ftps('upload', rollbackSource).ok, 'Rollback upload failed');
  const verified = doubleDownload('rollback-verified', beforeSha);
  return { attempted: true, restoredFiles: 1, verified };
}

async function main() {
  assert.strictEqual(process.argv[2], '--execute');
  assert.strictEqual(process.argv[3], confirmation, 'Exact deployment confirmation is required');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const protectedGate = validateProtectedPreflight();
  const authBefore = await authenticatedGate();
  const packageState = prepareCandidateAndRollback();
  const drillPath = path.join(evidenceRoot, 'rollback-drill', runtimePath);
  fs.mkdirSync(path.dirname(drillPath), { recursive: true });
  fs.copyFileSync(rollbackSource, drillPath);
  assert.strictEqual(fileSha(drillPath), beforeSha, 'Non-destructive rollback drill failed');
  mutationStarted = true;
  assert(ftps('upload', packageState.candidatePath).ok, 'Feature flag upload failed');
  const deployed = doubleDownload('deployed', packageState.candidateSha);
  const result = {
    contract: '2026-10-09-safety-vote-phase9.6-r1', generatedAt: new Date().toISOString(),
    candidate: { commit: candidateCommit, tree: candidateTree, runtimePaths: 1, indexSha256: packageState.candidateSha },
    protectedGate, authenticatedGateBefore: authBefore, remoteBefore: packageState.remoteBefore, rollbackPackage: packageState.rollback,
    deployment: { uploaded: [runtimePath], doubleDownloadVerified: true, deployed },
    rollbackDrill: { mode: 'non-destructive-local-restore-verification', productionMutationPerformed: false, filesVerified: 1, pass: true },
    constraints: { permissionChanged: false, campaignCreated: false, emailOrNotificationSent: false, loginAttempted: false, businessDataWritten: false, moduleChanged: false, integrationsOpened: false, pushPerformed: false },
    rollback: { attempted: false }, decision: 'PASS_FEATURE_FLAG_DEPLOYED_HOLD_FOR_BROWSER_SMOKE_AND_POSTCHECK'
  };
  const resultPath = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const resultSha = fileSha(resultPath);
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha}  result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, protectedGate, rollbackPackage: result.rollbackPackage, deployed: result.deployment.doubleDownloadVerified, rollbackDrill: result.rollbackDrill, constraints: result.constraints, resultSha256: resultSha }, null, 2)}\n`);
}

main().catch(error => {
  let rollbackResult = { attempted: false };
  if (mutationStarted && rollbackSource && beforeSha) {
    try { rollbackResult = rollback(); } catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ contract: '2026-10-09-safety-vote-phase9.6-r1', generatedAt: new Date().toISOString(), error: error.message, rollback: rollbackResult, decision: 'HOLD_FEATURE_DEPLOY_FAILED' }, null, 2)}\n`, 'utf8');
  process.stderr.write(`Safety Vote Phase 9.6 feature deploy failed: ${error.message}; rollback attempted=${rollbackResult.attempted}\n`);
  process.exitCode = 1;
});
