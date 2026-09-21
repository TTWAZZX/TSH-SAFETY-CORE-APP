const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../db');

const baseUrl = String(process.env.KY_PHP_API_BASE || 'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/, '');
const testYear = 2198;
const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const activities = [];
const evidenceIds = [];
const localFiles = [];
let passed = false;

function apiUrl(route) {
    if (!baseUrl.includes('?route=')) return `${baseUrl}/${route}`;
    const separator = route.indexOf('?');
    return separator < 0
        ? `${baseUrl}${route}`
        : `${baseUrl}${route.slice(0, separator)}&${route.slice(separator + 1)}`;
}

async function request(route, options = {}) {
    const response = await fetch(apiUrl(route), options);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
    if (!response.ok) {
        const error = new Error(`${route}: ${response.status} ${body?.code || ''} ${body?.message || ''}`.trim());
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return { response, body };
}

async function post(route, headers, body) {
    return (await request(route, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })).body;
}

function syntheticMp4(seed) {
    const buffer = Buffer.alloc(384 * 1024 + seed, seed);
    buffer.writeUInt32BE(buffer.length, 0);
    buffer.write('ftyp', 4, 'ascii');
    buffer.write('isom', 8, 'ascii');
    return buffer;
}

async function cleanup() {
    for (const evidenceId of evidenceIds) {
        await db.query('DELETE FROM KY_Annual_Video_Evidence_Audit WHERE EvidenceID=?', [evidenceId]).catch(() => {});
        await db.query('DELETE FROM KY_Annual_Video_Evidence WHERE id=?', [evidenceId]).catch(() => {});
    }
    for (const activity of activities) {
        await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID=?', [activity.id]).catch(() => {});
        await db.query('DELETE FROM KY_Activities WHERE id=?', [activity.id]).catch(() => {});
    }
    for (const file of localFiles) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        const directory = path.dirname(file);
        const prefix = `${file}.ky-delete-`;
        if (fs.existsSync(directory)) {
            for (const name of fs.readdirSync(directory)) {
                const candidate = path.join(directory, name);
                if (candidate.startsWith(prefix)) fs.unlinkSync(candidate);
            }
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

        await request(`ky/annual-video-evidence?year=${testYear}`, { headers });
        const uploadRoot = process.env.KY_UAT_UPLOAD_ROOT
            ? path.resolve(process.env.KY_UAT_UPLOAD_ROOT)
            : baseUrl.includes('localhost:5000') || baseUrl.includes('127.0.0.1:5000')
                ? path.resolve(__dirname, '..', 'uploads')
                : path.resolve(__dirname, '..', '..', 'uploads');
        fs.mkdirSync(uploadRoot, { recursive: true });

        for (let index = 0; index < 3; index += 1) {
            const id = crypto.randomUUID();
            const department = `__KY_ANNUAL_UAT_${runId}_${index}`;
            const storedName = `ky-annual-uat-${runId}-${index}.mp4`;
            const originalName = `annual-evidence-${index + 1}.mp4`;
            const localPath = path.join(uploadRoot, storedName);
            const payload = syntheticMp4(index + 1);
            fs.writeFileSync(localPath, payload);
            localFiles.push(localPath);
            const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
            const videoUrl = `/safety/tsh-safety-core/uploads/${storedName}?filename=${encodeURIComponent(originalName)}`;
            await db.query(
                `INSERT INTO KY_Activities
                 (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,VideoUrl,Status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'annual-video-uat', 'General', 'Annual video evidence UAT', 'Temporary test row', ?, 'Open')`,
                [id, `${testYear}-09-${String(index + 1).padStart(2, '0')}`, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName,
                    department, `Unit ${index + 1}`, `Annual UAT ${index + 1}`, videoUrl]
            );
            activities.push({ id, localPath, sha256, originalName });

            const declared = await post('ky/annual-video-evidence/declare', headers, { activityId: id, storageMode: 'Production' });
            evidenceIds.push(declared.data.id);
            assert.strictEqual(declared.data.SHA256, sha256, 'server declaration must persist the physical file hash');
            const verifiedProduction = await post(`ky/annual-video-evidence/${declared.data.id}/verify`, headers, {
                status: 'Verified', rowVersion: declared.data.RowVersion, note: 'Production copy inspected during UAT',
            });
            await assert.rejects(
                post('ky/annual-video-evidence/delete-production', headers, {
                    items: [{ id: declared.data.id, rowVersion: verifiedProduction.data.RowVersion }], reason: 'must fail before external backup',
                }),
                /409 KY_EXTERNAL_BACKUP_NOT_VERIFIED|409.*external backup/i
            );
            const correction = await post(`ky/annual-video-evidence/${declared.data.id}/verify`, headers, {
                status: 'NeedsCorrection', rowVersion: verifiedProduction.data.RowVersion, note: 'Confirm central-machine backup',
            });
            const external = await post('ky/annual-video-evidence/declare', headers, {
                activityId: id,
                storageMode: 'CentralMachine',
                externalBackupConfirmed: true,
                externalReference: `CENTRAL-UAT/${testYear}/${runId}/${originalName}`,
                originalFileName: originalName,
                mimeType: 'video/mp4',
                fileSize: payload.length,
                sha256,
                rowVersion: correction.data.RowVersion,
            });
            const verified = await post(`ky/annual-video-evidence/${external.data.id}/verify`, headers, {
                status: 'Verified', rowVersion: external.data.RowVersion, note: 'Hash and central reference verified',
            });
            const downloaded = await request(`ky/annual-video-evidence/${external.data.id}/download`, { headers });
            assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(downloaded.body)).digest('hex'), sha256, 'download must preserve SHA-256');
            activities[index].evidence = verified.data;
        }

        const deletedOne = await post('ky/annual-video-evidence/delete-production', headers, {
            items: [{ id: activities[0].evidence.id, rowVersion: activities[0].evidence.RowVersion }],
            reason: 'Local annual evidence single-file deletion UAT',
        });
        assert.strictEqual(deletedOne.data.deleted, 1, 'single deletion must remove exactly one preflighted file');

        const deleted = await post('ky/annual-video-evidence/delete-production', headers, {
            items: activities.slice(1).map(item => ({ id: item.evidence.id, rowVersion: item.evidence.RowVersion })),
            reason: 'Local annual evidence batch deletion UAT',
        });
        assert.strictEqual(deleted.data.deleted, 2, 'bulk deletion must remove every preflighted file');

        for (const activity of activities) {
            assert.ok(!fs.existsSync(activity.localPath), 'Production file must be removed after successful batch deletion');
            const [[savedActivity]] = await db.query('SELECT VideoUrl FROM KY_Activities WHERE id=?', [activity.id]);
            assert.strictEqual(savedActivity.VideoUrl, null, 'activity must no longer point at a deleted Production file');
            const [[evidence]] = await db.query('SELECT SHA256,ExternalReference,ProductionDeletedAt,ProductionDeletionReason FROM KY_Annual_Video_Evidence WHERE id=?', [activity.evidence.id]);
            assert.strictEqual(evidence.SHA256, activity.sha256, 'SHA-256 metadata must remain after physical deletion');
            assert.ok(evidence.ExternalReference && evidence.ProductionDeletedAt && evidence.ProductionDeletionReason, 'external metadata and deletion metadata must remain');
            const [[audit]] = await db.query("SELECT COUNT(*) AS count FROM KY_Annual_Video_Evidence_Audit WHERE EvidenceID=? AND Action='PRODUCTION_FILE_DELETED'", [activity.evidence.id]);
            assert.strictEqual(Number(audit.count), 1, 'each deleted file must have an immutable deletion audit event');
        }

        passed = true;
    } finally {
        await cleanup();
        if (passed) {
            for (const evidenceId of evidenceIds) {
                const [[evidenceResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Annual_Video_Evidence WHERE id=?', [evidenceId]);
                const [[auditResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Annual_Video_Evidence_Audit WHERE EvidenceID=?', [evidenceId]);
                assert.strictEqual(Number(evidenceResidue.count), 0, 'test evidence cleanup must leave no row residue');
                assert.strictEqual(Number(auditResidue.count), 0, 'test audit cleanup must leave no row residue');
            }
            for (const activity of activities) {
                const [[activityResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Activities WHERE id=?', [activity.id]);
                assert.strictEqual(Number(activityResidue.count), 0, 'test activity cleanup must leave no row residue');
            }
            for (const file of localFiles) assert.ok(!fs.existsSync(file), 'test file cleanup must leave no file residue');
        }
        await db.end();
        if (passed) console.log('KY annual video evidence API UAT: PASS (declare/verify/download/hash/protected delete/single delete/bulk delete/metadata/audit/zero residue)');
    }
})().catch(error => {
    console.error(`KY annual video evidence API UAT: FAIL - ${error.message}`);
    process.exitCode = 1;
});
