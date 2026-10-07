'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const phase83Mode = process.env.JOHNNY_PHASE83_ANSWER_VERIFICATION === '1';
const phase82Mode = phase83Mode || process.env.JOHNNY_PHASE82_MULTI_SOURCE === '1';
const phaseTag = phase83Mode ? 'phase83' : (phase82Mode ? 'phase82' : 'phase81');
const nodeDbName = `tsh_johnny_${phaseTag}_node_${stamp}`;
const phpDbName = `tsh_johnny_${phaseTag}_php_${stamp}`;
const nodeUrl = 'http://127.0.0.1:5081';
const phpUrl = 'http://127.0.0.1:5082';
const mockUrl = 'http://127.0.0.1:5080/v1beta';
const controlToken = `phase81-${stamp}`;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

assert.ok(loopbackHosts.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Phase 8.1 UAT refuses non-loopback DB_HOST');
assert.match(String(process.env.DB_NAME || ''), /(test|dev|local|uat|staging)/i, 'Phase 8.1 UAT requires development/test source configuration');

let admin;
let mockServer;
let nodeProcess;
let phpProcess;
let phpDatabaseCreated = false;
const childOutput = new Map();
const mockStats = { embeddings: 0, generations: 0, webToolRequests: 0 };

function capture(child, label) {
    const record = { stdout: '', stderr: '' };
    childOutput.set(label, record);
    child.stdout.on('data', chunk => { record.stdout += String(chunk); });
    child.stderr.on('data', chunk => { record.stderr += String(chunk); });
    return child;
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let value = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { value += chunk; });
        req.on('end', () => {
            try { resolve(value ? JSON.parse(value) : {}); } catch (error) { reject(error); }
        });
        req.on('error', reject);
    });
}

function embeddingFor(text) {
    const value = String(text || '').toLowerCase();
    if (/approval|approver|อนุมัติ/.test(value)) return [0, 1, 0, 0];
    if (/chemical|eye|eyewash|emergency|ฉุกเฉิน/.test(value)) return [0, 0, 1, 0];
    if (/patrol/.test(value) && /(how many|open|system|จำนวน|กี่)/.test(value)) return [0, 0, 0, 1];
    return [1, 0, 0, 0];
}

function generatedAnswer(payload) {
    const serialized = JSON.stringify(payload).toLowerCase();
    if (/hallucination guard/.test(serialized)) {
        return 'The required eyewash duration is 30 minutes.';
    }
    if (/chemical|eyewash|eye splash/.test(serialized)) {
        return 'Emergency response: use the eyewash immediately and flush continuously for at least 15 minutes. Call onsite emergency support and obtain medical evaluation; do not delay flushing.';
    }
    if (/sole final approver|approval matrix|selected knowledge base document/.test(serialized)) {
        return 'The selected document states that the Plant Manager is the sole final approver for a high-risk corrective action, after SHE Manager review.';
    }
    if (/notification deadline|documents agree/.test(serialized) && /before the end of the shift/.test(serialized) && /within 24 hours/.test(serialized)) {
        return 'The selected company documents conflict: the accident policy says before the end of the shift, while the investigation procedure says within 24 hours. Verify the controlling approved policy with SHE before relying on either deadline.';
    }
    if (/safety patrol/.test(serialized) && /system data context|open\/in progress|openitems|issues/.test(serialized)) {
        return 'The verified TSH system data shows 3 Safety Patrol walks this year and this month, with 2 open or in-progress issues and 1 closed issue.';
    }
    return 'Company policy requires immediate notification to the direct supervisor and SHE, followed by recording the incident in Accident Reporting before the end of the shift. Open the Accident module and create the report for review.';
}

async function startMockGemini() {
    mockServer = http.createServer(async (req, res) => {
        try {
            const body = await readRequestBody(req);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (String(req.url).includes(':embedContent')) {
                mockStats.embeddings += 1;
                const text = body?.content?.parts?.map(part => part.text || '').join(' ') || '';
                res.end(JSON.stringify({ embedding: { values: embeddingFor(text) } }));
                return;
            }
            if (String(req.url).includes(':generateContent')) {
                mockStats.generations += 1;
                if (Array.isArray(body.tools) && body.tools.length) mockStats.webToolRequests += 1;
                res.end(JSON.stringify({
                    candidates: [{ content: { parts: [{ text: generatedAnswer(body) }] }, finishReason: 'STOP' }],
                    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30 },
                }));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: { message: 'Unknown local mock route' } }));
        } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: { message: error.message } }));
        }
    });
    await new Promise((resolve, reject) => {
        mockServer.once('error', reject);
        mockServer.listen(5080, '127.0.0.1', resolve);
    });
}

