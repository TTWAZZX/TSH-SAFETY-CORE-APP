'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.env.JOHNNY_PHASE81_PORT || 5081);
const controlToken = String(process.env.JOHNNY_PHASE81_CONTROL_TOKEN || 'phase81-local-only');
const databaseName = String(process.env.JOHNNY_PHASE81_DB_NAME || '');
const mockBase = String(process.env.JOHNNY_PHASE81_GEMINI_BASE || '');
const phase83Mode = process.env.JOHNNY_PHASE83_ANSWER_VERIFICATION === '1';
const phase82Mode = phase83Mode || process.env.JOHNNY_PHASE82_MULTI_SOURCE === '1';
const phaseTag = phase83Mode ? 'phase83' : (phase82Mode ? 'phase82' : 'phase81');
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

if (!loopbackHosts.has(String(process.env.DB_HOST || '').trim().toLowerCase())) {
    throw new Error('Phase 8.1 fixture refuses non-loopback DB_HOST');
}
if (!new RegExp(`^tsh_johnny_${phaseTag}_node_\\d+_\\d+$`).test(databaseName)) {
    throw new Error('Phase 8.1 fixture database name is outside the guarded prefix');
}
if (!mockBase || !loopbackHosts.has(new URL(mockBase).hostname)) {
    throw new Error('Phase 8.1 fixture requires a loopback Gemini mock');
}

const users = {
    'phase81-admin': { id: 'PHASE81-ADMIN', name: 'Phase 8.1 Admin', role: 'Admin', department: 'UAT', unit: 'Fixture', mustChangePassword: false },
    'phase81-user': { id: 'PHASE81-USER', name: 'Phase 8.1 User', role: 'User', department: 'UAT', unit: 'Fixture', mustChangePassword: false },
};

let adminConnection;
let appServer;
let shuttingDown = false;

function bearer(req) {
    const match = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : '';
}

function authenticateFixture(req, res, next) {
    const user = users[bearer(req)];
    if (!user) return res.status(401).json({ success: false, message: 'Fixture authentication required' });
    req.user = { ...user };
    return next();
}

async function seedFixture(connection) {
    const baseDocuments = [
        {
            title: 'Phase 8.1 Accident Company Policy', sourceType: 'document', vector: [1, 0, 0, 0],
            chunks: ['Company accident policy fixture: immediately notify the direct supervisor and SHE. Preserve the scene when safe, obtain first aid, and record the incident in Accident Reporting before the end of the shift.'],
        },
        {
            title: 'Phase 8.1 Approval Matrix', sourceType: 'document', vector: [0, 1, 0, 0],
            chunks: ['Scoped approval fixture: the Plant Manager is the sole final approver for a high-risk corrective action. The SHE Manager reviews the evidence before final approval.'],
        },
        {
            title: 'Phase 8.1 Emergency Eye Wash Manual', sourceType: 'manual', vector: [0, 0, 1, 0],
            chunks: ['Emergency chemical eye splash fixture: go to the eyewash immediately, flush continuously for at least 15 minutes, call onsite emergency support, and obtain medical evaluation. Do not delay flushing.'],
        },
    ];
    const documents = phase82Mode ? [
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
    ] : baseDocuments;
    const ids = {};
    for (const item of documents) {
        const text = item.chunks.join('\n\n');
        const [insert] = await connection.query(
            `INSERT INTO johnny_kb_documents
             (Title,Category,OriginalName,StoredName,FileUrl,MimeType,FileSize,SourceType,TextContent,IsActive,IndexedStatus,ChunkCount,UploadedBy,UploadedByName,LastIndexedAt)
             VALUES (?,?,?,?,?,?,?,?,?,1,'ready',?,'PHASE81-ADMIN',?,NOW())`,
            [item.title, `${phaseTag}-fixture`, `${item.title}.txt`, `${phaseTag}-fixture.txt`, '', 'text/plain', text.length, item.sourceType, text, item.chunks.length, phase82Mode ? 'Phase 8.2 Fixture' : 'Phase 8.1 Fixture']
        );
        ids[item.title] = Number(insert.insertId);
        for (let index = 0; index < item.chunks.length; index += 1) {
            await connection.query(
                `INSERT INTO johnny_kb_chunks
                 (DocumentID,ChunkIndex,ChunkText,PageLabel,EmbeddingJson,EmbeddingModel,TokenEstimate)
                 VALUES (?,?,?,?,?,'phase81-local-embedding',?)`,
                [insert.insertId, index, item.chunks[index], `Fixture page ${index + 1}`, JSON.stringify(item.vector), Math.ceil(item.chunks[index].length / 4)]
            );
        }
    }
    await connection.query('CREATE TABLE Patrol_Attendance (id INT AUTO_INCREMENT PRIMARY KEY, PatrolDate DATE NOT NULL, UserID VARCHAR(50) NOT NULL) ENGINE=InnoDB');
    await connection.query('CREATE TABLE Patrol_Issues (id INT AUTO_INCREMENT PRIMARY KEY, Area VARCHAR(80) NOT NULL, Status VARCHAR(30) NOT NULL) ENGINE=InnoDB');
    await connection.query("INSERT INTO Patrol_Attendance(PatrolDate,UserID) VALUES (CURDATE(),'P81-A'),(CURDATE(),'P81-B'),(CURDATE(),'P81-A')");
    await connection.query("INSERT INTO Patrol_Issues(Area,Status) VALUES ('Assembly','Open'),('Warehouse','In Progress'),('Office','Closed')");
    return {
        scopedDocumentId: ids[phase82Mode ? 'Phase 8.2 Approval Matrix' : 'Phase 8.1 Approval Matrix'],
        fixtureCounts: { documents: documents.length, chunks: documents.reduce((sum, item) => sum + item.chunks.length, 0) },
    };
}

