'use strict';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const stamp = `${Date.now()}`.slice(-9);
const marker = `CAI${stamp}`;
const stack = String(process.env.ACCIDENT_UAT_STACK || 'node').toLowerCase();
const port = 6000 + Math.floor(Math.random() * 80);
const origin = `http://127.0.0.1:${port}`;
const year = new Date().getFullYear();
const accidentDate = `${year}-01-15`;
const token = jwt.sign({ id: marker, name: marker, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const requestUrl = route => stack === 'php'
    ? `${origin}/api/index.php?route=${route.slice(1).replace('?', '&')}`
    : `${origin}/api${route}`;
let db;
let server;

async function cleanup() {
    if (!db) return;
    await db.query('DELETE FROM Accident_Reports WHERE CreatedBy=?', [marker]);
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [marker]);
}

async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt++) {
        try {
            const response = await fetch(requestUrl('/health'));
            if (response.status > 0) return;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`${stack} local server did not start`);
}

function injuryForm(bodySide) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
        ReportDate: accidentDate,
        AccidentDate: accidentDate,
        EmployeeID: marker,
        AccidentType: 'First Aid',
        Severity: 'Minor',
        InjuryType: `${marker}_FORM_INJURY`,
        BodyPart: 'เท้า / นิ้วเท้า',
        BodySide: bodySide,
        LostDays: '0',
        Status: 'Open',
    })) form.set(key, value);
    return form;
}

