const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../db');

const baseUrl = String(process.env.KY_PHP_API_BASE || 'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/, '');
const activityId = crypto.randomUUID();
let storedName = null;
let passed = false;
let uploadId = null;

function apiUrl(route) {
    return baseUrl.includes('?route=') ? `${baseUrl}${route}` : `${baseUrl}/${route}`;
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!response.ok) throw new Error(`${response.status} ${data?.message || text.slice(0, 300)}`);
    return data;
}

async function cleanup() {
    await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID=?', [activityId]).catch(() => {});
    await db.query("DELETE FROM Admin_AuditLogs WHERE Module='ky' AND TargetID=?", [activityId]).catch(() => {});
    await db.query('DELETE FROM KY_Activities WHERE id=?', [activityId]).catch(() => {});
    if (storedName) {
        for (const dir of [path.join(__dirname, '..', 'uploads'), path.join(__dirname, '..', '..', 'uploads')]) {
            const target = path.resolve(dir, storedName);
            if (target.startsWith(`${path.resolve(dir)}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target);
        }
    }
    if (uploadId && /^[a-f0-9]{32}$/i.test(uploadId)) {
        const root = path.resolve(__dirname, '..', 'private-uploads', 'ky-video-chunks');
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

(async () => {
    try {
        const [admins] = await db.query("SELECT EmployeeID,EmployeeName,Role,Department FROM Employees WHERE LOWER(COALESCE(Role,''))='admin' LIMIT 1");
        assert.ok(admins.length, 'local Admin employee is required');
        assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
        const admin = admins[0];
        const token = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department }, process.env.JWT_SECRET, { expiresIn: '10m' });
        const headers = { Authorization: `Bearer ${token}` };

        await db.query(
            `INSERT INTO KY_Activities
             (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,Status)
             VALUES (?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,'Open')`,
            [activityId, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName, admin.Department || 'TEST', 'KY chunk smoke', '[]', 'chunk-smoke', 'General', 'KY chunk upload smoke test', 'Remove test row after verification']
        );

        const size = (5 * 1024 * 1024) + 37;
        const video = Buffer.alloc(size, 0);
        video.writeUInt32BE(size, 0);
        video.write('ftyp', 4, 'ascii');
        video.write('isom', 8, 'ascii');
        const initialized = await jsonFetch(apiUrl(`ky/${activityId}/video-upload/init`), {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: 'ky-chunk-smoke.mp4', fileSize: video.length, mimeType: 'video/mp4' }),
        });
        assert.strictEqual(initialized.data.totalChunks, 2);
        uploadId = initialized.data.uploadId;

        const uploadPart = async index => {
            const start = index * initialized.data.chunkSize;
            const form = new FormData();
            form.append('chunk', new Blob([video.subarray(start, Math.min(video.length, start + initialized.data.chunkSize))]), `part-${index}`);
            await jsonFetch(apiUrl(`ky/${activityId}/video-upload/${initialized.data.uploadId}/chunk/${index}`), { method: 'POST', headers, body: form });
        };
        await uploadPart(0);
        await uploadPart(0); // retrying a completed part must remain safe
        await assert.rejects(
            jsonFetch(apiUrl(`ky/${activityId}/video-upload/${initialized.data.uploadId}/complete`), {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: '{}',
            }),
            /409 .*ส่วนที่ 2/
        );
        await uploadPart(1);
        const completed = await jsonFetch(apiUrl(`ky/${activityId}/video-upload/${initialized.data.uploadId}/complete`), {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: '{}',
        });
        const videoUrl = completed?.data?.videoUrl || '';
        assert.match(videoUrl, /\/uploads\//);
        storedName = path.basename(new URL(videoUrl, 'http://localhost').pathname);

        const [[saved]] = await db.query('SELECT VideoUrl FROM KY_Activities WHERE id=?', [activityId]);
        assert.strictEqual(saved.VideoUrl, videoUrl);
        const diskPath = [path.join(__dirname, '..', 'uploads', storedName), path.join(__dirname, '..', '..', 'uploads', storedName)].find(fs.existsSync);
        assert.ok(diskPath, 'assembled video must exist in established uploads storage');
        assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(diskPath)).digest('hex'), crypto.createHash('sha256').update(video).digest('hex'));
        passed = true;
    } finally {
        await cleanup();
        await db.end();
        if (passed) console.log('KY chunked video lifecycle: PASS (retry/incomplete/2 chunks/hash/cleanup verified)');
    }
})().catch(error => {
    console.error(`KY chunked video lifecycle: FAIL - ${error.message}`);
    process.exitCode = 1;
});
