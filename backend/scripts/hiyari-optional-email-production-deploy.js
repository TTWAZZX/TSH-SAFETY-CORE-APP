'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const confirmation = 'DEPLOY_HIYARI_OPTIONAL_EMAIL_R1';
const expectedCommit = String(process.argv[4] || '').trim();
const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const runtimePaths = Object.freeze([
    'api/handlers/workflow_phase6.php',
    'public/js/pages/hiyari.js',
    'public/js/main.js',
    'index.html',
]);
const publicPaths = new Set(['public/js/pages/hiyari.js', 'public/js/main.js', 'index.html']);
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `hiyari-optional-email-r1-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package', 'runtime-before');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
let prepared = null;
let mutationStarted = false;

function safe(relative) {
    assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`);
    return relative;
}

function under(base, relative) {
    const target = path.resolve(base, ...safe(relative).split('/'));
    assert(target.startsWith(`${path.resolve(base)}${path.sep}`), `Escaped guarded root: ${relative}`);
    return target;
}

function run(program, args, { binary = false, timeout = 300000 } = {}) {
    return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}

function git(args, options = {}) {
    const result = run('git', args, options);
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
    return result.stdout;
}

function blob(commit, relative) {
    return git(['show', `${commit}:${safe(relative)}`], { binary: true });
}

function ftps(action, remotePath, localPath = '') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safe(remotePath)];
    if (localPath) args.push('-LocalPath', localPath);
    const result = run('powershell.exe', args, { timeout: 180000 });
    return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') };
}

function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `FTPS download failed: ${relative}: ${result.error || result.output}`);
    return { source: target, bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)) };
}

function doubleDownload(relative, label, expectedSha = '') {
    const first = download(relative, under(path.join(evidenceRoot, `${label}-a`), relative));
    const second = download(relative, under(path.join(evidenceRoot, `${label}-b`), relative));
    assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`);
    if (expectedSha) assert.equal(first.sha256, expectedSha, `Deployed checksum mismatch: ${relative}`);
    return first;
}

function writeJson(name, value) {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const target = path.join(evidenceRoot, name);
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    return fileSha(target);
}

function prepare(commit, parent) {
    fs.mkdirSync(candidateRoot, { recursive: true });
    fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidates = [];
    const restore = [];
    const remoteBefore = [];
    for (const relative of runtimePaths) {
        const candidateBytes = blob(commit, relative);
        const parentBytes = blob(parent, relative);
        assert.notEqual(sha256(candidateBytes), sha256(parentBytes), `Runtime path did not change: ${relative}`);
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(parentBytes), `Production drift from immutable parent: ${relative}`);

        const candidatePath = under(candidateRoot, relative);
        fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
        fs.writeFileSync(candidatePath, candidateBytes);
        if (relative.endsWith('.php')) {
            const lint = run(php, ['-l', candidatePath]);
            assert.equal(lint.status, 0, `PHP lint failed: ${relative}`);
        }
        const rollbackPath = under(rollbackRoot, relative);
        fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
        fs.copyFileSync(before.source, rollbackPath);
        candidates.push({ path: relative, candidatePath, bytes: candidateBytes.length, sha256: sha256(candidateBytes) });
        restore.push({ path: relative, rollbackPath, bytes: before.bytes, sha256: before.sha256 });
        remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, normalizedSha256: before.normalizedSha256 });
    }

    const page = fs.readFileSync(under(candidateRoot, 'public/js/pages/hiyari.js'), 'utf8');
    const main = fs.readFileSync(under(candidateRoot, 'public/js/main.js'), 'utf8');
    const index = fs.readFileSync(under(candidateRoot, 'index.html'), 'utf8');
    const handler = fs.readFileSync(under(candidateRoot, 'api/handlers/workflow_phase6.php'), 'utf8');
    assert(page.includes('Company Email <span class="normal-case font-medium text-slate-400">(ไม่บังคับ)</span>'), 'Optional email UI marker missing');
    assert(page.includes('if (companyEmail && !_isCompanyEmail(companyEmail))'), 'Supplied email validation marker missing');
    assert(!page.includes('id="hiyari-company-email" required'), 'CompanyEmail is still required in the UI');
    assert(!handler.includes('Employee Master has no CompanyEmail for this reporter.'), 'PHP still blocks missing CompanyEmail');
    assert(handler.includes("if($recipientInfo['recipients']!=='')wf_email_outbox"), 'PHP no-recipient email skip missing');
    assert(main.includes('./pages/hiyari.js?v=20261109-hiyari-optional-email-r2'), 'Hiyari cache marker missing');
    assert(index.includes('public/js/main.js?v=20261109-hiyari-optional-email-r2'), 'Main cache marker missing');

    const manifest = {
        contract: '2026-11-09-hiyari-optional-email-r1',
        commit,
        parent,
        runtimePaths,
        restore: restore.map(({ rollbackPath: ignored, ...row }) => row),
        schemaChanged: false,
        businessDataChanged: false,
        externalDeliveryChanged: false,
    };
    return { candidates, restore, remoteBefore, manifestSha256: writeJson('rollback-manifest.json', manifest) };
}

async function login() {
    const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
    const password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
    assert(employeeId && password, 'Production UAT Admin credentials are required');
    const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, 'Production Admin login failed');
    assert(body?.token, 'Production Admin token missing');
    return body.token;
}

async function readSnapshot(token) {
    const get = async route => {
        const response = await fetch(`${baseUrl}/api/${route}${route.includes('?') ? '&' : '?'}hiyari_optional_email_release=${Date.now()}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
            cache: 'no-store',
        });
        const body = await response.json().catch(() => null);
        assert.equal(response.status, 200, `Authenticated ${route} failed`);
        assert.equal(body?.success, true, `Authenticated ${route} response failed`);
        return body;
    };
    const assignments = await get('hiyari/assignments');
    const reports = await get('hiyari');
    const assignmentRows = Array.isArray(assignments.data) ? assignments.data : [];
    const reportRows = Array.isArray(reports.data) ? reports.data : [];
    const assignmentFingerprint = sha256(Buffer.from(JSON.stringify(assignmentRows.map(row => [row.id, row.EmployeeID]).sort()), 'utf8'));
    const reportFingerprint = sha256(Buffer.from(JSON.stringify(reportRows.map(row => [row.id, row.ReporterID, row.ReviewStatus, row.Status]).sort()), 'utf8'));
    return { assignments: assignmentRows.length, reports: reportRows.length, assignmentFingerprint, reportFingerprint, responseBodiesRecorded: false };
}

