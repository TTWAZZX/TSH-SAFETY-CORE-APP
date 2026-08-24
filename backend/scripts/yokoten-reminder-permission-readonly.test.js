'use strict';

const assert = require('assert');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const phpBase = String(process.env.LOCAL_PHP_API_URL || 'http://localhost/tsh-safety-core/api/index.php?route=');

async function businessFingerprint() {
    const [[row]] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM YokotenResponses) responses,
            (SELECT COUNT(*) FROM Yokoten_EmailOutbox) outbox
    `);
    return row;
}

async function post(url, token, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: response.status, json, text };
}

async function get(url, token) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `${url}: ${JSON.stringify(json).slice(0, 500)}`);
    return json;
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const { admin, user } = await loadReadyTestUsers(db);
    const adminToken = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '10m' });
    const userToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '10m' });
    const before = await businessFingerprint();
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const nodeUrl = `http://127.0.0.1:${server.address().port}/api/yokoten/reminders/send`;
        const phpUrl = `${phpBase}yokoten/reminders/send`;
        const [nodeUser, phpUser, nodeAdmin, phpAdmin] = await Promise.all([
            post(nodeUrl, userToken, {}),
            post(phpUrl, userToken, {}),
            post(nodeUrl, adminToken, {}),
            post(phpUrl, adminToken, {}),
        ]);
        assert.strictEqual(nodeUser.status, 403, `Node User status: ${nodeUser.text}`);
        assert.strictEqual(phpUser.status, 403, `PHP User status: ${phpUser.text}`);
        assert.strictEqual(nodeAdmin.status, 400, `Node Admin validation status: ${nodeAdmin.text}`);
        assert.strictEqual(phpAdmin.status, 400, `PHP Admin validation status: ${phpAdmin.text}`);
        assert.match(String(nodeAdmin.json?.message || ''), /Topic/i);
        assert.match(String(phpAdmin.json?.message || ''), /Topic/i);

        const completion = await get(`http://127.0.0.1:${server.address().port}/api/yokoten/dept-completion`, adminToken);
        let completedScope = null;
        for (const department of completion?.data?.deptSummary || []) {
            const topic = (department.topicBreakdown || []).find(row => row.responded === true);
            if (topic) {
                completedScope = { topicId: topic.YokotenID, department: department.department };
                break;
            }
        }
        assert.ok(completedScope, 'A completed local Yokoten scope is required for no-send validation');
        const completedBody = { topicId: completedScope.topicId, departments: [completedScope.department] };
        const [nodeComplete, phpComplete] = await Promise.all([
            post(nodeUrl, adminToken, completedBody),
            post(phpUrl, adminToken, completedBody),
        ]);
        assert.strictEqual(nodeComplete.status, 400, `Node completed-scope guard: ${nodeComplete.text}`);
        assert.strictEqual(phpComplete.status, 400, `PHP completed-scope guard: ${phpComplete.text}`);
        assert.match(String(nodeComplete.json?.message || ''), /already completed/i);
        assert.match(String(phpComplete.json?.message || ''), /already completed/i);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
    const after = await businessFingerprint();
    assert.deepStrictEqual(after, before, 'Reminder permission/validation probes must not change Yokoten responses or outbox');
    console.log('PASS Yokoten Reminder Node/PHP permission and validation parity; business fingerprint unchanged');
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
