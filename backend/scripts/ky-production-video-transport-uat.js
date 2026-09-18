'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const baseUrl = String(process.env.KY_PRODUCTION_API_BASE || 'https://dev.tshpcl.com/safety/tsh-safety-core/api').replace(/\/+$/, '');
const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const videoPath = path.resolve(process.env.KY_PRODUCTION_TEST_VIDEO || path.join(__dirname, '..', '..', 'uploads', '20260706132808-da9592b9692d28df.mp4'));

async function request(route, { method = 'GET', token = '', body, headers = {}, expected = 200 } = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch (_) {}
    assert.strictEqual(response.status, expected, `${method} ${route}: expected ${expected}, received ${response.status} (${payload?.code || payload?.message || text.slice(0, 160)})`);
    return payload;
}

(async () => {
    assert.ok(employeeId && password, 'Production UAT credentials are required');
    assert.ok(fs.existsSync(videoPath), `Real MP4 test file is missing: ${videoPath}`);
    const sourceVideo = fs.readFileSync(videoPath);
    assert.ok(sourceVideo.length > 2 * 1024 * 1024, 'Real MP4 test file must be larger than the Production 2 MB PHP limit');
    assert.strictEqual(sourceVideo.toString('ascii', 4, 8), 'ftyp', 'Real test file must have an MP4 signature');
    const requestedProbeBytes = Number(process.env.KY_PRODUCTION_TRANSPORT_BYTES || 0);
    const video = Number.isSafeInteger(requestedProbeBytes) && requestedProbeBytes > 0
        ? sourceVideo.subarray(0, Math.min(requestedProbeBytes, sourceVideo.length))
        : sourceVideo;

    const login = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    assert.ok(login?.token, 'Production login returned no token');
    const token = login.token;
    const config = (await request('/ky/video-upload/config', { token })).data;
    assert.strictEqual(config.maxFileSize, 200 * 1024 * 1024);
    assert.ok(config.chunkSize >= 64 * 1024 && config.chunkSize <= 1024 * 1024);
    assert.strictEqual(config.requiresChunkSha256, true);

    const history = await request(`/ky?year=${new Date().getFullYear()}&evidence=no_video`, { token });
    const activity = (history?.data || []).find(row => !String(row.VideoUrl || '').trim());
    assert.ok(activity?.id, 'A pre-existing no-video KY row is required for reversible transport UAT');

    let uploadId = '';
    try {
        const initialized = await request(`/ky/${encodeURIComponent(activity.id)}/video-upload/init`, {
            method: 'POST', token,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: path.basename(videoPath), fileSize: video.length, mimeType: 'video/mp4' }),
            expected: 201,
        });
        uploadId = initialized.data.uploadId;
        assert.strictEqual(initialized.data.totalChunks, Math.ceil(video.length / initialized.data.chunkSize));

        const uploadPart = async index => {
            const start = index * initialized.data.chunkSize;
            const part = video.subarray(start, Math.min(video.length, start + initialized.data.chunkSize));
            const sha256 = crypto.createHash('sha256').update(part).digest('hex');
            const form = new FormData();
            form.append('chunk', new Blob([part], { type: 'application/octet-stream' }), `part-${index}`);
            const result = await request(`/ky/${encodeURIComponent(activity.id)}/video-upload/${uploadId}/chunk/${index}`, {
                method: 'POST', token, body: form, headers: { 'X-KY-Chunk-SHA256': sha256 },
            });
            assert.strictEqual(result.data.sha256, sha256);
        };

        for (let index = 0; index < initialized.data.totalChunks; index += 1) await uploadPart(index);
        await uploadPart(0); // Re-sending only one completed chunk must be idempotent.
        await request(`/ky/${encodeURIComponent(activity.id)}/video-upload/${uploadId}`, { method: 'DELETE', token });

        const firstPart = video.subarray(0, initialized.data.chunkSize);
        const form = new FormData();
        form.append('chunk', new Blob([firstPart]), 'part-0-after-abort');
        await request(`/ky/${encodeURIComponent(activity.id)}/video-upload/${uploadId}/chunk/0`, {
            method: 'POST', token, body: form,
            headers: { 'X-KY-Chunk-SHA256': crypto.createHash('sha256').update(firstPart).digest('hex') },
            expected: 404,
        });
        uploadId = '';

        const unchanged = await request(`/ky/${encodeURIComponent(activity.id)}`, { token });
        assert.ok(!String(unchanged?.data?.VideoUrl || '').trim(), 'Transport-only UAT must not attach a video to the KY row');
        console.log(JSON.stringify({
            result: 'PASS',
            mode: 'transport-only-no-business-write',
            bytes: video.length,
            chunks: initialized.data.totalChunks,
            chunkSize: initialized.data.chunkSize,
            retryVerified: true,
            sha256VerifiedPerChunk: true,
            abortCleanupVerifiedBy404: true,
            activityUnchanged: true,
        }));
    } finally {
        if (uploadId) {
            await request(`/ky/${encodeURIComponent(activity.id)}/video-upload/${uploadId}`, { method: 'DELETE', token }).catch(() => {});
        }
    }
})().catch(error => {
    console.error(`KY Production video transport UAT: FAIL - ${error.message}`);
    process.exitCode = 1;
});
