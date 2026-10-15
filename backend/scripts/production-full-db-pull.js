'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const templatePath = path.join(__dirname, 'production-full-db-export-helper.php.template');
const ftps = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(8).toString('hex');
const evidence = path.join(root, 'backups', 'production', `full-db-local-sync-${stamp}`);
const staging = path.join(evidence, 'staging');
const helperName = `full-db-export-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const backupId = `full-db-local-sync-${nonce}`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let remoteUploaded = false;
let htaccessModified = false;
let htaccessBefore = '';
let htaccessBeforeHash = '';

function runFtps(action, remotePath = '', localPath = '') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftps, '-Action', action];
    if (remotePath) args.push('-RemotePath', remotePath);
    if (localPath) args.push('-LocalPath', localPath);
    const result = spawnSync('powershell.exe', args, { cwd: root, encoding: 'utf8', timeout: 180000, windowsHide: true });
    return { ok: result.status === 0, status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

async function helperRequest(token, action) {
    const response = await fetch(helperUrl, { method: 'POST', headers: { 'User-Agent': 'TSH-Safety-Core-Full-Database-Local-Sync/1.0', 'X-TSH-Export-Token': token, 'X-TSH-Export-Action': action, 'Cache-Control': 'no-cache' }, body: '{}' });
    let data;
    try { data = await response.json(); } catch (_) { data = { success: false, code: 'NON_JSON_RESPONSE' }; }
    return { status: response.status, data };
}

async function cleanup() {
    let response = null;
    if (remoteUploaded) {
        try { response = await helperRequest(cleanupToken, 'cleanup'); } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    let htaccessRestored = !htaccessModified;
    if (htaccessModified && htaccessBefore) {
        const upload = runFtps('upload', '.htaccess', htaccessBefore);
        const verify = path.join(evidence, 'htaccess-restored-download-back');
        const download = upload.ok ? runFtps('download', '.htaccess', verify) : { ok: false };
        htaccessRestored = Boolean(download.ok && hash(fs.readFileSync(verify)) === htaccessBeforeHash);
        if (htaccessRestored) htaccessModified = false;
    }
    const inventory = runFtps('list', 'api');
    if (inventory.ok && inventory.stdout.includes(helperName)) runFtps('delete', remoteHelper);
    if (inventory.ok && inventory.stdout.includes(guardName)) runFtps('delete', remoteGuard);
    return { responseStatus: response?.status || null, htaccessRestored };
}

(async () => {
    fs.mkdirSync(staging, { recursive: true });
    const source = fs.readFileSync(templatePath, 'utf8')
        .replace('__RUN_TOKEN_SHA256__', hash(runToken))
        .replace('__CLEANUP_TOKEN_SHA256__', hash(cleanupToken))
        .replace('__BACKUP_ID__', backupId)
        .replace('__GUARD_NAME__', guardName);
    assert(!source.includes('__RUN_TOKEN_SHA256__') && !source.includes('__CLEANUP_TOKEN_SHA256__'));
    const helper = path.join(staging, helperName), guard = path.join(staging, guardName);
    fs.writeFileSync(helper, source, 'utf8');
    const helperHash = hash(fs.readFileSync(helper));
    fs.writeFileSync(guard, `${helperHash}\n`, 'utf8');
    const lint = spawnSync(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-l', helper], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.strictEqual(lint.status, 0, lint.stderr || lint.stdout);

    const beforeA = path.join(evidence, 'htaccess-before-a'), beforeB = path.join(evidence, 'htaccess-before-b');
    assert(runFtps('download', '.htaccess', beforeA).ok, 'Production .htaccess download A failed.');
    assert(runFtps('download', '.htaccess', beforeB).ok, 'Production .htaccess download B failed.');
    htaccessBefore = beforeA;
    htaccessBeforeHash = hash(fs.readFileSync(beforeA));
    assert.strictEqual(hash(fs.readFileSync(beforeB)), htaccessBeforeHash, 'Production .htaccess double-download mismatch.');
    const original = fs.readFileSync(beforeA, 'utf8');
    const anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,';
    assert(original.includes(anchor), 'Production .htaccess rewrite anchor was not found.');
    const rule = `# Exact temporary full database export helper exception.\nRewriteRule ^api/${helperName.replace(/\./g, '\\.')}\$ - [L]\n\n`;
    const windowPath = path.join(staging, 'htaccess-helper-window');
    fs.writeFileSync(windowPath, original.replace(anchor, rule + anchor), 'utf8');

    assert(runFtps('upload', remoteGuard, guard).ok, 'Guard upload failed.');
    assert(runFtps('upload', remoteHelper, helper).ok, 'Helper upload failed.');
    remoteUploaded = true;
    assert(runFtps('upload', '.htaccess', windowPath).ok, 'Temporary helper window upload failed.');
    htaccessModified = true;
    const windowVerify = path.join(evidence, 'htaccess-helper-window-download-back');
    assert(runFtps('download', '.htaccess', windowVerify).ok && hash(fs.readFileSync(windowVerify)) === hash(fs.readFileSync(windowPath)), 'Temporary helper window verification failed.');

    const getResponse = await fetch(helperUrl, { headers: { 'User-Agent': 'TSH-Safety-Core-Full-Database-Local-Sync/1.0' } });
    assert.strictEqual(getResponse.status, 405, 'Helper GET must fail closed.');
    const invalid = await helperRequest('invalid-token', 'backup');
    assert.strictEqual(invalid.status, 401, 'Invalid helper token must fail closed.');
    const response = await helperRequest(runToken, 'backup');
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data?.success, true, JSON.stringify(response.data));
    assert.strictEqual(response.data?.readOnlyTransaction, true);
    const relative = String(response.data.relativePath || '');
    assert(new RegExp(`^api/private/${backupId}/production-full-database\\.sql\\.gz$`).test(relative), 'Unexpected private export path.');
    const downloadA = path.join(evidence, 'production-full-database-a.sql.gz');
    const downloadB = path.join(evidence, 'production-full-database-b.sql.gz');
    assert(runFtps('download', relative, downloadA).ok, 'Database download A failed.');
    assert(runFtps('download', relative, downloadB).ok, 'Database download B failed.');
    const a = fs.readFileSync(downloadA), b = fs.readFileSync(downloadB);
    assert.strictEqual(hash(a), response.data.sha256);
    assert.strictEqual(hash(b), response.data.sha256);
    assert.strictEqual(a.length, Number(response.data.bytes));
    const sql = zlib.gunzipSync(a);
    assert(sql.includes(Buffer.from('TSH Safety Core full Production database snapshot')) && sql.includes(Buffer.from('CREATE TABLE')), 'Downloaded SQL content is invalid.');
    const sqlPath = path.join(evidence, 'production-full-database.sql');
    fs.writeFileSync(sqlPath, sql);
    const publicProbe = await fetch(`${baseUrl}/${relative}`, { headers: { 'User-Agent': 'TSH-Safety-Core-Full-Database-Local-Sync/1.0' } });
    assert([401, 403, 404].includes(publicProbe.status), `Private export was publicly readable (${publicProbe.status}).`);
    const cleaned = await cleanup();
    assert.strictEqual(cleaned.responseStatus, 200, 'Remote helper cleanup failed.');
    assert.strictEqual(cleaned.htaccessRestored, true, 'Production .htaccess was not restored byte-exact.');
    const result = { decision: 'PASS_PRODUCTION_FULL_DATABASE_DOWNLOAD', generatedAt: new Date().toISOString(), evidence: path.relative(root, evidence).replace(/\\/g, '/'), tables: Number(response.data.tables), views: Number(response.data.views), rows: Number(response.data.rows), bytes: a.length, sha256: response.data.sha256, doubleDownloadVerified: true, readOnlyTransaction: true, publicAccessDenied: true, htaccessRestored: true, remoteHelperResidue: false, localImportPerformed: false };
    fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    fs.rmSync(staging, { recursive: true, force: true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
})().catch(async error => {
    const cleaned = await cleanup();
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'failure.json'), `${JSON.stringify({ errorClass: error.name, message: String(error.message || error), cleanup: cleaned }, null, 2)}\n`);
    console.error(error.stack || error);
    process.exitCode = 1;
});
