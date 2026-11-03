'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const confirmation = 'DEPLOY_SAFETY_VOTE_LIVE_RECONCILIATION_JURY_CATALOGUE_R1';
const expectedCommit = String(process.argv[4] || '').trim();
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const marker = '20261103-safety-vote-jury-catalogue-state-r1';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-live-reconciliation-jury-catalogue-r1-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package', 'runtime-before');
const runtime = Object.freeze([
    'api/handlers/safety_vote_phase2.php',
    'api/lib/safety_vote_live_results.php',
    'index.html',
    'public/js/main.js',
    'public/js/pages/admin-safety-vote-operations.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/admin.js',
    'public/js/pages/safety-vote-live-results.js',
    'public/js/pages/safety-vote-page-ux1.js',
    'public/js/pages/safety-vote-participation-model.mjs',
]);
const publicRuntime = runtime.filter(file => !file.startsWith('api/'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
const fileSha = file => sha256(fs.readFileSync(file));
let prepared = null;
let mutationStarted = false;

function safe(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`); return relative; }
function under(basePath, relative) { const target = path.resolve(basePath, ...safe(relative).split('/')); assert(target.startsWith(`${path.resolve(basePath)}${path.sep}`), `Escaped guarded root: ${relative}`); return target; }
function run(program, args, binary = false, timeout = 300000) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, binary = false) { const result = run('git', args, binary); assert.equal(result.status, 0, String(result.stderr || 'git failed')); return result.stdout; }
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safe(remote)]; if (local) args.push('-LocalPath', local); const result = run('powershell.exe', args, false, 120000); return { ok: result.status === 0, error: String(result.stderr || result.stdout || '') }; }
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); const result = ftps('download', relative, target); assert(result.ok, `Download failed: ${relative}: ${result.error}`); return { bytes: fs.statSync(target).size, sha256: fileSha(target), source: target }; }
function doubleDownload(relative, label) { const a = download(relative, under(path.join(evidence, `${label}-a`), relative)), b = download(relative, under(path.join(evidence, `${label}-b`), relative)); assert.equal(a.sha256, b.sha256, `Double-download mismatch: ${relative}`); return a; }
function writeJson(name, value) { fs.mkdirSync(evidence, { recursive: true }); const target = path.join(evidence, name); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return fileSha(target); }

async function login() {
    const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim(), password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '').trim();
    assert(employeeId && password, 'Production UAT Admin credentials are required');
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, password }) });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, 'Production Admin login failed');
    assert(body?.token, 'Production Admin token missing');
    return body.token;
}
async function api(route, token) {
    const response = await fetch(`${base}/api/index.php?route=${route}&live_reconciliation_jury_catalogue_release=${Date.now()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const text = await response.text();
    assert(!/(?:PHP\s+(?:Warning|Fatal error|Parse error)|undefined function|uncaught (?:error|exception))/i.test(text), `PHP runtime error: ${route}`);
    return { status: response.status, body: JSON.parse(text), cache: response.headers.get('cache-control') || '' };
}
async function smoke(token, verifyRelease) {
    const health = await api('safety-vote/admin/health', token), campaigns = await api('safety-vote/admin/campaigns', token), catalogue = await api('safety-vote/me/campaigns', token);
    assert.equal(health.status, 200); assert.equal(health.body?.data?.ready, true); assert(/no-store/i.test(health.cache));
    assert.equal(campaigns.status, 200); assert.equal(catalogue.status, 200);
    const adminRows = campaigns.body?.data?.rows || [], catalogueRows = catalogue.body?.data?.rows || [];
    const juryRows = catalogueRows.filter(row => String(row.CampaignType) === 'jury_scoring');
    if (verifyRelease) {
        assert(catalogueRows.every(row => Object.prototype.hasOwnProperty.call(row, 'WorkSource')), 'Catalogue WorkSource projection missing');
        assert(juryRows.every(row => ['admin_curated', 'employee_submission', 'imported'].includes(String(row.WorkSource))), 'Jury WorkSource projection invalid');
    }
    const liveChecks = [];
    if (verifyRelease) {
        for (const row of adminRows.filter(item => String(item.Status) === 'Open' && Number(item.LiveLeaderboardEnabled) === 1)) {
            const live = await api(`safety-vote/admin/campaigns/${Number(row.id)}/live-results`, token);
            assert.equal(live.status, 200, `Live results failed for campaign ${row.id}`);
            const data = live.body?.data || {};
            for (const question of data.questions || []) {
                if (data.status !== 'available') continue;
                const summary = question.summaryStats;
                assert(summary && Number(summary.displayedVoteCount) + Number(summary.hiddenVoteCount) === Number(summary.totalValidVotes), `Live reconciliation mismatch for campaign ${row.id}`);
            }
            liveChecks.push({ id: Number(row.id), status: String(data.status), accepted: data.totalAcceptedVotes, questionCount: (data.questions || []).length, reconciliationVerified: data.status === 'available' });
        }
    }
    return { health: 200, schemaVersion: health.body?.data?.schemaVersion, campaignTotal: adminRows.length, catalogueTotal: catalogueRows.length, juryCampaigns: juryRows.map(row => ({ id: Number(row.id), workSource: verifyRelease ? String(row.WorkSource) : null })), liveChecks, responseBodiesRecorded: false, businessMutation: false };
}

function prepare(commit, parent) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidates = [], restore = [], remoteBefore = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative), prior = blob(parent, relative), before = doubleDownload(relative, 'remote-before'), remote = fs.readFileSync(before.source);
        assert.notEqual(normalizedSha(bytes), normalizedSha(prior), `Release file is unchanged from immutable parent: ${relative}`);
        assert.equal(normalizedSha(remote), normalizedSha(prior), `Production drift outside immutable parent: ${relative}`);
        const target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        if (relative.endsWith('.php')) assert.equal(run(php, ['-l', target]).status, 0, `PHP lint failed: ${relative}`);
        const rollback = under(rollbackRoot, relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback);
        candidates.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) });
        restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 });
        remoteBefore.push({ path: relative, sha256: before.sha256, doubleDownloadMatched: true });
    }
    const phase2 = blob(commit, 'api/handlers/safety_vote_phase2.php').toString('utf8');
    const liveLib = blob(commit, 'api/lib/safety_vote_live_results.php').toString('utf8');
    const page = blob(commit, 'public/js/pages/safety-vote-page-ux1.js').toString('utf8');
    const livePage = blob(commit, 'public/js/pages/safety-vote-live-results.js').toString('utf8');
    const model = blob(commit, 'public/js/pages/safety-vote-participation-model.mjs').toString('utf8');
    const index = blob(commit, 'index.html').toString('utf8');
    for (const value of ['sv2_attach_catalogue_work_sources', 'WorkSource']) assert(phase2.includes(value), `Missing catalogue API marker ${value}`);
    for (const value of ['displayedVoteCount', 'hiddenVoteCount', 'totalValidVotes']) assert(liveLib.includes(value) && livePage.includes(value), `Missing live reconciliation marker ${value}`);
    for (const value of ['อยู่ระหว่างการตัดสิน', 'เปิดให้ชมผลงาน', 'เปิดรับผลงาน']) assert(page.includes(value), `Missing Jury catalogue label ${value}`);
    assert(model.includes('isViewOnlyJuryCampaign') && model.includes("view === 'read_only'"));
    assert(index.includes(marker));
    return { candidates, restore, remoteBefore, manifestSha256: writeJson('rollback-manifest.json', { contract: marker, commit, parent, runtime: candidates.map(({ target, ...item }) => item), restore: restore.map(({ rollback, ...item }) => item), remoteBefore, schemaChanged: false, businessDataChanged: false, notificationDeliveryChanged: false, externalDeliveryChanged: false }) };
}
async function verifyHttps(commit) {
    const verified = [];
    for (const file of prepared.candidates.filter(item => publicRuntime.includes(item.path))) {
        const response = await fetch(`${base}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(response.status, 200, `HTTPS read failed: ${file.path}`);
        assert.equal(sha256(bytes), file.sha256, `HTTPS checksum mismatch: ${file.path}`);
        verified.push({ path: file.path, sha256: file.sha256 });
    }
    return verified;
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
    const commit = String(git(['rev-parse', 'HEAD'])).trim(), parent = String(git(['rev-parse', 'HEAD^'])).trim();
    assert.equal(String(git(['branch', '--show-current'])).trim(), 'main'); assert.equal(commit, expectedCommit); assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim()); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const token = await login(), before = await smoke(token, false); prepared = prepare(commit, parent);
    for (const file of prepared.candidates) { mutationStarted = true; const upload = ftps('upload', file.path, file.target); assert(upload.ok, `Upload failed: ${file.path}: ${upload.error}`); }
    const deployed = prepared.candidates.map(file => { const remote = doubleDownload(file.path, 'deployed'); assert.equal(remote.sha256, file.sha256, `Deployed checksum mismatch: ${file.path}`); return { path: file.path, sha256: remote.sha256 }; });
    const https = await verifyHttps(commit), after = await smoke(token, true);
    assert.equal(after.schemaVersion, before.schemaVersion); assert.equal(after.campaignTotal, before.campaignTotal); assert.equal(after.catalogueTotal, before.catalogueTotal);
    const result = { decision: 'PASS_SAFETY_VOTE_LIVE_RECONCILIATION_JURY_CATALOGUE_R1_PRODUCTION_DEPLOYMENT', generatedAt: new Date().toISOString(), commit, parent, deployed, https, before, after, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length }, schemaChanged: false, migrationPerformed: false, businessDataChanged: false, notificationsSent: false, externalDeliveryChanged: false, rollback: { attempted: false } };
    const resultSha256 = writeJson('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, deployed: deployed.length, httpsVerified: https.length, liveChecks: after.liveChecks, juryCampaigns: after.juryCampaigns, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(error => {
    let rollbackResult = { attempted: false }; try { rollbackResult = rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; }
    const failure = { decision: !mutationStarted ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION' : rollbackResult.pass ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK' : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE', error: error.message, rollback: rollbackResult };
    writeJson('failure.json', failure); console.error(JSON.stringify(failure)); process.exitCode = 1;
});
