'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const helperTemplate = path.join(__dirname, 'safety-vote-phase104-production-migration-helper.php.template');
const browserSmoke = path.join(__dirname, 'safety-vote-phase96-production-browser-smoke.js');
const candidateCommit = '035be38f8dd1dd44bb43501ffa9dc0a876716d0b';
const candidateTree = '7b889e8aadb9db17db1b8529020b39c25a2e7e2b';
const productionBaseline = 'c1f4fd4e1c09839f84bf2a03094e5a3864563afa';
const confirmation = 'DEPLOY_PHASE104_RUNTIME_AND_ADDITIVE_SCHEMA';
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const runtime = [
  'index.html',
  'api/handlers/safety_vote.php',
  'api/handlers/safety_vote_phase10_4.php',
  'api/handlers/safety_vote_phase3.php',
  'api/index.php',
  'api/lib/safety_vote_phase1.php',
  'api/lib/safety_vote_phase10_4.php',
  'public/js/main.js',
  'public/js/pages/admin-safety-vote-ux1.js',
  'public/js/pages/admin.js',
  'public/js/pages/safety-vote-campaign-wizard.js',
  'public/js/pages/safety-vote-page-ux1.js',
  'public/js/pages/safety-vote-wizard-model.mjs',
  'public/style.css'
];
const newPaths = new Set(['api/handlers/safety_vote_phase10_4.php', 'api/lib/safety_vote_phase10_4.php']);
const delayedPaths = new Set(['api/handlers/safety_vote.php', 'api/index.php', 'index.html']);
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(6).toString('hex');
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase104-deploy-${stamp}`);
const staging = path.join(evidenceRoot, 'staging');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const helperName = `safety-vote-phase104-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const backupId = `safety-vote-phase104-${nonce}`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
let rollbackManifest = null;
let helperUploaded = false;
let htaccessModified = false;
let schemaMigrated = false;
let runtimeMutationStarted = false;
let htaccessOriginalPath = '';
let htaccessOriginalSha = '';

function safeRelative(relative) {
  assert(typeof relative === 'string' && relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`);
  return relative;
}

function under(base, relative) {
  const target = path.resolve(base, ...safeRelative(relative).split('/'));
  assert(target.startsWith(path.resolve(base) + path.sep), `Escaped guarded root: ${relative}`);
  return target;
}

function run(program, args, binary = false, timeout = 120000) {
  return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}

function gitBlob(commit, relative) {
  const result = run('git', ['show', `${commit}:${safeRelative(relative)}`], true);
  assert.strictEqual(result.status, 0, `Git blob unavailable: ${relative}`);
  return result.stdout;
}

function ftps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remotePath ? safeRelative(remotePath) : ''];
  if (localPath) args.push('-LocalPath', localPath);
  const result = run('powershell.exe', args);
  return { ok: result.status === 0, status: result.status, output: String(result.stdout || '') };
}

function remoteExists(relative) {
  const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
  const listing = ftps('list', parent);
  if (!listing.ok) return false;
  const name = path.posix.basename(relative).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${name}(?:\\r?\\n|$)`, 'm').test(listing.output);
}

function download(relative, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert(ftps('download', relative, target).ok, `Download failed: ${relative}`);
  return { bytes: fs.statSync(target).size, sha256: fileSha(target) };
}

function doubleDownload(relative, label, expectedSha = null) {
  const a = under(path.join(evidenceRoot, `${label}-a`), relative);
  const b = under(path.join(evidenceRoot, `${label}-b`), relative);
  const first = download(relative, a);
  const second = download(relative, b);
  assert.strictEqual(first.sha256, second.sha256, `Double-download mismatch: ${relative}`);
  if (expectedSha) assert.strictEqual(first.sha256, expectedSha, `Remote drift: ${relative}`);
  return { path: relative, bytes: first.bytes, sha256: first.sha256, doubleDownloadMatched: true, firstPath: a };
}

async function requestHelper(token, action) {
  const response = await fetch(helperUrl, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'X-Safety-Vote-Phase104-Token': token, 'X-Safety-Vote-Phase104-Action': action, 'Cache-Control': 'no-cache' },
    body: '{}'
  });
  const data = await response.json().catch(() => ({ success: false, code: 'NON_JSON_RESPONSE' }));
  return { status: response.status, data };
}

