'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const confirmation = 'DEPLOY_SAFETY_VOTE_JURY_OFFICIAL_RESULTS_R1';
const expectedCommit = String(process.argv[4] || '').trim();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-jury-official-results-r1-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package', 'runtime-before');
const runtime = Object.freeze(['api/handlers/safety_vote_phase5.php', 'api/lib/safety_vote_phase5.php']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
const fileSha = file => sha256(fs.readFileSync(file));
let prepared = null;
let mutationStarted = false;

function safe(relative) {
    assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative));
    return relative;
}
function under(basePath, relative) {
    const target = path.resolve(basePath, ...safe(relative).split('/'));
    assert(target.startsWith(`${path.resolve(basePath)}${path.sep}`));
    return target;
}
function run(program, args, binary = false, timeout = 300000) {
    return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}
function git(args, binary = false) {
    const result = run('git', args, binary);
    assert.equal(result.status, 0, String(result.stderr || 'git failed'));
    return result.stdout;
}
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', safe(remote)];
    if (local) args.push('-LocalPath', local);
    const result = run('powershell.exe', args, false, 120000);
    return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') };
}
function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `Download failed: ${relative}: ${result.error || result.output}`);
    return { source: target, bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)) };
}
function doubleDownload(relative, label) {
    const first = download(relative, under(path.join(evidence, `${label}-a`), relative));
    const second = download(relative, under(path.join(evidence, `${label}-b`), relative));
    assert.equal(first.sha256, second.sha256, `Remote drift between downloads: ${relative}`);
    return first;
}
function writeJson(name, value) {
    fs.mkdirSync(evidence, { recursive: true });
    const target = path.join(evidence, name);
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    return fileSha(target);
}
async function login() {
    const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
    const password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '').trim();
    assert(employeeId && password, 'Production UAT Admin credentials are required');
    const response = await fetch(`${base}/api/login`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, 'Production Admin login failed');
    assert(body?.token, 'Production Admin token missing');
    return body.token;
}
async function api(route, token) {
    const response = await fetch(`${base}/api/index.php?route=${route}&jury_official_results_release=${Date.now()}`, {
        cache: 'no-store', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
    });
    const text = await response.text();
    assert(!/(?:PHP\s+(?:Warning|Fatal error|Parse error)|undefined function|uncaught (?:error|exception))/i.test(text), `PHP runtime error: ${route}`);
    return { status: response.status, body: JSON.parse(text), cache: response.headers.get('cache-control') || '' };
}
async function locatePublishedJury(token) {
    const campaigns = await api('safety-vote/admin/campaigns', token);
    assert.equal(campaigns.status, 200);
    const rows = campaigns.body?.data?.rows || [];
    const campaign = rows.find(row => String(row.CampaignCode) === 'SHE-006-2026')
        || rows.find(row => String(row.CampaignType) === 'jury_scoring' && String(row.Status) === 'Published');
    assert(campaign, 'Published Jury campaign was not found');
    assert.equal(String(campaign.CampaignType), 'jury_scoring');
    assert.equal(String(campaign.Status), 'Published');
    return { id: Number(campaign.id), code: String(campaign.CampaignCode), campaignTotal: rows.length };
}
async function smoke(token, campaign, verifyRelease) {
    const health = await api('safety-vote/admin/health', token);
    assert.equal(health.status, 200); assert.equal(health.body?.data?.ready, true); assert(/no-store/i.test(health.cache));
    const result = await api(`safety-vote/campaigns/${campaign.id}/official-results`, token);
    if (!verifyRelease) {
        assert.equal(result.status, 404, 'Pre-deploy Jury result must reproduce the current integrity rejection');
        assert.equal(result.body?.code, 'RESULT_SNAPSHOT_NOT_AVAILABLE');
        return { health: 200, schemaVersion: health.body?.data?.schemaVersion, campaign, officialResults: 404, code: result.body?.code };
    }
    assert.equal(result.status, 200, 'Published Jury official results are still unavailable');
    const data = result.body?.data || {};
    assert.equal(data.integrity?.eligible, true);
    assert.equal(data.integrity?.evidenceModel, 'jury_scores');
    assert.equal(data.integrity?.ballotZeroGuardApplied, false);
    assert.equal(Number(data.totalResultRows), 38, 'Published Jury result row count changed');
    assert.equal(data.noResult, false);
    return { health: 200, schemaVersion: health.body?.data?.schemaVersion, campaign, officialResults: 200, resultRows: Number(data.totalResultRows), evidenceModel: data.integrity?.evidenceModel, snapshotHashRecorded: Boolean(data.snapshot?.resultHash), responseBodyRecorded: false };
}
function prepare(commit, parent) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidates = [], restore = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative), prior = blob(parent, relative);
        assert.notEqual(normalizedSha(bytes), normalizedSha(prior), `Runtime path did not change: ${relative}`);
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(prior), `Production drift outside immutable parent: ${relative}`);
        const target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        const lint = run(php, ['-l', target]); assert.equal(lint.status, 0, `PHP lint failed: ${relative}: ${lint.stderr || lint.stdout}`);
        const rollback = under(rollbackRoot, relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback);
        candidates.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) });
        restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 });
    }
    const handler = fs.readFileSync(under(candidateRoot, runtime[0]), 'utf8');
    const library = fs.readFileSync(under(candidateRoot, runtime[1]), 'utf8');
    assert(handler.includes('ballotZeroGuard') && handler.includes('sv5_result_evidence_model'));
    assert(library.includes('2026-11-03-workflow-aware-result-integrity-r1') && library.includes("'jury_scoring'?'jury_scores':'ballots'"));
    return { candidates, restore, manifestSha256: writeJson('rollback-manifest.json', {
        contract: '2026-11-03-safety-vote-jury-official-results-production-r1', commit, parent,
        runtime: candidates.map(({ target, ...row }) => row), restore: restore.map(({ rollback, ...row }) => row),
        schemaChanged: false, businessDataChanged: false, resultSnapshotChanged: false, notificationDeliveryChanged: false,
    }) };
}
function rollback() {
    if (!prepared || !mutationStarted) return { attempted: false };
    for (const file of [...prepared.restore].reverse()) {
        assert.equal(fileSha(file.rollback), file.sha256);
        assert(ftps('upload', file.path, file.rollback).ok, `Rollback upload failed: ${file.path}`);
    }
    for (const file of prepared.restore) {
        const remote = doubleDownload(file.path, 'rollback-verified'); assert.equal(remote.sha256, file.sha256);
    }
    return { attempted: true, pass: true, restored: prepared.restore.length };
}