function legacyLostTimeUpdateForm(bodySide) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
        ReportDate: accidentDate,
        AccidentDate: accidentDate,
        EmployeeID: marker,
        AccidentType: 'Lost Time',
        Severity: 'Moderate',
        Description: 'Legacy Lost Time report with zero stored lost days',
        InjuryType: `${marker}_LEGACY_INJURY`,
        BodyPart: 'เท้า / นิ้วเท้า',
        BodySide: bodySide,
        LostDays: '0',
        IsRecordable: '0',
        RootCause: 'Legacy root cause',
        CorrectiveAction: 'Legacy corrective action',
        Status: 'Open',
    })) form.set(key, value);
    return form;
}

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    assert.ok(['node', 'php'].includes(stack), `Unsupported ACCIDENT_UAT_STACK: ${stack}`);
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });
    try { await db.query('ALTER TABLE Accident_Reports ADD COLUMN BodySide VARCHAR(20) NULL AFTER BodyPart'); } catch (_) {}
    await cleanup();
    const [[scope]] = await db.query(
        "SELECT d.Name Department,COALESCE((SELECT u.name FROM master_safetyunits u WHERE u.department_id=d.id ORDER BY u.id LIMIT 1),'') Unit FROM master_departments d ORDER BY d.id LIMIT 1"
    );
    assert.ok(scope?.Department, 'Local onboarding master data needs at least one Department');
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)',
        [marker, marker, scope.Department, scope.Unit, 'User', 'Operator', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );

    const rows = [
        ['First Aid', `${marker}_FIRST_AID`, `${marker}_FOOT`, 'Left', 0],
        ['Medical Treatment', `${marker}_MEDICAL`, `${marker}_HAND`, 'Right', 0],
        ['Near Miss', `${marker}_NEAR_MISS`, `${marker}_NONE`, 'Bilateral', 0],
    ];
    for (const [type, injuryType, bodyPart, bodySide, isRecordable] of rows) {
        await db.query(
            `INSERT INTO Accident_Reports
             (ReportDate,AccidentDate,EmployeeID,Department,AccidentType,Severity,InjuryType,BodyPart,BodySide,LostDays,IsRecordable,Status,CreatedBy,IsDeleted)
             VALUES(?,?,?,?,?,'Minor',?,?,?,0,?,'Open',?,0)`,
            [accidentDate, accidentDate, marker, marker, type, injuryType, bodyPart, bodySide, isRecordable, marker]
        );
    }

    const repoRoot = path.join(__dirname, '..', '..');
    server = stack === 'php'
        ? spawn('C:\\xampp\\php\\php.exe', ['-S', `127.0.0.1:${port}`, '-t', repoRoot], { cwd: repoRoot, env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
        : spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    await waitForServer();

    const response = await fetch(requestUrl(`/accident/analytics?year=${year}`), {
        headers: { Authorization: `Bearer ${token}` },
    });
    const json = await response.json().catch(() => ({}));
    assert.strictEqual(response.status, 200, JSON.stringify(json));
    const injury = new Map((json.data?.injuryTypeStats || []).map(row => [String(row.label), Number(row.cnt)]));
    const body = new Map((json.data?.bodyPartStats || []).map(row => [`${row.bodyPart}|${row.bodySide || ''}`, Number(row.cnt)]));
    assert.strictEqual(injury.get(`${marker}_FIRST_AID`), 1, 'First Aid injury type must be counted');
    assert.strictEqual(injury.get(`${marker}_MEDICAL`), 1, 'Non-recordable Medical Treatment injury type must be counted');
    assert.strictEqual(injury.has(`${marker}_NEAR_MISS`), false, 'Near Miss injury type must be excluded');
    assert.strictEqual(body.get(`${marker}_FOOT|Left`), 1, 'First Aid left-side body part must be counted');
    assert.strictEqual(body.get(`${marker}_HAND|Right`), 1, 'Non-recordable right-side Medical Treatment body part must be counted');
    assert.strictEqual([...body.keys()].some(key => key.startsWith(`${marker}_NONE|`)), false, 'Near Miss body part must be excluded');

    const missingSideResponse = await fetch(requestUrl('/accident/reports'), {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: injuryForm(''),
    });
    const missingSideJson = await missingSideResponse.json().catch(() => ({}));
    assert.strictEqual(missingSideResponse.status, 400, JSON.stringify(missingSideJson));
    assert.match(String(missingSideJson.message || ''), /Body Side|ด้านของร่างกาย/i);

    const createResponse = await fetch(requestUrl('/accident/reports'), {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: injuryForm('Left'),
    });
    const createJson = await createResponse.json().catch(() => ({}));
    assert.strictEqual(createResponse.status, 200, JSON.stringify(createJson));
    assert.ok(Number(createJson.id) > 0, 'Created accident must return an id');
    const detailResponse = await fetch(requestUrl(`/accident/reports/${createJson.id}`), {
        headers: { Authorization: `Bearer ${token}` },
    });
    const detailJson = await detailResponse.json().catch(() => ({}));
    assert.strictEqual(detailResponse.status, 200, JSON.stringify(detailJson));
    assert.strictEqual(detailJson.data?.BodySide, 'Left', 'Created report must persist canonical BodySide');

    const newLostTimeZeroResponse = await fetch(requestUrl('/accident/reports'), {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: legacyLostTimeUpdateForm('Left'),
    });
    const newLostTimeZeroJson = await newLostTimeZeroResponse.json().catch(() => ({}));
    assert.strictEqual(newLostTimeZeroResponse.status, 400, JSON.stringify(newLostTimeZeroJson));
    assert.match(String(newLostTimeZeroJson.message || ''), /Lost Time/i, 'New Lost Time reports with zero lost days must remain rejected');

    const [legacyInsert] = await db.query(
        `INSERT INTO Accident_Reports
         (ReportDate,AccidentDate,EmployeeID,Department,AccidentType,Severity,Description,InjuryType,BodyPart,BodySide,RootCause,CorrectiveAction,LostDays,IsRecordable,Status,CreatedBy,IsDeleted)
         VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?,0,0,'Open',?,0)`,
        [accidentDate, accidentDate, marker, marker, 'Lost Time', 'Moderate', 'Legacy report', `${marker}_LEGACY_INJURY`, 'เท้า / นิ้วเท้า', 'Legacy root cause', 'Legacy corrective action', marker]
    );
    const legacyUpdateResponse = await fetch(requestUrl(`/accident/reports/${legacyInsert.insertId}`), {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: legacyLostTimeUpdateForm('Left'),
    });
    const legacyUpdateJson = await legacyUpdateResponse.json().catch(() => ({}));
    assert.strictEqual(legacyUpdateResponse.status, 200, JSON.stringify(legacyUpdateJson));
    const legacyDetailResponse = await fetch(requestUrl(`/accident/reports/${legacyInsert.insertId}`), {
        headers: { Authorization: `Bearer ${token}` },
    });
    const legacyDetailJson = await legacyDetailResponse.json().catch(() => ({}));
    assert.strictEqual(legacyDetailResponse.status, 200, JSON.stringify(legacyDetailJson));
    assert.strictEqual(legacyDetailJson.data?.BodySide, 'Left', 'Legacy Lost Time edit must persist BodySide');
    assert.strictEqual(Number(legacyDetailJson.data?.LostDays), 0, 'Legacy Lost Time edit must not rewrite historical LostDays');

    console.log(`Accident injury analytics ${stack.toUpperCase()} Local UAT: PASS (BodySide validation/persistence/separation, legacy Lost Time edit, First Aid included, Near Miss excluded)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) server.kill();
    await cleanup().catch(() => {});
    if (db) {
        const [[residue]] = await db.query(
            'SELECT (SELECT COUNT(*) FROM Accident_Reports WHERE CreatedBy=?) + (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) count',
            [marker, marker]
        ).catch(() => [[{ count: -1 }]]);
        console.log(`Accident injury analytics UAT residue: ${Number(residue.count)}`);
        await db.end().catch(() => {});
    }
});