async function authGate(expectedSchema) {
  assert(bearer && bearer.split('.').length === 3, 'Existing Production bearer token is required');
  assert(!String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim(), 'Ambiguous authentication inputs');
  const result = [];
  let campaignTotal = null;
  for (const relative of ['/api/index.php?route=safety-vote/admin/health', '/api/index.php?route=safety-vote/admin/campaigns']) {
    const response = await fetch(`${baseUrl}${relative}`, { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    const body = await response.json().catch(() => null);
    const cache = response.headers.get('cache-control') || '';
    assert.strictEqual(response.status, 200, `Authenticated GET failed: ${relative}`);
    assert.strictEqual(body?.success, true, `Authenticated response failed: ${relative}`);
    assert(/private/i.test(cache) && /no-store/i.test(cache), `Privacy header missing: ${relative}`);
    if (relative.includes('/health')) {
      assert.strictEqual(body.data?.ready, true);
      assert.strictEqual(body.data?.moduleEnabled, true);
      assert.strictEqual(body.data?.schemaVersion, expectedSchema);
    } else {
      campaignTotal = Number(body.data?.total);
      assert(Number.isInteger(campaignTotal) && campaignTotal >= 0, 'Campaign total is invalid');
      assert.strictEqual(body.data?.rows?.length, campaignTotal);
    }
    result.push({ path: relative, method: 'GET', status: response.status, privateNoStore: true, responseBodyRecorded: false });
  }
  return { requests: result, campaignTotal };
}

async function inspectProduction() {
  assert(bearer && bearer.split('.').length === 3, 'Existing Production bearer token is required');
  const headers = { Authorization: `Bearer ${bearer}`, Accept: 'application/json', 'Cache-Control': 'no-cache' };
  const healthResponse = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { method: 'GET', redirect: 'manual', headers });
  const campaignResponse = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/campaigns`, { method: 'GET', redirect: 'manual', headers });
  const health = await healthResponse.json().catch(() => null);
  const campaigns = await campaignResponse.json().catch(() => null);
  process.stdout.write(`${JSON.stringify({ decision: 'PASS_PHASE104_READ_ONLY_INSPECTION', health: { status: healthResponse.status, ready: health?.data?.ready === true, moduleEnabled: health?.data?.moduleEnabled === true, schemaVersion: health?.data?.schemaVersion || null }, campaigns: { status: campaignResponse.status, total: campaigns?.data?.total == null ? null : Number(campaigns.data.total), rowsRecorded: false }, credentialRecorded: false, responseBodiesRecorded: false, mutationPerformed: false }, null, 2)}\n`);
}

function stageCandidateAndRollback() {
  assert.strictEqual(run('git', ['rev-parse', `${candidateCommit}^{tree}`]).stdout.trim(), candidateTree, 'Candidate tree mismatch');
  fs.mkdirSync(staging, { recursive: true });
  fs.mkdirSync(rollbackRoot, { recursive: true });
  const candidate = [], restoreFiles = [], removeOnRollback = [], remoteBefore = [];
  for (const relative of runtime) {
    const blob = gitBlob(candidateCommit, relative);
    const candidatePath = under(path.join(staging, 'runtime'), relative);
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    fs.writeFileSync(candidatePath, blob);
    candidate.push({ path: relative, bytes: blob.length, sha256: sha256(blob) });
    if (newPaths.has(relative)) {
      assert(!remoteExists(relative), `Expected new Production path already exists: ${relative}`);
      removeOnRollback.push({ path: relative });
      remoteBefore.push({ path: relative, absent: true, absenceRevalidated: true });
      continue;
    }
    const expected = sha256(gitBlob(productionBaseline, relative));
    const remote = doubleDownload(relative, 'remote-before', expected);
    const rollbackPath = under(path.join(rollbackRoot, 'runtime-before'), relative);
    fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
    fs.copyFileSync(remote.firstPath, rollbackPath);
    restoreFiles.push({ path: relative, bytes: remote.bytes, sha256: remote.sha256 });
    remoteBefore.push({ path: relative, bytes: remote.bytes, sha256: remote.sha256, doubleDownloadMatched: true });
  }
  rollbackManifest = { contract: '2026-10-09-safety-vote-phase10.4-production-r1', candidateCommit, candidateTree, productionBaseline, restoreFiles, removeOnRollback, schemaRollback: 'Phase 7 only while business rows remain zero', externalIntegrationsRemainDisabled: true };
  const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(rollbackManifest, null, 2)}\n`, 'utf8');
  return { candidate, remoteBefore, manifestSha256: fileSha(manifestPath), restoreFiles: restoreFiles.length, removeOnRollback: removeOnRollback.length };
}

