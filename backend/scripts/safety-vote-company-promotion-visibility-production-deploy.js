'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseline = 'ba8b4b02764ff6274c8756af076c9c4a80e98943';
const confirmation = 'DEPLOY_SAFETY_VOTE_COMPANY_PROMOTION_VISIBILITY_R1';
const expectedCommit = String(process.argv[4] || '').trim();
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-company-promotion-visibility-r1-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package', 'runtime-before');
const runtime = Object.freeze([
    'api/handlers/safety_vote.php',
    'api/handlers/safety_vote_engagement.php',
    'api/handlers/safety_vote_phase2.php',
    'api/handlers/safety_vote_phase3.php',
]);

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
    assert.equal(response.status, 200, `Production ${label} login failed`);
    assert(body?.token, `Production ${label} token missing`);
    return body.token;
}

async function api(route, token) {
    const response = await fetch(`${base}/api/index.php?route=${route}&company_promotion_visibility_release=${Date.now()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const text = await response.text();
    assert(!/(?:PHP\s+(?:Warning|Fatal error|Parse error)|undefined function|uncaught (?:error|exception))/i.test(text), `PHP runtime error: ${route}`);
    return { status: response.status, body: JSON.parse(text), cache: response.headers.get('cache-control') || '' };
}

async function smoke(adminToken, userToken) {
    const health = await api('safety-vote/admin/health', adminToken);
    const campaigns = await api('safety-vote/admin/campaigns', adminToken);
    const catalogue = await api('safety-vote/me/campaigns', userToken);
    const promotions = await api('safety-vote/me/promotions', userToken);
    assert.equal(health.status, 200); assert.equal(health.body?.data?.ready, true); assert(/no-store/i.test(health.cache));
    assert.equal(campaigns.status, 200); assert.equal(campaigns.body?.success, true);
    assert.equal(catalogue.status, 200); assert.equal(catalogue.body?.success, true);
    assert.equal(promotions.status, 200); assert.equal(promotions.body?.success, true);
    const rows = campaigns.body?.data?.rows || [], visiblePromotions = promotions.body?.data?.rows || [];
    const campaignFingerprint = sha256(Buffer.from(JSON.stringify(rows.map(row => ({ id: Number(row.id), status: String(row.Status), rowVersion: Number(row.RowVersion), versionRowVersion: Number(row.VersionRowVersion) })).sort((a, b) => a.id - b.id))));
    let promotionProbe = { available: false };
    const promotion = visiblePromotions.find(item => Number(item.mobileFileId || item.desktopFileId) > 0) || visiblePromotions[0];
    if (promotion) {
        const detail = await api(`safety-vote/campaigns/${Number(promotion.campaignId)}`, userToken);
        assert.equal(detail.status, 200, 'Published promotion detail must be readable by the authenticated module user');
        assert.equal(detail.body?.data?.canSubmit === true || detail.body?.data?.canSubmit === false, true);
        const fileId = Number(promotion.mobileFileId || promotion.desktopFileId || 0);
        let imageStatus = null;
        if (fileId) {
            const image = await fetch(`${base}/api/index.php?route=safety-vote/files/${fileId}&company_promotion_visibility_release=${Date.now()}`, { headers: { Authorization: `Bearer ${userToken}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' });
            imageStatus = image.status; assert.equal(image.status, 200, 'Published promotion image must be readable by the authenticated module user');
        }
        promotionProbe = { available: true, campaignId: Number(promotion.campaignId), detailStatus: detail.status, accessMode: String(detail.body?.data?.accessMode || ''), eligible: Boolean(detail.body?.data?.eligibility?.eligible), canSubmit: Boolean(detail.body?.data?.canSubmit), imageStatus };
    }
    return { health: 200, schemaVersion: health.body?.data?.schemaVersion, campaignTotal: Number(campaigns.body?.data?.total), campaignFingerprint, catalogueTotal: Number(catalogue.body?.data?.total), activePromotionTotal: visiblePromotions.length, promotionProbe, responseBodiesRecorded: false };
}