async function cleanup(exitCode = 0) {
    if (shuttingDown) {
        process.exit(exitCode);
        return;
    }
    shuttingDown = true;
    try {
        const pool = require('../db');
        await pool.end().catch(() => {});
        if (appServer) {
            await new Promise(resolve => {
                appServer.close(resolve);
                appServer.closeAllConnections?.();
            });
        }
        if (adminConnection) {
            await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            const [[row]] = await adminConnection.query('SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]);
            if (Number(row.count) !== 0) throw new Error('Phase 8.1 fixture database residue remains');
            await adminConnection.end();
        }
        console.log('JOHNNY_PHASE81_NODE_CLEANUP zero-residue');
        process.exit(exitCode);
    } catch (error) {
        console.error(`JOHNNY_PHASE81_NODE_CLEANUP_FAILED ${error.message}`);
        process.exit(1);
    }
}

async function main() {
    adminConnection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });
    await adminConnection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        multipleStatements: true,
    });
    const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261006_johnny_phase7_schema.sql'), 'utf8');
    await connection.query(migration);
    await connection.query(migration);
    const fixture = await seedFixture(connection);
    await connection.end();

    process.env.DB_NAME = databaseName;
    process.env.JOHNNY_SYSTEM_DATA_ENABLED = 'true';
    process.env.JOHNNY_WEB_RESEARCH_ENABLED = 'false';
    process.env.GEMINI_API_KEY = 'phase81-local-mock';
    process.env.GEMINI_API_BASE = mockBase;
    process.env.GEMINI_MODELS = 'phase81-local-model';
    process.env.GEMINI_EMBEDDING_MODEL = 'phase81-local-embedding';
    process.env.GEMINI_EMBEDDING_DIMENSION = '4';
    process.env.GEMINI_TIMEOUT_MS = '5000';

    const johnnyRouter = require('../routes/johnny-ai');
    const db = require('../db');
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.get('/__phase81/ping', (_req, res) => res.json({ success: true, isolated: true, scopedDocumentId: fixture.scopedDocumentId, fixtureCounts: fixture.fixtureCounts }));
    app.get('/api/public/branding', (_req, res) => res.json({ success: true, data: {} }));
    app.post('/api/login', (req, res) => {
        const employeeId = String(req.body?.employeeId || '').trim().toUpperCase();
        const password = String(req.body?.password || '');
        if (employeeId !== 'PHASE81-ADMIN' || password !== 'Phase81Only!') {
            return res.status(401).json({ success: false, message: 'Invalid fixture credentials' });
        }
        return res.json({ success: true, user: users['phase81-admin'], token: 'phase81-admin' });
    });
    app.post('/api/session/verify', authenticateFixture, (req, res) => res.json({ success: true, user: req.user, token: bearer(req), status: 'READY', onboardingStatus: 'READY' }));
    app.get('/api/onboarding/status', authenticateFixture, (_req, res) => res.json({ success: true, status: 'READY' }));
    app.get('/api/bbs/me/context', authenticateFixture, (_req, res) => res.json({ success: true, data: { pilot: { inPilot: false } } }));
    app.use('/api/johnny', authenticateFixture, johnnyRouter);
    app.get('/__phase81/state', async (req, res) => {
        if (String(req.get('x-phase81-control') || '') !== controlToken) return res.sendStatus(403);
        const [[counts]] = await db.query(`SELECT
            (SELECT COUNT(*) FROM johnny_chat_conversations) conversations,
            (SELECT COUNT(*) FROM johnny_chat_messages) messages,
            (SELECT COUNT(*) FROM johnny_answer_feedback) feedback,
            (SELECT COUNT(*) FROM johnny_kb_documents) documents,
            (SELECT COUNT(*) FROM johnny_kb_chunks) chunks`);
        res.json({ success: true, databasePrefixValid: true, counts, scopedDocumentId: fixture.scopedDocumentId });
    });
    app.post('/__phase81/cleanup', async (req, res) => {
        if (String(req.get('x-phase81-control') || '') !== controlToken) return res.sendStatus(403);
        res.json({ success: true, cleanup: 'scheduled' });
        setTimeout(() => cleanup(0), 25);
    });
    app.use('/api', authenticateFixture, (_req, res) => res.json({ success: true, data: [] }));
    app.use('/shared', (_req, res) => res.status(404).end());
    app.use(express.static(root, { index: 'index.html', etag: false, maxAge: 0 }));
    app.use((req, res, next) => {
        if (req.method === 'GET' && String(req.get('accept') || '').includes('text/html')) return res.sendFile(path.join(root, 'index.html'));
        return next();
    });
    appServer = app.listen(port, '127.0.0.1', () => console.log(`JOHNNY_PHASE81_NODE_READY http://127.0.0.1:${port} isolated-db scoped=${fixture.scopedDocumentId}`));
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', error => { console.error(error.stack || error.message); cleanup(1); });
process.on('unhandledRejection', error => { console.error(error?.stack || error); cleanup(1); });

main().catch(error => { console.error(error.stack || error.message); cleanup(1); });