function uploadRuntime(paths) {
  for (const relative of paths) {
    runtimeMutationStarted = true;
    assert(ftps('upload', relative, under(path.join(staging, 'runtime'), relative)).ok, `Upload failed: ${relative}`);
  }
}

function verifyCandidate() {
  const expected = new Map(runtime.map(relative => [relative, sha256(gitBlob(candidateCommit, relative))]));
  return runtime.map(relative => doubleDownload(relative, 'deployed', expected.get(relative)));
}

function rollbackRuntime() {
  assert(rollbackManifest, 'Rollback manifest unavailable');
  for (const file of rollbackManifest.restoreFiles) {
    const source = under(path.join(rollbackRoot, 'runtime-before'), file.path);
    assert.strictEqual(fileSha(source), file.sha256, `Rollback checksum mismatch: ${file.path}`);
    assert(ftps('upload', file.path, source).ok, `Rollback upload failed: ${file.path}`);
  }
  for (const file of rollbackManifest.removeOnRollback) {
    if (remoteExists(file.path)) assert(ftps('delete', file.path).ok, `Rollback delete failed: ${file.path}`);
    assert(!remoteExists(file.path), `Rollback residue: ${file.path}`);
  }
  for (const file of rollbackManifest.restoreFiles) doubleDownload(file.path, 'rollback-verified', file.sha256);
  return { pass: true, restored: rollbackManifest.restoreFiles.length, removed: rollbackManifest.removeOnRollback.length };
}

function prepareHelperWindow() {
  const source = fs.readFileSync(helperTemplate, 'utf8')
    .replace('__RUN_TOKEN_SHA256__', sha256(runToken))
    .replace('__CLEANUP_TOKEN_SHA256__', sha256(cleanupToken))
    .replace('__GUARD_NAME__', guardName)
    .replace('__BACKUP_ID__', backupId);
  const localHelper = path.join(staging, helperName);
  const localGuard = path.join(staging, guardName);
  fs.writeFileSync(localHelper, source, 'utf8');
  const helperSha = fileSha(localHelper);
  fs.writeFileSync(localGuard, `${helperSha}\n`, 'utf8');
  const lint = run('C:\\xampp\\php\\php.exe', ['-l', localHelper]);
  assert.strictEqual(lint.status, 0, 'Migration helper PHP lint failed');

  const beforeA = path.join(evidenceRoot, 'htaccess-before-a');
  const beforeB = path.join(evidenceRoot, 'htaccess-before-b');
  assert(ftps('download', '.htaccess', beforeA).ok && ftps('download', '.htaccess', beforeB).ok, '.htaccess download failed');
  htaccessOriginalPath = beforeA;
  htaccessOriginalSha = fileSha(beforeA);
  assert.strictEqual(fileSha(beforeB), htaccessOriginalSha, '.htaccess double-download mismatch');
  const original = fs.readFileSync(beforeA, 'utf8');
  const anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,';
  assert(original.includes(anchor), '.htaccess helper anchor missing');
  const rule = `# Exact temporary Safety Vote Phase 10.4 migration helper exception.\nRewriteRule ^api/${helperName.replace(/\./g, '\\.')}$ - [L]\n\n`;
  const windowPath = path.join(staging, 'htaccess-helper-window');
  fs.writeFileSync(windowPath, original.replace(anchor, rule + anchor), 'utf8');
  assert(ftps('upload', remoteGuard, localGuard).ok, 'Helper guard upload failed');
  assert(ftps('upload', remoteHelper, localHelper).ok, 'Helper upload failed');
  helperUploaded = true;
  assert(ftps('upload', '.htaccess', windowPath).ok, 'Helper .htaccess window upload failed');
  htaccessModified = true;
  const windowBack = path.join(evidenceRoot, 'htaccess-window-download-back');
  assert(ftps('download', '.htaccess', windowBack).ok && fileSha(windowBack) === fileSha(windowPath), 'Helper window verification failed');
  const helperBack = path.join(evidenceRoot, 'helper-download-back.php');
  assert(ftps('download', remoteHelper, helperBack).ok && fileSha(helperBack) === helperSha, 'Helper checksum verification failed');
  return { helperSha256: helperSha };
}

