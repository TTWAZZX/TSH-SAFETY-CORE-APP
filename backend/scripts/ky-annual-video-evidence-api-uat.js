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
const candidateActivities = [];
const evidenceIds = [];
const inventoryIds = [];
const inventoryActivities = [];
const configDepartments = [];
const localFiles = [];
let passed = false;
let embeddedServer = null;

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
    for (const inventoryId of inventoryIds) {
        await db.query('DELETE FROM KY_Video_File_Inventory_Audit WHERE InventoryID=?', [inventoryId]).catch(() => {});
        await db.query('DELETE FROM KY_Video_File_Inventory WHERE id=?', [inventoryId]).catch(() => {});
    }
    for (const activity of inventoryActivities) {
        await db.query('DELETE FROM KY_Activities WHERE id=?', [activity.id]).catch(() => {});
    }
    for (const activity of activities) {
        await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID=?', [activity.id]).catch(() => {});
        await db.query('DELETE FROM KY_Activities WHERE id=?', [activity.id]).catch(() => {});
    }
    for (const activityId of candidateActivities) {
        await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID=?', [activityId]).catch(() => {});
        await db.query('DELETE FROM KY_Activities WHERE id=?', [activityId]).catch(() => {});
    }
    for (const department of configDepartments) {
        await db.query('DELETE FROM KY_Program_Config WHERE Year=? AND Department=?', [testYear, department]).catch(() => {});
    }
    for (const file of localFiles) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        const directory = path.dirname(file);
        const prefixes = [`${file}.ky-delete-`, `${file}.ky-inventory-delete-`];
        if (fs.existsSync(directory)) {
            for (const name of fs.readdirSync(directory)) {
                const candidate = path.join(directory, name);
                if (prefixes.some(prefix => candidate.startsWith(prefix))) fs.unlinkSync(candidate);
            }
        }
    }
}

