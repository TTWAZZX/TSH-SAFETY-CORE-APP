'use strict';

const assert = require('assert');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const stack = String(process.env.FOURM_UAT_STACK || 'node').toLowerCase();
const port = 5720 + Math.floor(Math.random() * 100);
const origin = `http://127.0.0.1:${port}`;
const marker = `CODX_4M_EDIT_${Date.now()}`;
const employeeId = `F4${String(Date.now()).slice(-12)}`;
const curriculumId = randomUUID();
const conflictId = randomUUID();
const courseId = randomUUID();
const assignmentId = randomUUID();
const courseAssignmentId = randomUUID();
let db;
let server;

const requestUrl = route => stack === 'php'
    ? `${origin}/api/index.php?route=${route.slice(1).replace('?', '&')}`
    : `${origin}/api${route}`;

async function request(method, route, token, body) {
    const response = await fetch(requestUrl(route), {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
}

async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(requestUrl('/health'));
            if (response.status > 0) return;
        } catch (_) { /* server still starting */ }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Local server did not start.');
}

async function cleanup() {
    if (!db) return;
    const [rows] = await db.query('SELECT id FROM FourM_Curriculums WHERE Department=? OR id IN (?,?)', [marker, curriculumId, conflictId]).catch(() => [[]]);
    const ids = rows.map(row => row.id);
    if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        await db.query(`DELETE FROM FourM_CourseEmployees WHERE CourseID IN (SELECT id FROM FourM_Courses WHERE CurriculumID IN (${placeholders}))`, ids).catch(() => {});
        await db.query(`DELETE FROM FourM_CurriculumEmployees WHERE CurriculumID IN (${placeholders})`, ids).catch(() => {});
        await db.query(`DELETE FROM FourM_CurriculumLogs WHERE CurriculumID IN (${placeholders})`, ids).catch(() => {});
        await db.query(`DELETE FROM FourM_Courses WHERE CurriculumID IN (${placeholders})`, ids).catch(() => {});
        await db.query(`DELETE FROM FourM_Curriculums WHERE id IN (${placeholders})`, ids).catch(() => {});
    }
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });
    await cleanup();
    const [[scope]] = await db.query(`
        SELECT d.Name AS Department,
               COALESCE((SELECT u.name FROM Master_SafetyUnits u WHERE u.department_id=d.id ORDER BY u.id LIMIT 1),'') AS Unit
          FROM Master_Departments d
         ORDER BY d.id
         LIMIT 1
    `);
    assert.ok(scope?.Department, 'A local Master Department is required for the UAT fixture');
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)',
        [employeeId, marker, scope.Department, scope.Unit, 'Admin', 'Manager', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );
    await db.query(
        'INSERT INTO FourM_Curriculums (id, `Year`, Department, CurriculumCode, CurriculumTitle, Notes, IsActive) VALUES (?, 2026, ?, ?, ?, NULL, 1), (?, 2026, ?, ?, ?, NULL, 1)',
        [curriculumId, marker, `${marker}-A`, 'Original title', conflictId, marker, `${marker}-B`, 'Conflict title']
    );
    await db.query(
        'INSERT INTO FourM_Courses (id,CurriculumID,CourseCode,CourseTitle,SortOrder,IsActive) VALUES (?,?,?,?,1,1)',
        [courseId, curriculumId, `${marker}-COURSE`, 'Preserved course']
    );
    await db.query(
        "INSERT INTO FourM_CurriculumEmployees (id,CurriculumID,EmployeeID,EmployeeName,Department,Position,Status) VALUES (?,?,?,?,?,?,'Assigned')",
        [assignmentId, curriculumId, employeeId, marker, marker, 'Manager']
    );
    await db.query(
        "INSERT INTO FourM_CourseEmployees (id,CourseID,EmployeeID,EmployeeName,Department,Position,Status) VALUES (?,?,?,?,?,?,'Assigned')",
        [courseAssignmentId, courseId, employeeId, marker, marker, 'Manager']
    );

    const repoRoot = path.join(__dirname, '..', '..');
    server = stack === 'php'
        ? spawn('C:\\xampp\\php\\php.exe', ['-S', `127.0.0.1:${port}`, '-t', repoRoot], { cwd: repoRoot, env: process.env, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true })
        : spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    await waitForServer();
    const token = jwt.sign({ id: employeeId, name: marker, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '20m' });
    const nonAdminToken = jwt.sign({ id: employeeId, name: marker, role: 'User', department: marker }, process.env.JWT_SECRET, { expiresIn: '20m' });
    const [indexes] = await db.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME)=LOWER('FourM_Curriculums') AND INDEX_NAME IN ('uq_fourm_curriculum_active','uq_fourm_curriculum','uq_cur')");
    assert.deepStrictEqual(indexes.map(row => row.INDEX_NAME), ['uq_fourm_curriculum_active'], 'Only the active-scope unique index may remain');

    const unchanged = await request('PUT', `/fourm/training-curriculums/${curriculumId}`, token, {
        Year: 2026, Department: marker, CurriculumCode: `${marker}-A`, CurriculumTitle: 'Original title', Notes: '',
    });
    assert.strictEqual(unchanged.status, 200, JSON.stringify(unchanged.json));
    assert.strictEqual(unchanged.json.data?.unchanged, true, 'No-op edit must succeed without a false duplicate conflict');
    let [[audit]] = await db.query('SELECT COUNT(*) count FROM FourM_CurriculumLogs WHERE CurriculumID=?', [curriculumId]);
    assert.strictEqual(Number(audit.count), 0, 'No-op edit must not create a misleading audit row');

    const changed = await request('PUT', `/fourm/training-curriculums/${curriculumId}`, token, {
        Year: 2026, Department: marker, CurriculumCode: `${marker}-A2`, CurriculumTitle: 'Edited title', Notes: 'Edited by lifecycle UAT',
    });
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.json));
    const [[saved]] = await db.query('SELECT CurriculumCode,CurriculumTitle,Notes FROM FourM_Curriculums WHERE id=?', [curriculumId]);
    assert.deepStrictEqual(saved, { CurriculumCode: `${marker}-A2`, CurriculumTitle: 'Edited title', Notes: 'Edited by lifecycle UAT' });
    [[audit]] = await db.query("SELECT COUNT(*) count FROM FourM_CurriculumLogs WHERE CurriculumID=? AND Action='CURRICULUM_UPDATE'", [curriculumId]);
    assert.strictEqual(Number(audit.count), 1, 'Changed edit must create one immutable audit row');

    const duplicate = await request('PUT', `/fourm/training-curriculums/${curriculumId}`, token, {
        Year: 2026, Department: marker, CurriculumCode: `${marker}-B`, CurriculumTitle: 'Must not save', Notes: '',
    });
    assert.strictEqual(duplicate.status, 409, JSON.stringify(duplicate.json));
    assert.strictEqual(duplicate.json.code, 'FOURM_DUPLICATE');
    const [[preserved]] = await db.query('SELECT CurriculumCode,CurriculumTitle FROM FourM_Curriculums WHERE id=?', [curriculumId]);
    assert.deepStrictEqual(preserved, { CurriculumCode: `${marker}-A2`, CurriculumTitle: 'Edited title' });

    const disabled = await request('DELETE', `/fourm/training-curriculums/${curriculumId}`, token);
    assert.strictEqual(disabled.status, 200, JSON.stringify(disabled.json));
    let [[disabledRow]] = await db.query('SELECT IsActive,ActiveScopeKey FROM FourM_Curriculums WHERE id=?', [curriculumId]);
    assert.strictEqual(Number(disabledRow.IsActive), 0);
    assert.strictEqual(disabledRow.ActiveScopeKey, null, 'Disabled curriculum must release its active uniqueness key');
    let [[preservedLinks]] = await db.query(`SELECT
        (SELECT COUNT(*) FROM FourM_Courses WHERE CurriculumID=?) courseCount,
        (SELECT COUNT(*) FROM FourM_CurriculumEmployees WHERE CurriculumID=? AND Status='Assigned') assignmentCount,
        (SELECT COUNT(*) FROM FourM_CourseEmployees WHERE CourseID=? AND Status='Assigned') courseAssignmentCount`, [curriculumId, curriculumId, courseId]);
    assert.deepStrictEqual({ courseCount: Number(preservedLinks.courseCount), assignmentCount: Number(preservedLinks.assignmentCount), courseAssignmentCount: Number(preservedLinks.courseAssignmentCount) }, { courseCount: 1, assignmentCount: 1, courseAssignmentCount: 1 });

    const defaultList = await request('GET', `/fourm/training-curriculums?year=2026&dept=${encodeURIComponent(marker)}`, token);
    assert.strictEqual(defaultList.status, 200, JSON.stringify(defaultList.json));
    assert.ok(!defaultList.json.data.some(row => row.id === curriculumId), 'Default list must hide disabled curriculum');
    const archiveList = await request('GET', `/fourm/training-curriculums?year=2026&dept=${encodeURIComponent(marker)}&includeInactive=1`, token);
    assert.strictEqual(archiveList.status, 200, JSON.stringify(archiveList.json));
    const archivedCurriculum = archiveList.json.data.find(row => row.id === curriculumId);
    assert.ok(archivedCurriculum && Number(archivedCurriculum.IsActive) === 0, 'Admin archive view must include disabled curriculum');
    assert.strictEqual(Number(archivedCurriculum.TotalCourseCount), 1, 'Admin archive view must retain the archived course count');
    const archivedCourses = await request('GET', `/fourm/training-curriculums/${curriculumId}/courses?includeInactive=1`, token);
    assert.strictEqual(archivedCourses.status, 200, JSON.stringify(archivedCourses.json));
    assert.ok(archivedCourses.json.data.some(row => row.id === courseId && Number(row.IsActive) === 0), 'Archived course ID must remain inspectable');
    const nonAdminArchive = await request('GET', `/fourm/training-curriculums?year=2026&includeInactive=1`, nonAdminToken);
    assert.strictEqual(nonAdminArchive.status, 200, JSON.stringify(nonAdminArchive.json));
    assert.ok(!nonAdminArchive.json.data.some(row => row.id === curriculumId), 'Non-Admin must not expose disabled curriculums through includeInactive');
    const statusBypass = await request('PUT', `/fourm/training-curriculums/${curriculumId}`, token, {
        Year: 2026, Department: marker, CurriculumCode: `${marker}-A2`, CurriculumTitle: 'Archived title', IsActive: 1,
    });
    assert.strictEqual(statusBypass.status, 400, JSON.stringify(statusBypass.json));
    assert.strictEqual(statusBypass.json.code, 'FOURM_CURRICULUM_STATUS_ACTION_REQUIRED', 'Reactivate must not be bypassed through generic edit');

    const reused = await request('POST', '/fourm/training-curriculums', token, {
        Year: 2026, Department: marker, CurriculumCode: `${marker}-A2`, CurriculumTitle: 'Replacement active curriculum', Notes: '',
    });
    assert.strictEqual(reused.status, 201, JSON.stringify(reused.json));
    const reusedId = reused.json.data?.id;
    assert.ok(reusedId && reusedId !== curriculumId, 'Reused active code must create a distinct curriculum ID');

    const bulkOptions = { year: 2026, department: marker, find: '-A2', replace: '-A3', activeOnly: false };
    const bulkPreview = await request('POST', '/fourm/training-curriculums/bulk-code-preview', token, bulkOptions);
    assert.strictEqual(bulkPreview.status, 200, JSON.stringify(bulkPreview.json));
    assert.strictEqual(Number(bulkPreview.json.data?.readyCount), 2, 'Bulk Code must permit the Active and Disabled rows to retain the same resulting code');
    assert.strictEqual(Number(bulkPreview.json.data?.conflictCount), 0);
    const expectedChanges = bulkPreview.json.data.rows.map(row => ({ id: row.id, oldCode: row.oldCode, newCode: row.newCode }));
    const bulkUpdate = await request('PUT', '/fourm/training-curriculums/bulk-code', token, { ...bulkOptions, expectedChanges });
    assert.strictEqual(bulkUpdate.status, 200, JSON.stringify(bulkUpdate.json));
    const [bulkSaved] = await db.query('SELECT id,CurriculumCode,IsActive,ActiveScopeKey FROM FourM_Curriculums WHERE id IN (?,?) ORDER BY IsActive DESC', [curriculumId, reusedId]);
    assert.ok(bulkSaved.every(row => row.CurriculumCode === `${marker}-A3`), 'Bulk Code must update both Active and Disabled rows');
    assert.strictEqual(bulkSaved.filter(row => Number(row.IsActive) === 1 && /^[a-f0-9]{64}$/.test(String(row.ActiveScopeKey || ''))).length, 1);
    assert.strictEqual(bulkSaved.filter(row => Number(row.IsActive) === 0 && row.ActiveScopeKey === null).length, 1);

    const blockedReactivate = await request('POST', `/fourm/training-curriculums/${curriculumId}/reactivate`, token, {});
    assert.strictEqual(blockedReactivate.status, 409, JSON.stringify(blockedReactivate.json));
    assert.strictEqual(blockedReactivate.json.code, 'FOURM_DUPLICATE');

    const editArchived = await request('PUT', `/fourm/training-curriculums/${curriculumId}`, token, {
        Year: 2026, Department: marker, CurriculumCode: `${marker}-A3`, CurriculumTitle: 'Archived title edited safely', Notes: 'Archive remains disabled',
    });
    assert.strictEqual(editArchived.status, 200, JSON.stringify(editArchived.json));
    [[disabledRow]] = await db.query('SELECT IsActive,ActiveScopeKey,CurriculumTitle FROM FourM_Curriculums WHERE id=?', [curriculumId]);
    assert.strictEqual(Number(disabledRow.IsActive), 0);
    assert.strictEqual(disabledRow.ActiveScopeKey, null);
    assert.strictEqual(disabledRow.CurriculumTitle, 'Archived title edited safely');

    const disableReplacement = await request('DELETE', `/fourm/training-curriculums/${reusedId}`, token);
    assert.strictEqual(disableReplacement.status, 200, JSON.stringify(disableReplacement.json));
    const reactivated = await request('POST', `/fourm/training-curriculums/${curriculumId}/reactivate`, token, {});
    assert.strictEqual(reactivated.status, 200, JSON.stringify(reactivated.json));
    assert.strictEqual(Number(reactivated.json.data?.restoredCourseCount), 1);
    const [[restored]] = await db.query('SELECT IsActive,ActiveScopeKey FROM FourM_Curriculums WHERE id=?', [curriculumId]);
    assert.strictEqual(Number(restored.IsActive), 1);
    assert.match(String(restored.ActiveScopeKey || ''), /^[a-f0-9]{64}$/);
    const [[restoredCourse]] = await db.query('SELECT IsActive FROM FourM_Courses WHERE id=?', [courseId]);
    assert.strictEqual(Number(restoredCourse.IsActive), 1, 'Reactivation must restore the preserved course ID');
    [[preservedLinks]] = await db.query("SELECT COUNT(*) assignmentCount FROM FourM_CurriculumEmployees WHERE id=? AND CurriculumID=? AND Status='Assigned'", [assignmentId, curriculumId]);
    assert.strictEqual(Number(preservedLinks.assignmentCount), 1, 'Reactivation must preserve the existing assignment ID and status');
    const [[preservedCourseAssignment]] = await db.query("SELECT COUNT(*) assignmentCount FROM FourM_CourseEmployees WHERE id=? AND CourseID=? AND Status='Assigned'", [courseAssignmentId, courseId]);
    assert.strictEqual(Number(preservedCourseAssignment.assignmentCount), 1, 'Reactivation must preserve course-level employee history');
    [[audit]] = await db.query("SELECT COUNT(*) count FROM FourM_CurriculumLogs WHERE CurriculumID=? AND Action IN ('CURRICULUM_DISABLE','CURRICULUM_REACTIVATE')", [curriculumId]);
    assert.strictEqual(Number(audit.count), 2, 'Disable and Reactivate must each retain immutable audit evidence');

    console.log(`4M curriculum soft-disable ${stack.toUpperCase()} Local API UAT: PASS (edit, active-only uniqueness, archive view, reuse, reactivate, links, audit)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) server.kill();
    await cleanup().catch(() => {});
    if (db) {
        const [[residue]] = await db.query("SELECT (SELECT COUNT(*) FROM FourM_Curriculums WHERE Department=?) + (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) + (SELECT COUNT(*) FROM FourM_Courses WHERE id=?) + (SELECT COUNT(*) FROM FourM_CurriculumEmployees WHERE id=?) + (SELECT COUNT(*) FROM FourM_CourseEmployees WHERE id=?) count", [marker, employeeId, courseId, assignmentId, courseAssignmentId]).catch(() => [[{ count: -1 }]]);
        console.log(`4M curriculum edit UAT residue: ${Number(residue.count)}`);
        await db.end().catch(() => {});
    }
});