function prepare(commit) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidates = [], restore = [], remoteBefore = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative), prior = blob(baseline, relative), before = doubleDownload(relative, 'remote-before'), remote = fs.readFileSync(before.source);
        assert.notEqual(normalizedSha(bytes), normalizedSha(prior), `Release file is unchanged from baseline: ${relative}`);
        assert.equal(normalizedSha(remote), normalizedSha(prior), `Production drift outside approved baseline: ${relative}`);
        const target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        const rollback = under(rollbackRoot, relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback);
        candidates.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) });
        restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 });
        remoteBefore.push({ path: relative, sha256: before.sha256, doubleDownloadMatched: true });
    }
    const engagement = blob(commit, 'api/handlers/safety_vote_engagement.php').toString('utf8');
    const core = blob(commit, 'api/handlers/safety_vote.php').toString('utf8');
    const phase2 = blob(commit, 'api/handlers/safety_vote_phase2.php').toString('utf8');
    const phase3 = blob(commit, 'api/handlers/safety_vote_phase3.php').toString('utf8');
    assert(engagement.includes("c.IsHidden=0 AND c.IsTest=0"), 'Promotion visibility safety filter missing');
    assert(!engagement.includes('ev.EmployeeID=?'), 'Promotion endpoint remains eligibility-filtered');
    assert(core.includes("['promotion_desktop','promotion_mobile','promotion_library']"), 'Promotion media visibility contract missing');
    assert(phase2.includes("||(bool)$promotion"), 'Phase 2 read-only promotion detail contract missing');
    assert(phase3.includes("||(bool)$promotion"), 'Phase 3 read-only promotion detail contract missing');
    const manifest = { contract: '2026-10-29-safety-vote-company-promotion-visibility-r1', baseline, commit, runtime: candidates.map(({ target, ...item }) => item), restore: restore.map(({ rollback, ...item }) => item), remoteBefore, schemaChanged: false, businessDataChanged: false, externalDeliveryChanged: false };
    return { candidates, restore, manifestSha256: writeJson('rollback-manifest.json', manifest) };
}

function rollback() {
    if (!prepared || !mutationStarted) return { attempted: false };
    for (const file of [...prepared.restore].reverse()) {
        assert.equal(fileSha(file.rollback), file.sha256);
        assert(ftps('upload', file.path, file.rollback).ok, `Rollback upload failed: ${file.path}`);
        const remote = doubleDownload(file.path, 'rollback-verified'); assert.equal(remote.sha256, file.sha256);
    }
    return { attempted: true, pass: true, restored: prepared.restore.length };
}

(async () => {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation); assert.match(expectedCommit, /^[a-f0-9]{40}$/);
    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    assert.equal(String(git(['branch', '--show-current'])).trim(), 'main'); assert.equal(commit, expectedCommit); assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim()); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const adminToken = await login(String(process.env.PROD_UAT_ADMIN_ID || '').trim(), String(process.env.PROD_UAT_ADMIN_PASSWORD || ''), 'Admin');
    const userToken = await login(String(process.env.PROD_UAT_USER_ID || '').trim(), String(process.env.PROD_UAT_USER_PASSWORD || ''), 'User');
    const before = await smoke(adminToken, userToken); prepared = prepare(commit);
    for (const file of prepared.candidates) { mutationStarted = true; const uploaded = ftps('upload', file.path, file.target); assert(uploaded.ok, `Upload failed: ${file.path}: ${uploaded.error}`); }
    const deployed = prepared.candidates.map(file => { const remote = doubleDownload(file.path, 'deployed'); assert.equal(remote.sha256, file.sha256, `Deployed checksum mismatch: ${file.path}`); return { path: file.path, sha256: remote.sha256 }; });
    const after = await smoke(adminToken, userToken); assert.equal(after.schemaVersion, before.schemaVersion); assert.equal(after.campaignTotal, before.campaignTotal); assert.equal(after.campaignFingerprint, before.campaignFingerprint, 'Production campaign metadata changed during runtime deployment');
    assert(after.promotionProbe.available, 'Production has no active promotion available for read-only verification'); assert.equal(after.promotionProbe.detailStatus, 200); if (after.promotionProbe.imageStatus !== null) assert.equal(after.promotionProbe.imageStatus, 200);
    const result = { decision: 'PASS_SAFETY_VOTE_COMPANY_PROMOTION_VISIBILITY_R1_PRODUCTION_DEPLOYMENT', generatedAt: new Date().toISOString(), commit, baseline, deployed, before, after, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length }, schemaChanged: false, migrationPerformed: false, businessDataChanged: false, notificationsSent: false, externalDeliveryChanged: false, rollback: { attempted: false } };
    const resultSha256 = writeJson('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, deployed: deployed.length, after, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(error => {
    let rollbackResult = { attempted: false };
    try { rollbackResult = rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; }
    const failure = { decision: !mutationStarted ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION' : rollbackResult.pass ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK' : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE', error: error.message, rollback: rollbackResult };
    writeJson('failure.json', failure); console.error(JSON.stringify(failure)); process.exitCode = 1;
});