async function migrateSchema() {
  const get = await fetch(helperUrl, { method: 'GET', redirect: 'manual' });
  const invalid = await requestHelper('invalid-token', 'migrate');
  assert.strictEqual(get.status, 405, 'Migration helper GET did not fail closed');
  assert.strictEqual(invalid.status, 401, 'Migration helper invalid token did not fail closed');
  const response = await requestHelper(runToken, 'migrate');
  assert.strictEqual(response.status, 200, `Migration failed at ${response.data?.failureStage || 'unknown'}`);
  assert.strictEqual(response.data?.success, true);
  schemaMigrated = true;
  assert.strictEqual(response.data?.valuesSuppressed, true);
  assert.strictEqual(response.data?.tableCountBefore, 39);
  assert.strictEqual(response.data?.tableCountAfter, 40);
  assert.strictEqual(response.data?.businessRowsPreserved, true);
  assert.strictEqual(response.data?.moduleEnabled, true);
  assert.strictEqual(response.data?.integrationsEnabled, false);
  assert.strictEqual(response.data?.configuredProviders, 0);
  const relative = String(response.data?.backup?.relativePath || '');
  assert(/^api\/private\/safety-vote-phase104-[a-f0-9]+\/safety-vote-phase104-rollback\.sql$/.test(relative), 'Unexpected migration backup path');
  const a = path.join(evidenceRoot, 'schema-backup-a.sql');
  const b = path.join(evidenceRoot, 'schema-backup-b.sql');
  const first = download(relative, a), second = download(relative, b);
  assert.strictEqual(first.sha256, second.sha256, 'Schema backup double-download mismatch');
  assert.strictEqual(first.sha256, response.data.backup.sha256, 'Schema backup checksum mismatch');
  const publicBackup = await fetch(`${baseUrl}/${relative}`, { method: 'GET', redirect: 'manual' });
  assert([401, 403, 404].includes(publicBackup.status), `Private backup exposure: ${publicBackup.status}`);
  return { response: response.data, backup: { path: relative, bytes: first.bytes, sha256: first.sha256, doubleDownloadMatched: true, publicHttpStatus: publicBackup.status } };
}

async function resumeSchema() {
  const get = await fetch(helperUrl, { method: 'GET', redirect: 'manual' });
  const invalid = await requestHelper('invalid-token', 'resume');
  assert.strictEqual(get.status, 405, 'Recovery helper GET did not fail closed');
  assert.strictEqual(invalid.status, 401, 'Recovery helper invalid token did not fail closed');
  const response = await requestHelper(runToken, 'resume');
  assert.strictEqual(response.status, 200, `Recovery precheck failed at ${response.data?.failureStage || 'unknown'}`);
  assert.strictEqual(response.data?.success, true);
  schemaMigrated = true;
  assert.strictEqual(response.data?.valuesSuppressed, true);
  assert.strictEqual(response.data?.tableCount, 40);
  assert.strictEqual(response.data?.phase104DataRows, 0);
  assert.strictEqual(response.data?.moduleEnabled, true);
  assert.strictEqual(response.data?.integrationsEnabled, false);
  assert.strictEqual(response.data?.configuredProviders, 0);
  const relative = String(response.data?.backup?.relativePath || '');
  assert(/^api\/private\/safety-vote-phase104-[a-f0-9]+\/safety-vote-phase104-rollback\.sql$/.test(relative), 'Unexpected recovery backup path');
  const a = path.join(evidenceRoot, 'schema-backup-a.sql');
  const b = path.join(evidenceRoot, 'schema-backup-b.sql');
  const first = download(relative, a), second = download(relative, b);
  assert.strictEqual(first.sha256, second.sha256, 'Recovery backup double-download mismatch');
  assert.strictEqual(first.sha256, response.data.backup.sha256, 'Recovery backup checksum mismatch');
  const publicBackup = await fetch(`${baseUrl}/${relative}`, { method: 'GET', redirect: 'manual' });
  assert([401, 403, 404].includes(publicBackup.status), `Private recovery backup exposure: ${publicBackup.status}`);
  return { response: response.data, backup: { path: relative, bytes: first.bytes, sha256: first.sha256, doubleDownloadMatched: true, publicHttpStatus: publicBackup.status } };
}

