'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const manifestPath = path.join(root, 'docs', 'safety-vote-phase96-mime-remediation-manifest.json');
const manifestSha256 = '73cb28d24e81782e88d7bf34548290a9a337c6a74afc7aa5283d6a4646168ab4';
const protectedEvidence = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009063228');
const confirmation = 'DEPLOY_PHASE96_MJS_MIME_HTACCESS_ONLY';
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase96-mime-deploy-${stamp}`);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
let mutationStarted = false;
let rollbackSource = '';
let expectedBeforeSha = '';

function run(program, args, binary = false) {
  return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout: 90000, windowsHide: true });
}

function ftps(action, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', '.htaccess'];
  if (localPath) args.push('-LocalPath', localPath);
  const result = run('powershell.exe', args);
  return { ok: result.status === 0, status: result.status };
}

function download(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert(ftps('download', target).ok, 'Production .htaccess download failed');
  return { bytes: fs.statSync(target).size, sha256: fileSha(target) };
}

function doubleDownload(label, expectedSha) {
  const a = path.join(evidenceRoot, `${label}-a`, '.htaccess');
  const b = path.join(evidenceRoot, `${label}-b`, '.htaccess');
  const first = download(a), second = download(b);
  assert.strictEqual(first.sha256, second.sha256, `${label} double-download mismatch`);
  assert.strictEqual(first.sha256, expectedSha, `${label} checksum mismatch`);
  return { path: '.htaccess', bytes: first.bytes, sha256: first.sha256, doubleDownloadMatched: true, firstPath: a };
}

function validateProtectedState() {
  const result = JSON.parse(fs.readFileSync(path.join(protectedEvidence, 'result.json'), 'utf8'));
  const sql = fs.readFileSync(path.join(protectedEvidence, 'database-download-a', 'safety-vote-phase82-scoped.sql'), 'utf8');
  assert.strictEqual(result.production?.schema?.tableCount, 39);
  assert.strictEqual(result.production?.schema?.businessRowCount, 0);
  assert.strictEqual(result.production?.schema?.settings?.moduleEnabled, '1');
  assert(Object.values(result.production?.providers || {}).every(provider => provider.configured === false));
  assert(/'phase7_integrations_enabled','0'/.test(sql));
  assert.strictEqual(result.helper?.zeroResidue, true);
  return { tables: 39, businessRows: 0, moduleEnabled: true, integrationsEnabled: false, providersConfigured: 0, zeroResidue: true };
}

async function authGate() {
  assert(token, 'Existing Production bearer token is required');
  const records = [];
  for (const relative of ['/api/index.php?route=safety-vote/admin/health', '/api/index.php?route=safety-vote/admin/campaigns']) {
    const response = await fetch(`${baseUrl}${relative}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, redirect: 'manual' });
    const body = await response.json().catch(() => null);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body?.success, true);
    assert(/private/i.test(response.headers.get('cache-control') || '') && /no-store/i.test(response.headers.get('cache-control') || ''));
    if (relative.includes('/health')) assert.strictEqual(body.data?.moduleEnabled, true);
    else assert.strictEqual(Number(body.data?.total), 0);
    records.push({ path: relative, method: 'GET', status: 200, privateNoStore: true, responseBodyRecorded: false });
  }
  return records;
}

async function probeMime(probes) {
  const records = [];
  for (const probe of probes) {
    const response = await fetch(`${baseUrl}/${probe.path}?phase96_mime=${stamp}`, { method: 'GET', redirect: 'manual', headers: { 'Cache-Control': 'no-cache' } });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    assert.strictEqual(response.status, 200, `MIME probe HTTP failed: ${probe.path}`);
    assert.strictEqual(contentType, 'application/javascript', `MIME probe content type failed: ${probe.path}`);
    assert.strictEqual(bytes.length, probe.bytes, `MIME probe byte count failed: ${probe.path}`);
    assert.strictEqual(sha256(bytes), probe.sha256, `MIME probe body checksum failed: ${probe.path}`);
    records.push({ path: probe.path, status: 200, contentType, bytes: bytes.length, sha256: probe.sha256, responseBodyRecorded: false });
  }
  return records;
}