function localRequest(baseUrl, method, route, headers = {}, body = undefined, timeoutMs = 15000) {
    const url = new URL(`${baseUrl}${route}`);
    assert.ok(loopbackHosts.has(url.hostname), 'Phase 8.1 request target must be loopback');
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const request = http.request({
            hostname: url.hostname,
            port: Number(url.port),
            path: `${url.pathname}${url.search}`,
            method,
            headers: { ...headers, ...(payload === null ? {} : { 'Content-Length': Buffer.byteLength(payload) }) },
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
    const response = await localRequest(baseUrl, method, route, headers, body, 30000);
    let json = null;
    try { json = response.text ? JSON.parse(response.text) : null; } catch (_) {}
    return { ...response, json };
}

async function waitReady(baseUrl, label, child) {
    const started = Date.now();
    let last = '';
    while (Date.now() - started < 60000) {
        if (child.exitCode !== null) {
            const output = childOutput.get(label);
            throw new Error(`${label} exited before readiness (${child.exitCode})\n${output?.stderr || output?.stdout || ''}`);
        }
        try {
            const response = await api(baseUrl, 'GET', '/api/johnny/status', 'phase81-admin');
            if (response.status === 200 && response.json?.success) return;
            last = `${response.status} ${response.text.slice(0, 500)}`;
        } catch (error) { last = error.message; }
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    const output = childOutput.get(label);
    throw new Error(`${label} readiness timeout: ${last}\n${output?.stderr || output?.stdout || ''}`);
}

async function applyAndSeed(databaseName) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        multipleStatements: true,
    });
    try {
        const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261006_johnny_phase7_schema.sql'), 'utf8');
        await connection.query(migration);
        await connection.query(migration);
        const baseDocs = [
            { title: 'Phase 8.1 Accident Company Policy', sourceType: 'document', vector: [1, 0, 0, 0], chunks: ['Company accident policy fixture: immediately notify the direct supervisor and SHE. Preserve the scene when safe, obtain first aid, and record the incident in Accident Reporting before the end of the shift.'] },
            { title: 'Phase 8.1 Approval Matrix', sourceType: 'document', vector: [0, 1, 0, 0], chunks: ['Scoped approval fixture: the Plant Manager is the sole final approver for a high-risk corrective action. The SHE Manager reviews the evidence before final approval.'] },
            { title: 'Phase 8.1 Emergency Eye Wash Manual', sourceType: 'manual', vector: [0, 0, 1, 0], chunks: ['Emergency chemical eye splash fixture: go to the eyewash immediately, flush continuously for at least 15 minutes, call onsite emergency support, and obtain medical evaluation. Do not delay flushing.'] },
        ];
        const docs = phase82Mode ? [
            {
                title: 'Phase 8.2 Accident Company Policy', sourceType: 'document', vector: [1, 0, 0, 0], chunks: [
                    'Company accident policy fixture: immediately notify the direct supervisor and SHE. Preserve the scene when safe, obtain first aid, and record the incident in Accident Reporting before the end of the shift.',
                    'Company accident policy fixture: immediately notify the direct supervisor and SHE. Preserve the scene when safe, obtain first aid, and record the incident in Accident Reporting before the end of the shift.',
                    'Accident escalation fixture: serious cases also require the Plant Manager to be notified after the immediate supervisor and SHE notification.',
                ],
            },
            { title: 'Phase 8.2 Accident Investigation Procedure', sourceType: 'document', vector: [1, 0, 0, 0], chunks: ['Investigation procedure fixture: notify the direct supervisor and SHE, then register the initial accident record within 24 hours. The procedure does not replace immediate emergency response.'] },
            { title: 'Phase 8.2 Approval Matrix', sourceType: 'document', vector: [0, 1, 0, 0], chunks: ['Scoped approval fixture: the Plant Manager is the sole final approver for a high-risk corrective action. The SHE Manager reviews the evidence before final approval.'] },
            { title: 'Phase 8.2 Emergency Eye Wash Manual', sourceType: 'manual', vector: [0, 0, 1, 0], chunks: ['Emergency chemical eye splash fixture: go to the eyewash immediately, flush continuously for at least 15 minutes, call onsite emergency support, and obtain medical evaluation. Do not delay flushing.'] },
            { title: 'Phase 8.2 Company Chemical Response Plan', sourceType: 'document', vector: [0, 0, 1, 0], chunks: ['Company chemical response fixture: activate onsite emergency support during eye flushing and arrange medical evaluation after at least 15 minutes of continuous eyewash.'] },
        ] : baseDocs;
        let scopedDocumentId = 0;
        let chunkCount = 0;
        for (const { title, sourceType, vector, chunks } of docs) {
            const text = chunks.join('\n\n');
            const [insert] = await connection.query(
                `INSERT INTO johnny_kb_documents
                 (Title,Category,OriginalName,StoredName,FileUrl,MimeType,FileSize,SourceType,TextContent,IsActive,IndexedStatus,ChunkCount,UploadedBy,UploadedByName,LastIndexedAt)
                 VALUES (?,?,?,?,?,?,?,?,?,1,'ready',?,'PHASE81-ADMIN',?,NOW())`,
                [title, `${phaseTag}-fixture`, `${title}.txt`, `${phaseTag}-fixture.txt`, '', 'text/plain', text.length, sourceType, text, chunks.length, phase82Mode ? 'Phase 8.2 Fixture' : 'Phase 8.1 Fixture']
            );
            if (title.includes('Approval Matrix')) scopedDocumentId = Number(insert.insertId);
            for (let index = 0; index < chunks.length; index += 1) {
                await connection.query(
                    `INSERT INTO johnny_kb_chunks(DocumentID,ChunkIndex,ChunkText,PageLabel,EmbeddingJson,EmbeddingModel,TokenEstimate)
                     VALUES (?,?,?,?,?,'phase81-local-embedding',?)`,
                    [insert.insertId, index, chunks[index], `Fixture page ${index + 1}`, JSON.stringify(vector), Math.ceil(chunks[index].length / 4)]
                );
                chunkCount += 1;
            }
        }
        await connection.query('CREATE TABLE Patrol_Attendance (id INT AUTO_INCREMENT PRIMARY KEY, PatrolDate DATE NOT NULL, UserID VARCHAR(50) NOT NULL) ENGINE=InnoDB');
        await connection.query('CREATE TABLE Patrol_Issues (id INT AUTO_INCREMENT PRIMARY KEY, Area VARCHAR(80) NOT NULL, Status VARCHAR(30) NOT NULL) ENGINE=InnoDB');
        await connection.query("INSERT INTO Patrol_Attendance(PatrolDate,UserID) VALUES (CURDATE(),'P81-A'),(CURDATE(),'P81-B'),(CURDATE(),'P81-A')");
        await connection.query("INSERT INTO Patrol_Issues(Area,Status) VALUES ('Assembly','Open'),('Warehouse','In Progress'),('Office','Closed')");
        return { scopedDocumentId, fixtureCounts: { documents: docs.length, chunks: chunkCount } };
    } finally {
        await connection.end();
    }
}