async function verifyHttps(commit) {
    const verified = [];
    for (const file of prepared.candidates.filter(row => publicPaths.has(row.path))) {
        const response = await fetch(`${baseUrl}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, {
            headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store',
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(response.status, 200, `HTTPS ${file.path} returned ${response.status}`);
        assert.equal(sha256(bytes), file.sha256, `HTTPS checksum mismatch: ${file.path}`);
        verified.push({ path: file.path, bytes: bytes.length, sha256: file.sha256 });
    }
    const anonymous = await fetch(`${baseUrl}/api/hiyari/assignments?release=${Date.now()}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    assert.equal(anonymous.status, 401, 'Anonymous Hiyari assignments must remain denied');
    return { files: verified, anonymousAssignmentsDenied: 401 };
}

function rollback() {
    if (!prepared || !mutationStarted) return { attempted: false };
    for (const file of [...prepared.restore].reverse()) {
        assert.equal(fileSha(file.rollbackPath), file.sha256, `Rollback checksum changed: ${file.path}`);
        assert(ftps('upload', file.path, file.rollbackPath).ok, `Rollback upload failed: ${file.path}`);
    }
    for (const file of prepared.restore) doubleDownload(file.path, 'rollback-verified', file.sha256);
    return { attempted: true, pass: true, restored: prepared.restore.length };
}

(async () => {
    assert.equal(process.argv[2], '--execute', 'Use --execute with the exact confirmation token');
    assert.equal(process.argv[3], confirmation, `Confirmation token must be ${confirmation}`);
    assert.match(expectedCommit, /^[a-f0-9]{40}$/, 'Expected immutable commit is required');
    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    const parent = String(git(['rev-parse', 'HEAD^'])).trim();
    const tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim();
    assert.equal(String(git(['branch', '--show-current'])).trim(), 'main', 'Production deployment requires main');
    assert.equal(commit, expectedCommit, 'HEAD does not match expected immutable commit');
    assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim(), 'Production deployment requires pushed origin/main');
    assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Production deployment requires a clean worktree');

    const token = await login();
    const before = await readSnapshot(token);
    prepared = prepare(commit, parent);
    for (const file of prepared.candidates) {
        mutationStarted = true;
        assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed: ${file.path}`);
    }
    const deployed = prepared.candidates.map(file => {
        const remote = doubleDownload(file.path, 'deployed', file.sha256);
        return { path: file.path, bytes: remote.bytes, sha256: remote.sha256 };
    });
    const https = await verifyHttps(commit);
    const after = await readSnapshot(token);
    assert.deepEqual(after, before, 'Hiyari assignment/report snapshot changed during deployment');

    const result = {
        decision: 'PASS_HIYARI_OPTIONAL_EMAIL_R1_PRODUCTION_DEPLOYMENT',
        generatedAt: new Date().toISOString(),
        candidate: { commit, parent, tree, runtimePaths: runtimePaths.length },
        remoteBefore: prepared.remoteBefore,
        deployed,
        https,
        smoke: { before, after, preserved: true },
        rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length },
        constraints: { schemaChanged: false, businessDataChanged: false, reportCreated: false, assignmentChanged: false, notificationSent: false, externalDeliveryChanged: false },
        rollback: { attempted: false },
    };
    const resultSha256 = writeJson('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replace(/\\/g, '/'), decision: result.decision, candidate: result.candidate, deployment: { uploaded: deployed.length, downloadBackVerified: deployed.length, httpsVerified: https.files.length }, smoke: result.smoke, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(error => {
    let rollbackResult = { attempted: false };
    try { rollbackResult = rollback(); }
    catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; }
    const decision = !mutationStarted
        ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION'
        : rollbackResult.pass
            ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK'
            : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE';
    writeJson('failure.json', { generatedAt: new Date().toISOString(), decision, error: error.message, rollback: rollbackResult });
    console.error(`Hiyari optional-email deploy failed: ${error.message}; rollback attempted=${rollbackResult.attempted}`);
    process.exitCode = 1;
});
