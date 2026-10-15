'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const baseline = '1e13e68f37e0364dc20872ea827187e75dbdbefb';
const confirmation = 'DEPLOY_SAFETY_VOTE_INDEPENDENT_BANNER_HOTFIX';
const runtime = [
  'api/handlers/safety_vote_engagement.php',
  'public/js/pages/safety-vote-page-ux1.js',
  'public/js/main.js',
  'index.html',
];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-independent-banner-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha(fs.readFileSync(file));
const normalized = value => sha(Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n'));
let prepared = null;
let runtimeMutation = false;

function safe(relative) {
  assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path ${relative}`);
  return relative;
}
function under(base, relative) {
  const target = path.resolve(base, ...safe(relative).split('/'));
  assert(target.startsWith(path.resolve(base) + path.sep), `Escaped path ${relative}`);
  return target;
}
function run(program, args, { binary = false, timeout = 180000 } = {}) {
  return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}
function git(args, options) {
  const result = run('git', args, options);
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  return result.stdout;
}
function blob(revision, relative) { return git(['show', `${revision}:${safe(relative)}`], { binary: true }); }
function ftps(action, remote, local) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safe(remote)];
  if (local) args.push('-LocalPath', local);
  const result = run('powershell.exe', args);
  return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') };
}
function download(relative, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = ftps('download', relative, target);
  assert(result.ok, `Download failed ${relative}`);
  return { bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalized(fs.readFileSync(target)), firstPath: target };
}
function doubleDownload(relative, label, expected) {
  const a = under(path.join(evidence, `${label}-a`), relative);
  const b = under(path.join(evidence, `${label}-b`), relative);
  const first = download(relative, a), second = download(relative, b);
  assert.equal(first.sha256, second.sha256, `Double-download mismatch ${relative}`);
  if (expected) assert.equal(first.sha256, expected, `SHA mismatch ${relative}`);
  return { path: relative, ...first, doubleDownloadMatched: true };
}
function prepare(commit, tree) {
  fs.mkdirSync(candidateRoot, { recursive: true });
  fs.mkdirSync(rollbackRoot, { recursive: true });
  const candidate = [], remoteBefore = [], rollback = [];
  for (const relative of runtime) {
    const data = blob(commit, relative), candidatePath = under(candidateRoot, relative);
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    fs.writeFileSync(candidatePath, data);
    if (relative.endsWith('.php')) assert.equal(run('C:\\xampp\\php\\php.exe', ['-l', candidatePath]).status, 0, `PHP lint failed ${relative}`);
    candidate.push({ path: relative, candidatePath, bytes: data.length, sha256: sha(data) });
    const before = doubleDownload(relative, 'remote-before');
    assert.equal(before.normalizedSha256, normalized(blob(baseline, relative)), `Production drift ${relative}`);
    const rollbackPath = under(rollbackRoot, relative);
    fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
    fs.copyFileSync(before.firstPath, rollbackPath);
    remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, doubleDownloadMatched: true });
    rollback.push({ path: relative, rollbackPath, sha256: before.sha256 });
  }
  const manifest = { contract: '2026-10-15-safety-vote-independent-banner-hotfix-r1', candidate: { commit, tree }, baseline, runtime, remoteBefore };
  const manifestPath = path.join(rollbackRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { candidate, remoteBefore, rollback, manifestSha256: fileSha(manifestPath) };
}
async function resolveAuth() {
  if (bearer && bearer.split('.').length === 3) {
    const response = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 200) return { token: bearer, source: 'existing_bearer', loginPerformed: false };
  }
  assert(adminId && adminPassword, 'Production Admin credentials missing');
  const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: adminId, password: adminPassword }) });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, 200, 'Admin login failed');
  assert(body?.token, 'Admin token missing');
  return { token: body.token, source: 'ephemeral_admin_login', loginPerformed: true };
}
async function smoke(auth) {
  const rows = [];
  for (const route of ['safety-vote/admin/health', 'safety-vote/admin/campaigns', 'safety-vote/me/promotions']) {
    const response = await fetch(`${baseUrl}/api/index.php?route=${route}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const body = await response.json().catch(() => null), cache = response.headers.get('cache-control') || '';
    assert.equal(response.status, 200, `Smoke failed ${route}`);
    assert.equal(body?.success, true);
    assert(/private/i.test(cache) && /no-store/i.test(cache), `Privacy cache policy failed ${route}`);
    if (route.endsWith('/health')) assert.equal(body.data?.ready, true);
    rows.push({ route, status: 200, responseBodyRecorded: false });
  }
  return { requests: rows, authenticationSource: auth.source, loginPerformed: auth.loginPerformed, credentialRecorded: false };
}
function upload() {
  for (const file of prepared.candidate) {
    runtimeMutation = true;
    assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed ${file.path}`);
  }
}
function verify() { return prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256)); }
async function httpsVerify(commit) {
  const map = new Map(prepared.candidate.map(file => [file.path, file]));
  const rows = [];
  for (const relative of runtime.filter(file => file !== 'api/handlers/safety_vote_engagement.php')) {
    const response = await fetch(`${baseUrl}/${relative}?release=${commit.slice(0, 12)}-${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, `HTTPS failed ${relative}`);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(sha(body), map.get(relative).sha256, `HTTPS SHA mismatch ${relative}`);
    rows.push({ path: relative, status: 200, sha256: sha(body) });
  }
  return rows;
}
function rollback() {
  if (!prepared || !runtimeMutation) return { attempted: false };
  for (const file of [...prepared.rollback].reverse()) {
    assert.equal(fileSha(file.rollbackPath), file.sha256);
    assert(ftps('upload', file.path, file.rollbackPath).ok, `Rollback upload failed ${file.path}`);
  }
  for (const file of prepared.rollback) doubleDownload(file.path, 'rollback-verified', file.sha256);
  return { attempted: true, pass: true, restored: prepared.rollback.length };
}
function write(name, value) {
  fs.mkdirSync(evidence, { recursive: true });
  const target = path.join(evidence, name);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  const digest = fileSha(target);
  fs.writeFileSync(path.join(evidence, `${name}.sha256`), `${digest}  ${name}\n`);
  return digest;
}