function sourceTypes(data) {
    return (data.sources || []).map(source => source.type).sort();
}

async function runCases(label, baseUrl, scopedDocumentId) {
    const unauthenticated = await api(baseUrl, 'POST', '/api/johnny/chat', '', { message: 'How do I use the Dashboard?' });
    assert.strictEqual(unauthenticated.status, 401, `${label}: authentication must be required`);

    const beforePure = { ...mockStats };
    const pure = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
        message: 'How do I use the Dashboard?',
        pageContext: { page: 'dashboard', title: 'Dashboard' },
    });
    assert.strictEqual(pure.status, 200, `${label}: pure usage failed: ${pure.text}`);
    assert.ok(pure.json?.data, `${label}: pure usage returned non-JSON/empty data: ${pure.text}`);
    assert.strictEqual(pure.json.data.sourceType, 'system_usage', `${label}: pure usage source`);
    assert.deepStrictEqual(sourceTypes(pure.json.data), ['system_usage'], `${label}: pure usage must not blend sources`);
    assert.strictEqual(mockStats.embeddings, beforePure.embeddings, `${label}: pure usage must bypass retrieval`);
    assert.strictEqual(mockStats.generations, beforePure.generations, `${label}: pure usage must bypass generation`);
    assert.strictEqual(pure.json.data.answerQuality.usageKnowledge.pureUsage, true, `${label}: pure usage metadata`);

    const mixed = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
        message: 'According to company policy, how do I open the Accident reporting screen?',
        pageContext: { page: 'dashboard', title: 'Dashboard' },
    });
    assert.strictEqual(mixed.status, 200, `${label}: mixed policy/UI failed: ${mixed.text}`);
    assert.strictEqual(mixed.json.data.sourceType, 'company_document', `${label}: mixed policy/UI primary source; response=${JSON.stringify(mixed.json.data)}`);
    assert.deepStrictEqual(sourceTypes(mixed.json.data), ['company_document', 'system_usage'], `${label}: mixed source preservation`);
    assert.strictEqual(mixed.json.data.answerQuality.usageKnowledge.mixedIntent, true, `${label}: mixed intent metadata`);
    assert.strictEqual(mixed.json.data.answerQuality.evidenceRanking?.version, '2026-10-07-phase8.2-r1', `${label}: mixed evidence ranking contract`);
    assert.ok(Number(mixed.json.data.answerQuality.evidenceRanking?.selectedCount) >= 1, `${label}: mixed evidence selection metadata`);
    assert.match(mixed.json.data.answer, /supervisor|SHE/i, `${label}: mixed answer must use policy evidence`);
    if (phase82Mode) {
        const ranked = mixed.json.data.citations.filter(citation => citation.rankingContract === '2026-10-07-phase8.2-r1');
        const counts = ranked.reduce((map, citation) => map.set(Number(citation.documentId), (map.get(Number(citation.documentId)) || 0) + 1), new Map());
        assert.ok(ranked.length >= 3, `${label}: multi-source policy retrieval selected too little evidence`);
        assert.ok(new Set(ranked.map(citation => Number(citation.documentId))).size >= 2, `${label}: policy evidence lacks document diversity`);
        assert.ok([...counts.values()].every(count => count <= 2), `${label}: a document monopolized the result`);
        assert.strictEqual(new Set(ranked.map(citation => citation.excerpt.toLowerCase().replace(/\s+/g, ' ').trim())).size, ranked.length, `${label}: duplicate chunk survived ranking`);
        assert.deepStrictEqual(ranked.map(citation => citation.rank), ranked.map((_, index) => index + 1), `${label}: citation ranks are not contiguous`);
        assert.ok(ranked.every(citation => citation.trace?.method === 'phase8.2_multi_source_hybrid'), `${label}: citation trace contract missing`);
        assert.ok(Number(mixed.json.data.answerQuality.evidenceRanking.distinctDocuments) >= 2, `${label}: ranking summary lacks diversity`);
    }

    const scoped = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
        message: 'Who is the final approver in this selected document?',
        documentId: scopedDocumentId,
    });
    assert.strictEqual(scoped.status, 200, `${label}: scoped document failed: ${scoped.text}`);
    assert.strictEqual(scoped.json.data.sourceType, 'company_document', `${label}: scoped source`);
    assert.ok(scoped.json.data.citations.length > 0, `${label}: scoped citation missing`);
    assert.ok(scoped.json.data.citations.every(citation => Number(citation.documentId) === scopedDocumentId), `${label}: scoped retrieval leaked another document`);
    assert.strictEqual(scoped.json.data.answerQuality.evidenceRanking?.diversityApplied, false, `${label}: scoped retrieval must disable cross-document diversity`);
    assert.match(scoped.json.data.answer, /Plant Manager/i, `${label}: scoped answer must use selected evidence`);

    const live = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
        message: 'How many open Safety Patrol issues are in the system this year?',
    });
    assert.strictEqual(live.status, 200, `${label}: live data failed: ${live.text}`);
    assert.strictEqual(live.json.data.sourceType, 'system_data', `${label}: live data source`);
    assert.deepStrictEqual(sourceTypes(live.json.data), ['system_data'], `${label}: live data must not be replaced by usage guidance`);
    assert.match(live.json.data.answer, /2 open|2 open or in-progress/i, `${label}: live answer did not use fixture totals`);

    const emergency = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
        message: 'Emergency: what should I do immediately if chemical splashes into my eyes?',
        pageContext: { page: 'patrol', title: 'Safety Patrol' },
    });
    assert.strictEqual(emergency.status, 200, `${label}: emergency failed: ${emergency.text}`);
    assert.strictEqual(emergency.json.data.sourceType, 'safety_knowledge', `${label}: emergency source`);
    assert.deepStrictEqual(
        sourceTypes(emergency.json.data),
        phase82Mode ? ['company_document', 'safety_knowledge'] : ['safety_knowledge'],
        `${label}: emergency evidence source preservation`
    );
    assert.deepStrictEqual(
        emergency.json.data.answerQuality.evidenceRanking?.sourceTypes,
        phase82Mode ? ['safety_knowledge', 'company_document'] : ['safety_knowledge'],
        `${label}: emergency evidence ranking source`
    );
    assert.match(emergency.json.data.answer, /15 minutes/i, `${label}: emergency evidence missing`);
    assert.strictEqual(emergency.json.data.answerQuality.answerVerification?.status, 'verified', `${label}: emergency critical fact was not verified`);

    let conflict = null;
    if (phase82Mode) {
        assert.deepStrictEqual(emergency.json.data.answerQuality.evidenceRanking?.sourceTypes, ['safety_knowledge', 'company_document'], `${label}: emergency must preserve safety and company evidence roles`);
        assert.deepStrictEqual(sourceTypes(emergency.json.data), ['company_document', 'safety_knowledge'], `${label}: emergency source groups missing`);
        assert.strictEqual(emergency.json.data.citations[0]?.type, 'safety_knowledge', `${label}: safety evidence must rank first for emergency intent`);
        conflict = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
            message: 'Do these company documents agree on the accident notification deadline?',
        });
        assert.strictEqual(conflict.status, 200, `${label}: conflict synthesis failed: ${conflict.text}`);
        assert.ok(Number(conflict.json.data.answerQuality.evidenceRanking?.distinctDocuments) >= 2, `${label}: conflict case lacks multi-document evidence`);
        assert.match(conflict.json.data.answer, /conflict|before the end of the shift|within 24 hours/i, `${label}: synthesis hid conflicting evidence`);
        assert.match(conflict.json.data.answer, /verify|SHE/i, `${label}: conflict answer lacks verification guidance`);
    }

    let hallucinationGuard = null;
    if (phase83Mode) {
        hallucinationGuard = await api(baseUrl, 'POST', '/api/johnny/chat', 'phase81-user', {
            message: 'For the chemical eye splash procedure, test the hallucination guard and state the required eyewash duration.',
        });
        assert.strictEqual(hallucinationGuard.status, 200, `${label}: hallucination guard request failed: ${hallucinationGuard.text}`);
        assert.strictEqual(hallucinationGuard.json.data.sourceType, 'safety_knowledge', `${label}: hallucination guard lost grounded source`);
        assert.strictEqual(hallucinationGuard.json.data.answerQuality.answerVerification?.status, 'fail_closed', `${label}: unsupported duration did not fail closed`);
        assert.strictEqual(hallucinationGuard.json.data.answerQuality.answerVerification?.version, '2026-10-07-phase8.3-r1', `${label}: verification contract missing`);
        assert.doesNotMatch(hallucinationGuard.json.data.answer, /30 minutes/i, `${label}: unsupported duration leaked to the user`);
        assert.ok(hallucinationGuard.json.data.citations.length >= 1, `${label}: fail-closed answer lost evidence links`);
    }

    const history = await api(baseUrl, 'GET', '/api/johnny/conversations', 'phase81-user');
    assert.strictEqual(history.status, 200, `${label}: history failed`);
    assert.strictEqual(history.json.data.length, phase83Mode ? 7 : (phase82Mode ? 6 : 5), `${label}: unexpected persisted conversation count`);
    const cleanup = await api(baseUrl, 'DELETE', '/api/johnny/conversations', 'phase81-user');
    assert.strictEqual(cleanup.status, 200, `${label}: conversation cleanup failed`);
    const after = await api(baseUrl, 'GET', '/api/johnny/conversations', 'phase81-user');
    assert.deepStrictEqual(after.json.data, [], `${label}: conversation residue`);

    return {
        pure: { sourceType: pure.json.data.sourceType, sources: sourceTypes(pure.json.data) },
        mixed: { sourceType: mixed.json.data.sourceType, sources: sourceTypes(mixed.json.data), mixedIntent: true },
        scoped: { sourceType: scoped.json.data.sourceType, citationDocumentIds: [...new Set(scoped.json.data.citations.map(item => Number(item.documentId)))] },
        live: { sourceType: live.json.data.sourceType, sources: sourceTypes(live.json.data) },
        emergency: { sourceType: emergency.json.data.sourceType, sources: sourceTypes(emergency.json.data) },
        ...(conflict ? { conflict: { sourceType: conflict.json.data.sourceType, sources: sourceTypes(conflict.json.data), distinctDocuments: conflict.json.data.answerQuality.evidenceRanking.distinctDocuments } } : {}),
        ...(hallucinationGuard ? { hallucinationGuard: { sourceType: hallucinationGuard.json.data.sourceType, status: hallucinationGuard.json.data.answerQuality.answerVerification.status } } : {}),
    };
}

