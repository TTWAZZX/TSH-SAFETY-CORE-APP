'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const confirmation = 'DEPLOY_SAFETY_VOTE_JURY_REVOCATION_R1';
const expectedCommit = String(process.argv[4] || '').trim();
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-jury-revocation-r1-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package', 'runtime-before');
const baselines = Object.freeze({
    'api/handlers/safety_vote_phase4.php': 'e29261d191616dcf9165d424a99f812107f9eabb',
    'index.html': '5b27162cd1073d78335148dbe16887ae7e68700d',
    'public/js/main.js': '5b27162cd1073d78335148dbe16887ae7e68700d',
    'public/js/pages/safety-vote-page-ux1.js': '5058212e9f78ed7e3235a6d5efd46cb55fee2b14',
    'public/js/pages/safety-vote-jury-workspace.js': '4886262892fd1fdb6d57d32cbc355a36c795b832',
    'public/js/pages/safety-vote-jury-model.mjs': '4886262892fd1fdb6d57d32cbc355a36c795b832',
});
const runtime = Object.freeze(Object.keys(baselines));
const publicRuntime = Object.freeze(runtime.filter(relative => relative !== 'api/handlers/safety_vote_phase4.php'));
const marker = '20261029-safety-vote-jury-revocation-r1';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
const fileSha = file => sha256(fs.readFileSync(file));
let prepared;
let mutationStarted = false;

function safe(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`); return relative; }
function under(basePath, relative) { const target = path.resolve(basePath, ...safe(relative).split('/')); assert(target.startsWith(`${path.resolve(basePath)}${path.sep}`), `Escaped guarded root: ${relative}`); return target; }
function run(program, args, binary = false, timeout = 300000) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, binary = false) { const result = run('git', args, binary); assert.equal(result.status, 0, String(result.stderr || 'git failed')); return result.stdout; }
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safe(remote)]; if (local) args.push('-LocalPath', local); const result = run('powershell.exe', args); return { ok: result.status === 0, error: String(result.stderr || result.stdout || '') }; }
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); const result = ftps('download', relative, target); assert(result.ok, `Download failed: ${relative}: ${result.error}`); return { bytes: fs.statSync(target).size, sha256: fileSha(target), source: target }; }
function doubleDownload(relative, label) { const first = download(relative, under(path.join(evidence, `${label}-a`), relative)); const second = download(relative, under(path.join(evidence, `${label}-b`), relative)); assert.equal(first.sha256, second.sha256, `Double-download mismatch: ${relative}`); return first; }
function writeJson(name, value) { fs.mkdirSync(evidence, { recursive: true }); const target = path.join(evidence, name); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return fileSha(target); }

async function login(employeeId, password, label) {
    assert(employeeId && password, `Production ${label} credentials are required`);
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, password }) });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, `Production ${label} login failed`); assert(body?.token, `Production ${label} token missing`); return body.token;
}
async function api(route, token) { const response = await fetch(`${base}/api/index.php?route=${route}&jury_revocation_release=${Date.now()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' }); const text = await response.text(); assert(!/(?:PHP\s+(?:Warning|Fatal error|Parse error)|undefined function|uncaught (?:error|exception))/i.test(text), `PHP runtime error: ${route}`); return { status: response.status, body: JSON.parse(text), cache: response.headers.get('cache-control') || '' }; }

async function smoke(adminToken, userToken) {
    const health = await api('safety-vote/admin/health', adminToken), campaigns = await api('safety-vote/admin/campaigns', adminToken), userQueue = await api('safety-vote/jury/assignments', userToken);
    assert.equal(health.status, 200); assert.equal(health.body?.data?.ready, true); assert(/no-store/i.test(health.cache)); assert.equal(campaigns.status, 200); assert.equal(userQueue.status, 200);
    const campaignRows = campaigns.body?.data?.rows || [], adminAssignments = [];
    for (const campaign of campaignRows) { const response = await api(`safety-vote/admin/campaigns/${Number(campaign.id)}/jury/assignments`, adminToken); if (response.status === 200) for (const row of response.body?.data?.rows || []) adminAssignments.push({ id: Number(row.id), campaignId: Number(campaign.id), status: String(row.Status), rowVersion: Number(row.RowVersion) }); }
    const campaignFingerprint = sha256(Buffer.from(JSON.stringify(campaignRows.map(row => ({ id: Number(row.id), status: String(row.Status), rowVersion: Number(row.RowVersion), versionRowVersion: Number(row.VersionRowVersion) })).sort((a, b) => a.id - b.id))));
    const assignmentFingerprint = sha256(Buffer.from(JSON.stringify(adminAssignments.sort((a, b) => a.id - b.id))));
    const userRows = userQueue.body?.data?.rows || [];
    return { health: 200, schemaVersion: health.body?.data?.schemaVersion, campaignTotal: Number(campaigns.body?.data?.total), campaignFingerprint, assignmentTotal: adminAssignments.length, revokedAssignmentTotal: adminAssignments.filter(row => row.status === 'Revoked').length, assignmentFingerprint, userQueueTotal: userRows.length, revokedRowsInUserQueue: userRows.filter(row => row.Status === 'Revoked').length, responseBodiesRecorded: false };
}

async function verifyHttps(commit) {
    const rows = [];
    for (const relative of publicRuntime) { const response = await fetch(`${base}/${relative}?v=${marker}&commit=${commit}`, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store' }); assert.equal(response.status, 200, `HTTPS verification failed: ${relative}`); const body = Buffer.from(await response.arrayBuffer()); assert.equal(normalizedSha(body), normalizedSha(blob(commit, relative)), `HTTPS checksum mismatch: ${relative}`); rows.push({ path: relative, status: response.status, sha256: sha256(body) }); }
    assert((await (await fetch(`${base}/index.html?v=${marker}`, { cache: 'no-store' })).text()).includes(marker), 'Public entry cache marker missing');
    return rows;
}

function prepare(commit) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true }); const candidates = [], restore = [], remoteBefore = [];
    for (const relative of runtime) { const bytes = blob(commit, relative), prior = blob(baselines[relative], relative), before = doubleDownload(relative, 'remote-before'), remote = fs.readFileSync(before.source); assert.notEqual(normalizedSha(bytes), normalizedSha(prior), `Release file is unchanged from baseline: ${relative}`); assert.equal(normalizedSha(remote), normalizedSha(prior), `Production drift outside approved baseline: ${relative}`); const target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); const rollback = under(rollbackRoot, relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback); candidates.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) }); restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 }); remoteBefore.push({ path: relative, baseline: baselines[relative], sha256: before.sha256, doubleDownloadMatched: true }); }
    const php = blob(commit, 'api/handlers/safety_vote_phase4.php').toString('utf8'), workspace = blob(commit, 'public/js/pages/safety-vote-jury-workspace.js').toString('utf8'), page = blob(commit, 'public/js/pages/safety-vote-page-ux1.js').toString('utf8');
    assert(php.includes("Status<>'Revoked'") && php.includes('ASSIGNMENT_NOT_FOUND'), 'PHP revocation read-denial contract missing'); assert(workspace.includes("assignmentState(item) !== 'revoked'"), 'Jury workspace defensive filter missing'); assert(page.includes("'submitted', 'recused', 'revoked'"), 'Participant task filter missing');
    const manifest = { contract: '2026-10-29-safety-vote-jury-revocation-r1', baselines, commit, runtime: candidates.map(({ target, ...item }) => item), restore: restore.map(({ rollback, ...item }) => item), remoteBefore, schemaChanged: false, businessDataChanged: false, externalDeliveryChanged: false };
    return { candidates, restore, manifestSha256: writeJson('rollback-manifest.json', manifest) };
}
function rollback() { if (!prepared || !mutationStarted) return { attempted: false }; for (const file of [...prepared.restore].reverse()) { assert.equal(fileSha(file.rollback), file.sha256); assert(ftps('upload', file.path, file.rollback).ok, `Rollback upload failed: ${file.path}`); const remote = doubleDownload(file.path, 'rollback-verified'); assert.equal(remote.sha256, file.sha256); } return { attempted: true, pass: true, restored: prepared.restore.length }; }

