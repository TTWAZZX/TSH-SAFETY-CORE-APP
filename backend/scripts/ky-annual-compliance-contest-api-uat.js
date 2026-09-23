'use strict';

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const db = require('../db');

const baseUrl = String(process.env.KY_PHP_API_BASE || 'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/, '');
const testYear = 2196;
const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const department = `__KY_CONTEST_${runId}`;
const activityIds = Array.from({ length: 13 }, () => crypto.randomUUID());
const evidenceIds = [];
const contestIds = [];
let embeddedServer;
let passed = false;

function apiUrl(route) {
    if (!baseUrl.includes('?route=')) return `${baseUrl}/${route}`;
    const offset = route.indexOf('?');
    return offset < 0 ? `${baseUrl}${route}` : `${baseUrl}${route.slice(0, offset)}&${route.slice(offset + 1)}`;
}

async function request(route, token, options = {}) {
    const response = await fetch(apiUrl(route), { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json();
    if (!response.ok) {
        const error = new Error(`${route}: ${response.status} ${body.code || ''} ${body.message || ''}`);
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
}

const post = (route, token, body) => request(route, token, { method: 'POST', body: JSON.stringify(body) });

async function expectConflict(route, token, body, code) {
    try { await post(route, token, body); }
    catch (error) {
        assert.strictEqual(error.status, 409);
        assert.strictEqual(error.body.code, code);
        return;
    }
    assert.fail(`${route} must return ${code}`);
}

async function cleanup() {
    await db.query('DELETE FROM KY_Annual_Unit_Contest_Entry_Audit WHERE ActivityID IN (?)', [activityIds]).catch(() => {});
    await db.query('DELETE FROM KY_Annual_Unit_Contest_Entries WHERE EntryYear=? AND Department=?', [testYear, department]).catch(() => {});
    await db.query('DELETE FROM KY_Video_File_Inventory_Audit WHERE ActivityID IN (?)', [activityIds]).catch(() => {});
    await db.query('DELETE FROM KY_Video_File_Inventory WHERE ActivityID IN (?)', [activityIds]).catch(() => {});
    await db.query('DELETE FROM KY_Activity_External_Video_Evidence_Audit WHERE ActivityID IN (?)', [activityIds]).catch(() => {});
    await db.query('DELETE FROM KY_Activity_External_Video_Evidence WHERE ActivityID IN (?)', [activityIds]).catch(() => {});
    await db.query('DELETE FROM KY_Video_Reactions WHERE ActivityID IN (?)', [activityIds]).catch(() => {});
    await db.query('DELETE FROM KY_Activities WHERE id IN (?)', [activityIds]).catch(() => {});
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
        assert.ok(admin && process.env.JWT_SECRET, 'Admin and JWT_SECRET are required');
        const adminToken = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: 'admin', department: admin.Department }, process.env.JWT_SECRET, { expiresIn: '20m' });
        const unitUserToken = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: 'user', department }, process.env.JWT_SECRET, { expiresIn: '20m' });
        await db.query('INSERT INTO KY_Program_Config (Year,Department,SafetyUnits,YearlyTarget,DeadlineDay,IsActive,CreatedBy) VALUES (?,?,NULL,12,15,1,?)', [testYear, department, admin.EmployeeID]);
        await request(`ky/annual-video-evidence?year=${testYear}`, adminToken);
        for (let i = 0; i < activityIds.length; i += 1) {
            await db.query(`INSERT INTO KY_Activities
                (id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status)
                VALUES (?,?,?,?,?,?,?,?,?,'contest-uat','General','Annual compliance contest UAT','Temporary fixture','/uploads/contest-uat.pdf',?,'Closed')`,
            [activityIds[i], `${testYear}-${String((i % 12) + 1).padStart(2, '0')}-15`, admin.EmployeeID, admin.EmployeeName, admin.EmployeeID, admin.EmployeeName, department, `Contest UAT ${i + 1}`, '[]', (i === 0 || i === 12) ? `/uploads/contest-${runId}-${i}.mp4` : null]);
        }

        for (let i = 1; i <= 11; i += 1) {
            const declared = await post('ky/activity-video-evidence/declare', unitUserToken, {
                activityId: activityIds[i], externalReference: `\\\\192.168.124.87\\KYT\\${testYear}\\external-${i}.mp4`,
                originalFileName: `external-${i}.mp4`, mimeType: 'video/mp4', fileSize: 1000 + i,
                sha256: crypto.createHash('sha256').update(`${runId}-${i}`).digest('hex'),
            });
            evidenceIds.push(declared.data.id);
            if (i <= 10) await post(`ky/activity-video-evidence/${declared.data.id}/verify`, adminToken, { status: 'Verified', rowVersion: declared.data.RowVersion, note: 'UAT verify' });
        }
        let overview = (await request(`ky/evidence-overview?year=${testYear}`, adminToken)).data;
        let scope = overview.rows.find(row => row.department === department);
        assert.strictEqual(scope.productionVideo, 2, 'Production count must use distinct activities');
        assert.strictEqual(scope.verifiedExternalVideo, 10, 'only verified External activities may count');
        assert.strictEqual(scope.pendingExternalVideo, 1, 'Pending external must remain separate');
        assert.strictEqual(scope.evidenceTotal, 12, 'Production surplus may appear in the distinct evidence total');
        assert.strictEqual(scope.missingEvidenceTotal, 1, 'Production surplus must not hide the missing verified External activity');
        assert.strictEqual(scope.annualCompliant, false, 'Pending evidence must not satisfy Annual Compliance');
        let annualScope = (await request(`ky/annual-video-evidence?year=${testYear}`, adminToken)).data.scopes.find(row => row.department === department);
        assert.strictEqual(annualScope.productionVideo, 2, 'Annual Compliance must use the same Production activity count');
        assert.strictEqual(annualScope.verifiedExternalVideo, 10, 'Annual Compliance must exclude Pending external evidence');
        assert.strictEqual(annualScope.missingEvidenceTotal, 1, 'Annual Compliance must preserve the missing External requirement even when total evidence is 12');
        assert.strictEqual(annualScope.compliant, false, 'Annual Compliance must remain incomplete before the final Admin Verify');

        const pending = await request(`ky/activity-video-evidence?year=${testYear}`, adminToken);
        const last = pending.data.find(row => row.id === evidenceIds.at(-1));
        await post(`ky/activity-video-evidence/${last.id}/verify`, adminToken, { status: 'Verified', rowVersion: last.RowVersion, note: 'Final UAT verify' });
        overview = (await request(`ky/evidence-overview?year=${testYear}`, adminToken)).data;
        scope = overview.rows.find(row => row.department === department);
        assert.strictEqual(scope.productionRequired, 1);
        assert.strictEqual(scope.externalRequired, 11);
        assert.strictEqual(scope.evidenceTotal, 13);
        assert.strictEqual(scope.missingEvidenceTotal, 0);
        assert.strictEqual(scope.annualCompliant, true, '1+ Production and 11 verified External distinct activities must satisfy target 12');
        annualScope = (await request(`ky/annual-video-evidence?year=${testYear}`, adminToken)).data.scopes.find(row => row.department === department);
        assert.strictEqual(annualScope.productionRequired, 1);
        assert.strictEqual(annualScope.externalRequired, 11);
        assert.strictEqual(annualScope.evidenceTotal, 13);
        assert.strictEqual(annualScope.missingEvidenceTotal, 0);
        assert.strictEqual(annualScope.compliant, true, 'Annual Compliance endpoint must match the shared dashboard projection');

        const submitted = await post('ky/unit-contest-entries', unitUserToken, { activityId: activityIds[0] });
        contestIds.push(submitted.data.id);
        assert.strictEqual(submitted.data.ActivityID, activityIds[0]);
        await expectConflict('ky/unit-contest-entries', unitUserToken, { activityId: activityIds[12] }, 'KY_CONTEST_ENTRY_ADMIN_REPLACE_REQUIRED');
        const replaced = await post('ky/unit-contest-entries', adminToken, { activityId: activityIds[12] });
        assert.strictEqual(replaced.data.ActivityID, activityIds[12], 'Admin must be able to replace the Unit representative');
        const showcase = (await request(`ky/video-showcase?year=${testYear}&limit=50`, adminToken)).data;
        assert.deepStrictEqual(showcase.filter(row => row.Department === department).map(row => row.id), [activityIds[12]], 'Showcase must expose only the active Unit representative');

        await post(`ky/${activityIds[12]}/reaction`, adminToken, { reaction: 'useful' });
        const reacted = (await request(`ky/video-showcase?year=${testYear}&limit=50`, adminToken)).data.find(row => row.id === activityIds[12]);
        assert.strictEqual(Number(reacted.UsefulCount), 1, 'existing reactions must work on contest entries');
        const inventoryId = crypto.randomUUID();
        await db.query(`INSERT INTO KY_Video_File_Inventory
            (id,EvidenceYear,ActivityID,Department,ExternalBackupConfirmed,ExternalReference,OriginalFileName,MimeType,FileSize,SHA256,ProductionVideoUrl,ProductionStoredName,Status)
            VALUES (?,?,?,?,1,?,?,?,?,?,?,?,'Verified')`,
        [inventoryId, testYear, activityIds[12], department, '\\\\192.168.124.87\\KYT\\contest.mp4', 'contest.mp4', 'video/mp4', 1234, 'a'.repeat(64), `/uploads/contest-${runId}-12.mp4`, `contest-${runId}-12.mp4`]);
        await expectConflict('ky/video-inventory/delete-production', adminToken, { items: [{ id: inventoryId, rowVersion: 1 }], reason: 'UAT guard' }, 'KY_CONTEST_ENTRY_RETENTION_HOLD');
        const audit = (await request(`ky/unit-contest-entries/${replaced.data.id}/audit`, adminToken)).data;
        assert.ok(audit.some(row => row.Action === 'ENTRY_SUBMITTED') && audit.some(row => row.Action === 'ENTRY_REPLACED'), 'contest audit must retain submit and replace');
        passed = true;
    } finally {
        await cleanup();
        if (embeddedServer) await new Promise(resolve => embeddedServer.close(resolve));
        const [[residue]] = await db.query('SELECT COUNT(*) AS count FROM KY_Annual_Unit_Contest_Entries WHERE EntryYear=? AND Department=?', [testYear, department]);
        assert.strictEqual(Number(residue.count), 0, 'contest UAT must leave zero fixture residue');
        await db.end();
        if (passed) console.log('KY annual compliance + Unit contest API UAT: PASS (distinct 1+11, Pending exclusion, submit/replace, Showcase/Reaction, cleanup guard, zero residue)');
    }
})().catch(error => { console.error(`KY annual compliance + Unit contest API UAT: FAIL - ${error.message}`); process.exitCode = 1; });