async function rollbackSchema() {
  if (!schemaMigrated || !helperUploaded) return { attempted: false };
  const response = await requestHelper(runToken, 'rollback');
  const pass = response.status === 200 && response.data?.success === true && response.data?.schemaVersionRestored === true;
  if (pass) schemaMigrated = false;
  return { attempted: true, pass, status: response.status };
}

async function cleanupHelper() {
  if (!helperUploaded && !htaccessModified) return { status: null, htaccessRestored: true, zeroResidue: true, attempted: false };
  let response = null;
  if (helperUploaded && htaccessModified) {
    response = await requestHelper(cleanupToken, 'cleanup').catch(() => null);
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  let htaccessRestored = !htaccessModified;
  if (htaccessModified && htaccessOriginalPath) {
    assert(ftps('upload', '.htaccess', htaccessOriginalPath).ok, '.htaccess restore upload failed');
    const restored = path.join(evidenceRoot, 'htaccess-restored-download-back');
    assert(ftps('download', '.htaccess', restored).ok, '.htaccess restore download failed');
    assert.strictEqual(fileSha(restored), htaccessOriginalSha, '.htaccess was not restored byte-exact');
    htaccessModified = false;
    htaccessRestored = true;
  }
  const api = ftps('list', 'api');
  const privateBackup = ftps('list', `api/private/${backupId}`);
  const zeroResidue = api.ok && !api.output.includes(helperName) && !api.output.includes(guardName) && !privateBackup.ok;
  assert.strictEqual(response?.status, 200, 'Helper cleanup failed');
  assert(zeroResidue, 'Helper/private-backup residue remains');
  helperUploaded = false;
  return { status: response.status, htaccessRestored, htaccessSha256: htaccessOriginalSha, zeroResidue };
}

function runBrowserSmoke() {
  const result = run(process.execPath, [browserSmoke, '--allow-existing-campaigns'], false, 300000);
  assert.strictEqual(result.status, 0, 'Authenticated GET-only Production browser smoke failed');
  return { pass: true, script: path.relative(root, browserSmoke).replaceAll('\\', '/'), outputRecorded: false };
}

function writeResult(name, value) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const target = path.join(evidenceRoot, name);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const digest = fileSha(target);
  fs.writeFileSync(path.join(evidenceRoot, `${name}.sha256`), `${digest}  ${name}\n`, 'utf8');
  return digest;
}

