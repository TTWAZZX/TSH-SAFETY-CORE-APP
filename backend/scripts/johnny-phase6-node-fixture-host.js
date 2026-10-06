'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.env.JOHNNY_PHASE6_PORT || 5000);
const controlToken = String(process.env.JOHNNY_PHASE6_CONTROL_TOKEN || 'johnny-phase6-local-only');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const databaseName = String(process.env.JOHNNY_PHASE6_DB_NAME || `tsh_johnny_phase6_node_${stamp}`);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

if (!loopbackHosts.has(String(process.env.DB_HOST || '').trim().toLowerCase())) {
    throw new Error('Phase 6 fixture host refuses non-loopback DB_HOST');
}
if (!/^tsh_johnny_phase6_node_\d+_\d+$/.test(databaseName)) {
    throw new Error('Phase 6 fixture database name is outside the guarded prefix');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid Phase 6 fixture port');
}

const users = {
    'phase6-admin': { id: 'PHASE6-ADMIN', name: 'Phase 6 Admin', role: 'Admin', department: 'UAT', unit: 'Fixture', mustChangePassword: false },
    'phase6-user': { id: 'PHASE6-USER', name: 'Phase 6 User', role: 'User', department: 'UAT', unit: 'Fixture', mustChangePassword: false },
    'phase6-other': { id: 'PHASE6-OTHER', name: 'Phase 6 Other', role: 'User', department: 'UAT', unit: 'Fixture', mustChangePassword: false },
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

async function cleanup(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
        const pool = require('../db');
        await pool.end().catch(() => {});
        if (appServer) await new Promise(resolve => appServer.close(resolve));
        if (adminConnection) {
            await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            const [[row]] = await adminConnection.query(
                'SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?',
                [databaseName]
            );
            if (Number(row.count) !== 0) throw new Error('Phase 6 fixture database residue remains');
            await adminConnection.end();
        }
        console.log('JOHNNY_PHASE6_NODE_CLEANUP zero-residue');
        process.exit(exitCode);
    } catch (error) {
        console.error(`JOHNNY_PHASE6_NODE_CLEANUP_FAILED ${error.message}`);
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

    const migrationConnection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        multipleStatements: true,
    });
    const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261006_johnny_phase7_schema.sql'), 'utf8');
    await migrationConnection.query(migrationSql);
    await migrationConnection.query(migrationSql);
    await migrationConnection.query(
        "INSERT INTO johnny_chat_conversations(UserID,Title,CreatedAt,UpdatedAt) VALUES('PHASE7-RETENTION-SENTINEL','must survive runtime startup','2000-01-01','2000-01-01')"
    );
    const [[sentinelConversation]] = await migrationConnection.query('SELECT LAST_INSERT_ID() AS id');
    await migrationConnection.query(
        "INSERT INTO johnny_chat_messages(ConversationID,UserID,Role,MessageText,CreatedAt) VALUES(?, 'PHASE7-RETENTION-SENTINEL', 'user', 'must survive runtime startup', '2000-01-01')",
        [sentinelConversation.id]
    );
    await migrationConnection.query(
        "INSERT INTO johnny_operational_logs(Level,Operation,Message,CreatedAt) VALUES('info','phase7_retention_sentinel','must survive runtime startup','2000-01-01')"
    );
    await migrationConnection.end();

    process.env.DB_NAME = databaseName;
    process.env.JOHNNY_SYSTEM_DATA_ENABLED = 'false';
    process.env.JOHNNY_WEB_RESEARCH_ENABLED = 'false';
    process.env.GEMINI_API_KEY = '';

    const johnnyRouter = require('../routes/johnny-ai');
    const db = require('../db');
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.get('/__phase6/ping', (_req, res) => res.json({ success: true, isolated: true }));
    app.get('/api/public/branding', (_req, res) => res.json({ success: true, data: {} }));

    app.post('/api/login', (req, res) => {
        const employeeId = String(req.body?.employeeId || '').trim().toUpperCase();
        const password = String(req.body?.password || '');
        if (employeeId !== 'PHASE6-ADMIN' || password !== 'Phase6Only!') {
            return res.status(401).json({ success: false, message: 'Invalid fixture credentials' });
        }
        return res.json({ success: true, user: users['phase6-admin'], token: 'phase6-admin' });
    });
    app.post('/api/session/verify', authenticateFixture, (req, res) => {
        res.json({ success: true, user: req.user, token: bearer(req), status: 'READY', onboardingStatus: 'READY' });
    });
    app.get('/api/onboarding/status', authenticateFixture, (_req, res) => res.json({ success: true, status: 'READY' }));
    app.get('/api/bbs/me/context', authenticateFixture, (_req, res) => res.json({ success: true, data: { pilot: { inPilot: false } } }));
    app.use('/api/johnny', authenticateFixture, johnnyRouter);

    app.get('/__phase6/state', async (req, res) => {
        if (String(req.get('x-phase6-control') || '') !== controlToken) return res.sendStatus(403);
        const [tables] = await db.query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [databaseName]);
        const counts = {};
        for (const table of tables) {
            const name = table.TABLE_NAME;
            if (!/^johnny_|^App_Settings$/i.test(name)) throw new Error(`Unexpected fixture table: ${name}`);
            const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM \`${name}\``);
            counts[name] = Number(row.count);
        }
        res.json({ success: true, databasePrefixValid: true, counts });
    });
    app.post('/__phase6/cleanup', async (req, res) => {
        if (String(req.get('x-phase6-control') || '') !== controlToken) return res.sendStatus(403);
        res.json({ success: true, cleanup: 'scheduled' });
        setTimeout(() => cleanup(0), 25);
    });

    app.use('/api', authenticateFixture, (_req, res) => res.json({ success: true, data: [] }));
    app.use('/shared', (_req, res) => res.status(404).end());
    app.use(express.static(root, { index: 'index.html', etag: false, maxAge: 0 }));
    app.use((req, res, next) => {
        if (req.method === 'GET' && String(req.get('accept') || '').includes('text/html')) {
            return res.sendFile(path.join(root, 'index.html'));
        }
        return next();
    });

    appServer = app.listen(port, '127.0.0.1', () => {
        console.log(`JOHNNY_PHASE6_NODE_READY http://127.0.0.1:${port} isolated-db`);
    });
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', error => {
    console.error(error.stack || error.message);
    cleanup(1);
});
process.on('unhandledRejection', error => {
    console.error(error?.stack || error);
    cleanup(1);
});

main().catch(error => {
    console.error(error.stack || error.message);
    cleanup(1);
});
