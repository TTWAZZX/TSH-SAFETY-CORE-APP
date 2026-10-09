'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const commit = 'ec5b8eb9bea0824a90d6bf413805eedb676a87ee';
const tree = '055f31a29ddaad634d4b2d87187658b1057784ef';
const confirmation = 'DEPLOY_PHASE96_ADMIN_RENDER_TARGET_TWO_PATHS';
const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase96-admin-target-deploy-${stamp}`);
const files = [
  { path: 'public/js/utils/async-ui.js', beforeSha256: 'd21e4f37bbd26a4d939e301ac7573d7af3685c4d728ed0a1ceae672769c80ad8', candidateSha256: '0b5bc2fd28b5709030dafbac3a5af060abfca15d996398f6d85c1e544db87df3' },
  { path: 'public/js/pages/admin.js', beforeSha256: '8b853cad4eb9b83b22392bb519f886df57ebb4ec610e7769e6116ccb3f172b46', candidateSha256: '6ca5a89aa090d90a55952630f50307b1593c03d262b2310ac20a8c3b7a2ef654' }
];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
let mutationStarted = false;

function under(base, relative) {
  const target = path.resolve(base, ...relative.split('/'));
  assert(target.startsWith(path.resolve(base) + path.sep));
  return target;
}
function run(program, args, binary = false) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout: 90000, windowsHide: true }); }
function ftps(action, remote, local) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', remote];
  if (local) args.push('-LocalPath', local);
  const result = run('powershell.exe', args);
  return result.status === 0;
}
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); assert(ftps('download', relative, target), `Download failed: ${relative}`); return { bytes: fs.statSync(target).size, sha256: fileSha(target) }; }
function doubleDownload(file, label, expected) {
  const a = under(path.join(evidenceRoot, `${label}-a`), file.path), b = under(path.join(evidenceRoot, `${label}-b`), file.path);
  const first = download(file.path, a), second = download(file.path, b);
  assert.strictEqual(first.sha256, second.sha256, `Double-download mismatch: ${file.path}`);
  assert.strictEqual(first.sha256, expected, `Remote drift: ${file.path}`);
  return { path: file.path, bytes: first.bytes, sha256: first.sha256, doubleDownloadMatched: true, firstPath: a };
}
async function authGate() {
  assert(token, 'Bearer token required');
  for (const route of ['safety-vote/admin/health', 'safety-vote/admin/campaigns']) {
    const response = await fetch(`${baseUrl}/api/index.php?route=${route}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    assert.strictEqual(response.status, 200); assert.strictEqual(body?.success, true);
    if (route.endsWith('/health')) assert.strictEqual(body.data?.moduleEnabled, true); else assert.strictEqual(Number(body.data?.total), 0);
  }
}
function rollback() {
  const restored = [];
  for (const file of [...files].reverse()) {
    const source = under(path.join(evidenceRoot, 'rollback-package'), file.path);
    assert.strictEqual(fileSha(source), file.beforeSha256);
    assert(ftps('upload', file.path, source), `Rollback upload failed: ${file.path}`);
    restored.push(doubleDownload(file, 'rollback', file.beforeSha256));
  }
  return { attempted: true, pass: true, restored };
}
async function main() {
  assert.strictEqual(process.argv[2], '--execute'); assert.strictEqual(process.argv[3], confirmation);
  assert.strictEqual(run('git', ['rev-parse', `${commit}^{tree}`]).stdout.trim(), tree);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await authGate();
  const remoteBefore = [], staged = [];
  for (const file of files) {
    const record = doubleDownload(file, 'remote-before', file.beforeSha256); remoteBefore.push(record);
    const rollbackFile = under(path.join(evidenceRoot, 'rollback-package'), file.path); fs.mkdirSync(path.dirname(rollbackFile), { recursive: true }); fs.copyFileSync(record.firstPath, rollbackFile);
    const blob = run('git', ['show', `${commit}:${file.path}`], true); assert.strictEqual(blob.status, 0); assert.strictEqual(sha256(blob.stdout), file.candidateSha256);
    const candidateFile = under(path.join(evidenceRoot, 'candidate'), file.path); fs.mkdirSync(path.dirname(candidateFile), { recursive: true }); fs.writeFileSync(candidateFile, blob.stdout); staged.push({ ...file, candidateFile });
  }
  mutationStarted = true;
  for (const file of staged) assert(ftps('upload', file.path, file.candidateFile), `Upload failed: ${file.path}`);
  const deployed = files.map(file => doubleDownload(file, 'deployed', file.candidateSha256));
  const result = { contract: '2026-10-09-safety-vote-phase9.6-admin-target-r1', generatedAt: new Date().toISOString(), candidate: { commit, tree, runtimePaths: files.length }, remoteBefore, deployed, rollbackPackage: { files: 2, verified: true }, constraints: { loginAttempted: false, businessDataWritten: false, campaignCreated: false, permissionChanged: false, integrationsOpened: false, pushPerformed: false }, rollback: { attempted: false }, decision: 'PASS_ADMIN_TARGET_DEPLOYED_HOLD_FOR_FLAG_AND_BROWSER_SMOKE' };
  const target = path.join(evidenceRoot, 'result.json'); fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`); const digest = fileSha(target); fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${digest}  result.json\n`);
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployed: deployed.length, rollbackPackage: result.rollbackPackage, constraints: result.constraints, resultSha256: digest }, null, 2)}\n`);
}
main().catch(error => {
  let rollbackResult = { attempted: false };
  if (mutationStarted) { try { rollbackResult = rollback(); } catch (e) { rollbackResult = { attempted: true, pass: false, error: e.message }; } }
  fs.mkdirSync(evidenceRoot, { recursive: true }); fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ error: error.message, rollback: rollbackResult, decision: 'HOLD_ADMIN_TARGET_DEPLOY_FAILED' }, null, 2)}\n`);
  process.stderr.write(`Admin target deploy failed: ${error.message}; rollback attempted=${rollbackResult.attempted}\n`); process.exitCode = 1;
});