(async () => {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation); assert.match(expectedCommit, /^[a-f0-9]{40}$/); const commit = String(git(['rev-parse', 'HEAD'])).trim(); assert.equal(String(git(['branch', '--show-current'])).trim(), 'main'); assert.equal(commit, expectedCommit); assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim()); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const adminToken = await login(String(process.env.PROD_UAT_ADMIN_ID || '').trim(), String(process.env.PROD_UAT_ADMIN_PASSWORD || ''), 'Admin'), userToken = await login(String(process.env.PROD_UAT_USER_ID || '').trim(), String(process.env.PROD_UAT_USER_PASSWORD || ''), 'User'); const before = await smoke(adminToken, userToken); prepared = prepare(commit);
    for (const file of prepared.candidates) { mutationStarted = true; const uploaded = ftps('upload', file.path, file.target); assert(uploaded.ok, `Upload failed: ${file.path}: ${uploaded.error}`); }
    const deployed = prepared.candidates.map(file => { const remote = doubleDownload(file.path, 'deployed'); assert.equal(remote.sha256, file.sha256, `Deployed checksum mismatch: ${file.path}`); return { path: file.path, sha256: remote.sha256 }; }); const https = await verifyHttps(commit); const after = await smoke(adminToken, userToken);
    assert.equal(after.schemaVersion, before.schemaVersion); assert.equal(after.campaignFingerprint, before.campaignFingerprint, 'Production campaign metadata changed'); assert.equal(after.assignmentFingerprint, before.assignmentFingerprint, 'Production assignment metadata changed'); assert.equal(after.revokedRowsInUserQueue, 0, 'Revoked assignment remains in the juror queue');
    const result = { decision: 'PASS_SAFETY_VOTE_JURY_REVOCATION_R1_PRODUCTION_DEPLOYMENT', generatedAt: new Date().toISOString(), commit, baselines, deployed, https, before, after, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length }, schemaChanged: false, migrationPerformed: false, businessDataChanged: false, notificationsSent: false, externalDeliveryChanged: false, rollback: { attempted: false } }; const resultSha256 = writeJson('result.json', result); process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, deployed: deployed.length, https: https.length, after, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(error => { let rollbackResult = { attempted: false }; try { rollbackResult = rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; } const failure = { decision: !mutationStarted ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION' : rollbackResult.pass ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK' : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE', error: error.message, rollback: rollbackResult }; writeJson('failure.json', failure); console.error(JSON.stringify(failure)); process.exitCode = 1; });