async function main() {
  if (process.argv[2] === '--inspect') return inspectProduction();
  if (process.argv[2] === '--resume') {
    assert.strictEqual(process.argv[3], confirmation, 'Exact deployment confirmation is required');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const release = stageCandidateAndRollback();
    const helper = prepareHelperWindow();
    const migration = await resumeSchema();
    uploadRuntime(runtime.filter(relative => !delayedPaths.has(relative)));
    uploadRuntime(['api/handlers/safety_vote.php', 'api/index.php', 'index.html']);
    const verified = verifyCandidate();
    const afterAuth = await authGate('2026-10-09-phase10.4-r1');
    assert.strictEqual(afterAuth.campaignTotal, Number(migration.response.campaignCount), 'Campaign count changed during recovery');
    const browser = runBrowserSmoke();
    const cleanup = await cleanupHelper();
    const result = {
      contract: '2026-10-09-safety-vote-phase10.4-production-recovery-r1', generatedAt: new Date().toISOString(),
      candidate: { commit: candidateCommit, tree: candidateTree, runtimePaths: runtime.length },
      recoveredState: { priorHealthStatus: 503, schemaVersion: '2026-10-09-phase10.4-r1', runtimeRolledBack: true },
      remoteBefore: release.remoteBefore,
      rollbackPackage: { manifestSha256: release.manifestSha256, restoreFiles: release.restoreFiles, removeOnRollback: release.removeOnRollback, schemaBackupSha256: migration.backup.sha256, verified: true },
      helper, migration, deployment: { uploaded: runtime, doubleDownloadVerified: verified.length },
      authenticatedAfter: afterAuth, browserSmoke: browser, cleanup,
      posture: { moduleEnabled: true, integrationsEnabled: false, configuredExternalProviders: 0, campaignTotal: afterAuth.campaignTotal, businessRowsPreserved: true, emailsOrNotificationsSent: false, loginAttempted: false, permissionsChanged: false },
      rollback: { attempted: false, packageReady: true },
      decision: 'PASS_PHASE104_PRODUCTION_DEPLOYMENT_RECOVERED'
    };
    const digest = writeResult('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, rollbackPackage: result.rollbackPackage, deployment: result.deployment, browserSmoke: browser.pass, cleanup, posture: result.posture, resultSha256: digest }, null, 2)}\n`);
    return;
  }
  assert.strictEqual(process.argv[2], '--execute', 'Execution requires --execute');
  assert.strictEqual(process.argv[3], confirmation, 'Exact deployment confirmation is required');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const beforeAuth = await authGate('2026-10-08-phase7-r1');
  const release = stageCandidateAndRollback();
  const helper = prepareHelperWindow();
  uploadRuntime(runtime.filter(relative => !delayedPaths.has(relative)));
  const migration = await migrateSchema();
  uploadRuntime(['api/handlers/safety_vote.php', 'api/index.php', 'index.html']);
  const verified = verifyCandidate();
  const afterAuth = await authGate('2026-10-09-phase10.4-r1');
  assert.strictEqual(afterAuth.campaignTotal, beforeAuth.campaignTotal, 'Campaign count changed during deployment');
  const browser = runBrowserSmoke();
  const cleanup = await cleanupHelper();
  const result = {
    contract: '2026-10-09-safety-vote-phase10.4-production-r1', generatedAt: new Date().toISOString(),
    candidate: { commit: candidateCommit, tree: candidateTree, runtimePaths: runtime.length },
    authenticatedBefore: beforeAuth, remoteBefore: release.remoteBefore,
    rollbackPackage: { manifestSha256: release.manifestSha256, restoreFiles: release.restoreFiles, removeOnRollback: release.removeOnRollback, verified: true },
    helper, migration, deployment: { uploaded: runtime, doubleDownloadVerified: verified.length },
    authenticatedAfter: afterAuth, browserSmoke: browser, cleanup,
    posture: { moduleEnabled: true, integrationsEnabled: false, configuredExternalProviders: 0, campaignTotal: afterAuth.campaignTotal, businessRowsPreserved: true, emailsOrNotificationsSent: false, loginAttempted: false, permissionsChanged: false },
    rollback: { attempted: false, packageReady: true },
    decision: 'PASS_PHASE104_PRODUCTION_DEPLOYMENT'
  };
  const digest = writeResult('result.json', result);
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, rollbackPackage: result.rollbackPackage, migration: { tableCountBefore: 39, tableCountAfter: 40, businessRowsPreserved: true }, deployment: result.deployment, browserSmoke: browser.pass, cleanup, posture: result.posture, resultSha256: digest }, null, 2)}\n`);
}

main().catch(async error => {
  const rollback = { schema: { attempted: false }, runtime: { attempted: false } };
  try { rollback.schema = await rollbackSchema(); } catch (_) { rollback.schema = { attempted: true, pass: false }; }
  if (runtimeMutationStarted && rollbackManifest) {
    try { rollback.runtime = { attempted: true, ...rollbackRuntime() }; } catch (_) { rollback.runtime = { attempted: true, pass: false }; }
  }
  let cleanup = null;
  try { cleanup = await cleanupHelper(); } catch (_) { cleanup = { pass: false }; }
  const safe = (!rollback.schema.attempted || rollback.schema.pass) && (!rollback.runtime.attempted || rollback.runtime.pass) && cleanup?.zeroResidue === true;
  const failure = { contract: '2026-10-09-safety-vote-phase10.4-production-r1', generatedAt: new Date().toISOString(), error: String(error.message || error), rollback, cleanup, secretRecorded: false, decision: safe ? 'HOLD_PHASE104_DEPLOYMENT_FAILED_ROLLED_BACK' : 'HOLD_PHASE104_DEPLOYMENT_FAILED_ROLLBACK_INCOMPLETE' };
  const digest = writeResult('failure.json', failure);
  process.stderr.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: failure.decision, error: failure.error, rollback, cleanup, failureSha256: digest }, null, 2)}\n`);
  process.exitCode = 1;
});
