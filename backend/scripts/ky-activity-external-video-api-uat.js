const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');

const baseUrl = String(process.env.KY_PHP_API_BASE || 'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/, '');
const testYear = 2197;
const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const department = `__KY_ACTIVITY_EXTERNAL_${runId}`;
const activityIds = [crypto.randomUUID(), crypto.randomUUID()];
const evidenceIds = [];
let embeddedServer = null;
let passed = false;

function apiUrl(route) {
    if (!baseUrl.includes('?route=')) return `${baseUrl}/${route}`;
    const separator = route.indexOf('?');
    return separator < 0 ? `${baseUrl}${route}` : `${baseUrl}${route.slice(0, separator)}&${route.slice(separator + 1)}`;
}

async function request(route, options = {}) {
    const response = await fetch(apiUrl(route), options);
    const body = await response.json();
    if (!response.ok) {
        const error = new Error(`${route}: ${response.status} ${body?.code || ''} ${body?.message || ''}`.trim());
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
}

async function post(route, headers, body) {
    return request(route, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function cleanup() {
    for (const id of evidenceIds) {
        await db.query('DELETE FROM KY_Activity_External_Video_Evidence_Audit WHERE EvidenceID=?', [id]).catch(() => {});
        await db.query('DELETE FROM KY_Activity_External_Video_Evidence WHERE id=?', [id]).catch(() => {});
    }
    for (const id of activityIds) {
        await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID=?', [id]).catch(() => {});
        await db.query('DELETE FROM KY_Activities WHERE id=?', [id]).catch(() => {});
    }
    await db.query('DELETE FROM KY_Program_Config WHERE Year=? AND Department=?', [testYear, department]).catch(() => {});
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
        const [[admin]] = await db.query("SELECT EmployeeID,EmployeeName,Role,Department FROM Employees WHERE LOWER(COALESCE(Role,''))='admin' LIMIT 1");
        assert.ok(admin, 'local Admin employee is required');
        assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
        const headers = { Authorization: `Bearer ${jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department }, process.env.JWT_SECRET, { expiresIn: '10m' })}` };

        await db.query('INSERT INTO KY_Program_Config (Year,Department,SafetyUnits,YearlyTarget,DeadlineDay,IsActive,CreatedBy) VALUES (?,?,NULL,12,15,1,?)', [testYear, department, admin.EmployeeID]);
        await request(`ky/annual-video-evidence?year=${testYear}`, { headers });
        for (let index = 0; index < activityIds.length; index += 1) {
            await db.query(
                `INSERT INTO KY_Activities
                 (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status)
                 VALUES (?,?,?,?,?,?,?,NULL,?,'[]','activity-external-uat','General','External evidence lifecycle UAT','Temporary test row','/uploads/ky-activity-external-uat.pdf',NULL,'Closed')`,
                [activityIds[index], `${testYear}-0${index + 1}-15`, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName, department, `External UAT ${index + 1}`]
            );
        }

        const metadata = index => ({
            activityId: activityIds[index],
            externalReference: `\\\\192.168.124.87\\KYT\\${testYear}\\external-${index + 1}.mp4`,
            originalFileName: `external-${index + 1}.mp4`,
            mimeType: 'video/mp4',
            fileSize: 1024 + index,
            sha256: crypto.createHash('sha256').update(`activity-external-${runId}-${index}`).digest('hex'),
        });

        const first = await post('ky/activity-video-evidence/declare', headers, metadata(0));
        evidenceIds.push(first.data.id);
        assert.strictEqual(first.data.Status, 'Pending', 'new activity evidence must start Pending');
        const firstAgain = await post('ky/activity-video-evidence/declare', headers, metadata(0));
        assert.strictEqual(Boolean(firstAgain.idempotent), true, 'identical declaration must be idempotent');

        const pendingHistory = (await request(`ky?year=${testYear}&evidence=external_pending`, { headers })).data;
        assert.ok(pendingHistory.some(row => row.id === activityIds[0]), 'pending filter must expose activity external evidence');
        const noVideoWhilePending = (await request(`ky?year=${testYear}&evidence=no_video`, { headers })).data;
        assert.ok(!noVideoWhilePending.some(row => row.id === activityIds[0]), 'Need video/no-video must exclude Pending external evidence');
        const overviewPending = (await request(`ky/evidence-overview?year=${testYear}`, { headers })).data;
        const pendingScope = overviewPending.rows.find(row => row.department === department);
        assert.strictEqual(Number(pendingScope.pendingExternalVideo), 1, 'follow-up summary must count Pending external evidence');
        assert.strictEqual(Number(pendingScope.waitingVideo), 1, 'only the second activity without any video evidence may remain Need video');
        assert.strictEqual(pendingScope.records.find(row => row.id === activityIds[0])?.evidenceStatus, 'external_pending', 'the Pending activity itself must not be classified as Need video');

        const firstVerified = await post(`ky/activity-video-evidence/${first.data.id}/verify`, headers, { status: 'Verified', rowVersion: first.data.RowVersion, note: 'UAT verified' });
        assert.strictEqual(firstVerified.data.Status, 'Verified', 'Admin verification must produce Verified status');
        const annualAfterFirst = (await request(`ky/annual-video-evidence?year=${testYear}`, { headers })).data;
        const annualScope = annualAfterFirst.scopes.find(row => row.department === department);
        assert.strictEqual(Boolean(annualScope?.compliant), false, 'one verified external activity must not satisfy a 12-activity Annual Compliance target');
        assert.strictEqual(Number(annualScope.externalRequired), 11, 'a YearlyTarget of 12 must require eleven verified External activities');
        assert.strictEqual(Number(annualScope.missingProduction), 1, 'Annual Compliance must still require one Production activity');

        const second = await post('ky/activity-video-evidence/declare', headers, metadata(1));
        evidenceIds.push(second.data.id);
        assert.strictEqual(second.data.Status, 'Pending', 'a second activity in the same annual scope must register without annual-scope conflict');
        const correction = await post(`ky/activity-video-evidence/${second.data.id}/verify`, headers, { status: 'NeedsCorrection', rowVersion: second.data.RowVersion, note: 'Correct central reference' });
        const correctedMetadata = { ...metadata(1), externalReference: `${metadata(1).externalReference}.corrected`, rowVersion: correction.data.RowVersion };
        const corrected = await post('ky/activity-video-evidence/declare', headers, correctedMetadata);
        const secondVerified = await post(`ky/activity-video-evidence/${second.data.id}/verify`, headers, { status: 'Verified', rowVersion: corrected.data.RowVersion, note: 'Corrected and verified' });
        assert.strictEqual(secondVerified.data.Status, 'Verified', 'corrected evidence must return to Verified');

        const verifiedHistory = (await request(`ky?year=${testYear}&evidence=external_verified`, { headers })).data;
        assert.ok(activityIds.every(id => verifiedHistory.some(row => row.id === id)), 'History verified filter must return both same-scope activities');
        const completeHistory = (await request(`ky?year=${testYear}&evidence=complete`, { headers })).data;
        assert.ok(activityIds.every(id => completeHistory.some(row => row.id === id)), 'complete filter must accept required file plus verified external video');
        const stats = (await request(`ky/stats?year=${testYear}`, { headers })).data.videoEvidence;
        assert.strictEqual(Number(stats.verifiedExternalVideo), 2, 'Dashboard stats must count both verified activity videos');
        assert.strictEqual(Number(stats.pendingExternalVideo), 0, 'Dashboard stats must clear Pending after verification');
        assert.strictEqual(Number(stats.missingVideoEvidence), 0, 'Dashboard stats must not classify verified activity videos as missing');
        const adminList = (await request(`ky/activity-video-evidence?year=${testYear}`, { headers })).data;
        assert.strictEqual(adminList.length, 2, 'Admin queue must expose both activity evidence rows');
        const audit = (await request(`ky/activity-video-evidence/${second.data.id}/audit`, { headers })).data;
        assert.ok(audit.some(row => row.Action === 'NEEDS_CORRECTION') && audit.some(row => row.Action === 'ADMIN_VERIFIED'), 'audit must retain correction and verification events');
        passed = true;
    } finally {
        await cleanup();
        if (passed) {
            const [[activityResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Activities WHERE id IN (?,?)', activityIds);
            const [[evidenceResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Activity_External_Video_Evidence WHERE ActivityID IN (?,?)', activityIds);
            const [[auditResidue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Activity_External_Video_Evidence_Audit WHERE ActivityID IN (?,?)', activityIds);
            assert.strictEqual(Number(activityResidue.count), 0, 'activity UAT must leave no activity rows');
            assert.strictEqual(Number(evidenceResidue.count), 0, 'activity UAT must leave no evidence rows');
            assert.strictEqual(Number(auditResidue.count), 0, 'activity UAT must leave no audit rows');
        }
        if (embeddedServer) await new Promise(resolve => embeddedServer.close(resolve));
        await db.end();
        if (passed) console.log('KY activity external video API UAT: PASS (Pending/Verify/Correction, same-scope activities, Dashboard/History/Annual parity, zero residue)');
    }
})().catch(error => {
    console.error(`KY activity external video API UAT: FAIL - ${error.message}`, error.stack || '');
    process.exitCode = 1;
});