async function main() {
  assert.equal(process.argv[2], '--execute');
  assert.equal(process.argv[3], confirmation);
  const branch = String(git(['branch', '--show-current'])).trim();
  const commit = String(git(['rev-parse', 'HEAD'])).trim();
  const origin = String(git(['rev-parse', 'origin/main'])).trim();
  const tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim();
  assert.equal(branch, 'main');
  assert.equal(commit, origin, 'Candidate must be pushed');
  assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Worktree must be clean');
  const auth = await resolveAuth(), smokeBefore = await smoke(auth);
  prepared = prepare(commit, tree);
  upload();
  const deployed = verify(), https = await httpsVerify(commit), smokeAfter = await smoke(auth);
  const result = {
    contract: '2026-10-15-safety-vote-independent-banner-hotfix-r1', generatedAt: new Date().toISOString(),
    decision: 'PASS_SAFETY_VOTE_INDEPENDENT_BANNER_PRODUCTION_HOTFIX',
    candidate: { branch, commit, tree, baseline, runtimePaths: runtime.length }, remoteBefore: prepared.remoteBefore,
    deployment: { uploaded: runtime, doubleDownloadVerified: deployed.length, httpsVerified: https.length },
    smokeBefore, smokeAfter,
    rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.rollback.length, verified: true },
    posture: { schemaChanged: false, businessRowsMutated: false, permissionsChanged: false, externalDelivery: false },
    rollback: { attempted: false },
  };
  const resultSha256 = write('result.json', result);
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployment: result.deployment, smokeAfter: result.smokeAfter, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
}

main().catch(error => {
  let rollbackResult = { attempted: false };
  try { rollbackResult = rollback(); } catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
  const failure = { generatedAt: new Date().toISOString(), decision: rollbackResult.attempted && rollbackResult.pass ? 'HOLD_HOTFIX_FAILED_ROLLED_BACK' : 'HOLD_HOTFIX_ROLLBACK_INCOMPLETE', error: String(error.message || error), rollback: rollbackResult };
  const failureSha256 = write('failure.json', failure);
  process.stderr.write(`${JSON.stringify({ ...failure, evidence: path.relative(root, evidence).replaceAll('\\', '/'), failureSha256 }, null, 2)}\n`);
  process.exitCode = 1;
});
