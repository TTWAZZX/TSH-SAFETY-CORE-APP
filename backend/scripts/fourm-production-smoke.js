'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const api = `${base}/api`;
const checks = [];

function record(name, details = {}) {
    checks.push({ name, passed: true, ...details });
    console.log(`PASS ${name}`);
}

async function call(relative, { method = 'GET', token, body, form } = {}) {
    const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${api}${relative}`, {
        method,
        headers,
        body: form || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { response, json, text };
}

async function login(employeeId, password) {
    assert.ok(employeeId && password, 'Production UAT credentials are required');
    const result = await call('/login', { method: 'POST', body: { employeeId, password } });
    assert.strictEqual(result.response.status, 200, result.text.slice(0, 300));
    assert.ok(result.json?.token, 'Login token missing');
    return result.json.token;
}

async function staticFile(relative, localPath, marker) {
    const response = await fetch(`${base}/${relative}?smoke=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    assert.strictEqual(response.status, 200, `${relative} status`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const remoteHash = crypto.createHash('sha256').update(bytes).digest('hex');
    const localHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, localPath))).digest('hex');
    assert.strictEqual(remoteHash, localHash, `${relative} SHA-256`);
    assert.ok(bytes.toString('utf8').includes(marker), `${relative} marker`);
    record(`Static ${relative}`, { sha256: remoteHash });
}

async function main() {
    await staticFile('index.html', 'index.html', 'main.js?v=20260819-fourm-stabilization');
    await staticFile('public/js/main.js', 'public/js/main.js', 'fourm.js?v=20260819-fourm-stabilization');
    await staticFile('public/js/pages/fourm.js', 'public/js/pages/fourm.js', "fd.delete('attachment')");
    const unauth = await call('/fourm/notices');
    assert.strictEqual(unauth.response.status, 401, 'Unauthenticated 4M boundary');
    record('Unauthenticated 4M boundary', { status: 401 });

    const adminToken = await login(process.env.PROD_UAT_ADMIN_ID, process.env.PROD_UAT_ADMIN_PASSWORD);
    const userToken = await login(process.env.PROD_UAT_USER_ID, process.env.PROD_UAT_USER_PASSWORD);
    record('Production Admin and User login', { expectedSideEffect: 'normal login audit/housekeeping only' });

    const verify = await call('/session/verify', { method: 'POST', token: userToken, body: {} });
    assert.strictEqual(verify.response.status, 200, verify.text.slice(0, 300));
    record('User session verify', { status: 200 });

    const userCreateBoundary = await call('/fourm/notices', {
        method: 'POST', token: userToken, body: { ChangeType: 'Man' },
    });
    assert.strictEqual(userCreateBoundary.response.status, 400, userCreateBoundary.text.slice(0, 300));
    record('User reaches Notice create validation without Admin 403', { status: 400, rowsCreated: 0 });

    const year = new Date().getFullYear();
    for (const relative of [
        `/fourm/stats?year=${year}`,
        `/fourm/man-records?year=${year}`,
        `/fourm/training-curriculums?year=${year}`,
        '/fourm/training-course-master?includeInactive=1',
        `/fourm/training-employee-scopes?year=${year}`,
        `/fourm/training-logs?year=${year}&limit=5`,
    ]) {
        const result = await call(relative, { token: adminToken });
        assert.strictEqual(result.response.status, 200, `${relative}: ${result.text.slice(0, 300)}`);
        assert.strictEqual(result.json?.success, true, relative);
    }
    record('4M and Training Matrix read paths', { paths: 6 });

    const closedList = await call(`/fourm/notices?status=Closed&year=${year}`, { token: adminToken });
    assert.strictEqual(closedList.response.status, 200, closedList.text.slice(0, 300));
    const notice = closedList.json?.data?.[0];
    assert.ok(notice?.id, 'A closed Notice is required for no-op edit smoke');
    const before = {
        Title: notice.Title,
        Status: notice.Status,
        AttachmentUrl: notice.AttachmentUrl || null,
    };
    const form = new FormData();
    form.append('Title', notice.Title);
    form.append('attachment', new Blob([]), '');
    const edit = await call(`/fourm/notices/${encodeURIComponent(notice.id)}`, {
        method: 'PUT', token: adminToken, form,
    });
    assert.strictEqual(edit.response.status, 200, edit.text.slice(0, 300));
    const afterList = await call(`/fourm/notices?status=Closed&year=${year}`, { token: adminToken });
    const afterNotice = afterList.json?.data?.find(row => String(row.id) === String(notice.id));
    assert.deepStrictEqual({
        Title: afterNotice?.Title,
        Status: afterNotice?.Status,
        AttachmentUrl: afterNotice?.AttachmentUrl || null,
    }, before, 'Closed Notice no-op edit must retain status and attachment');
    record('Closed Notice edit with empty attachment', { noticeId: notice.id, dataChanged: false });

    const masterList = await call('/fourm/training-course-master?includeInactive=1', { token: adminToken });
    const master = masterList.json?.data?.[0];
    assert.ok(master?.CourseCode, 'Course Master row required for duplicate smoke');
    const duplicateMaster = await call('/fourm/training-course-master', {
        method: 'POST', token: adminToken,
        body: { CourseCode: master.CourseCode, CourseTitle: master.CourseTitle },
    });
    if (duplicateMaster.response.status === 201 && duplicateMaster.json?.data?.id) {
        const accidentalId = duplicateMaster.json.data.id;
        const cleanup = await call(`/fourm/training-course-master/${encodeURIComponent(accidentalId)}?hard=1`, {
            method: 'DELETE', token: adminToken,
        });
        assert.strictEqual(cleanup.response.status, 200, `Accidental duplicate cleanup failed: ${cleanup.text.slice(0, 300)}`);
        throw new Error(`Duplicate guard failed; accidental row ${accidentalId} was cleaned up`);
    }
    assert.strictEqual(duplicateMaster.response.status, 409, duplicateMaster.text.slice(0, 300));
    assert.strictEqual(duplicateMaster.json?.code, 'FOURM_DUPLICATE');
    record('Course Master duplicate response', { status: 409, rowsCreated: 0 });

    const invalidMan = await call('/fourm/man-records', {
        method: 'POST', token: adminToken,
        body: { Department: 'PRODUCTION 1 SEC.', Status: 'INVALID', TotalAttendance: 0, Pass: 0, Fail: 0 },
    });
    assert.strictEqual(invalidMan.response.status, 400, invalidMan.text.slice(0, 300));
    record('Man Record status validation', { status: 400, rowsCreated: 0 });

    const evidence = {
        production: base,
        executedAt: new Date().toISOString(),
        authenticated: true,
        checks,
        passed: true,
        businessDataChanged: false,
        temporaryRowsRemaining: 0,
    };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const evidenceDir = path.join(root, 'backups', 'production', `fourm-stabilization-smoke-${stamp}`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(evidence, null, 2));
    console.log(`EVIDENCE=${path.relative(root, evidenceDir).replace(/\\/g, '/')}`);
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
