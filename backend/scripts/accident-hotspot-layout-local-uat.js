'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const stack = String(process.env.ACCIDENT_LAYOUT_UAT_STACK || 'node').toLowerCase();
const port = 6110 + Math.floor(Math.random() * 70);
const origin = `http://127.0.0.1:${port}`;
const marker = `AL${String(Date.now()).slice(-12)}`;
const token = jwt.sign({ id: marker, name: marker, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '20m' });
const repoRoot = path.join(__dirname, '..', '..');
const uploadRoots = [path.join(repoRoot, 'backend', 'uploads'), path.join(repoRoot, 'uploads')];
const requestUrl = route => stack === 'php'
    ? `${origin}/api/index.php?route=${route.replace(/^\//, '')}`
    : `${origin}/api/${route.replace(/^\//, '')}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let db;
let server;
let baseline = null;
let serverErrors = '';
const backups = new Map();

function storedName(url) {
    try { return path.basename(decodeURIComponent(new URL(String(url), origin).pathname)); } catch { return ''; }
}

function candidates(url) {
    const name = storedName(url);
    return name ? uploadRoots.map(root => path.join(root, name)) : [];
}

async function request(route, options = {}) {
    return fetch(requestUrl(route), { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
}

async function readJson(response, label) {
    const body = await response.text();
    try { return body ? JSON.parse(body) : {}; } catch {
        throw new Error(`${label} returned non-JSON (${response.status}): ${body.slice(0, 1200)} ${serverErrors}`);
    }
}

async function waitForServer() {
    for (let i = 0; i < 80; i++) {
        try { const response = await fetch(requestUrl('/health')); if (response.status > 0) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`${stack} local server did not start`);
}

async function restore() {
    if (!db) return;
    const [[current]] = await db.query('SELECT * FROM accident_hotspot_layout WHERE id=1 LIMIT 1').catch(() => [[]]);
    if (current && String(current.FileName || '').includes(marker)) {
        for (const file of candidates(current.FileURL)) await fs.promises.rm(file, { force: true }).catch(() => {});
    }
    await db.query('DELETE FROM accident_hotspot_layout WHERE id=1').catch(() => {});
    if (baseline) {
        await db.query(
            'INSERT INTO accident_hotspot_layout (id,FileURL,FileName,FileType,FileSize,UpdatedBy,UpdatedAt) VALUES (1,?,?,?,?,?,?)',
            [baseline.FileURL, baseline.FileName, baseline.FileType, baseline.FileSize, baseline.UpdatedBy, baseline.UpdatedAt]
        );
    }
    for (const [file, bytes] of backups) {
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, bytes);
    }
    await db.query("DELETE FROM Admin_AuditLogs WHERE AdminID=? AND Module='accident'", [marker]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [marker]).catch(() => {});
}

(async () => {
    assert.ok(['node', 'php'].includes(stack), `Unsupported stack: ${stack}`);
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    await db.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261002_accident_hotspot_layout.sql'), 'utf8'));
    const [[scope]] = await db.query("SELECT d.Name Department,COALESCE((SELECT u.name FROM Master_SafetyUnits u WHERE u.department_id=d.id ORDER BY u.id LIMIT 1),'') Unit FROM Master_Departments d ORDER BY d.id LIMIT 1");
    assert.ok(scope?.Department, 'Local master data needs at least one Department');
    await db.query("DELETE FROM Employees WHERE EmployeeName LIKE 'ACC_LAYOUT_UAT_%' AND Password='LOCAL_UAT_NOT_A_LOGIN_HASH'");
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [marker]);
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)',
        [marker, marker, scope.Department, scope.Unit, 'Admin', 'Safety Admin', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );
    const [baselineRows] = await db.query('SELECT * FROM accident_hotspot_layout WHERE id=1 LIMIT 1');
    baseline = baselineRows[0] || null;
    if (baseline?.FileURL) {
        for (const file of candidates(baseline.FileURL)) if (fs.existsSync(file)) backups.set(file, await fs.promises.readFile(file));
    }

    server = stack === 'php'
        ? spawn('C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${port}`, '-t', repoRoot], { cwd: repoRoot, env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
        : spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    server.stderr?.on('data', chunk => { serverErrors += String(chunk).slice(0, 4000); });
    await waitForServer();

    const initial = await request('/accident/hotspot-layout');
    const initialJson = await readJson(initial, 'Initial layout read');
    assert.strictEqual(initial.status, 200, `${JSON.stringify(initialJson)} ${serverErrors}`);

    const fake = new FormData();
    fake.append('layoutFile', new File([Buffer.from('not an image')], `${marker}.png`, { type: 'image/png' }));
    const rejected = await request('/accident/hotspot-layout', { method: 'POST', body: fake });
    assert.strictEqual(rejected.status, 400, 'A forged PNG must be rejected');

    const body = new FormData();
    body.append('layoutFile', new File([png], `${marker}.png`, { type: 'image/png' }));
    const uploaded = await request('/accident/hotspot-layout', { method: 'POST', body });
    const uploadedJson = await readJson(uploaded, 'Layout upload');
    assert.strictEqual(uploaded.status, 200, JSON.stringify(uploadedJson));
    assert.strictEqual(uploadedJson.data.IsDefault, false);
    assert.strictEqual(uploadedJson.data.FileName, `${marker}.png`);
    assert.ok(uploadedJson.data.FileURL);

    const loaded = await request('/accident/hotspot-layout');
    const loadedJson = await readJson(loaded, 'Saved layout read');
    assert.strictEqual(loaded.status, 200);
    assert.strictEqual(loadedJson.data.FileName, `${marker}.png`);

    const reset = await request('/accident/hotspot-layout', { method: 'DELETE' });
    const resetJson = await readJson(reset, 'Layout reset');
    assert.strictEqual(reset.status, 200, JSON.stringify(resetJson));
    assert.strictEqual(resetJson.data.IsDefault, true);
    for (const file of candidates(uploadedJson.data.FileURL)) assert.strictEqual(fs.existsSync(file), false, `Fixture file residue: ${file}`);

    console.log(`Accident Factory Layout ${stack.toUpperCase()} Local UAT: PASS (admin upload, forged-image rejection, read, reset, file cleanup)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { server?.kill(); } catch {}
    await restore().catch(error => { console.error('Restore failed:', error.message); process.exitCode = 1; });
    if (db) await db.end().catch(() => {});
});
