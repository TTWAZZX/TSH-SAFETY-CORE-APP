'use strict';

process.env.EMAIL_ENABLED = 'false';
process.env.COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED = 'false';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { ensureCompanyEmailChangeSchema } = require('../services/company-email-change');
const { CROSS_PATH_OPERATION, executeEmployeeProfileWrite } = require('../services/employee-profile-write');

const appUrl = process.env.COMPANY_EMAIL_BROWSER_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiOrigin = 'http://127.0.0.1:5096';
const browserPath = process.env.COMPANY_EMAIL_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9796;
const employeeId = `ZCEB${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
const employeeName = `Company Email Browser Test ${employeeId}`;
const currentEmail = `${employeeId.toLowerCase()}.current@gmail.com`;
const pendingEmail = `${employeeId.toLowerCase()}.new@outlook.com`;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-company-email-browser-'));
const pendingCommands = new Map();
const consoleErrors = [];
const failedResponses = [];
const mutations = [];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let commandId = 1;
let browser;
let socket;
let server;

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingCommands.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
        }, timeout);
        pendingCommands.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function cleanup() {
    await db.query('DELETE FROM company_email_change_audit WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM admin_auditlogs WHERE AdminID=? OR TargetID=?', [employeeId, employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

async function seedEmployee() {
    const [[master]] = await db.query(
        `SELECT d.Name department,u.name unit,p.Name position
           FROM master_departments d
           JOIN master_safetyunits u ON u.department_id=d.id
           CROSS JOIN master_positions p
          ORDER BY d.id,u.id,p.id LIMIT 1`
    );
    assert.ok(master, 'Profile masters unavailable');
    const connection = await db.getConnection();
    try {
        await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId,
            profilePayload: {
                EmployeeName: employeeName,
                Department: master.department,
                Unit: master.unit,
                Position: master.position,
            },
            protectedFields: {
                Role: 'User', Password: await bcrypt.hash('Browser-UAT-Only-42!', 4), MustChangePassword: 0,
            },
        });
    } finally {
        connection.release();
    }
    await db.query('UPDATE Employees SET CompanyEmail=? WHERE EmployeeID=?', [currentEmail, employeeId]);
    const tokenHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    await db.query(
        `INSERT INTO company_email_verification_requests
            (EmployeeID,PreviousCompanyEmail,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,?,?,'Pending','127.0.0.1',DATE_ADD(NOW(),INTERVAL 1 HOUR))`,
        [employeeId, currentEmail, pendingEmail, pendingEmail, tokenHash]
    );
    return {
        id: employeeId,
        EmployeeID: employeeId,
        name: employeeName,
        EmployeeName: employeeName,
        role: 'User',
        Role: 'User',
        department: master.department,
        Department: master.department,
    };
}

async function startServer() {
    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: '5096' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    let output = '';
    server.stdout.on('data', chunk => { output += String(chunk); });
    server.stderr.on('data', chunk => { output += String(chunk); });
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (server.exitCode !== null) throw new Error(`Node API exited: ${output}`);
        try {
            const response = await fetch(`${apiOrigin}/api/health`);
            if (response.status > 0) return;
        } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Local Node API did not start: ${output}`);
}

async function connectBrowser() {
    browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) {
                targets = await response.json();
                break;
            }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Browser page target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
            consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        }
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            if (String(request.url || '').includes('/api/profile/company-email')
                && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase())) {
                mutations.push(`${request.method} ${request.url}`);
            }
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/profile')) {
                failedResponses.push(`${response.status} ${response.url}`);
            }
        }
        const pending = pendingCommands.get(message.id);
        if (!pending) return;
        pendingCommands.delete(message.id);
        clearTimeout(pending.timer);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiOrigin}/api`)};` });
}

(async () => {
    assert.ok(fs.existsSync(browserPath), `Browser not found: ${browserPath}`);
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()));
    assert.match(String(process.env.DB_NAME || ''), /(?:uat|test|local|dev)/i);
    await ensureCompanyEmailChangeSchema(db);
    await cleanup();
    const user = await seedEmployee();
    await startServer();
    await connectBrowser();
    const authToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '20m' });
    await command('Page.navigate', { url: `${appUrl}?company_email_browser_uat=${Date.now()}` });
    await waitFor("document.readyState==='complete'");
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(authToken)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.reload();return true;})()`);
    await waitFor("document.querySelector('#open-profile-btn')");
    await evaluate("document.querySelector('#open-profile-btn').click()");
    await waitFor("document.querySelector('#pf-company-email-submit')");

    const viewports = [[1440, 1000], [1024, 768], [390, 844]];
    const results = [];
    for (const [width, height] of viewports) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(250);
        results.push(await evaluate(`(() => {
            const drawer=document.querySelector('#profile-drawer');
            const submit=document.querySelector('#pf-company-email-submit');
            return {
                width:${width},height:${height},
                current:drawer?.innerText.includes(${JSON.stringify(currentEmail)})||false,
                pending:drawer?.innerText.includes(${JSON.stringify(pendingEmail)})||false,
                ready:drawer?.innerText.includes('พร้อมใช้งาน')||false,
                resend:Boolean(document.querySelector('#pf-company-email-resend')),
                cancel:Boolean(document.querySelector('#pf-company-email-cancel')),
                password:Boolean(document.querySelector('#pf-company-email-password')),
                submitHeight:submit?.getBoundingClientRect().height||0,
                drawerOverflow:drawer ? drawer.scrollWidth>drawer.clientWidth+3 : true
            };
        })()`));
    }
    for (const result of results) {
        assert.equal(result.current, true, `${result.width}: current email missing`);
        assert.equal(result.pending, true, `${result.width}: pending email missing`);
        assert.equal(result.ready, true, `${result.width}: ready status missing`);
        assert.equal(result.resend, true, `${result.width}: resend action missing`);
        assert.equal(result.cancel, true, `${result.width}: cancel action missing`);
        assert.equal(result.password, true, `${result.width}: password re-auth input missing`);
        assert.ok(result.submitHeight >= 43, `${result.width}: submit touch target too small`);
        assert.equal(result.drawerOverflow, false, `${result.width}: profile drawer horizontal overflow`);
    }
    assert.deepEqual(mutations, [], `Browser UAT must remain read-only: ${mutations.join(' | ')}`);
    assert.deepEqual(failedResponses, [], `Failed API responses: ${failedResponses.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log(`Company Email Browser UAT passed: ${results.map(row => `${row.width}x${row.height}`).join(', ')}, read-only, zero console/API errors.`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    try { server?.kill(); } catch (_) {}
    await cleanup();
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) employees,
            (SELECT COUNT(*) FROM company_email_verification_requests WHERE EmployeeID=?) requests`,
        [employeeId, employeeId]
    ).catch(() => [[{ employees: -1, requests: -1 }]]);
    console.log(`Company Email Browser cleanup: employees=${residue.employees}; requests=${residue.requests}`);
    await db.end().catch(() => {});
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
