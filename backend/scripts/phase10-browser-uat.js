'use strict';

process.env.EMAIL_ENABLED = 'false';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');

const db = require('../db');
const app = require('../server');
const { smtpConfigured } = require('../utils/email');
const { CROSS_PATH_OPERATION, executeEmployeeProfileWrite } = require('../services/employee-profile-write');
const { resolveEmployeeOnboarding } = require('../utils/onboarding-resolver');

const root = path.resolve(__dirname, '..', '..');
const browserPath = process.env.PHASE10_BROWSER
    || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.PHASE10_APP_URL
    || 'http://127.0.0.1/tsh-safety-core/index.html';
const apiPort = Number(process.env.PHASE10_API_PORT || 5000);
const cdpPort = Number(process.env.PHASE10_CDP_PORT || 9798);
const blockExternalAssets = process.env.PHASE10_BLOCK_EXTERNAL !== 'false';
const runPrefix = `U10${Date.now().toString(36).toUpperCase()}`;
const ids = { flow: `${runPrefix}F`, admin: `${runPrefix}A` };
const passwords = {
    flowCurrent: `${runPrefix}!Temp9`,
    flowReady: `${runPrefix}!Ready9`,
    admin: `${runPrefix}!Admin9`,
};
const artifactDir = path.join(root, 'backups', `phase10-browser-${runPrefix}`);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-phase10-browser-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let server;
let browser;
let client;
let baseline;
let baselineAttemptRows;
let masters;
let cleanupRequired = false;
const evidence = { runPrefix, appUrl, externalAssetsBlocked: blockExternalAssets, checks: {} };

function hashRows(rows) {
    return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function snapshot() {
    const [employees] = await db.query('SELECT * FROM employees ORDER BY EmployeeID');
    const [audits] = await db.query('SELECT * FROM admin_auditlogs ORDER BY id');
    const [attempts] = await db.query('SELECT * FROM auth_login_attempts ORDER BY ID');
    const [schema] = await db.query(
        `SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
         ORDER BY TABLE_NAME,ORDINAL_POSITION`
    );
    return {
        employees: { count: employees.length, hash: hashRows(employees) },
        audits: { count: audits.length, hash: hashRows(audits) },
        attempts: { count: attempts.length, hash: hashRows(attempts) },
        schema: hashRows(schema),
    };
}

async function safetyGate() {
    assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()));
    assert(/(?:uat|test|local|dev)/i.test(String(process.env.DB_NAME || '')));
    assert(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(appUrl));
    assert(fs.existsSync(browserPath), `Browser not found: ${browserPath}`);
    assert.strictEqual(smtpConfigured(), false, 'Email delivery must be disabled');
    const [[identity]] = await db.query('SELECT DATABASE() db,@@hostname host,@@port port');
    assert(/(?:uat|test|local|dev)/i.test(String(identity.db || '')));
    const [[localFailures]] = await db.query(
        `SELECT COUNT(*) count FROM auth_login_attempts
         WHERE Successful=0 AND IPAddress IN ('127.0.0.1','::1','::ffff:127.0.0.1')`
    );
    assert.strictEqual(Number(localFailures.count), 0,
        'Browser login would delete existing local failed-login evidence');
    return identity;
}

async function loadMasters() {
    const [[row]] = await db.query(
        `SELECT d.Name department,u.name unit,p.Name position
         FROM master_departments d
         JOIN master_safetyunits u ON u.department_id=d.id
         CROSS JOIN master_positions p
         ORDER BY d.id,u.id,p.id LIMIT 1`
    );
    assert(row, 'Valid profile masters were not found');
    return row;
}

async function seedEmployee(employeeId, { role, unit, password, mustChangePassword }) {
    const connection = await db.getConnection();
    try {
        await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId,
            profilePayload: {
                EmployeeName: `Phase 10 ${role} ${runPrefix}`,
                Department: masters.department,
                Unit: unit,
                Position: masters.position,
            },
            protectedFields: {
                Role: role,
                Password: await bcrypt.hash(password, 10),
                MustChangePassword: mustChangePassword,
            },
        });
    } finally {
        connection.release();
    }
}

async function seed() {
    await seedEmployee(ids.flow, {
        role: 'User', unit: '', password: passwords.flowCurrent, mustChangePassword: 1,
    });
    await seedEmployee(ids.admin, {
        role: 'Admin', unit: masters.unit, password: passwords.admin, mustChangePassword: 0,
    });
}

