'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const nodeDbName = `tsh_johnny_phase6_node_${stamp}`;
const phpDbName = `tsh_johnny_phase6_php_${stamp}`;
const controlToken = `phase6-${stamp}`;
const workflows = require('../lib/johnny-workflow-actions').getWorkflowActionContract();

assert.ok(loopbackHosts.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Phase 6 UAT refuses non-loopback DB_HOST');
assert.match(String(process.env.DB_NAME || ''), /(test|dev|local|uat|staging)/i, 'Phase 6 UAT requires a development/test source configuration');
assert.strictEqual(workflows.navigationTargets.length, 21, 'Phase 6 release gate requires exactly 21 workflow navigation targets');

let admin;
let nodeProcess;
let phpProcess;
let phpDatabaseCreated = false;
const childOutput = new Map();

function capture(child, label) {
    const record = { stdout: '', stderr: '' };
    childOutput.set(label, record);
    child.stdout.on('data', chunk => { record.stdout += String(chunk); });
    child.stderr.on('data', chunk => { record.stderr += String(chunk); });
    return child;
}

function localRequest(baseUrl, method, route, headers = {}, body = undefined, timeoutMs = 15000) {
    const url = new URL(`${baseUrl}${route}`);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Phase 6 request target must be loopback');
    const payload = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    return new Promise((resolve, reject) => {
        const request = http.request({
            hostname: url.hostname,
            port: Number(url.port),
            path: `${url.pathname}${url.search}`,
            method,
            headers: {
                ...headers,
                ...(payload === null ? {} : { 'Content-Length': Buffer.byteLength(payload) }),
            },
        }, response => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { text += chunk; });
            response.on('end', () => resolve({ status: Number(response.statusCode), text }));
        });
        request.setTimeout(timeoutMs, () => request.destroy(new Error(`Local request timeout after ${timeoutMs}ms`)));
        request.on('error', reject);
        if (payload !== null) request.write(payload);
        request.end();
    });
}

async function api(baseUrl, method, route, token = '', body = undefined) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await localRequest(baseUrl, method, route, headers, body);
    const text = response.text;
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { status: response.status, json, text };
}

