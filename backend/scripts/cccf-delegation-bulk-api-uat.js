'use strict';

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path:path.join(__dirname,'..','.env'), quiet:true });
process.env.SMTP_HOST=''; process.env.SMTP_USER=''; process.env.SMTP_PASS='';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const db = require('../db');

const run=Date.now().toString().slice(-10);
const ids={admin:`CDA${run}`,delegate:`CDD${run}`,ownerA:`CD1${run}`,ownerB:`CD2${run}`,ownerC:`CD3${run}`,unassigned:`CDU${run}`};
const employeeIds=Object.values(ids);
const assignmentIds=[];
const delegationIds=[];
const deptA='SAFETY HEALTH & ENVIRONMENT SEC.';
const deptB='MAINTENANCE SEC.';
const unitA=`CCCF UNIT A ${run}`;
const unitB=`CCCF UNIT B ${run}`;
let server;

const token=(id,name,role,department)=>jwt.sign({id,EmployeeID:id,name,EmployeeName:name,role,department},process.env.JWT_SECRET,{expiresIn:'15m'});
async function api(base,route,{method='GET',auth,body,expect=200}={}){
    const headers={Authorization:`Bearer ${auth}`};let payload;
    if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
    const response=await fetch(`${base}${route}`,{method,headers,body:payload});
    const text=await response.text();let json={};try{json=text?JSON.parse(text):{};}catch{json={raw:text};}
    assert.strictEqual(response.status,expect,`${method} ${route}: ${response.status} ${json.message||text}`);
    return json;
}

async function cleanup(){
    if(delegationIds.length){const marks=delegationIds.map(()=>'?').join(',');await db.query(`DELETE FROM Admin_AuditLogs WHERE TargetType='CCCF_Submit_Delegations' AND TargetID IN (${marks})`,delegationIds.map(String)).catch(()=>{});}
    await db.query('DELETE FROM CCCF_Submit_Delegations WHERE DelegateEmployeeID=?',[ids.delegate]).catch(()=>{});
    if(assignmentIds.length)await db.query(`DELETE FROM CCCF_Assignments WHERE id IN (${assignmentIds.map(()=>'?').join(',')})`,assignmentIds).catch(()=>{});
    await db.query(`DELETE FROM Employees WHERE EmployeeID IN (${employeeIds.map(()=>'?').join(',')})`,employeeIds).catch(()=>{});
    const [[remaining]]=await db.query(`SELECT
      (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (${employeeIds.map(()=>'?').join(',')})) employees,
      (SELECT COUNT(*) FROM CCCF_Assignments WHERE EmployeeID IN (${employeeIds.map(()=>'?').join(',')})) assignments,
      (SELECT COUNT(*) FROM CCCF_Submit_Delegations WHERE DelegateEmployeeID=?) delegations`,[...employeeIds,...employeeIds,ids.delegate]);
    assert.deepStrictEqual([Number(remaining.employees),Number(remaining.assignments),Number(remaining.delegations)],[0,0,0]);
    console.log('CCCF bulk delegation cleanup: employees=0, assignments=0, delegations=0');
}

