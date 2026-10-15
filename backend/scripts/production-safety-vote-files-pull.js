'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const privateDir = path.join(root, 'backend', 'private-uploads', 'safety-vote');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-private-files-local-sync-${stamp}`);
const staging = path.join(evidence, 'staging');
const previous = path.join(evidence, 'local-before');
const ftps = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function download(remote, local) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftps, '-Action', 'download', '-RemotePath', remote, '-LocalPath', local], {
        cwd: root,
        encoding: 'utf8',
        timeout: 180000,
        windowsHide: true
    });
    if (result.error || result.status !== 0) throw new Error(`Private file download failed (${path.basename(remote)}).`);
}

(async () => {
    const host = String(process.env.DB_HOST || '').toLowerCase();
    assert(['localhost', '127.0.0.1', '::1'].includes(host), 'Refusing a non-loopback Local database.');
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    let rows;
    try {
        [rows] = await db.query("SELECT StoredName,FileSize,ContentSha256 FROM SafetyVote_Files WHERE Status='Active' ORDER BY id");
    } finally {
        await db.end();
    }
    fs.mkdirSync(staging, { recursive: true });
    if (fs.existsSync(privateDir)) fs.cpSync(privateDir, previous, { recursive: true });
    const names = new Set();
    for (const row of rows) {
        const name = String(row.StoredName || '');
        assert(name && path.basename(name) === name && !names.has(name), 'Unsafe or duplicate Safety Vote stored filename.');
        names.add(name);
        const destination = path.join(staging, name);
        download(`api/private/safety-vote/${name}`, destination);
        if (Number(row.FileSize || 0)) assert.strictEqual(fs.statSync(destination).size, Number(row.FileSize), 'Private file size mismatch.');
        if (/^[a-f0-9]{64}$/i.test(String(row.ContentSha256 || ''))) assert.strictEqual(sha256(destination), String(row.ContentSha256).toLowerCase(), 'Private file SHA-256 mismatch.');
    }
    fs.mkdirSync(privateDir, { recursive: true });
    for (const name of names) fs.copyFileSync(path.join(staging, name), path.join(privateDir, name));
    const result = {
        decision: 'PASS_PRODUCTION_SAFETY_VOTE_PRIVATE_FILES_LOCAL_SYNC',
        syncedAt: new Date().toISOString(),
        activeFiles: names.size,
        sizeVerified: true,
        sha256VerifiedWhenAvailable: true,
        productionMutation: false,
        localPreviousFilesBackedUp: fs.existsSync(previous)
    };
    fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    fs.rmSync(staging, { recursive: true, force: true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
})().catch(error => {
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'failure.json'), `${JSON.stringify({ errorClass: error.name, message: error.message }, null, 2)}\n`);
    console.error(error.stack || error);
    process.exitCode = 1;
});