async function auditDatabase(databaseName, fixtureCounts) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
    });
    try {
        const [[counts]] = await connection.query(`SELECT
            (SELECT COUNT(*) FROM johnny_chat_conversations) conversations,
            (SELECT COUNT(*) FROM johnny_chat_messages) messages,
            (SELECT COUNT(*) FROM johnny_answer_feedback) feedback,
            (SELECT COUNT(*) FROM johnny_kb_documents) documents,
            (SELECT COUNT(*) FROM johnny_kb_chunks) chunks,
            (SELECT COUNT(*) FROM Patrol_Attendance) attendance,
            (SELECT COUNT(*) FROM Patrol_Issues) issues`);
        assert.deepStrictEqual(
            [Number(counts.conversations), Number(counts.messages), Number(counts.feedback)],
            [0, 0, 0],
            'Chat/feedback residue remains'
        );
        assert.deepStrictEqual(
            [Number(counts.documents), Number(counts.chunks), Number(counts.attendance), Number(counts.issues)],
            [fixtureCounts.documents, fixtureCounts.chunks, 3, 3],
            'Fixture evidence changed unexpectedly'
        );
        return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)]));
    } finally {
        await connection.end();
    }
}

async function waitExit(child, timeoutMs = 10000) {
    if (!child || child.exitCode !== null) return;
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Fixture child exit timeout')), timeoutMs)),
    ]);
}