function rollback() {
  assert.strictEqual(fileSha(rollbackSource), expectedBeforeSha, 'Rollback source drift');
  assert(ftps('upload', rollbackSource).ok, 'Rollback upload failed');
  return { attempted: true, pass: true, verified: doubleDownload('rollback', expectedBeforeSha) };
}

async function main() {
  assert.strictEqual(process.argv[2], '--execute');
  assert.strictEqual(process.argv[3], confirmation, 'Exact confirmation is required');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  assert.strictEqual(fileSha(manifestPath), manifestSha256, 'Manifest checksum mismatch');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const protectedGate = validateProtectedState();
  const authenticatedGate = await authGate();
  const candidateResult = run('git', ['show', `${manifest.sourceCommit}:.htaccess`], true);
  assert.strictEqual(candidateResult.status, 0, 'Candidate Git blob unavailable');
  const candidate = candidateResult.stdout;
  assert.strictEqual(candidate.length, manifest.runtimeAllowlist[0].bytes);
  assert.strictEqual(sha256(candidate), manifest.runtimeAllowlist[0].sha256);
  const candidatePath = path.join(evidenceRoot, 'candidate', '.htaccess');
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  fs.writeFileSync(candidatePath, candidate);
  expectedBeforeSha = manifest.productionBefore.sha256;
  const remoteBefore = doubleDownload('remote-before', expectedBeforeSha);
  rollbackSource = path.join(evidenceRoot, 'rollback-package', '.htaccess');
  fs.mkdirSync(path.dirname(rollbackSource), { recursive: true });
  fs.copyFileSync(remoteBefore.firstPath, rollbackSource);
  assert.strictEqual(fileSha(rollbackSource), expectedBeforeSha);
  mutationStarted = true;
  assert(ftps('upload', candidatePath).ok, 'Candidate .htaccess upload failed');
  const deployed = doubleDownload('deployed', manifest.runtimeAllowlist[0].sha256);
  const mimeProbes = await probeMime(manifest.mimeProbes);
  const result = {
    contract: manifest.contract, generatedAt: new Date().toISOString(), manifestSha256,
    candidate: { commit: manifest.sourceCommit, tree: manifest.sourceTree, runtimePaths: 1, sha256: manifest.runtimeAllowlist[0].sha256 },
    protectedGate, authenticatedGate, remoteBefore, rollbackPackage: { files: 1, bytes: fs.statSync(rollbackSource).size, sha256: fileSha(rollbackSource), doubleDownloadSourceVerified: true },
    deployment: { paths: ['.htaccess'], deployed, mimeProbes },
    constraints: { loginAttempted: false, permissionChanged: false, campaignCreated: false, businessDataWritten: false, emailOrNotificationSent: false, integrationsOpened: false, pushPerformed: false },
    rollback: { attempted: false }, decision: 'PASS_MIME_DEPLOYED_HOLD_FOR_LEGACY_BROWSER_SMOKE'
  };
  const resultPath = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const digest = fileSha(resultPath);
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${digest}  result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, mimeProbes: mimeProbes.length, rollbackPackage: result.rollbackPackage, constraints: result.constraints, resultSha256: digest }, null, 2)}\n`);
}

main().catch(error => {
  let rollbackResult = { attempted: false };
  if (mutationStarted && rollbackSource && expectedBeforeSha) {
    try { rollbackResult = rollback(); } catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ contract: '2026-10-09-safety-vote-phase9.6-mime-r1', error: error.message, rollback: rollbackResult, decision: 'HOLD_MIME_REMEDIATION_FAILED' }, null, 2)}\n`, 'utf8');
  process.stderr.write(`Safety Vote Phase 9.6 MIME deploy failed: ${error.message}; rollback attempted=${rollbackResult.attempted}\n`);
  process.exitCode = 1;
});
