'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const baseline = 'f48c8045b2ef793c43d9d26df0b5cc449117893d';
const confirmation = 'DEPLOY_SAFETY_VOTE_THAI_TIME_24H_PRODUCTION';
const runtime = [
  'index.html', 'public/js/main.js', 'public/js/pages/admin.js',
  'public/js/pages/admin-safety-vote-governance.js', 'public/js/pages/admin-safety-vote-operations.js',
  'public/js/pages/admin-safety-vote-planning.js', 'public/js/pages/admin-safety-vote-results.js',
  'public/js/pages/admin-safety-vote-review.js', 'public/js/pages/admin-safety-vote-ux1.js',
  'public/js/pages/safety-vote-campaign-wizard.js', 'public/js/pages/safety-vote-jury-workspace.js',
  'public/js/pages/safety-vote-live-results.js', 'public/js/pages/safety-vote-page-ux1.js',
  'public/js/pages/safety-vote-time.mjs', 'public/style.css'
];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-thai-time-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate'), rollbackRoot = path.join(evidence, 'rollback-package');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim(), adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha(fs.readFileSync(file));
const normalized = value => sha(Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n'));
let prepared = null, mutationStarted = false;

function safe(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative)); return relative; }
function under(base, relative) { const target = path.resolve(base, ...safe(relative).split('/')); assert(target.startsWith(path.resolve(base) + path.sep)); return target; }
function run(program, args, { binary = false, timeout = 180000 } = {}) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, options) { const result = run('git', args, options); assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`); return result.stdout; }
function blob(revision, relative) { return git(['show', `${revision}:${safe(relative)}`], { binary: true }); }
function exists(relative) { const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative), result = ftps('list', parent); assert(result.ok, `Remote list failed ${parent}`); return result.output.split(/\r?\n/).some(line => line.trim().endsWith(path.posix.basename(relative))); }
function ftps(action, remote, local) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remote ? safe(remote) : ''];
  if (local) args.push('-LocalPath', local);
  const result = run('powershell.exe', args); return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') };
}
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); const result = ftps('download', relative, target); assert(result.ok, `Download failed ${relative}`); return { path: relative, bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalized(fs.readFileSync(target)), firstPath: target }; }
function doubleDownload(relative, label, expected) {
  const a = download(relative, under(path.join(evidence, `${label}-a`), relative)), b = download(relative, under(path.join(evidence, `${label}-b`), relative));
  assert.equal(a.sha256, b.sha256, `Double-download mismatch ${relative}`); if (expected) assert.equal(a.normalizedSha256, expected, `Remote baseline drift ${relative}`);
  return { ...a, doubleDownloadMatched: true };
}
function prepare(commit, tree) {
  fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
  const candidate = [], restoreFiles = [], removeOnRollback = [], remoteBefore = [];
  for (const relative of runtime) {
    const data = blob(commit, relative), candidatePath = under(candidateRoot, relative); fs.mkdirSync(path.dirname(candidatePath), { recursive: true }); fs.writeFileSync(candidatePath, data);
    candidate.push({ path: relative, candidatePath, bytes: data.length, sha256: sha(data) });
    const baselineExists = run('git', ['cat-file', '-e', `${baseline}:${relative}`]).status === 0;
    if (!baselineExists) { assert.equal(exists(relative), false, `Expected new remote path is already present: ${relative}`); removeOnRollback.push({ path: relative }); remoteBefore.push({ path: relative, absent: true }); continue; }
    const before = doubleDownload(relative, 'remote-before', normalized(blob(baseline, relative)));
    const rollbackPath = under(rollbackRoot, relative); fs.mkdirSync(path.dirname(rollbackPath), { recursive: true }); fs.copyFileSync(before.firstPath, rollbackPath);
    restoreFiles.push({ path: relative, rollbackPath, sha256: before.sha256 }); remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, doubleDownloadMatched: true });
  }
  const manifest = { contract: '2026-10-15-safety-vote-thai-time-24h-r1', candidate: { commit, tree }, baseline, runtime, remoteBefore };
  const manifestPath = path.join(rollbackRoot, 'manifest.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { candidate, restoreFiles, removeOnRollback, remoteBefore, manifestSha256: fileSha(manifestPath) };
}
async function health(token) {
  const response = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
  return { status: response.status, body: await response.json().catch(() => null), cache: response.headers.get('cache-control') || '' };
}
async function resolveAuth() {
  if (bearer && bearer.split('.').length === 3) { const probe = await health(bearer); if (probe.status === 200) return { token: bearer, source: 'existing_bearer', loginPerformed: false }; }
  assert(adminId && adminPassword, 'Production Admin credentials missing');
  const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: adminId, password: adminPassword }) });
  const body = await response.json().catch(() => null); assert.equal(response.status, 200, 'Production Admin login failed'); assert(body?.token, 'Production Admin token missing');
  return { token: body.token, source: 'ephemeral_admin_login', loginPerformed: true };
}
async function smoke(auth) {
  const routes = ['safety-vote/admin/health', 'safety-vote/admin/campaigns', 'safety-vote/me/promotions'], requests = [];
  for (const route of routes) {
    const response = await fetch(`${baseUrl}/api/index.php?route=${route}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const body = await response.json().catch(() => null), cache = response.headers.get('cache-control') || '';
    assert.equal(response.status, 200, `Production smoke failed: ${route}`); assert.equal(body?.success, true); assert(/private/i.test(cache) && /no-store/i.test(cache));
    if (route.endsWith('/health')) assert.equal(body.data?.ready, true);
    requests.push({ route, status: 200, method: 'GET', responseBodyRecorded: false });
  }
  const anonymous = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { cache: 'no-store' }); assert.equal(anonymous.status, 401);
  return { requests, anonymousDenied: true, authenticationSource: auth.source, loginPerformed: auth.loginPerformed, credentialsRecorded: false };
}
function upload() { for (const file of prepared.candidate) { mutationStarted = true; assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed ${file.path}`); } }
function verify() { return prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256)); }
async function verifyHttps(commit) {
  const rows = [];
  for (const file of prepared.candidate.filter(row => row.path === 'index.html' || row.path.startsWith('public/'))) {
    const response = await fetch(`${baseUrl}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, `HTTPS failed ${file.path}`); const body = Buffer.from(await response.arrayBuffer()); assert.equal(sha(body), file.sha256, `HTTPS digest mismatch ${file.path}`); rows.push({ path: file.path, status: 200, sha256: file.sha256 });
  }
  return rows;
}
function rollback() {
  if (!prepared || !mutationStarted) return { attempted: false };
  for (const file of [...prepared.restoreFiles].reverse()) { assert.equal(fileSha(file.rollbackPath), file.sha256); assert(ftps('upload', file.path, file.rollbackPath).ok, `Restore failed ${file.path}`); }
  for (const file of prepared.removeOnRollback) { if (exists(file.path)) assert(ftps('delete', file.path).ok, `Remove candidate path failed ${file.path}`); assert.equal(exists(file.path), false); }
  for (const file of prepared.restoreFiles) doubleDownload(file.path, 'rollback-verified', file.sha256);
  return { attempted: true, pass: true, restored: prepared.restoreFiles.length, removed: prepared.removeOnRollback.length };
}
function write(name, data) { fs.mkdirSync(evidence, { recursive: true }); const target = path.join(evidence, name); fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n'); const digest = fileSha(target); fs.writeFileSync(path.join(evidence, `${name}.sha256`), `${digest}  ${name}\n`); return digest; }

async function main() {
  assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation);
  const branch = String(git(['branch', '--show-current'])).trim(), commit = String(git(['rev-parse', 'HEAD'])).trim(), origin = String(git(['rev-parse', 'origin/main'])).trim(), tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim();
  assert.equal(branch, 'main'); assert.equal(commit, origin, 'Candidate must be pushed'); assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Worktree must be clean');
  const auth = await resolveAuth(), smokeBefore = await smoke(auth); prepared = prepare(commit, tree); upload();
  const deployed = verify(), https = await verifyHttps(commit), smokeAfter = await smoke(auth);
  const result = { contract: '2026-10-15-safety-vote-thai-time-24h-r1', generatedAt: new Date().toISOString(), decision: 'PASS_SAFETY_VOTE_THAI_TIME_24H_PRODUCTION_DEPLOYMENT', candidate: { branch, commit, tree, baseline, runtimePaths: runtime.length }, remoteBefore: prepared.remoteBefore, deployment: { uploaded: runtime, doubleDownloadVerified: deployed.length, httpsVerified: https.length }, smokeBefore, smokeAfter, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restoreFiles.length, removeOnRollback: prepared.removeOnRollback.length, verified: true }, posture: { schemaChanged: false, businessRowsMutated: false, permissionsChanged: false, externalDelivery: false }, rollback: { attempted: false } };
  const resultSha256 = write('result.json', result); process.stdout.write(JSON.stringify({ evidence: path.relative(root, evidence).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployment: result.deployment, smokeAfter: result.smokeAfter, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2) + '\n');
}
main().catch(error => {
  let rollbackResult = { attempted: false };
  try { rollbackResult = rollback(); } catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
  const failure = { generatedAt: new Date().toISOString(), decision: rollbackResult.attempted && rollbackResult.pass ? 'HOLD_DEPLOY_FAILED_ROLLED_BACK' : 'HOLD_DEPLOYMENT', error: String(error.message || error), rollback: rollbackResult };
  const failureSha256 = write('failure.json', failure); process.stderr.write(JSON.stringify({ ...failure, evidence: path.relative(root, evidence).replaceAll('\\', '/'), failureSha256 }, null, 2) + '\n'); process.exitCode = 1;
});