(async () => {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation); assert.match(expectedCommit, /^[a-f0-9]{40}$/);
    const commit = String(git(['rev-parse', 'HEAD'])).trim(), parent = String(git(['rev-parse', 'HEAD^'])).trim();
    assert.equal(String(git(['branch', '--show-current'])).trim(), 'main'); assert.equal(commit, expectedCommit);
    assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim()); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const token = await login(), campaign = await locatePublishedJury(token), before = await smoke(token, campaign, false);
    prepared = prepare(commit, parent);
    for (const file of prepared.candidates) { mutationStarted = true; const upload = ftps('upload', file.path, file.target); assert(upload.ok, `Upload failed: ${file.path}: ${upload.error || upload.output}`); }
    const deployed = prepared.candidates.map(file => { const remote = doubleDownload(file.path, 'deployed'); assert.equal(remote.sha256, file.sha256); return { path: file.path, sha256: remote.sha256 }; });
    const after = await smoke(token, campaign, true);
    assert.equal(after.schemaVersion, before.schemaVersion); assert.equal(after.campaign.campaignTotal, before.campaign.campaignTotal);
    const result = {
        decision: 'PASS_SAFETY_VOTE_JURY_OFFICIAL_RESULTS_R1_PRODUCTION_DEPLOYMENT', generatedAt: new Date().toISOString(),
        commit, parent, deployed, before, after, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length },
        schemaChanged: false, migrationPerformed: false, businessDataChanged: false, resultSnapshotChanged: false,
        notificationsSent: false, externalDeliveryChanged: false, rollback: { attempted: false },
    };
    const resultSha256 = writeJson('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, deployed: deployed.length, before: before.officialResults, after: after.officialResults, resultRows: after.resultRows, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(error => {
    let rollbackResult = { attempted: false };
    try { rollbackResult = rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; }
    writeJson('failure.json', { decision: !mutationStarted ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION' : rollbackResult.pass ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK' : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE', error: error.message, rollback: rollbackResult });
    console.error(error); process.exitCode = 1;
});
