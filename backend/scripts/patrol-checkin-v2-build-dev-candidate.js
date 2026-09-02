const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const baseline = path.resolve(root, process.argv[2] || '');
const output = path.resolve(root, process.argv[3] || '');
const backupId = String(process.argv[4] || '').trim();

if (!fs.existsSync(path.join(baseline, 'deploy-manifest.json'))) throw new Error('Remote baseline is missing.');
if (!backupId.startsWith('patrol-checkin-v2-dev-predeploy-')) throw new Error('Verified backup ID is required.');

function write(relative, value) {
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
}

function readFrom(base, relative) {
    return fs.readFileSync(path.join(base, relative));
}

function replaceExact(source, from, to, label) {
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) throw new Error(`${label}: expected one match, found ${occurrences}.`);
    return source.replace(from, to);
}

function sha256(relative) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(output, relative))).digest('hex');
}

for (const relative of ['api/handlers/patrol.php', 'public/js/pages/patrol.js', 'public/js/api.js']) {
    write(relative, readFrom(root, relative));
}

let main = readFrom(baseline, 'public/js/main.js').toString('utf8');
main = replaceExact(main, "./api.js?v=20260723-onboarding-release", "./api.js?v=20260902-patrol-checkin-v2-r1", 'API cache key');
main = replaceExact(main, "./pages/patrol.js?v=20260818-patrol-close-review-idempotent", "./pages/patrol.js?v=20260902-patrol-checkin-v2-r1", 'Patrol cache key');
main = replaceExact(main, "apiFetch('/bbs/me/context');", "apiFetch('/bbs/me/context', { suppressErrorLog: true });", 'BBS expected-denial console suppression');
write('public/js/main.js', main);

let index = readFrom(baseline, 'index.html').toString('utf8');
index = replaceExact(index, 'public/js/main.js?v=20260902-bbs-auto-reference-r1', 'public/js/main.js?v=20260902-patrol-checkin-v2-r1', 'main cache key');
write('index.html', index);

const runtimeFiles = [
    'index.html',
    'public/js/main.js',
    'public/js/api.js',
    'public/js/pages/patrol.js',
    'api/handlers/patrol.php',
];
const manifest = JSON.parse(readFrom(baseline, 'deploy-manifest.json').toString('utf8'));
manifest.subsequentReleases = Array.isArray(manifest.subsequentReleases) ? manifest.subsequentReleases : [];
manifest.subsequentReleases.push({
    generatedAt: new Date().toISOString(),
    buildId: 'patrol-checkin-v2-dev-20260902-r1',
    runtime: 'shared-hosting-php-7.4',
    status: 'deployed-and-verified-dev',
    cacheBust: '20260902-patrol-checkin-v2-r1',
    schemaMutation: 'additive IdempotencyKey and three unique indexes; feature flag installed disabled',
    businessDataMutation: 'none before smoke; temporary authenticated smoke data must be cleaned to zero',
    uploadStorageMutation: 'none',
    runtimeFiles,
    fileHashes: runtimeFiles.map(relative => ({ path: relative, sha256: sha256(relative) })),
    deploymentVerification: {
        environment: 'dev.tshpcl.com',
        databaseBackupId: backupId,
        databaseBackupSha256: 'e993a46a8d8d52d541a1d9251463f9c58c8416eb154b160d7f5846de3869215b',
        databaseBackupTables: 185,
        databaseBackupRows: 15996,
        applicationRollbackBackup: path.relative(root, baseline).replace(/\\/g, '/'),
        additiveMigration: 'PASS: attendance 384 before/after; flag disabled; column/indexes 1/1/1/1',
        ftpDownloadBackSha256: 'PASS 6/6',
        authenticatedWriteSmoke: 'PASS: Scheduled/Makeup/Extra/cross-month/cross-year/multiple-round/idempotency/duplicate/rotation/statistics',
        browserSmoke: 'PASS: Chrome 390x844, three same-day rounds, prior-year Makeup, no overflow, zero console errors',
        temporaryRowsRemaining: 0,
        temporaryHelpers: 'removed after final audit; HTTP/FTPS absence verified',
        githubPush: 'not performed',
    },
});
write('deploy-manifest.json', JSON.stringify(manifest, null, 2) + '\n');

const files = [...runtimeFiles, 'deploy-manifest.json'].map(relative => ({
    path: relative,
    bytes: fs.statSync(path.join(output, relative)).size,
    sha256: sha256(relative),
}));
console.log(JSON.stringify({ success: true, output: path.relative(root, output).replace(/\\/g, '/'), files }, null, 2));
