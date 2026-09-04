'use strict';

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
// UAT verifies outbox creation only. Never deliver real email.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const db = require('../db');
const { deleteLocalUpload } = require('../storage');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');

const run = Date.now().toString().slice(-11);
const adminId = `C1A${run}`;
const userId = `C1U${run}`;
const otherId = `C1O${run}`;
const department = 'SAFETY HEALTH & ENVIRONMENT SEC.';
const created = [];
let assignmentId = null;
let delegationId = null;
let server;

function token(id, name, role) {
    return jwt.sign({ id, EmployeeID:id, name, EmployeeName:name, role, department }, process.env.JWT_SECRET, { expiresIn:'20m' });
}

async function api(base, route, { method='GET', auth, form, body, expect=200 }={}) {
    const headers = auth ? { Authorization:`Bearer ${auth}` } : {};
    let payload = form;
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const response = await fetch(`${base}${route}`, { method, headers, body:payload });
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw:text }; }
    assert.strictEqual(response.status, expect, `${method} ${route}: ${response.status} ${json.message || text}`);
    return json;
}

function excelForm(assigneeId, marker) {
    const form = new FormData();
    form.set('AssigneeID', assigneeId);
    form.set('DocumentMode', 'excel_review');
    form.set('JobArea', marker);
    form.set('SubmitDate', new Date().toISOString().slice(0, 10));
    form.set('Summary', marker);
    form.set('StopType', '6');
    form.set('Rank', 'C');
    form.set('FormFile', new Blob(['C1,C2\nUAT,1\n'], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${marker}.xlsx`);
    return form;
}

async function cleanup() {
    if (created.length) {
        const placeholders = created.map(() => '?').join(',');
        const [rows] = await db.query(`SELECT FileUrl,ExcelFileUrl,SignedFileUrl FROM CCCF_FormA_Permanent WHERE id IN (${placeholders})`, created).catch(() => [[]]);
        for (const row of rows) {
            for (const value of new Set([row.FileUrl,row.ExcelFileUrl,row.SignedFileUrl].filter(Boolean))) {
                try { deleteLocalUpload(value); } catch (_) {}
            }
        }
        await db.query(`DELETE FROM CCCF_EmailOutbox WHERE PermanentID IN (${placeholders})`, created).catch(() => {});
        await db.query(`DELETE FROM Admin_AuditLogs WHERE TargetType='CCCF_FormA_Permanent' AND TargetID IN (${placeholders})`, created.map(String)).catch(() => {});
        await db.query(`DELETE FROM CCCF_FormA_Permanent WHERE id IN (${placeholders})`, created).catch(() => {});
    }
    if (delegationId) {
        await db.query("DELETE FROM Admin_AuditLogs WHERE TargetType='CCCF_Submit_Delegations' AND TargetID=?", [String(delegationId)]).catch(() => {});
        await db.query('DELETE FROM CCCF_Submit_Delegations WHERE id=?', [delegationId]).catch(() => {});
    }
    if (assignmentId) {
        await db.query("DELETE FROM Admin_AuditLogs WHERE TargetType='CCCF_Assignments' AND TargetID=?", [String(assignmentId)]).catch(() => {});
        await db.query('DELETE FROM CCCF_Assignments WHERE id=?', [assignmentId]).catch(() => {});
    }
    await db.query(
        "DELETE FROM CCCF_EmailOutbox WHERE EventType='Assigned' AND Recipients IN (?, ?, ?)",
        [`uat-${run}-admin@thaisummit-harness.co.th`, `uat-${run}-user@thaisummit-harness.co.th`, `uat-${run}-other@thaisummit-harness.co.th`]
    ).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID IN (?,?,?)', [adminId,userId,otherId]).catch(() => {});
    const [[remaining]] = await db.query(
        `SELECT
          (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (?,?,?)) employees,
          (SELECT COUNT(*) FROM CCCF_FormA_Permanent WHERE id IN (${created.length ? created.map(() => '?').join(',') : 'NULL'})) records,
          (SELECT COUNT(*) FROM CCCF_Assignments WHERE id=?) assignments,
          (SELECT COUNT(*) FROM CCCF_Submit_Delegations WHERE id=?) delegations,
          (SELECT COUNT(*) FROM Admin_AuditLogs WHERE (TargetType='CCCF_Assignments' AND TargetID=?) OR (TargetType='CCCF_Submit_Delegations' AND TargetID=?)) audits`,
        [adminId,userId,otherId,...created,assignmentId || 0,delegationId || 0,String(assignmentId || 0),String(delegationId || 0)]
    ).catch(() => [[{ employees:-1,records:-1 }]]);
    console.log(`CCCF C1-C4 API cleanup: employees=${remaining.employees}, records=${remaining.records}, assignments=${remaining.assignments}, delegations=${remaining.delegations}, audits=${remaining.audits}`);
    assert.deepStrictEqual([Number(remaining.employees),Number(remaining.records),Number(remaining.assignments),Number(remaining.delegations),Number(remaining.audits)],[0,0,0,0,0]);
}

(async()=>{
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    await ensureEmployeeCompanyEmailColumn(db);
    const password = await bcrypt.hash(`C1-${run}`, 4);
    for (const row of [
        [adminId,'CODX CCCF C1 Admin',department,'C1 UAT','Tester','Admin',`uat-${run}-admin@thaisummit-harness.co.th`,password,0],
        [userId,'CODX CCCF C1 User',department,'C1 UAT','Tester','User',`uat-${run}-user@thaisummit-harness.co.th`,password,0],
        [otherId,'CODX CCCF C1 Other',department,'C1 UAT','Tester','User',`uat-${run}-other@thaisummit-harness.co.th`,password,0],
    ]) await db.query('INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Position,Role,CompanyEmail,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,?,?)',row);

    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const adminToken=token(adminId,'CODX CCCF C1 Admin','Admin');
    const userToken=token(userId,'CODX CCCF C1 User','User');

    const forgedMarker=`C1-FORGED-${run}`;
    await api(base,'/cccf/form-a-permanent',{method:'POST',auth:userToken,form:excelForm(otherId,forgedMarker),expect:403});
    const assignment = await api(base, '/cccf/assignments', { method:'POST', auth:adminToken, body:{ EmployeeID:otherId, AllowDirectSignedPdf:0, Note:'C1-C4 UAT' } });
    assignmentId = Number(assignment.id);
    const delegation = await api(base, '/cccf/delegations', { method:'POST', auth:adminToken, body:{ OwnerEmployeeID:otherId, DelegateEmployeeID:userId } , expect:201 });
    delegationId = Number(delegation.data.id);
    // Submission endpoint repeats the authorization check server-side; route-level
    // list filtering is covered by the static parity contract and browser UAT.
    const forged=await api(base,'/cccf/form-a-permanent',{method:'POST',auth:userToken,form:excelForm(otherId,forgedMarker)});
    created.push(Number(forged.id));
    const rows=await api(base,'/cccf/form-a-permanent',{auth:adminToken});
    const forgedRow=(Array.isArray(rows)?rows:rows.data||[]).find(row=>Number(row.id)===Number(forged.id));
    assert.strictEqual(String(forgedRow.AssigneeID),otherId,'Delegated submission must retain the assigned form owner');
    assert.strictEqual(String(forgedRow.SubmitterName),'CODX CCCF C1 Other');
    assert.strictEqual(String(forgedRow.SubmittedByEmployeeID),userId,'Audit must retain the authenticated delegate');
    assert.strictEqual(String(forgedRow.SubmittedByName),'CODX CCCF C1 User');

    await api(base,`/cccf/form-a-permanent/${forged.id}/review`,{method:'POST',auth:adminToken,body:{ReviewStatus:'Rejected',ReviewComment:''},expect:400});
    const comment=`Approved C1-C3 ${run}`;
    const first=await api(base,`/cccf/form-a-permanent/${forged.id}/review`,{method:'POST',auth:adminToken,body:{ReviewStatus:'Approved',ReviewComment:comment}});
    assert.strictEqual(first.success,true);
    const retry=await api(base,`/cccf/form-a-permanent/${forged.id}/review`,{method:'POST',auth:adminToken,body:{ReviewStatus:'Approved',ReviewComment:comment}});
    assert.strictEqual(retry.alreadyReviewed,true,'Identical retry must be idempotent');
    await api(base,`/cccf/form-a-permanent/${forged.id}/review`,{method:'POST',auth:adminToken,body:{ReviewStatus:'Rejected',ReviewComment:'stale'},expect:409});

    const adminMarker=`C1-ADMIN-BEHALF-${run}`;
    const adminCreated=await api(base,'/cccf/form-a-permanent',{method:'POST',auth:adminToken,form:excelForm(otherId,adminMarker)});
    created.push(Number(adminCreated.id));
    const updatedRows=await api(base,'/cccf/form-a-permanent',{auth:adminToken});
    const adminRow=(Array.isArray(updatedRows)?updatedRows:updatedRows.data||[]).find(row=>Number(row.id)===Number(adminCreated.id));
    assert.strictEqual(String(adminRow.AssigneeID),otherId,'Admin submit-on-behalf must retain selected EmployeeID');
    assert.strictEqual(String(adminRow.SubmitterName),'CODX CCCF C1 Other');
    await api(base,`/cccf/form-a-permanent/${adminCreated.id}`,{method:'PUT',auth:adminToken,body:{JobArea:adminMarker,SubmitDate:new Date().toISOString().slice(0,10),Summary:`Updated ${adminMarker}`,StopType:6,Rank:'C'}});
    const afterOwnerlessUpdate=await api(base,'/cccf/form-a-permanent',{auth:adminToken});
    const preservedOwner=(Array.isArray(afterOwnerlessUpdate)?afterOwnerlessUpdate:afterOwnerlessUpdate.data||[]).find(row=>Number(row.id)===Number(adminCreated.id));
    assert.strictEqual(String(preservedOwner.AssigneeID),otherId,'Admin update without an owner field must retain the persisted owner');

    const [events]=await db.query("SELECT EventType FROM CCCF_EmailOutbox WHERE PermanentID=? AND EventType='Approved'",[forged.id]);
    assert.strictEqual(events.length,1,'Identical review retry must not create a duplicate outbox event');
    const [delegateEvents] = await db.query("SELECT EventType FROM CCCF_EmailOutbox WHERE PermanentID=? AND EventType='SubmittedByAdmin'", [forged.id]);
    assert.strictEqual(delegateEvents.length,1,'Delegated owner notification must reuse the existing outbox event/template');
    await api(base, `/cccf/delegations/${delegationId}`, { method:'PUT', auth:adminToken, body:{ IsActive:false } });
    await api(base,'/cccf/form-a-permanent',{method:'POST',auth:userToken,form:excelForm(otherId,`C1-DISABLED-${run}`),expect:403});
    console.log('CCCF Phase C1-C3 API authorization/review lifecycle UAT: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));
    try{await cleanup();}catch(error){console.error(error.stack||error);process.exitCode=1;}
    await db.end().catch(()=>{});
});