async function waitReady(baseUrl, label, child, timeoutMs = 60000) {
    const started = Date.now();
    let lastResponse = '';
    let pingReady = label === 'PHP';
    while (Date.now() - started < timeoutMs) {
        if (child.exitCode !== null) {
            const output = childOutput.get(label);
            throw new Error(`${label} exited before readiness (${child.exitCode})\n${output?.stderr || output?.stdout || ''}`);
        }
        try {
            if (!pingReady) {
                const ping = await localRequest(baseUrl, 'GET', '/__phase6/ping', {}, undefined, 1000);
                pingReady = ping.status === 200;
                if (!pingReady) throw new Error(`ping ${ping.status}`);
            }
            const response = await localRequest(
                baseUrl,
                'GET',
                '/api/johnny/status',
                { Authorization: 'Bearer phase6-admin', Accept: 'application/json' },
                undefined,
                45000
            );
            try { response.json = JSON.parse(response.text); } catch (_) { response.json = null; }
            if (response.status === 200 && response.json?.success) return response;
            lastResponse = `${response.status} ${response.text.slice(0, 500)}`;
        } catch (error) { lastResponse = `${error.name || 'Error'}: ${error.message || error}`; }
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    const output = childOutput.get(label);
    throw new Error(`${label} readiness timeout; last response=${lastResponse || 'none'}\n${output?.stderr || output?.stdout || ''}`);
}

async function databaseAudit(databaseName, expectedLogMinimum) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
    });
    try {
        const [feedbackColumns] = await connection.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=? AND TABLE_NAME='johnny_answer_feedback' ORDER BY ORDINAL_POSITION`,
            [databaseName]
        );
        const columnNames = feedbackColumns.map(row => String(row.COLUMN_NAME));
        assert.deepStrictEqual(columnNames, [
            'id', 'MessageID', 'ConversationID', 'UserID', 'Rating', 'ReasonCode', 'SourceType', 'ContractVersion', 'CreatedAt', 'UpdatedAt',
        ], 'Feedback storage must remain metadata-only');
        assert.ok(!columnNames.some(name => /(text|comment|prompt|answer)/i.test(name)), 'Feedback schema must not store free text');

        const [[counts]] = await connection.query(`
            SELECT
                (SELECT COUNT(*) FROM johnny_chat_conversations) AS conversations,
                (SELECT COUNT(*) FROM johnny_chat_messages) AS messages,
                (SELECT COUNT(*) FROM johnny_answer_feedback) AS feedback,
                (SELECT COUNT(*) FROM johnny_operational_logs WHERE Operation='workflow_action') AS workflowLogs
        `);
        assert.strictEqual(Number(counts.conversations), 0, 'Conversation cleanup residue');
        assert.strictEqual(Number(counts.messages), 0, 'Message cleanup residue');
        assert.strictEqual(Number(counts.feedback), 0, 'Feedback cleanup residue');
        assert.ok(Number(counts.workflowLogs) >= expectedLogMinimum, 'Workflow audit coverage is incomplete');

        const [tables] = await connection.query(
            'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',
            [databaseName]
        );
        const unexpected = tables.map(row => String(row.TABLE_NAME)).filter(name => !/^johnny_|^App_Settings$/i.test(name));
        assert.deepStrictEqual(unexpected, [], 'Phase 6 fixture created a non-Johnny business table');
        return { tables: tables.length, workflowLogs: Number(counts.workflowLogs) };
    } finally {
        await connection.end();
    }
}

async function applySchemaMigration(databaseName) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        multipleStatements: true,
    });
    try {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261006_johnny_phase7_schema.sql'), 'utf8');
        await connection.query(sql);
        await connection.query(sql);
        await connection.query(
            "INSERT INTO johnny_chat_conversations(UserID,Title,CreatedAt,UpdatedAt) VALUES('PHASE7-RETENTION-SENTINEL','must survive runtime startup','2000-01-01','2000-01-01')"
        );
        const [[conversation]] = await connection.query('SELECT LAST_INSERT_ID() AS id');
        await connection.query(
            "INSERT INTO johnny_chat_messages(ConversationID,UserID,Role,MessageText,CreatedAt) VALUES(?, 'PHASE7-RETENTION-SENTINEL', 'user', 'must survive runtime startup', '2000-01-01')",
            [conversation.id]
        );
        await connection.query(
            "INSERT INTO johnny_operational_logs(Level,Operation,Message,CreatedAt) VALUES('info','phase7_retention_sentinel','must survive runtime startup','2000-01-01')"
        );
    } finally {
        await connection.end();
    }
}

async function verifyAndRemoveRetentionSentinel(databaseName, label) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
    });
    try {
        const [[counts]] = await connection.query(`
            SELECT
                (SELECT COUNT(*) FROM johnny_chat_conversations WHERE UserID='PHASE7-RETENTION-SENTINEL') AS conversations,
                (SELECT COUNT(*) FROM johnny_chat_messages WHERE UserID='PHASE7-RETENTION-SENTINEL') AS messages,
                (SELECT COUNT(*) FROM johnny_operational_logs WHERE Operation='phase7_retention_sentinel') AS logs
        `);
        assert.deepStrictEqual(
            [Number(counts.conversations), Number(counts.messages), Number(counts.logs)],
            [1, 1, 1],
            `${label}: runtime startup must not apply retention deletes`
        );
        await connection.query("DELETE FROM johnny_chat_messages WHERE UserID='PHASE7-RETENTION-SENTINEL'");
        await connection.query("DELETE FROM johnny_chat_conversations WHERE UserID='PHASE7-RETENTION-SENTINEL'");
        await connection.query("DELETE FROM johnny_operational_logs WHERE Operation='phase7_retention_sentinel'");
        console.log(`PASS ${label} runtime startup is schema-read-only and retention-free`);
    } finally {
        await connection.end();
    }
}

async function runLifecycle(label, baseUrl, databaseName) {
    const unauthenticated = await api(baseUrl, 'GET', '/api/johnny/status');
    assert.strictEqual(unauthenticated.status, 401, `${label}: unauthenticated access must fail closed`);

    const status = await api(baseUrl, 'GET', '/api/johnny/status', 'phase6-user');
    assert.strictEqual(status.status, 200, `${label}: status failed`);
    assert.strictEqual(status.json.data.phase, 6, `${label}: release phase marker`);
    assert.strictEqual(status.json.data.workflow.navigationTargets.length, 21, `${label}: workflow target count`);
    assert.strictEqual(status.json.data.workflow.autoSubmit, false, `${label}: auto-submit guard`);
    assert.strictEqual(status.json.data.workflow.businessMutation, false, `${label}: business mutation guard`);
    assert.strictEqual(status.json.data.privacy.answerFeedbackStoresMessageText, false, `${label}: feedback text privacy`);
    assert.strictEqual(status.json.data.privacy.answerFeedbackStoresFreeText, false, `${label}: feedback free-text privacy`);

    const chat = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase6-user', {
        message: 'how to use dashboard',
        pageContext: { page: 'dashboard', title: 'Dashboard' },
    });
    assert.strictEqual(chat.status, 200, `${label}: deterministic usage chat failed: ${chat.text}`);
    assert.strictEqual(chat.json.data.sourceType, 'system_usage', `${label}: usage answer must be catalog-grounded`);
    assert.ok(Number(chat.json.data.messageId) > 0, `${label}: persisted assistant answer required`);
    const messageId = Number(chat.json.data.messageId);
    const conversationId = Number(chat.json.data.conversationId);

    const otherHistory = await api(baseUrl, 'GET', '/api/johnny/conversations', 'phase6-other');
    assert.strictEqual(otherHistory.status, 200, `${label}: secondary user history failed`);
    assert.deepStrictEqual(otherHistory.json.data, [], `${label}: conversation ownership leaked`);

    const invalidFeedback = await api(baseUrl, 'PUT', `/api/johnny/messages/${messageId}/feedback`, 'phase6-user', {
        rating: 'not_helpful', reasonCode: 'free form must not be accepted', comment: 'private fixture text',
    });
    assert.strictEqual(invalidFeedback.status, 200, `${label}: unknown feedback reason normalization failed`);
    assert.strictEqual(invalidFeedback.json.data.reasonCode, 'other', `${label}: unknown feedback reason must normalize to metadata-only other`);
    assert.ok(!JSON.stringify(invalidFeedback.json).includes('private fixture text'), `${label}: feedback response leaked free text`);

    const feedback = await api(baseUrl, 'PUT', `/api/johnny/messages/${messageId}/feedback`, 'phase6-user', {
        rating: 'not_helpful', reasonCode: 'unsafe', comment: 'must never be persisted',
    });
    assert.strictEqual(feedback.status, 200, `${label}: feedback save failed`);
    assert.ok(!JSON.stringify(feedback.json).includes('must never be persisted'), `${label}: feedback response leaked free text`);

    const foreignFeedback = await api(baseUrl, 'PUT', `/api/johnny/messages/${messageId}/feedback`, 'phase6-other', {
        rating: 'helpful', reasonCode: '',
    });
    assert.strictEqual(foreignFeedback.status, 404, `${label}: foreign feedback ownership must fail closed`);

    for (const target of workflows.navigationTargets) {
        const action = await api(baseUrl, 'POST', '/api/johnny/workflow-actions', 'phase6-user', {
            action: 'navigate', target: target.key, messageId,
        });
        assert.strictEqual(action.status, 200, `${label}: workflow ${target.key} failed: ${action.text}`);
        assert.strictEqual(action.json.data.route, target.route, `${label}: workflow route mismatch for ${target.key}`);
        assert.strictEqual(action.json.data.autoSubmit, false, `${label}: workflow auto-submit invariant`);
        assert.strictEqual(action.json.data.businessMutation, false, `${label}: workflow mutation invariant`);
    }

    const foreignWorkflow = await api(baseUrl, 'POST', '/api/johnny/workflow-actions', 'phase6-other', {
        action: 'navigate', target: 'dashboard', messageId,
    });
    assert.strictEqual(foreignWorkflow.status, 404, `${label}: foreign workflow ownership must fail closed`);

    const unsupportedDraft = await api(baseUrl, 'POST', '/api/johnny/workflow-actions', 'phase6-user', {
        action: 'draft', target: 'dashboard', messageId,
    });
    assert.strictEqual(unsupportedDraft.status, 400, `${label}: unsupported draft must be rejected`);
    for (const target of workflows.draftTargets) {
        const draft = await api(baseUrl, 'POST', '/api/johnny/workflow-actions', 'phase6-user', {
            action: 'draft', target: target.key, messageId,
        });
        assert.strictEqual(draft.status, 200, `${label}: supported draft ${target.key} failed`);
        assert.strictEqual(draft.json.data.businessMutation, false, `${label}: draft mutation invariant`);
    }

    const userObservability = await api(baseUrl, 'GET', '/api/johnny/observability?days=1', 'phase6-user');
    assert.strictEqual(userObservability.status, 403, `${label}: observability must be Admin-only`);
    const adminObservability = await api(baseUrl, 'GET', '/api/johnny/observability?days=1', 'phase6-admin');
    assert.strictEqual(adminObservability.status, 200, `${label}: Admin observability failed`);
    assert.ok(Number(adminObservability.json.data.feedback?.total) >= 1, `${label}: feedback observability missing`);
    const observedWorkflowTotal = (adminObservability.json.data.workflow?.actions || [])
        .reduce((sum, row) => sum + Number(row.total || 0), 0);
    assert.ok(observedWorkflowTotal >= 24, `${label}: workflow observability missing`);

    const detail = await api(baseUrl, 'GET', `/api/johnny/conversations/${conversationId}`, 'phase6-user');
    assert.strictEqual(detail.status, 200, `${label}: conversation detail failed`);
    const assistant = detail.json.data.messages.find(row => Number(row.id) === messageId);
    assert.strictEqual(assistant.FeedbackRating, 'not_helpful', `${label}: feedback metadata missing from history`);
    assert.strictEqual(assistant.FeedbackReasonCode, 'unsafe', `${label}: feedback reason missing from history`);

    const removeFeedback = await api(baseUrl, 'DELETE', `/api/johnny/messages/${messageId}/feedback`, 'phase6-user');
    assert.strictEqual(removeFeedback.status, 200, `${label}: feedback removal failed`);
    const restoreFeedback = await api(baseUrl, 'PUT', `/api/johnny/messages/${messageId}/feedback`, 'phase6-user', {
        rating: 'helpful', reasonCode: '',
    });
    assert.strictEqual(restoreFeedback.status, 200, `${label}: feedback cascade fixture failed`);

    const removeConversation = await api(baseUrl, 'DELETE', `/api/johnny/conversations/${conversationId}`, 'phase6-user');
    assert.strictEqual(removeConversation.status, 200, `${label}: conversation deletion failed`);
    const missingConversation = await api(baseUrl, 'GET', `/api/johnny/conversations/${conversationId}`, 'phase6-user');
    assert.strictEqual(missingConversation.status, 404, `${label}: deleted conversation remained visible`);

    const audit = await databaseAudit(databaseName, workflows.navigationTargets.length + workflows.draftTargets.length);
    console.log(`PASS ${label} lifecycle: 21 modules, feedback/privacy/permission, tables=${audit.tables}, workflowLogs=${audit.workflowLogs}, zero chat residue`);
}

async function schemaExists(databaseName) {
    const [[row]] = await admin.query(
        'SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?',
        [databaseName]
    );
    return Number(row.count) > 0;
}

async function waitExit(child, timeoutMs = 10000) {
    if (!child || child.exitCode !== null) return;
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Fixture child exit timeout')), timeoutMs)),
    ]);
}

async function main() {
    admin = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });

    nodeProcess = capture(spawn(process.execPath, [path.join(__dirname, 'johnny-phase6-node-fixture-host.js')], {
        cwd: root,
        env: {
            ...process.env,
            JOHNNY_PHASE6_PORT: '5061',
            JOHNNY_PHASE6_DB_NAME: nodeDbName,
            JOHNNY_PHASE6_CONTROL_TOKEN: controlToken,
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    }), 'Node');
    await waitReady('http://127.0.0.1:5061', 'Node', nodeProcess);
    await verifyAndRemoveRetentionSentinel(nodeDbName, 'Node');
    await runLifecycle('Node', 'http://127.0.0.1:5061', nodeDbName);
    const cleanupResponse = await localRequest(
        'http://127.0.0.1:5061', 'POST', '/__phase6/cleanup', { 'x-phase6-control': controlToken }
    );
    assert.strictEqual(cleanupResponse.status, 200, 'Node fixture cleanup endpoint failed');
    await waitExit(nodeProcess);
    assert.strictEqual(await schemaExists(nodeDbName), false, 'Node fixture database residue remains');
    console.log('PASS Node database drop verification: zero residue');

    await admin.query(`CREATE DATABASE \`${phpDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    phpDatabaseCreated = true;
    await applySchemaMigration(phpDbName);
    phpProcess = capture(spawn(phpBin, ['-S', '127.0.0.1:5062', path.join(__dirname, 'johnny-phase6-php-router.php')], {
        cwd: root,
        env: { ...process.env, DB_NAME: phpDbName },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    }), 'PHP');
    await waitReady('http://127.0.0.1:5062', 'PHP', phpProcess);
    await verifyAndRemoveRetentionSentinel(phpDbName, 'PHP');
    await runLifecycle('PHP', 'http://127.0.0.1:5062', phpDbName);
    phpProcess.kill();
    await waitExit(phpProcess);
    phpProcess = null;
    await admin.query(`DROP DATABASE IF EXISTS \`${phpDbName}\``);
    phpDatabaseCreated = false;
    assert.strictEqual(await schemaExists(phpDbName), false, 'PHP fixture database residue remains');
    console.log('PASS PHP database drop verification: zero residue');
    console.log('Johnny AI Phase 6 Integrated Local UAT: PASS (mock-only Node/PHP lifecycle, authenticated permissions, feedback/privacy, 21-module workflow, cleanup zero residue)');
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    if (nodeProcess && nodeProcess.exitCode === null) nodeProcess.kill();
    if (phpProcess && phpProcess.exitCode === null) phpProcess.kill();
    if (admin) {
        if (/^tsh_johnny_phase6_node_\d+_\d+$/.test(nodeDbName)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${nodeDbName}\``).catch(() => {});
        }
        if (phpDatabaseCreated && /^tsh_johnny_phase6_php_\d+_\d+$/.test(phpDbName)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${phpDbName}\``).catch(() => {});
        }
        await admin.end().catch(() => {});
    }
});