async function schemaExists(name) {
    const [[row]] = await admin.query('SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [name]);
    return Number(row.count) > 0;
}

async function main() {
    await startMockGemini();
    admin = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });

    nodeProcess = capture(spawn(process.execPath, [path.join(__dirname, 'johnny-phase81-node-fixture-host.js')], {
        cwd: root,
        env: {
            ...process.env,
            JOHNNY_PHASE81_PORT: '5081',
            JOHNNY_PHASE81_DB_NAME: nodeDbName,
            JOHNNY_PHASE81_CONTROL_TOKEN: controlToken,
            JOHNNY_PHASE81_GEMINI_BASE: mockUrl,
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    }), 'Node');
    await waitReady(nodeUrl, 'Node', nodeProcess);
    const nodePing = await api(nodeUrl, 'GET', '/__phase81/ping');
    const nodeResult = await runCases('Node', nodeUrl, Number(nodePing.json.scopedDocumentId));
    const nodeAudit = await auditDatabase(nodeDbName, nodePing.json.fixtureCounts);
    console.log('PASS Node authenticated answer matrix and zero chat residue');

    const browserScript = path.join(__dirname, 'johnny-phase81-browser-local-uat.js');
    if (fs.existsSync(browserScript) && process.env.JOHNNY_PHASE81_SKIP_BROWSER !== '1') {
        const browser = capture(spawn(process.execPath, [browserScript], {
            cwd: root,
            env: { ...process.env, JOHNNY_UAT_URL: nodeUrl },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        }), 'Browser');
        await waitExit(browser, 120000);
        const output = childOutput.get('Browser');
        if (browser.exitCode !== 0) throw new Error(`Browser UAT failed (${browser.exitCode})\n${output?.stderr || output?.stdout || ''}`);
        console.log(output.stdout.trim());
    }

    const nodeCleanup = await localRequest(nodeUrl, 'POST', '/__phase81/cleanup', { 'x-phase81-control': controlToken });
    assert.strictEqual(nodeCleanup.status, 200, 'Node cleanup endpoint failed');
    let nodeForcedShutdown = false;
    try {
        await waitExit(nodeProcess);
    } catch (error) {
        nodeForcedShutdown = true;
        if (process.platform === 'win32') {
            spawnSync('taskkill', ['/PID', String(nodeProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
            nodeProcess.kill('SIGKILL');
        }
        await waitExit(nodeProcess, 15000);
    }
    nodeProcess = null;
    if (await schemaExists(nodeDbName)) {
        assert.ok(new RegExp(`^tsh_johnny_${phaseTag}_node_\\d+_\\d+$`).test(nodeDbName), 'Node cleanup database prefix rejected');
        await admin.query(`DROP DATABASE IF EXISTS \`${nodeDbName}\``);
    }
    assert.strictEqual(await schemaExists(nodeDbName), false, 'Node database residue remains');

    await admin.query(`CREATE DATABASE \`${phpDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    phpDatabaseCreated = true;
    const phpFixture = await applyAndSeed(phpDbName);
    phpProcess = capture(spawn(phpBin, ['-S', '127.0.0.1:5082', path.join(__dirname, 'johnny-phase81-php-router.php')], {
        cwd: root,
        env: { ...process.env, DB_NAME: phpDbName, JOHNNY_PHASE81_GEMINI_BASE: mockUrl },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    }), 'PHP');
    await waitReady(phpUrl, 'PHP', phpProcess);
    const phpResult = await runCases('PHP', phpUrl, phpFixture.scopedDocumentId);
    const phpAudit = await auditDatabase(phpDbName, phpFixture.fixtureCounts);
    assert.deepStrictEqual(phpResult, nodeResult, 'Node/PHP answer routing parity');
    console.log('PASS PHP authenticated answer matrix, Node/PHP parity and zero chat residue');

    phpProcess.kill();
    await waitExit(phpProcess);
    phpProcess = null;
    await admin.query(`DROP DATABASE IF EXISTS \`${phpDbName}\``);
    phpDatabaseCreated = false;
    assert.strictEqual(await schemaExists(phpDbName), false, 'PHP database residue remains');
    assert.strictEqual(mockStats.webToolRequests, 0, 'Local UAT unexpectedly requested web research');

    console.log(JSON.stringify({
        marker: phase83Mode ? 'JOHNNY_PHASE83_AUTHENTICATED_ANSWER_VERIFICATION_UAT' : (phase82Mode ? 'JOHNNY_PHASE82_AUTHENTICATED_MULTI_SOURCE_UAT' : 'JOHNNY_PHASE81_AUTHENTICATED_LOCAL_UAT'),
        mode: 'authenticated-isolated-db-loopback-model-mock',
        decision: 'PASS',
        nodePhpParity: true,
        cases: ['pure_usage', 'mixed_policy_ui', 'scoped_document', 'live_system_data', 'emergency', ...(phase82Mode ? ['conflicting_documents'] : []), ...(phase83Mode ? ['unsupported_critical_fact_fail_closed'] : [])],
        mockStats,
        nodeAudit,
        phpAudit,
        zeroDatabaseResidue: true,
        nodeForcedShutdown,
        productionTouched: false,
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    if (nodeProcess && nodeProcess.exitCode === null) {
        nodeProcess.kill();
        await waitExit(nodeProcess, 15000).catch(() => {});
    }
    nodeProcess = null;
    if (phpProcess && phpProcess.exitCode === null) {
        phpProcess.kill();
        await waitExit(phpProcess, 15000).catch(() => {});
    }
    phpProcess = null;
    if (admin) {
        if (new RegExp(`^tsh_johnny_${phaseTag}_node_\\d+_\\d+$`).test(nodeDbName)) await admin.query(`DROP DATABASE IF EXISTS \`${nodeDbName}\``).catch(() => {});
        if (phpDatabaseCreated && new RegExp(`^tsh_johnny_${phaseTag}_php_\\d+_\\d+$`).test(phpDbName)) await admin.query(`DROP DATABASE IF EXISTS \`${phpDbName}\``).catch(() => {});
        await admin.end().catch(() => {});
    }
    if (mockServer) {
        mockServer.closeAllConnections?.();
        mockServer.close();
        mockServer.unref?.();
    }
    process.exit(process.exitCode || 0);
});