async function getJson(url, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Timed out: ${url}`);
}

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            try {
                let raw = event.data;
                if (raw && typeof raw.text === 'function') raw = await raw.text();
                if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
                const message = JSON.parse(String(raw));
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                clearTimeout(pending.timer);
                message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
            } catch (error) {
                console.warn(`CDP message warning: ${error.message}`);
            }
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression, timeout = 30000) {
        const response = await this.command('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true,
        }, timeout);
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result?.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(expression, label, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        let runtimeErrors = [];
        try {
            if (await client.eval(`Boolean(${expression})`, 10000)) return;
            runtimeErrors = await client.eval('window.__tshRuntimeErrors||[]', 10000);
        } catch (_) {}
        if (runtimeErrors.length) {
            throw new Error(`Browser runtime error while waiting for ${label}: ${JSON.stringify(runtimeErrors)}`);
        }
        await sleep(300);
    }
    const state = await client.eval(`({
        url:location.href,
        title:document.title,
        readyState:document.readyState,
        loginReady:window.__tshLoginReady,
        hasLoginForm:Boolean(document.getElementById('login-form')),
        hasSession:Boolean(window.TSHSession),
        runtimeErrors:window.__tshRuntimeErrors||[],
        moduleScripts:[...document.querySelectorAll('script[type="module"]')].map(node=>node.src),
        resources:performance.getEntriesByType('resource').filter(row=>/session|main|cdn|flatpickr|xlsx|chart/i.test(row.name)).map(row=>({name:row.name,duration:Math.round(row.duration),size:row.transferSize})),
        loginError:window.__tshLoginError||'',
        body:document.body?.innerText?.slice(0,500)||''
    })`).catch(() => null);
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function screenshot(name) {
    const response = await client.command('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(response.data, 'base64'));
}

async function setViewport(width, height, mobile = false) {
    await client.command('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: mobile ? 2.5 : 1, mobile,
    });
    await client.command('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await client.eval(`window.dispatchEvent(new Event('resize'));true`);
    await sleep(500);
}

async function login(employeeId, password) {
    await waitFor(`window.__tshLoginReady===true&&document.getElementById('login-form')`, 'login form');
    await client.eval(`(() => {
        document.getElementById('login-employee-id').value=${JSON.stringify(employeeId)};
        document.getElementById('login-password').value=${JSON.stringify(password)};
        document.getElementById('login-form').requestSubmit();
        return true;
    })()`);
}

async function logout() {
    await client.eval(`window.TSHSession.logout();true`);
    await waitFor(`window.__tshLoginReady===true&&!localStorage.getItem('tsh_token')`, 'logout and cleared session');
}

async function browserApiStatus(pathname) {
    return client.eval(`(async()=>{
        const response=await fetch('http://127.0.0.1:${apiPort}/api'+${JSON.stringify(pathname)}, {
            headers:{Authorization:'Bearer '+localStorage.getItem('tsh_token')}
        });
        return response.status;
    })()`);
}

async function runBrowser(identity) {
    fs.mkdirSync(artifactDir, { recursive: true });
    browser = spawn(browserPath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        '--remote-allow-origins=*',
        '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking',
        // Keep the local onboarding UAT deterministic when optional CDN assets
        // are unavailable. Localhost remains resolvable for the app and API.
        ...(blockExternalAssets
            ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
            : []),
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    await getJson(`http://127.0.0.1:${cdpPort}/json/version`);
    const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert(page, 'Browser page target was not found');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Network.enable');
    if (blockExternalAssets) {
        await client.command('Network.setBlockedURLs', { urls: ['https://*'] });
    }
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.API_BASE='http://127.0.0.1:${apiPort}/api';
            window.__tshRuntimeErrors=[];
            window.addEventListener('error',event=>{
                if(event.error||event.message){
                    window.__tshRuntimeErrors.push(String(event.error?.stack||event.message));
                }
            });
            window.addEventListener('unhandledrejection',event=>{
                window.__tshRuntimeErrors.push(String(event.reason?.stack||event.reason||'Unhandled promise rejection'));
            });
        `,
    });
    await setViewport(1366, 860, false);
    await client.command('Page.navigate', { url: `${appUrl}?phase10=${Date.now()}` });

    await login(ids.flow, passwords.flowCurrent);
    await waitFor(`document.getElementById('change-password-form')?.dataset?.forced==='1'`, 'forced password modal');
    evidence.checks.passwordGate = true;
    await screenshot('01-password-required.png');

    await client.eval(`(() => {
        document.getElementById('cp-current').value=${JSON.stringify(passwords.flowCurrent)};
        document.getElementById('cp-new').value=${JSON.stringify(passwords.flowReady)};
        document.getElementById('cp-confirm').value=${JSON.stringify(passwords.flowReady)};
        document.getElementById('change-password-form').requestSubmit();
        return true;
    })()`);
    await waitFor(`document.getElementById('safety-unit-gate-select')?.options?.length>1
        &&document.getElementById('modal-wrapper')?.classList.contains('hidden')
        &&!document.getElementById('change-password-form')`, 'Safety Unit gate without stacked password modal');
    evidence.checks.safetyUnitGate = true;
    evidence.checks.modalTransitionClean = true;
    await screenshot('02-safety-unit-required.png');

    await client.eval(`(() => {
        const select=document.getElementById('safety-unit-gate-select');
        select.value=${JSON.stringify(masters.unit)};
        select.dispatchEvent(new Event('change',{bubbles:true}));
        document.getElementById('safety-unit-gate-form').requestSubmit();
        return true;
    })()`);
    await waitFor(`!document.getElementById('safety-unit-gate-page')&&document.getElementById('app-container')&&!document.getElementById('app-container').classList.contains('hidden')`, 'READY user shell');
    const readyUser = await client.eval(`(() => ({
        user:JSON.parse(localStorage.getItem('tsh_user')||'{}'),
        adminHidden:document.getElementById('admin-menu-section')?.classList.contains('hidden')===true,
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(readyUser.user.id, ids.flow);
    assert.strictEqual(readyUser.user.role, 'User');
    assert.strictEqual(readyUser.adminHidden, true);
    if (!blockExternalAssets) assert.strictEqual(readyUser.overflow, false);
    assert.strictEqual(await browserApiStatus('/admin/dashboard-stats'), 403);
    evidence.checks.userReady = true;
    evidence.checks.desktopLayout = blockExternalAssets && readyUser.overflow
        ? 'NOT_ASSERTED_EXTERNAL_CSS_BLOCKED'
        : true;
    evidence.checks.userAdminForbidden = true;
    await screenshot('03-user-ready-desktop.png');

    await client.command('Page.reload', { ignoreCache: true });
    await waitFor(`document.getElementById('app-container')&&!document.getElementById('app-container').classList.contains('hidden')&&!document.getElementById('change-password-form')&&!document.getElementById('safety-unit-gate-page')`, 'session persistence after refresh');
    assert.strictEqual(await client.eval(`JSON.parse(localStorage.getItem('tsh_user')||'{}').id`), ids.flow);
    evidence.checks.sessionRefresh = true;

    await setViewport(390, 844, true);
    const mobile = await client.eval(`({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,appVisible:!document.getElementById('app-container')?.classList.contains('hidden')})`);
    assert.strictEqual(mobile.appVisible, true);
    if (!blockExternalAssets) assert.strictEqual(mobile.overflow, false);
    evidence.checks.mobileLayout = blockExternalAssets && mobile.overflow
        ? 'NOT_ASSERTED_EXTERNAL_CSS_BLOCKED'
        : true;
    await screenshot('04-user-ready-mobile.png');

    await setViewport(1366, 860, false);
    await logout();
    await login(ids.flow, passwords.flowReady);
    await waitFor(`document.getElementById('app-container')&&!document.getElementById('app-container').classList.contains('hidden')&&!document.getElementById('change-password-form')&&!document.getElementById('safety-unit-gate-page')`, 'repeat login after onboarding');
    evidence.checks.repeatLogin = true;
    await logout();

    await login(ids.admin, passwords.admin);
    await waitFor(`document.getElementById('app-container')&&!document.getElementById('app-container').classList.contains('hidden')`, 'Admin shell');
    const adminState = await client.eval(`(() => ({
        user:JSON.parse(localStorage.getItem('tsh_user')||'{}'),
        adminVisible:document.getElementById('admin-menu-section')?.classList.contains('hidden')===false,
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(adminState.user.id, ids.admin);
    assert.strictEqual(adminState.user.role, 'Admin');
    assert.strictEqual(adminState.adminVisible, true);
    if (!blockExternalAssets) assert.strictEqual(adminState.overflow, false);
    assert.strictEqual(await browserApiStatus('/admin/dashboard-stats'), 200);
    evidence.checks.adminReady = true;
    evidence.checks.adminLayout = blockExternalAssets && adminState.overflow
        ? 'NOT_ASSERTED_EXTERNAL_CSS_BLOCKED'
        : true;
    evidence.checks.adminApiAllowed = true;
    await screenshot('05-admin-ready.png');
    await logout();

    evidence.database = identity;
    evidence.employeeStatuses = {
        flow: await resolveEmployeeOnboarding(db, ids.flow),
        admin: await resolveEmployeeOnboarding(db, ids.admin),
    };
    assert.deepStrictEqual(evidence.employeeStatuses, { flow: 'READY', admin: 'READY' });
    evidence.passed = true;
    evidence.generatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(evidence, null, 2));
}

async function cleanup() {
    try { client?.close(); } catch (_) {}
    if (browser?.pid) {
        spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
            stdio: 'ignore', windowsHide: true,
        });
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await sleep(800);

    if (cleanupRequired) {
        const testIds = Object.values(ids);
        const marks = testIds.map(() => '?').join(',');
        const [auditRows] = await db.query(
            `SELECT id FROM admin_auditlogs WHERE AdminID IN (${marks}) OR TargetID IN (${marks})`,
            [...testIds, ...testIds]
        );
        const [attemptRows] = await db.query(
            `SELECT ID FROM auth_login_attempts WHERE EmployeeID IN (${marks})`, testIds
        );
        const connection = await db.getConnection();
        let restoredHousekeepingAttempts = 0;
        try {
            await connection.beginTransaction();
            if (auditRows.length) {
                await connection.query(
                    `DELETE FROM admin_auditlogs WHERE id IN (${auditRows.map(() => '?').join(',')})`,
                    auditRows.map(row => Number(row.id))
                );
            }
            if (attemptRows.length) {
                await connection.query(
                    `DELETE FROM auth_login_attempts WHERE ID IN (${attemptRows.map(() => '?').join(',')})`,
                    attemptRows.map(row => Number(row.ID))
                );
            }
            await connection.query(`DELETE FROM employees WHERE EmployeeID IN (${marks})`, testIds);

            const [remainingAttempts] = await connection.query('SELECT * FROM auth_login_attempts ORDER BY ID');
            const baselineById = new Map(baselineAttemptRows.map(row => [Number(row.ID), row]));
            for (const row of remainingAttempts) {
                assert.deepStrictEqual(row, baselineById.get(Number(row.ID)),
                    `Unexpected auth_login_attempts row after cleanup: ${row.ID}`);
            }
            const remainingIds = new Set(remainingAttempts.map(row => Number(row.ID)));
            const housekeepingRows = baselineAttemptRows.filter(row => !remainingIds.has(Number(row.ID)));
            for (const row of housekeepingRows) {
                await connection.query(
                    'INSERT INTO auth_login_attempts(ID,IPAddress,EmployeeID,Successful,AttemptedAt) VALUES(?,?,?,?,?)',
                    [row.ID, row.IPAddress, row.EmployeeID, row.Successful, row.AttemptedAt]
                );
            }
            restoredHousekeepingAttempts = housekeepingRows.length;
            await connection.commit();
        } catch (error) {
            await connection.rollback().catch(() => {});
            throw error;
        } finally {
            connection.release();
        }

        const [employeeResidue] = await db.query(`SELECT EmployeeID FROM employees WHERE EmployeeID IN (${marks})`, testIds);
        const [auditResidue] = await db.query(
            `SELECT id FROM admin_auditlogs WHERE AdminID IN (${marks}) OR TargetID IN (${marks})`,
            [...testIds, ...testIds]
        );
        const [attemptResidue] = await db.query(`SELECT ID FROM auth_login_attempts WHERE EmployeeID IN (${marks})`, testIds);
        assert.strictEqual(employeeResidue.length + auditResidue.length + attemptResidue.length, 0, 'Phase 10 residue remains');
        assert.deepStrictEqual(await snapshot(), baseline, 'Database fingerprint changed after Phase 10 cleanup');
        evidence.cleanup = {
            employees: 0,
            audits: 0,
            loginAttempts: 0,
            restoredHousekeepingAttempts,
            fingerprintsRestored: true,
        };
    }
    if (fs.existsSync(artifactDir)) {
        fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(evidence, null, 2));
    }
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.warn(`Browser profile cleanup warning: ${error.message}`); }
}

(async () => {
    let failure;
    try {
        const identity = await safetyGate();
        baseline = await snapshot();
        [baselineAttemptRows] = await db.query('SELECT * FROM auth_login_attempts ORDER BY ID');
        masters = await loadMasters();
        cleanupRequired = true;
        await seed();
        server = app.listen(apiPort);
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });
        await runBrowser(identity);
        console.log(`Phase 10 browser UAT PASS (${Object.keys(evidence.checks).length} checks).`);
        console.log(`Evidence: ${artifactDir}`);
    } catch (error) {
        failure = error;
        evidence.passed = false;
        evidence.error = error.message;
        console.error(`Phase 10 browser UAT FAIL: ${error.stack || error}`);
    }
    try {
        await cleanup();
        console.log('Phase 10 cleanup PASS: zero residue; fingerprints restored.');
    } catch (error) {
        failure = failure || error;
        evidence.passed = false;
        evidence.cleanup = { error: error.message, fingerprintsRestored: false };
        if (fs.existsSync(artifactDir)) {
            fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(evidence, null, 2));
        }
        console.error(`Phase 10 cleanup FAIL: ${error.stack || error}`);
    } finally {
        await db.end().catch(() => {});
    }
    if (failure) process.exitCode = 1;
})();
