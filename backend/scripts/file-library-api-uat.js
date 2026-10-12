'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

const root = path.resolve(__dirname, '..', '..');
const marker = `file-library-uat-${Date.now()}`;
const userAgent = `TSH-${marker}`;
const nodePort = 5031, phpPort = 5032;
let nodeServer, phpServer, stderr = '';
const createdIds = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(base, route, { method='GET', token, body, form }={}) {
    const headers = { 'User-Agent': userAgent, ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${route}`, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    return { status: response.status, payload, headers: response.headers };
}

async function waitFor(url) {
    for (let i=0;i<80;i++) { try { const r=await fetch(url); if (r.status < 500) return; } catch (_) {} await sleep(75); }
    throw new Error(`Server did not start: ${url} ${stderr}`);
}

function uploadForm(valid=true, category='FORM_TEMPLATE') {
    const form = new FormData();
    const data = valid ? Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]) : Buffer.from('not-an-image');
    form.set('file', new Blob([data], { type:'image/png' }), `นโยบายความปลอดภัย-${marker}${valid?'':'-invalid'}.png`);
    form.set('title', marker);
    form.set('category', category);
    form.set('description', 'Privacy-safe local fixture');
    form.set('publishNow', '1');
    form.set('accessMode', 'Public');
    form.set('deliveryMode', 'Auto');
    return form;
}

async function lifecycle(label, base, adminToken, userToken) {
    assert.strictEqual((await request(base,'/admin/file-library',{token:userToken})).status,403,`${label} non-Admin denial`);
    assert.strictEqual((await request(base,'/admin/file-library/categories',{method:'POST',token:userToken,body:{labelTh:marker}})).status,403,`${label} non-Admin category denial`);
    const categoryList=await request(base,'/admin/file-library/categories',{token:adminToken});
    assert.strictEqual(categoryList.status,200,`${label} category list`);
    assert(categoryList.payload.data.some(row=>row.code==='OTHER'&&row.isActive),`${label} required Other category`);
    const categoryCreated=await request(base,'/admin/file-library/categories',{method:'POST',token:adminToken,body:{labelTh:`${marker}-${label}`,labelEn:'UAT category',sortOrder:777}});
    assert.strictEqual(categoryCreated.status,201,`${label} category create: ${JSON.stringify(categoryCreated.payload)}`);
    const customCategory=categoryCreated.payload.data;
    assert.match(customCategory.code,/^CUSTOM_[A-F0-9]{16}$/);
    const previousMaxSort=Math.max(...categoryList.payload.data.map(row=>Number(row.sortOrder)||0));
    assert.strictEqual(customCategory.sortOrder,previousMaxSort+10,`${label} automatic category display order`);
    assert.notStrictEqual(customCategory.sortOrder,777,`${label} category create ignores client sort order`);
    const categoryUpdated=await request(base,`/admin/file-library/categories/${customCategory.id}`,{method:'PUT',token:adminToken,body:{labelTh:`${marker}-${label}-updated`,labelEn:'Updated UAT category',sortOrder:778,isActive:true}});
    assert.strictEqual(categoryUpdated.status,200,`${label} category update`);
    const invalid = await request(base,'/admin/file-library',{method:'POST',token:adminToken,form:uploadForm(false)});
    assert.strictEqual(invalid.status,400,`${label} signature rejection`);
    const created = await request(base,'/admin/file-library',{method:'POST',token:adminToken,form:uploadForm(true,customCategory.code)});
    assert.strictEqual(created.status,201,`${label} upload: ${JSON.stringify(created.payload)}`);
    const item=created.payload.data; createdIds.push(item.id);
    assert.strictEqual(item.originalName,`นโยบายความปลอดภัย-${marker}.png`,`${label} UTF-8 original filename`);
    assert.strictEqual(new URL(item.url).port,String(label==='Node'?nodePort:phpPort),`${label} public URL uses API origin`);
    const [[storedRow]]=await db.query('SELECT StoredName FROM FileLibrary_Items WHERE id=?',[item.id]);
    const storageDir=label==='Node'?path.join(root,'backend','private-uploads','file-library'):path.join(root,'api','private','file-library');
    const storedTarget=path.join(storageDir,path.basename(storedRow.StoredName));
    const expectedOriginalName=`นโยบายความปลอดภัย-${marker}.png`;
    const legacyMojibake=Buffer.from(expectedOriginalName,'utf8').toString('latin1');
    await db.query('UPDATE FileLibrary_Items SET OriginalName=? WHERE id=?',[legacyMojibake,item.id]);
    const legacyList=await request(base,'/admin/file-library',{token:adminToken});
    assert.strictEqual(legacyList.payload.data.rows.find(row=>row.id===item.id)?.originalName,expectedOriginalName,`${label} legacy mojibake display repair`);
    assert.strictEqual(item.status,'Published'); assert.strictEqual(item.accessMode,'Public');
    assert.match(item.url,/\/api\/public\/file-library\/[A-Za-z0-9_-]{43}$/);
    const publicRoute=`/public/file-library/${item.publicToken}`;
    const opened=await request(base,publicRoute);
    assert.strictEqual(opened.status,200,`${label} anonymous public file`);
    if(label==='Node')assert.strictEqual((await fetch(item.url)).status,200,'Node generated Public URL opens directly');
    assert.match(opened.headers.get('content-type')||'',/image\/png/);
    assert.strictEqual(opened.headers.get('x-content-type-options'),'nosniff');
    assert((opened.headers.get('content-disposition')||'').includes(encodeURIComponent(expectedOriginalName)),`${label} UTF-8 download filename`);
    const invalidCategory=await request(base,`/admin/file-library/${item.id}`,{method:'PUT',token:adminToken,body:{title:marker,description:'Invalid',category:'FREE_TEXT',status:'Published',accessMode:'Public',deliveryMode:'Auto',expiresAt:'',rowVersion:item.rowVersion}});
    assert.strictEqual(invalidCategory.status,400,`${label} invalid category rejection`);
    const missingOtherDetail=await request(base,`/admin/file-library/${item.id}`,{method:'PUT',token:adminToken,body:{title:marker,description:'Invalid Other',category:'OTHER',categoryDetail:'',status:'Published',accessMode:'Public',deliveryMode:'Auto',expiresAt:'',rowVersion:item.rowVersion}});
    assert.strictEqual(missingOtherDetail.status,400,`${label} missing Other detail rejection`);
    const invalidAccess=await request(base,`/admin/file-library/${item.id}`,{method:'PUT',token:adminToken,body:{title:marker,description:'Invalid',category:'FORM_TEMPLATE',status:'Published',accessMode:'Typo',deliveryMode:'Auto',expiresAt:'',rowVersion:item.rowVersion}});
    assert.strictEqual(invalidAccess.status,400,`${label} invalid access mode rejection`);
    const draft=await request(base,`/admin/file-library/${item.id}`,{method:'PUT',token:adminToken,body:{title:marker,description:'Draft',category:'OTHER',categoryDetail:'เอกสารทดสอบเฉพาะกิจ',status:'Draft',accessMode:'Authenticated',deliveryMode:'Download',expiresAt:'',rowVersion:item.rowVersion}});
    assert.strictEqual(draft.status,200,`${label} Draft update`);
    assert.strictEqual(draft.payload.data.categoryDetail,'เอกสารทดสอบเฉพาะกิจ',`${label} Other detail persistence`);
    assert.strictEqual((await request(base,publicRoute)).status,404,`${label} Draft public denial`);
    const published=await request(base,`/admin/file-library/${item.id}`,{method:'PUT',token:adminToken,body:{title:marker,description:'Published',category:'FORM_TEMPLATE',status:'Published',accessMode:'Authenticated',deliveryMode:'Download',expiresAt:'',rowVersion:draft.payload.data.rowVersion}});
    assert.strictEqual(published.status,200,`${label} member-only publish`);
    assert.strictEqual((await request(base,publicRoute)).status,404,`${label} member-only anonymous denial`);
    const memberRoute=`/file-library/${item.publicToken}`;
    assert.strictEqual((await request(base,memberRoute)).status,401,`${label} member link requires login`);
    const memberOpened=await request(base,memberRoute,{token:userToken});
    assert.strictEqual(memberOpened.status,200,`${label} authenticated member file`);
    assert.match(memberOpened.headers.get('content-disposition')||'',/^attachment;/);
    const rotated=await request(base,`/admin/file-library/${item.id}/rotate-link`,{method:'POST',token:adminToken,body:{rowVersion:published.payload.data.rowVersion}});
    assert.strictEqual(rotated.status,200,`${label} rotate link`);
    assert.notStrictEqual(rotated.payload.data.publicToken,item.publicToken);
    assert.strictEqual((await request(base,memberRoute,{token:userToken})).status,404,`${label} old rotated link denial`);
    const rotatedMemberRoute=`/file-library/${rotated.payload.data.publicToken}`;
    assert.strictEqual((await request(base,rotatedMemberRoute,{token:userToken})).status,200,`${label} rotated member link`);
    const expired=await request(base,`/admin/file-library/${item.id}`,{method:'PUT',token:adminToken,body:{title:marker,description:'Expired',category:'FORM_TEMPLATE',status:'Published',accessMode:'Authenticated',deliveryMode:'Download',expiresAt:'2020-01-01T00:00',rowVersion:rotated.payload.data.rowVersion}});
    assert.strictEqual(expired.status,200,`${label} expiry update`);
    assert.strictEqual((await request(base,rotatedMemberRoute,{token:userToken})).status,404,`${label} expired member denial`);
    const activePurge=await request(base,`/admin/file-library/${item.id}/purge`,{method:'POST',token:adminToken,body:{rowVersion:expired.payload.data.rowVersion,confirmTitle:marker}});
    assert.strictEqual(activePurge.status,409,`${label} purge requires revoke first`);
    assert.strictEqual((await request(base,`/admin/file-library/${item.id}`,{method:'DELETE',token:adminToken})).status,200,`${label} revoke`);
    assert.strictEqual((await request(base,rotatedMemberRoute,{token:userToken})).status,404,`${label} revoked member denial`);
    const revokedList=await request(base,'/admin/file-library',{token:adminToken});
    const revokedRow=revokedList.payload.data.rows.find(row=>row.id===item.id);
    assert(revokedRow,`${label} revoked row remains available for controlled purge`);
    const wrongConfirmation=await request(base,`/admin/file-library/${item.id}/purge`,{method:'POST',token:adminToken,body:{rowVersion:revokedRow.rowVersion,confirmTitle:'wrong title'}});
    assert.strictEqual(wrongConfirmation.status,400,`${label} purge exact-title confirmation`);
    const purged=await request(base,`/admin/file-library/${item.id}/purge`,{method:'POST',token:adminToken,body:{rowVersion:revokedRow.rowVersion,confirmTitle:marker}});
    assert.strictEqual(purged.status,200,`${label} permanent purge`);
    assert(!fs.existsSync(storedTarget),`${label} purged private bytes`);
    assert(!fs.readdirSync(storageDir).some(name=>name.startsWith(`${path.basename(storedRow.StoredName)}.purge-`)),`${label} purge quarantine residue`);
    const [[purgeAudit]]=await db.query("SELECT COUNT(*) count FROM Admin_AuditLogs WHERE Action='FILE_LIBRARY_PURGE' AND (TargetID=? OR Metadata LIKE ?)",[String(item.id),`%\"itemId\":${item.id}%`]);
    assert(Number(purgeAudit.count)>=1,`${label} permanent purge audit evidence`);
    assert.strictEqual((await request(base,rotatedMemberRoute,{token:userToken})).status,404,`${label} purged link denial`);
    const afterPurge=await request(base,'/admin/file-library',{token:adminToken});
    assert(!afterPurge.payload.data.rows.some(row=>row.id===item.id),`${label} purged metadata removed`);
    const archived=await request(base,`/admin/file-library/categories/${customCategory.id}`,{method:'DELETE',token:adminToken});
    assert.strictEqual(archived.status,200,`${label} category archive`);
    console.log(`PASS ${label} File Library lifecycle`);
}

async function cleanup() {
    const [rows] = await db.query('SELECT id,StoredName FROM FileLibrary_Items WHERE Title=?', [marker]).catch(()=>[[]]);
    for (const row of rows) for (const dir of [path.join(root,'backend','private-uploads','file-library'),path.join(root,'api','private','file-library')]) {
        const target=path.join(dir,path.basename(row.StoredName||'')); if (target.startsWith(dir)&&fs.existsSync(target)) fs.unlinkSync(target);
    }
    await db.query('DELETE FROM FileLibrary_Items WHERE Title=?',[marker]).catch(()=>{});
    await db.query('DELETE FROM FileLibrary_Categories WHERE LabelTh LIKE ?',[`${marker}%`]).catch(()=>{});
    await db.query('DELETE FROM Admin_AuditLogs WHERE UserAgent=?',[userAgent]).catch(()=>{});
}

async function main() {
    assert(['localhost','127.0.0.1','::1'].includes(String(process.env.DB_HOST||'').trim().toLowerCase()),'UAT is loopback-only');
    const [[admin]]=await db.query("SELECT EmployeeID,EmployeeName,Department,Role FROM Employees WHERE LOWER(Role)='admin' ORDER BY EmployeeID LIMIT 1");
    assert(admin,'Local Admin is required');
    const identity={id:admin.EmployeeID,name:admin.EmployeeName,department:admin.Department,role:'Admin'};
    const adminToken=jwt.sign(identity,process.env.JWT_SECRET,{expiresIn:'10m'}), userToken=jwt.sign({...identity,role:'User'},process.env.JWT_SECRET,{expiresIn:'10m'});
    nodeServer=await new Promise(resolve=>{const instance=app.listen(nodePort,'127.0.0.1',()=>resolve(instance));});
    await lifecycle('Node',`http://127.0.0.1:${nodePort}/api`,adminToken,userToken);
    phpServer=spawn(process.env.PHP_BIN||'C:\\xampp\\php\\php.exe',['-d','display_errors=0','-d','log_errors=1','-S',`127.0.0.1:${phpPort}`,'-t',root],{cwd:root,env:process.env,stdio:['ignore','ignore','pipe'],windowsHide:true});
    phpServer.stderr.on('data',chunk=>{stderr+=chunk.toString();});
    await waitFor(`http://127.0.0.1:${phpPort}/api/index.php?route=public/file-library/not-found`);
    await lifecycle('PHP',`http://127.0.0.1:${phpPort}/api/index.php?route=`,adminToken,userToken);
    console.log('File Library Node/PHP API UAT: PASS (category CRUD, public policy, revoke-first permanent purge and zero residue)');
}
main().catch(error=>{console.error(error.stack||error);if(stderr)console.error(stderr);process.exitCode=1;}).finally(async()=>{if(nodeServer)await new Promise(resolve=>nodeServer.close(resolve));if(phpServer&&phpServer.exitCode===null)phpServer.kill();await cleanup();const [[left]]=await db.query('SELECT COUNT(*) count FROM FileLibrary_Items WHERE Title=?',[marker]).catch(()=>[[{count:-1}]]);const [[categoryLeft]]=await db.query('SELECT COUNT(*) count FROM FileLibrary_Categories WHERE LabelTh LIKE ?',[`${marker}%`]).catch(()=>[[{count:-1}]]);if(Number(left.count)!==0||Number(categoryLeft.count)!==0){console.error('File Library UAT residue detected');process.exitCode=1;}await db.end();});
