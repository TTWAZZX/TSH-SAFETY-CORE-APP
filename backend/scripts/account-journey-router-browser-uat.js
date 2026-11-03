'use strict';

process.env.EMAIL_ENABLED = 'false';
const STATIC_PORT = 19777;
process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${STATIC_PORT}`;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const db = require('../db');
const app = require('../server');

const root = path.resolve(__dirname, '..', '..');
const stamp = `AJB${Date.now().toString(36).toUpperCase()}`;
const evidence = path.join(root, 'backups', 'local', `account-journey-router-${Date.now()}`);
const ids = { active: `${stamp}A`, inactive: `${stamp}I`, pending: `${stamp}P`, fresh: `${stamp}N` };
const allIds = Object.values(ids);
const viewports = [{ width: 390, height: 844 }, { width: 1366, height: 768 }];
let apiServer, staticServer, browser;

function guardLocal() {
    const host=String(process.env.DB_HOST||'').trim().toLowerCase(),name=String(process.env.DB_NAME||'').trim();
    assert(['localhost','127.0.0.1','::1'].includes(host),`Refusing non-loopback DB_HOST: ${host}`);
    assert(/(?:uat|test|local|dev)/i.test(name),`Refusing database without local/test marker: ${name}`);
}
async function waitFor(url) {
    for(let i=0;i<80;i++){try{const response=await fetch(url);if(response.status<500)return;}catch(_){}await new Promise(resolve=>setTimeout(resolve,100));}
    throw new Error(`Fixture did not start: ${url}`);
}
async function seed() {
    await db.query(`INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword) VALUES
        (?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?)`,[
        ids.active,'Journey Browser Active','Safety','Core','','Officer','User',`$2a$10$${'a'.repeat(53)}`,0,
        ids.inactive,'Journey Browser Inactive','Safety','Core','','Officer','User',null,0,
    ]);
    await db.query(`INSERT INTO registration_requests(ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,PasswordHash,Status) VALUES(?,?,?,?,?,?,?,?)`,[`REF-${ids.pending}`,ids.pending,'Journey Browser Pending','Safety','Core','Officer','fixture-hash','Pending']);
}
async function openPage(viewport) {
    const context=await browser.newContext({viewport});
    await context.addInitScript(value=>{window.API_BASE=value;},`http://127.0.0.1:${apiServer.address().port}/api`);
    const page=await context.newPage(),errors=[],failed=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('favicon'))errors.push(message.text());});
    page.on('response',response=>{if(response.url().includes('/account/journey')&&response.status()>=400)failed.push(`${response.status()} ${response.url()}`);});
    await page.goto(`http://127.0.0.1:${STATIC_PORT}/index.html?account_journey_uat=${Date.now()}`,{waitUntil:'networkidle'});
    await page.locator('#login-overlay:not(.hidden)').waitFor();
    return {context,page,errors,failed};
}
async function resolve(page,employeeId) {
    await page.locator('#login-employee-id').fill(employeeId);
    await Promise.all([
        page.waitForResponse(response=>response.url().includes('/account/journey')&&response.status()===200),
        page.locator('#account-journey-check').click(),
    ]);
}
async function inspect(viewport) {
    const session=await openPage(viewport),{page}=session;
    await resolve(page,ids.active);
    await page.locator('#login-account-journey-result').filter({hasText:'พร้อมใช้งานแล้ว'}).waitFor();
    assert.equal(await page.locator('#login-employee-id').inputValue(),ids.active);

    await resolve(page,ids.inactive);
    await page.locator('#register-view:not(.hidden)').waitFor();
    assert.equal(await page.locator('#reg-id').inputValue(),ids.inactive);
    assert.equal(await page.locator('#registration-new-fields').evaluate(el=>el.classList.contains('hidden')),true);
    assert.match(await page.locator('#registration-account-journey-result').innerText(),/ยังไม่เคยตั้งรหัสผ่าน/);

    await page.locator('#go-login-btn').click();
    await resolve(page,ids.fresh);
    await page.locator('#register-view:not(.hidden)').waitFor();
    assert.equal(await page.locator('#reg-id').inputValue(),ids.fresh);
    assert.equal(await page.locator('#registration-new-fields').evaluate(el=>el.classList.contains('hidden')),false);
    assert.match(await page.locator('#registration-account-journey-result').innerText(),/สมัครบัญชีใหม่/);

    await page.locator('#go-login-btn').click();
    await resolve(page,ids.pending);
    await page.locator('#registration-status-form:not(.hidden)').waitFor();
    assert.equal(await page.locator('#registration-status-employee-id').inputValue(),ids.pending);
    assert.match(await page.locator('#registration-account-journey-result').innerText(),/อยู่ระหว่างการตรวจสอบ/);

    const metrics=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        checks:[...document.querySelectorAll('#account-journey-check,#registration-account-journey-check')].filter(el=>el.getClientRects().length>0).map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
    }));
    assert.equal(metrics.overflow,false,`Horizontal overflow at ${viewport.width}`);
    assert(metrics.checks.every(item=>item.width>=44&&item.height>=44),`Journey touch target below 44px at ${viewport.width}: ${JSON.stringify(metrics.checks)}`);
    assert.deepEqual(session.failed,[]);
    assert.deepEqual(session.errors.filter(error=>!error.includes('Failed to load resource')),[]);
    fs.mkdirSync(evidence,{recursive:true});
    await page.screenshot({path:path.join(evidence,`journey-${viewport.width}x${viewport.height}.png`),fullPage:true});
    await session.context.close();
    return {viewport,login:true,activate:true,newRegistration:true,pendingStatus:true,sharedEmployeeId:true,overflow:false,touchTargets:true};
}
async function cleanup() {
    if(browser)await browser.close().catch(()=>{});
    if(apiServer)await new Promise(resolve=>apiServer.close(resolve));
    if(staticServer&&staticServer.exitCode===null)staticServer.kill();
    await new Promise(resolve=>setTimeout(resolve,250));
    await db.query(`DELETE FROM Admin_AuditLogs WHERE TargetID IN (${allIds.map(()=>'?').join(',')})`,allIds).catch(()=>{});
    await db.query(`DELETE FROM registration_requests WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})`,allIds).catch(()=>{});
    await db.query(`DELETE FROM Employees WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})`,allIds).catch(()=>{});
    const [[residue]]=await db.query(`SELECT (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})) employees,(SELECT COUNT(*) FROM registration_requests WHERE EmployeeID IN (${allIds.map(()=>'?').join(',')})) requests`,[...allIds,...allIds]);
    assert.deepEqual([Number(residue.employees),Number(residue.requests)],[0,0]);
    await db.end();
}

(async()=>{let failure;try{
    guardLocal();await seed();apiServer=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{apiServer.once('listening',resolve);apiServer.once('error',reject);});
    staticServer=spawn(process.env.PHP_BIN||'C:\\xampp\\php\\php.exe',['-d','display_errors=0','-S',`127.0.0.1:${STATIC_PORT}`,'-t',root],{env:{...process.env,EMAIL_ENABLED:'false'},stdio:'ignore',windowsHide:true});
    await waitFor(`http://127.0.0.1:${STATIC_PORT}/index.html`);browser=await chromium.launch({headless:true});const results=[];for(const viewport of viewports)results.push(await inspect(viewport));
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({contract:'2026-11-03-account-journey-router-r1',results,productionConnected:false,businessMutation:false,externalDelivery:false,disposableResidue:0},null,2));
    console.log(`Account Journey Router Browser UAT: PASS (390/1366, ${evidence})`);
}catch(error){failure=error;console.error(error.stack||error);}try{await cleanup();console.log('CLEANUP PASS: zero browser fixture residue');}catch(error){failure=failure||error;console.error(error.stack||error);}if(failure)process.exitCode=1;})();