(async () => {
    try {
        if (process.env.KY_UAT_EMBED_NODE === '1') {
            const app = require('../server');
            embeddedServer = await new Promise((resolve, reject) => {
                const server = app.listen(5000, '127.0.0.1', () => resolve(server));
                server.on('error', reject);
            });
        }
        const [admins] = await db.query("SELECT EmployeeID,EmployeeName,Role,Department FROM Employees WHERE LOWER(COALESCE(Role,''))='admin' LIMIT 1");
        assert.ok(admins.length, 'local Admin employee is required');
        assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
        const admin = admins[0];
        const token = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department }, process.env.JWT_SECRET, { expiresIn: '10m' });
        const headers = { Authorization: `Bearer ${token}` };

        configDepartments.push(
            ...Array.from({ length: 3 }, (_, index) => `__KY_ANNUAL_UAT_${runId}_${index}`),
            `__KY_INVENTORY_UAT_${runId}`,
            `__KY_CANONICAL_UAT_${runId}`,
            `__KY_ZERO_UAT_${runId}`
        );
        for (const department of configDepartments) {
            await db.query(
                'INSERT INTO KY_Program_Config (Year,Department,SafetyUnits,YearlyTarget,DeadlineDay,IsActive,CreatedBy) VALUES (?,?,NULL,12,15,1,?)',
                [testYear, department, admin.EmployeeID]
            );
        }

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
                 (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'annual-video-uat', 'General', 'Annual video evidence UAT', 'Temporary test row', '/uploads/ky-annual-uat-evidence.pdf', ?, 'Open')`,
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

        const duplicateActivityId = crypto.randomUUID();
        candidateActivities.push(duplicateActivityId);
        const [[sourceActivity]] = await db.query('SELECT * FROM KY_Activities WHERE id=?', [activities[0].id]);
        await db.query(
            `INSERT INTO KY_Activities
             (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'annual-video-duplicate-scope', 'General', 'Duplicate annual scope UAT', 'Temporary test row', '/uploads/ky-annual-uat-evidence.pdf', ?, 'Closed')`,
            [duplicateActivityId, sourceActivity.ActivityDate, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName,
                sourceActivity.Department, sourceActivity.SafetyUnit, 'Annual duplicate scope UAT', sourceActivity.VideoUrl]
        );
        const annualDashboard = (await request(`ky/annual-video-evidence?year=${testYear}`, { headers })).body.data;
        const duplicateCandidate = annualDashboard.candidates.find(row => String(row.id) === duplicateActivityId);
        assert.ok(duplicateCandidate, 'a second Production video in the same annual scope must remain visible for Admin review');
        assert.strictEqual(Boolean(duplicateCandidate.ScopeAlreadyRegistered), true, 'candidate must identify its already-registered annual scope');
        assert.strictEqual(duplicateCandidate.ScopeEvidenceStatus, 'Verified', 'candidate must expose the verified scope status');
        assert.strictEqual(String(duplicateCandidate.ScopeEvidenceID), String(activities[0].evidence.id), 'candidate must link to the existing evidence row');
        await assert.rejects(
            post('ky/annual-video-evidence/declare', headers, { activityId: duplicateActivityId, storageMode: 'Production' }),
            /409 KY_ANNUAL_VIDEO_ALREADY_VERIFIED/
        );
        await db.query('DELETE FROM KY_Activities WHERE id=?', [duplicateActivityId]);

        const inventoryActivityId = crypto.randomUUID();
        const inventoryStoredName = `ky-inventory-uat-${runId}.mp4`;
        const inventoryOriginalName = 'inventory-external-backup.mp4';
        const inventoryPath = path.join(uploadRoot, inventoryStoredName);
        const inventoryPayload = syntheticMp4(77);
        fs.writeFileSync(inventoryPath, inventoryPayload);
        localFiles.push(inventoryPath);
        const inventorySha = crypto.createHash('sha256').update(inventoryPayload).digest('hex');
        const inventoryVideoUrl = `/safety/tsh-safety-core/uploads/${inventoryStoredName}?filename=${encodeURIComponent(inventoryOriginalName)}`;
        await db.query(
            `INSERT INTO KY_Activities
             (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'video-inventory-uat', 'General', 'Production inventory UAT', 'Temporary test row', '/uploads/ky-inventory-uat-evidence.pdf', ?, 'Closed')`,
            [inventoryActivityId, `${testYear}-10-10`, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName,
                `__KY_INVENTORY_UAT_${runId}`, 'Inventory Unit', 'Inventory UAT', inventoryVideoUrl]
        );
        inventoryActivities.push({ id: inventoryActivityId, localPath: inventoryPath, sha256: inventorySha });
        const inventoryDashboard = (await request(`ky/annual-video-evidence?year=${testYear}`, { headers })).body.data;
        const unregisteredInventory = inventoryDashboard.inventory.find(row => String(row.ActivityID) === inventoryActivityId);
        assert.ok(unregisteredInventory && !unregisteredInventory.registered, 'every Production video must appear in Inventory before registration');
        await assert.rejects(
            post('ky/video-inventory/declare', headers, {
                activityId: inventoryActivityId, externalReference: `CENTRAL-UAT/${testYear}/${runId}/mismatch.mp4`,
                originalFileName: inventoryOriginalName, mimeType: 'video/mp4', fileSize: inventoryPayload.length,
                sha256: '0'.repeat(64), externalBackupConfirmed: true,
            }),
            /409 KY_VIDEO_INVENTORY_BACKUP_MISMATCH/
        );
        const inventoryDeclared = await post('ky/video-inventory/declare', headers, {
            activityId: inventoryActivityId, externalReference: `CENTRAL-UAT/${testYear}/${runId}/${inventoryOriginalName}`,
            originalFileName: inventoryOriginalName, mimeType: 'video/mp4', fileSize: inventoryPayload.length,
            sha256: inventorySha, externalBackupConfirmed: true,
        });
        inventoryIds.push(inventoryDeclared.data.id);
        await assert.rejects(
            post('ky/video-inventory/delete-production', headers, {
                items: [{ id: inventoryDeclared.data.id, rowVersion: inventoryDeclared.data.RowVersion }], reason: 'must fail before verify',
            }),
            /409 KY_VIDEO_INVENTORY_NOT_VERIFIED|409.*verified matching external backup/i
        );
        const inventoryVerified = await post(`ky/video-inventory/${inventoryDeclared.data.id}/verify`, headers, {
            status: 'Verified', rowVersion: inventoryDeclared.data.RowVersion, note: 'Inventory hash verified during UAT',
        });
        const inventoryDownload = await request(`ky/video-inventory/${inventoryDeclared.data.id}/download`, { headers });
        assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(inventoryDownload.body)).digest('hex'), inventorySha, 'Inventory download must preserve SHA-256');
        const inventoryDeleted = await post('ky/video-inventory/delete-production', headers, {
            items: [{ id: inventoryDeclared.data.id, rowVersion: inventoryVerified.data.RowVersion }], reason: 'Local Production inventory deletion UAT',
        });
        assert.strictEqual(inventoryDeleted.data.deleted, 1, 'Inventory cleanup must remove exactly one verified file');

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

        const canonicalActivityId = crypto.randomUUID();
        candidateActivities.push(canonicalActivityId);
        await db.query(
            `INSERT INTO KY_Activities
             (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, '[]', 'canonical-department-uat', 'General', 'Canonical Department matching UAT', 'Temporary test row', '/uploads/ky-canonical-uat-evidence.pdf', NULL, 'Closed')`,
            [canonicalActivityId, `${testYear}-11-11`, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName,
                `  __ky_canonical_uat_${runId}  `, 'Canonical Department UAT']
        );

        const history = (await request(`ky?year=${testYear}`, { headers })).body.data;
        const byId = new Map(history.map(row => [String(row.id), row]));
        for (const activity of activities) {
            const projected = byId.get(String(activity.id));
            assert.ok(projected, 'deleted activity must remain visible in KY History');
            assert.strictEqual(Number(projected.HasProductionVideo), 0, 'deleted Production video must no longer be projected');
            assert.strictEqual(Number(projected.HasVerifiedExternalVideo), 1, 'verified external evidence must remain projected');
            assert.strictEqual(Number(projected.HasVideoEvidence), 1, 'verified external evidence must count as video evidence');
            assert.strictEqual(projected.VideoEvidenceStorage, 'ExternalVerified', 'history must identify the verified external storage source');
        }
        const inventoryProjected = byId.get(inventoryActivityId);
        assert.ok(inventoryProjected, 'Inventory activity must remain in KY History after cleanup');
        assert.strictEqual(Number(inventoryProjected.HasProductionVideo), 0, 'Inventory cleanup must clear Production projection');
        assert.strictEqual(Number(inventoryProjected.HasVerifiedExternalVideo), 1, 'Verified Inventory backup must become External verified');
        assert.strictEqual(inventoryProjected.VideoEvidenceStorage, 'ExternalVerified', 'Inventory cleanup must preserve video evidence classification');
        const externalFiltered = (await request(`ky?year=${testYear}&evidence=external_verified`, { headers })).body.data;
        const expectedExternalIds = [...activities.map(row => String(row.id)), inventoryActivityId].sort();
        assert.deepStrictEqual(externalFiltered.map(row => String(row.id)).sort(), expectedExternalIds, 'verified external filter must return Annual and Inventory cleaned activities');
        const completeFiltered = (await request(`ky?year=${testYear}&evidence=complete`, { headers })).body.data;
        assert.deepStrictEqual(completeFiltered.map(row => String(row.id)).sort(), expectedExternalIds, 'complete filter must accept required file plus Annual or Inventory verified external video');
        const missingVideoFiltered = (await request(`ky?year=${testYear}&evidence=no_video`, { headers })).body.data;
        assert.ok(expectedExternalIds.every(id => !missingVideoFiltered.some(row => String(row.id) === id)), 'no-video filter must exclude Annual and Inventory verified external evidence');
        const statsResponse = (await request(`ky/stats?year=${testYear}`, { headers })).body.data;
        const stats = statsResponse.videoEvidence;
        assert.strictEqual(Number(stats.productionVideo), 0, 'stats must not retain deleted Production video copies');
        assert.strictEqual(Number(stats.verifiedExternalVideo), 4, 'stats must count Annual and Inventory verified external evidence');
        assert.strictEqual(Number(stats.videoEvidenceTotal), 4, 'combined stats must count every verified external activity');
        assert.strictEqual(statsResponse.departmentSource, 'ProgramConfig', 'Active Program Config must be the Department dashboard authority');
        assert.deepStrictEqual(statsResponse.configuredDepartments, [...configDepartments].sort(), 'stats must return every configured Department in canonical order');
        assert.strictEqual(statsResponse.byDept.length, configDepartments.length, 'Department chart must retain configured zero-activity Departments');
        assert.strictEqual(statsResponse.deptMonthly.length, configDepartments.length * 12, 'Heatmap must contain 12 months for every configured Department');
        assert.strictEqual(Number(statsResponse.byDept.find(row => row.Department === `__KY_ZERO_UAT_${runId}`)?.count), 0, 'configured zero-activity Department must remain visible');
        assert.strictEqual(Number(statsResponse.byDept.find(row => row.Department === `__KY_CANONICAL_UAT_${runId}`)?.count), 1, 'case and surrounding whitespace must resolve to the canonical configured Department');
        assert.ok(!statsResponse.unmappedDepartments.some(row => String(row.Department).toLowerCase().includes('__ky_canonical_uat_')), 'canonical Department variant must not be reported as unmapped');

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
        assert.ok(!fs.existsSync(inventoryPath), 'Inventory Production file must be removed after verified cleanup');
        const [[savedInventoryActivity]] = await db.query('SELECT VideoUrl FROM KY_Activities WHERE id=?', [inventoryActivityId]);
        assert.strictEqual(savedInventoryActivity.VideoUrl, null, 'Inventory activity must no longer point at a deleted Production file');
        const [[inventoryEvidence]] = await db.query('SELECT SHA256,ExternalReference,ProductionDeletedAt,ProductionDeletionReason FROM KY_Video_File_Inventory WHERE id=?', [inventoryDeclared.data.id]);
        assert.strictEqual(inventoryEvidence.SHA256, inventorySha, 'Inventory SHA-256 must remain after deletion');
        assert.ok(inventoryEvidence.ExternalReference && inventoryEvidence.ProductionDeletedAt && inventoryEvidence.ProductionDeletionReason, 'Inventory metadata must remain after deletion');
        const [[inventoryAudit]] = await db.query("SELECT COUNT(*) AS count FROM KY_Video_File_Inventory_Audit WHERE InventoryID=? AND Action='PRODUCTION_FILE_DELETED'", [inventoryDeclared.data.id]);
        assert.strictEqual(Number(inventoryAudit.count), 1, 'Inventory deletion must create an immutable audit event');
        await assert.rejects(
            request(`ky/${inventoryActivityId}`, { method: 'DELETE', headers }),
            /409 KY_VIDEO_PROTECTED_BY_RETENTION|409.*retention record/i,
            'an activity retained by Inventory metadata must not be deletable after its Production file is removed'
        );

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
            for (const inventoryId of inventoryIds) {
                const [[inventoryResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Video_File_Inventory WHERE id=?', [inventoryId]);
                const [[inventoryAuditResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Video_File_Inventory_Audit WHERE InventoryID=?', [inventoryId]);
                assert.strictEqual(Number(inventoryResidue.count), 0, 'test Inventory cleanup must leave no row residue');
                assert.strictEqual(Number(inventoryAuditResidue.count), 0, 'test Inventory audit cleanup must leave no row residue');
            }
            for (const activity of activities) {
                const [[activityResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Activities WHERE id=?', [activity.id]);
                assert.strictEqual(Number(activityResidue.count), 0, 'test activity cleanup must leave no row residue');
            }
            for (const activityId of candidateActivities) {
                const [[candidateResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Activities WHERE id=?', [activityId]);
                assert.strictEqual(Number(candidateResidue.count), 0, 'duplicate-scope candidate cleanup must leave no row residue');
            }
            for (const file of localFiles) assert.ok(!fs.existsSync(file), 'test file cleanup must leave no file residue');
        }
        if (embeddedServer) await new Promise(resolve => embeddedServer.close(resolve));
        await db.end();
        if (passed) console.log('KY annual video evidence API UAT: PASS (Annual + Production Inventory lifecycle, config-complete Department charts/heatmap, canonical matching, zero residue)');
    }
})().catch(error => {
    console.error(`KY annual video evidence API UAT: FAIL - ${error.message}`, error.cause || error.stack || '');
    process.exitCode = 1;
});
