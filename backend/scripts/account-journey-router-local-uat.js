'use strict';

process.env.EMAIL_ENABLED = 'false';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const db = require('../db');
const app = require('../server');

const stamp = `AJ${Date.now().toString(36).toUpperCase()}`;
const ids = { active: `${stamp}A`, inactive: `${stamp}I`, pending: `${stamp}P`, rejected: `${stamp}R`, approved: `${stamp}D`, fresh: `${stamp}N` };
const allIds = Object.values(ids);
let nodeServer, phpServer;

function guardLocal() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    const name = String(process.env.DB_NAME || '').trim();
    assert(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-loopback DB_HOST: ${host}`);
    assert(/(?:uat|test|local|dev)/i.test(name), `Refusing database without local/test marker: ${name}`);
}
async function call(url, employeeId) {
    const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ EmployeeID: employeeId }) });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : {} };
}
async function waitFor(url) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try { const response = await fetch(url); if (response.status < 500) return; } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Fixture did not start: ${url}`);
}
async function seed() {
    await db.query(`INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword) VALUES
        (?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?)`, [
        ids.active,'Journey Active','Safety','Core','','Officer','User',`$2a$10$${'a'.repeat(53)}`,0,
        ids.inactive,'Journey Inactive','Safety','Core','','Officer','User',null,0,
    ]);
    for (const [employeeId, status] of [[ids.pending,'Pending'],[ids.rejected,'Rejected'],[ids.approved,'Approved']]) {
        await db.query(`INSERT INTO registration_requests(ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,PasswordHash,Status) VALUES(?,?,?,?,?,?,?,?)`, [`REF-${employeeId}`,employeeId,'Journey Request','Safety','Core','Officer','fixture-hash',status]);
    }
}
async function snapshot() {
    const [employees] = await db.query(`SELECT EmployeeID,Password,MustChangePassword FROM Employees WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')}) ORDER BY EmployeeID`,allIds);
    const [requests] = await db.query(`SELECT EmployeeID,Status,PasswordHash FROM registration_requests WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')}) ORDER BY EmployeeID`,allIds);
    return JSON.stringify({ employees, requests });
}
async function verify(label, base) {
    const expected = [
        [ids.active,'LOGIN',false], [ids.inactive,'ACTIVATE',false], [ids.pending,'CHECK_STATUS',true],
        [ids.rejected,'CHECK_STATUS',true], [ids.approved,'CONTACT_ADMIN',false], [ids.fresh,'NEW_REGISTRATION',false],
    ];
    for (const [employeeId, action, requiresReferenceCode] of expected) {
        const response = await call(base, employeeId);
        assert.equal(response.status, 200, `${label} ${employeeId}: ${JSON.stringify(response.json)}`);
        const data = response.json.data;
        assert.equal(data.recommendedAction, action, `${label} action for ${employeeId}`);
        assert.equal(Boolean(data.requiresReferenceCode), requiresReferenceCode, `${label} reference requirement for ${employeeId}`);
        assert.equal(data.personalDataIncluded, false);
        assert.equal(data.businessMutation, false);
        assert.deepEqual(Object.keys(data).sort(), ['allowedActions','businessMutation','contract','employeeId','message','personalDataIncluded','recommendedAction','requiresReferenceCode'].sort());
    }
    console.log(`PASS ${label}: active/inactive/pending/rejected/approved-inconsistent/new routes`);
}
async function cleanup() {
    if (nodeServer) await new Promise(resolve => nodeServer.close(resolve));
    if (phpServer && phpServer.exitCode === null) phpServer.kill();
    await new Promise(resolve => setTimeout(resolve, 250));
    await db.query(`DELETE FROM Admin_AuditLogs WHERE TargetID IN (${allIds.map(()=>'?').join(',')})`,allIds).catch(()=>{});
    await db.query(`DELETE FROM registration_requests WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})`,allIds).catch(()=>{});
    await db.query(`DELETE FROM Employees WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})`,allIds).catch(()=>{});
    const [[residue]] = await db.query(`SELECT (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})) employees,(SELECT COUNT(*) FROM registration_requests WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})) requests`,[...allIds,...allIds]);
    assert.deepEqual([Number(residue.employees),Number(residue.requests)],[0,0]);
    await db.end();
}

(async()=>{
    let failure;
    try {
        guardLocal(); await seed(); const before = await snapshot();
        nodeServer = app.listen(0,'127.0.0.1'); await new Promise((resolve,reject)=>{nodeServer.once('listening',resolve);nodeServer.once('error',reject);});
        const phpPort=19000+Math.floor(Math.random()*500);
        phpServer=spawn(process.env.PHP_BIN||'C:\\xampp\\php\\php.exe',['-d','display_errors=0','-S',`127.0.0.1:${phpPort}`,'-t',path.resolve(__dirname,'..','..')],{env:{...process.env,EMAIL_ENABLED:'false'},stdio:'ignore',windowsHide:true});
        await waitFor(`http://127.0.0.1:${phpPort}/api/index.php?route=register/options`);
        await verify('node',`http://127.0.0.1:${nodeServer.address().port}/api/account/journey`);
        await verify('php',`http://127.0.0.1:${phpPort}/api/index.php?route=account/journey`);
        assert.equal(await snapshot(),before,'Journey resolution mutated Employee Master or registration requests');
        const [[audits]]=await db.query(`SELECT COUNT(*) total FROM Admin_AuditLogs WHERE Action='ACCOUNT_JOURNEY_RESOLVED' AND TargetID IN (${allIds.map(()=>'?').join(',')})`,allIds);
        assert.equal(Number(audits.total),12,'Every Node/PHP resolution must be audited');
        console.log('Account Journey Router Node/PHP local UAT: PASS (read-only business data, 12 audited resolutions)');
    } catch(error) { failure=error; console.error(error.stack||error); }
    try { await cleanup(); console.log('CLEANUP PASS: zero Employee/registration residue'); } catch(error) { failure=failure||error; console.error(error.stack||error); }
    if(failure) process.exitCode=1;
})();