(async()=>{
    assert.ok(process.env.JWT_SECRET,'JWT_SECRET is required');
    const password=await bcrypt.hash(`CD-${run}`,4);
    const rows=[
        [ids.admin,'CODX Delegation Admin',deptA,unitA,'Admin'],[ids.delegate,'CODX Delegation Delegate',deptA,unitA,'User'],
        [ids.ownerA,'CODX Delegation Owner A',deptA,unitA,'User'],[ids.ownerB,'CODX Delegation Owner B',deptA,unitB,'User'],
        [ids.ownerC,'CODX Delegation Owner C',deptB,unitA,'User'],[ids.unassigned,'CODX Delegation Unassigned',deptA,unitA,'User'],
    ];
    for(const [id,name,department,unit,role] of rows)await db.query('INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Position,Role,CompanyEmail,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,?,0)',[id,name,department,unit,'Tester',role,`${id.toLowerCase()}@example.invalid`,password]);
    for(const ownerId of [ids.ownerA,ids.ownerB,ids.ownerC]){const [result]=await db.query('INSERT INTO CCCF_Assignments(EmployeeID,AssigneeName,Department,AllowDirectSignedPdf,CreatedBy) SELECT EmployeeID,EmployeeName,Department,0,? FROM Employees WHERE EmployeeID=?',['CCCF bulk delegation UAT',ownerId]);assignmentIds.push(Number(result.insertId));}

    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const adminToken=token(ids.admin,'CODX Delegation Admin','Admin',deptA);
    const delegateToken=token(ids.delegate,'CODX Delegation Delegate','User',deptA);

    const individual=await api(base,'/cccf/delegations',{method:'POST',auth:adminToken,body:{ScopeType:'individual',OwnerEmployeeIDs:[ids.ownerA,ids.ownerC],DelegateEmployeeID:ids.delegate},expect:201});
    assert.strictEqual(Number(individual.data.OwnerCount),2);
    delegationIds.push(...individual.data.rows.map(row=>Number(row.id)));
    let visible=await api(base,'/cccf/delegations',{auth:delegateToken});
    assert.deepStrictEqual(new Set(visible.data.map(row=>String(row.OwnerEmployeeID))),new Set([ids.ownerA,ids.ownerC]));
    for(const row of individual.data.rows)await api(base,`/cccf/delegations/${row.id}`,{method:'PUT',auth:adminToken,body:{IsActive:false}});

    const department=await api(base,'/cccf/delegations',{method:'POST',auth:adminToken,body:{ScopeType:'department',OwnerDepartment:deptA,DelegateEmployeeID:ids.delegate},expect:201});
    assert.ok(Number(department.data.OwnerCount)>=2,'Department scope must include both UAT assigned owners');
    delegationIds.push(...department.data.rows.map(row=>Number(row.id)));
    visible=await api(base,'/cccf/delegations',{auth:delegateToken});
    const visibleOwners=new Set(visible.data.map(row=>String(row.OwnerEmployeeID)));
    assert.ok(visibleOwners.has(ids.ownerA)&&visibleOwners.has(ids.ownerB),'Department scope must include assigned owners in the selected Department');
    assert.ok(!visibleOwners.has(ids.ownerC)&&!visibleOwners.has(ids.unassigned)&&!visibleOwners.has(ids.delegate),'Department scope must exclude other Departments, unassigned employees and delegate self');
    const [wrongScope]=await db.query(`SELECT d.OwnerEmployeeID FROM CCCF_Submit_Delegations d INNER JOIN Employees e ON e.EmployeeID=d.OwnerEmployeeID LEFT JOIN CCCF_Assignments a ON a.EmployeeID=d.OwnerEmployeeID WHERE d.DelegateEmployeeID=? AND d.IsActive=1 AND (TRIM(e.Department)<>? OR a.id IS NULL OR d.OwnerEmployeeID=?)`,[ids.delegate,deptA,ids.delegate]);
    assert.strictEqual(wrongScope.length,0,'Every Department grant must remain assignment-bound and Department-scoped');
    for(const row of department.data.rows)await api(base,`/cccf/delegations/${row.id}`,{method:'PUT',auth:adminToken,body:{IsActive:false}});

    const unit=await api(base,'/cccf/delegations',{method:'POST',auth:adminToken,body:{ScopeType:'unit',OwnerDepartment:deptA,OwnerUnit:unitA,DelegateEmployeeID:ids.delegate},expect:201});
    assert.strictEqual(Number(unit.data.OwnerCount),1,'Unit scope must include only the assigned owner in the selected Department and Unit');
    assert.strictEqual(unit.data.OwnerDepartment,deptA);
    assert.strictEqual(unit.data.OwnerUnit,unitA);
    delegationIds.push(...unit.data.rows.map(row=>Number(row.id)));
    visible=await api(base,'/cccf/delegations',{auth:delegateToken});
    assert.deepStrictEqual(new Set(visible.data.map(row=>String(row.OwnerEmployeeID))),new Set([ids.ownerA]));
    const [wrongUnitScope]=await db.query(`SELECT d.OwnerEmployeeID FROM CCCF_Submit_Delegations d INNER JOIN Employees e ON e.EmployeeID=d.OwnerEmployeeID LEFT JOIN CCCF_Assignments a ON a.EmployeeID=d.OwnerEmployeeID WHERE d.DelegateEmployeeID=? AND d.IsActive=1 AND (TRIM(e.Department)<>? OR TRIM(e.Unit)<>? OR a.id IS NULL OR d.OwnerEmployeeID=?)`,[ids.delegate,deptA,unitA,ids.delegate]);
    assert.strictEqual(wrongUnitScope.length,0,'Every Unit grant must remain assignment-bound and match both Department and Unit');
    await api(base,'/cccf/delegations',{method:'POST',auth:adminToken,body:{ScopeType:'individual',OwnerEmployeeIDs:[ids.unassigned],DelegateEmployeeID:ids.delegate},expect:400});
    console.log('CCCF multi-owner/Department/Unit delegation API UAT: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));
    try{await cleanup();}catch(error){console.error(error.stack||error);process.exitCode=1;}
    await db.end().catch(()=>{});
});
