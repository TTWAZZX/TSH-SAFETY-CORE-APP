const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../db');

const baseUrl = String(process.env.KY_PHP_API_BASE || 'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/, '');
const activityId = crypto.randomUUID();
const storedNames = new Set();
const uploadIds = new Set();
let passed = false;

function apiUrl(route) {
    return baseUrl.includes('?route=') ? `${baseUrl}${route}` : `${baseUrl}/${route}`;
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!response.ok) {
        const error = new Error(`${response.status} ${data?.code || ''} ${data?.message || text.slice(0, 300)}`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function makeSyntheticMp4(size) {
    const video = Buffer.alloc(size, 0);
    video.writeUInt32BE(Math.min(size, 0xffffffff), 0);
    video.write('ftyp', 4, 'ascii');
    video.write('isom', 8, 'ascii');
    return video;
}

async function cleanup() {
    await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID=?', [activityId]).catch(() => {});
    await db.query("DELETE FROM Admin_AuditLogs WHERE Module='ky' AND TargetID=?", [activityId]).catch(() => {});
    await db.query('DELETE FROM KY_Activities WHERE id=?', [activityId]).catch(() => {});
    for (const storedName of storedNames) {
        for (const dir of [path.join(__dirname, '..', 'uploads'), path.join(__dirname, '..', '..', 'uploads')]) {
            const target = path.resolve(dir, storedName);
            if (target.startsWith(`${path.resolve(dir)}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target);
        }
    }
    const root = path.resolve(__dirname, '..', 'private-uploads', 'ky-video-chunks');
    for (const uploadId of uploadIds) {
        if (!/^[a-f0-9]{32}$/i.test(uploadId)) continue;
        const target = path.resolve(root, uploadId);
        const manifestPath = path.join(target, 'manifest.json');
        if (target.startsWith(`${root}${path.sep}`) && fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                if (manifest.activityId === activityId) fs.rmSync(target, { recursive: true, force: true });
            } catch (_) {}
        }
    }
}

async function uploadCase(headers, size, label, exerciseRecovery = false) {
    const video = makeSyntheticMp4(size);
    const sourceSha256 = crypto.createHash('sha256').update(video).digest('hex');
    const initialized = await jsonFetch(apiUrl(`ky/${activityId}/video-upload/init`), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: `${label}.mp4`, fileSize: video.length, mimeType: 'video/mp4' }),
    });
    const config = initialized.data;
    assert.ok(config.chunkSize > 0 && config.chunkSize <= 1024 * 1024, 'server chunk must be adaptive and no larger than 1 MiB');
    assert.strictEqual(config.maxFileSize, 200 * 1024 * 1024);
    assert.strictEqual(config.requiresChunkSha256, true);
    assert.strictEqual(config.totalChunks, Math.ceil(size / config.chunkSize));
    uploadIds.add(config.uploadId);

    const uploadPart = async (index, overrideHash = null) => {
        const start = index * config.chunkSize;
        const part = video.subarray(start, Math.min(video.length, start + config.chunkSize));
        const sha256 = overrideHash || crypto.createHash('sha256').update(part).digest('hex');
        const form = new FormData();
        form.append('chunk', new Blob([part]), `part-${index}`);
        const result = await jsonFetch(apiUrl(`ky/${activityId}/video-upload/${config.uploadId}/chunk/${index}`), {
            method: 'POST',
            headers: { ...headers, 'X-KY-Chunk-SHA256': sha256 },
            body: form,
        });
        assert.strictEqual(result.data.sha256, sha256);
    };

    if (exerciseRecovery) {
        await assert.rejects(uploadPart(0, '0'.repeat(64)), /409 KY_VIDEO_CHUNK_HASH_MISMATCH/);
        await uploadPart(0);
        await uploadPart(0);
        await assert.rejects(
            jsonFetch(apiUrl(`ky/${activityId}/video-upload/${config.uploadId}/complete`), {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
            }),
            /409 KY_VIDEO_CHUNKS_INCOMPLETE/
        );
    }
    for (let index = exerciseRecovery ? 1 : 0; index < config.totalChunks; index += 1) await uploadPart(index);

    const completed = await jsonFetch(apiUrl(`ky/${activityId}/video-upload/${config.uploadId}/complete`), {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.strictEqual(completed.data.sha256, sourceSha256);
    const videoUrl = completed.data.videoUrl || '';
    assert.match(videoUrl, /\/uploads\//);
    const storedName = path.basename(new URL(videoUrl, 'http://localhost').pathname);
    storedNames.add(storedName);
    const diskPath = [path.join(__dirname, '..', 'uploads', storedName), path.join(__dirname, '..', '..', 'uploads', storedName)].find(fs.existsSync);
    assert.ok(diskPath, 'assembled video must exist in established uploads storage');
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(diskPath)).digest('hex'), sourceSha256);
    const chunkDir = path.join(__dirname, '..', 'private-uploads', 'ky-video-chunks', config.uploadId);
    assert.ok(!fs.existsSync(chunkDir), 'successful upload must remove all temporary chunks');
    return videoUrl;
}

(async () => {
    try {
        const [admins] = await db.query("SELECT EmployeeID,EmployeeName,Role,Department FROM Employees WHERE LOWER(COALESCE(Role,''))='admin' LIMIT 1");
        assert.ok(admins.length, 'local Admin employee is required');
        assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
        const admin = admins[0];
        const token = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department }, process.env.JWT_SECRET, { expiresIn: '10m' });
        const headers = { Authorization: `Bearer ${token}` };

        const configResponse = await jsonFetch(apiUrl('ky/video-upload/config'), { headers });
        assert.ok(configResponse.data.chunkSize <= 1024 * 1024);
        assert.strictEqual(configResponse.data.maxFileSize, 200 * 1024 * 1024);

        await db.query(
            `INSERT INTO KY_Activities
             (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,Status)
             VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,'Open')`,
            [activityId, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName, admin.Department || 'TEST', 'KY chunk smoke', '[]', 'chunk-smoke', 'General', 'KY chunk upload smoke test', 'Remove test row after verification']
        );

        await assert.rejects(
            jsonFetch(apiUrl(`ky/${activityId}/video-upload/init`), {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: 'too-large.mp4', fileSize: (200 * 1024 * 1024) + 1, mimeType: 'video/mp4' }),
            }),
            /400 KY_VIDEO_SIZE_INVALID/
        );
        await assert.rejects(
            jsonFetch(apiUrl(`ky/${activityId}/video-upload/init`), {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: 'not-video.txt', fileSize: 1024, mimeType: 'text\/plain' }),
            }),
            /400 KY_VIDEO_TYPE_INVALID/
        );

        await uploadCase(headers, 2547455, 'ky-chunk-2_5mb', true);
        const finalVideoUrl = await uploadCase(headers, (5 * 1024 * 1024) + 37, 'ky-chunk-over-5mb');
        const [[saved]] = await db.query('SELECT VideoUrl FROM KY_Activities WHERE id=?', [activityId]);
        assert.strictEqual(saved.VideoUrl, finalVideoUrl);

        const abortInit = await jsonFetch(apiUrl(`ky/${activityId}/video-upload/init`), {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: 'ky-abort-at-200mb-limit.mp4', fileSize: 200 * 1024 * 1024, mimeType: 'video/mp4' }),
        });
        uploadIds.add(abortInit.data.uploadId);
        await jsonFetch(apiUrl(`ky/${activityId}/video-upload/${abortInit.data.uploadId}`), { method: 'DELETE', headers });
        assert.ok(!fs.existsSync(path.join(__dirname, '..', 'private-uploads', 'ky-video-chunks', abortInit.data.uploadId)), 'abort must remove temporary upload');
        passed = true;
    } finally {
        await cleanup();
        await db.end();
        if (passed) console.log('KY chunked video lifecycle: PASS (2.5MB/>5MB/adaptive/retry/SHA-256/abort/cleanup verified)');
    }
})().catch(error => {
    console.error(`KY chunked video lifecycle: FAIL - ${error.message}`);
    process.exitCode = 1;
});
