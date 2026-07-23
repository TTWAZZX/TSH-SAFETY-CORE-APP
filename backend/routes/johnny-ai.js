const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const XLSX = require('xlsx');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { uploadsDir, cleanOriginalFilename, deleteLocalUpload } = require('../storage');

const router = express.Router();

function parseModelList(value, fallback) {
    const seen = new Set();
    return String(value || '')
        .split(',')
        .concat(fallback)
        .map(item => String(item || '').trim())
        .filter(item => item && !seen.has(item) && seen.add(item));
}

const GEMINI_MODEL_CHAIN = parseModelList(
    process.env.GEMINI_MODELS || process.env.GEMINI_MODEL,
    ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
);
const DEFAULT_MODEL = GEMINI_MODEL_CHAIN[0] || 'gemini-3.5-flash';
const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
const GEMINI_ENDPOINT = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
const REFINE_TRANSIENT_RETRIES = Math.max(0, Number(process.env.JOHNNY_REFINE_TRANSIENT_RETRIES || 1));
const REFINE_RETRY_DELAY_MS = Math.max(0, Number(process.env.JOHNNY_REFINE_RETRY_DELAY_MS || 1200));
const REINDEX_MIN_CHAR_RATIO = Math.min(1, Math.max(0, Number(process.env.JOHNNY_REINDEX_MIN_CHAR_RATIO || 0.65)));
const REINDEX_MIN_CHUNK_RATIO = Math.min(1, Math.max(0, Number(process.env.JOHNNY_REINDEX_MIN_CHUNK_RATIO || 0.5)));
const OPERATIONAL_LOG_RETENTION_DAYS = Math.min(365, Math.max(1, Number(process.env.JOHNNY_OPERATIONAL_LOG_RETENTION_DAYS || 30)));
const MAX_MESSAGE_LENGTH = 4000;
const KB_MAX_FILE_SIZE = Number(process.env.JOHNNY_KB_MAX_UPLOAD_MB || 30) * 1024 * 1024;
const AVATAR_MAX_FILE_SIZE = Number(process.env.JOHNNY_AVATAR_MAX_UPLOAD_MB || 5) * 1024 * 1024;
const RISK_IMAGE_MAX_FILE_SIZE = Number(process.env.JOHNNY_RISK_IMAGE_MAX_UPLOAD_MB || 8) * 1024 * 1024;
const JOHNNY_AVATAR_SETTING_KEY = 'johnny_avatar_url';
const KB_TOP_K = Number(process.env.JOHNNY_MAX_CONTEXT_CHUNKS || 6);
const KB_MIN_SCORE = Number(process.env.JOHNNY_KB_MIN_SCORE || 0.68);
const KB_HYBRID_MIN_SCORE = Number(process.env.JOHNNY_KB_HYBRID_MIN_SCORE || Math.max(0.55, KB_MIN_SCORE - 0.08));
const KB_KEYWORD_MIN_SCORE = Number(process.env.JOHNNY_KB_KEYWORD_MIN_SCORE || 0.35);
const KB_SEMANTIC_WEIGHT = Number(process.env.JOHNNY_KB_SEMANTIC_WEIGHT || 0.7);
const KB_KEYWORD_WEIGHT = Number(process.env.JOHNNY_KB_KEYWORD_WEIGHT || 0.3);
const WEB_RESEARCH_ENABLED = String(process.env.JOHNNY_WEB_RESEARCH_ENABLED || 'true').toLowerCase() !== 'false';
const DEFAULT_WEB_ALLOWED_DOMAINS = [
    'ilo.org',
    'who.int',
    'osha.gov',
    'cdc.gov',
    'niosh.cdc.gov',
    'iso.org',
    'epa.gov',
    'hse.gov.uk',
    'ratchakitcha.soc.go.th',
    'mol.go.th',
    'labour.go.th',
    'osh.labour.go.th',
    'diw.go.th',
    'tisi.go.th',
    'shawpat.or.th',
];
const WEB_ALLOWED_DOMAINS = (process.env.JOHNNY_WEB_ALLOWED_DOMAINS || DEFAULT_WEB_ALLOWED_DOMAINS.join(','))
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
const SYSTEM_DATA_ENABLED = String(process.env.JOHNNY_SYSTEM_DATA_ENABLED || 'true').toLowerCase() !== 'false';
const SYSTEM_MODULES = [
    { key: 'cccf', label: 'CCCF', terms: ['cccf', 'form a', 'stop call wait', 'stop-call-wait', 'worker', 'permanent'] },
    { key: 'patrol', label: 'Safety Patrol', terms: ['patrol', 'safety patrol', 'เดินตรวจ', 'ตรวจความปลอดภัย'] },
    { key: 'kpi', label: 'KPI', terms: ['kpi', 'ตัวชี้วัด', 'เป้าหมาย'] },
    { key: 'hiyari', label: 'Hiyari Hatto', terms: ['hiyari', 'hiyari hatto', 'ไฮยาริ', 'near miss', 'near-miss'] },
    { key: 'ky', label: 'KY Ability', terms: ['ky', 'kyt', 'ky ability', 'kiken yochi'] },
    { key: 'fourm', label: '4M Change', terms: ['4m', 'fourm', 'man machine material method', 'change notice'] },
];

const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Johnny AI รับคำถามถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
});

const kbUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            cb(null, `johnny-kb-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
        },
    }),
    limits: { fileSize: KB_MAX_FILE_SIZE },
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowedExt = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.csv']);
        const allowedMime = new Set([
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/markdown',
            'text/csv',
            'application/csv',
            'application/octet-stream',
        ]);
        if (allowedExt.has(ext) && allowedMime.has(file.mimetype)) return cb(null, true);
        cb(new Error(`Unsupported Johnny AI document type: ${file.mimetype || ext}`), false);
    },
});

const avatarUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
        },
    }),
    limits: { fileSize: AVATAR_MAX_FILE_SIZE },
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
        const allowedMime = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
        if (allowedExt.has(ext) && allowedMime.has(file.mimetype)) return cb(null, true);
        cb(new Error(`Unsupported Johnny AI avatar type: ${file.mimetype || ext}`), false);
    },
});

const riskImageUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
        },
    }),
    limits: { fileSize: RISK_IMAGE_MAX_FILE_SIZE },
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
        const allowedMime = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
        if (allowedExt.has(ext) && allowedMime.has(file.mimetype)) return cb(null, true);
        cb(new Error(`Unsupported Johnny AI risk image type: ${file.mimetype || ext}`), false);
    },
});

function handleKbUpload(req, res, next) {
    kbUpload.single('kbFile')(req, res, err => {
        if (!err) return next();
        res.status(400).json({ success: false, message: err.message || 'อัปโหลดเอกสาร Johnny AI ไม่สำเร็จ' });
    });
}

function handleAvatarUpload(req, res, next) {
    avatarUpload.single('avatarFile')(req, res, err => {
        if (!err) return next();
        res.status(400).json({ success: false, message: err.message || 'อัปโหลดรูปจอห์นนี่ไม่สำเร็จ' });
    });
}

function handleRiskImageUpload(req, res, next) {
    riskImageUpload.single('riskImage')(req, res, err => {
        if (!err) return next();
        res.status(400).json({ success: false, message: err.message || 'อัปโหลดรูปสำหรับวิเคราะห์ความเสี่ยงไม่สำเร็จ' });
    });
}

async function ensureTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS App_Settings (
            key_name VARCHAR(100) PRIMARY KEY,
            value TEXT DEFAULT NULL,
            UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS johnny_chat_conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            UserID VARCHAR(50) NOT NULL,
            Title VARCHAR(180) NOT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_user_updated (UserID, UpdatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS johnny_chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ConversationID INT NOT NULL,
            UserID VARCHAR(50) NOT NULL,
            Role VARCHAR(20) NOT NULL,
            MessageText MEDIUMTEXT NOT NULL,
            SourceType VARCHAR(40) DEFAULT NULL,
            CitationsJson JSON DEFAULT NULL,
            Model VARCHAR(80) DEFAULT NULL,
            LatencyMs INT DEFAULT NULL,
            PromptTokens INT DEFAULT NULL,
            OutputTokens INT DEFAULT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_conversation_created (ConversationID, CreatedAt),
            KEY idx_user_created (UserID, CreatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS johnny_kb_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Title VARCHAR(220) NOT NULL,
            Category VARCHAR(80) DEFAULT 'general',
            OriginalName VARCHAR(220) NOT NULL,
            StoredName VARCHAR(220) NOT NULL,
            FileUrl TEXT NOT NULL,
            MimeType VARCHAR(120) DEFAULT NULL,
            FileSize INT DEFAULT 0,
            SourceType VARCHAR(30) NOT NULL DEFAULT 'document',
            TextContent MEDIUMTEXT DEFAULT NULL,
            IsActive TINYINT(1) NOT NULL DEFAULT 1,
            IndexedStatus VARCHAR(30) NOT NULL DEFAULT 'pending',
            ChunkCount INT NOT NULL DEFAULT 0,
            ErrorMessage TEXT DEFAULT NULL,
            AuditStatus VARCHAR(30) DEFAULT NULL,
            AuditJson MEDIUMTEXT DEFAULT NULL,
            LastAuditAt DATETIME DEFAULT NULL,
            ExtractionLogJson MEDIUMTEXT DEFAULT NULL,
            LastExtractionAt DATETIME DEFAULT NULL,
            UploadedBy VARCHAR(50) DEFAULT NULL,
            UploadedByName VARCHAR(120) DEFAULT NULL,
            UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            LastIndexedAt DATETIME DEFAULT NULL,
            KEY idx_active_status (IsActive, IndexedStatus),
            KEY idx_category (Category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN SourceType VARCHAR(30) NOT NULL DEFAULT 'document' AFTER FileSize").catch(() => {});
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN TextContent MEDIUMTEXT DEFAULT NULL AFTER SourceType").catch(() => {});
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN AuditStatus VARCHAR(30) DEFAULT NULL AFTER ErrorMessage").catch(() => {});
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN AuditJson MEDIUMTEXT DEFAULT NULL AFTER AuditStatus").catch(() => {});
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN LastAuditAt DATETIME DEFAULT NULL AFTER AuditJson").catch(() => {});
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN ExtractionLogJson MEDIUMTEXT DEFAULT NULL AFTER LastAuditAt").catch(() => {});
    await db.query("ALTER TABLE johnny_kb_documents ADD COLUMN LastExtractionAt DATETIME DEFAULT NULL AFTER ExtractionLogJson").catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS johnny_kb_chunks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            DocumentID INT NOT NULL,
            ChunkIndex INT NOT NULL,
            ChunkText MEDIUMTEXT NOT NULL,
            PageLabel VARCHAR(80) DEFAULT NULL,
            EmbeddingJson MEDIUMTEXT DEFAULT NULL,
            EmbeddingModel VARCHAR(80) DEFAULT NULL,
            TokenEstimate INT DEFAULT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_doc_chunk (DocumentID, ChunkIndex),
            KEY idx_doc (DocumentID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS johnny_operational_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            Level VARCHAR(20) NOT NULL,
            Operation VARCHAR(50) NOT NULL,
            Stage VARCHAR(80) DEFAULT NULL,
            UserID VARCHAR(50) DEFAULT NULL,
            ConversationID INT DEFAULT NULL,
            DocumentID INT DEFAULT NULL,
            Model VARCHAR(80) DEFAULT NULL,
            HttpStatus INT DEFAULT NULL,
            LatencyMs INT DEFAULT NULL,
            Message VARCHAR(900) DEFAULT NULL,
            MetaJson MEDIUMTEXT DEFAULT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_created (CreatedAt),
            KEY idx_level_created (Level, CreatedAt),
            KEY idx_operation_created (Operation, CreatedAt),
            KEY idx_document_created (DocumentID, CreatedAt),
            KEY idx_conversation_created (ConversationID, CreatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query('ALTER TABLE johnny_operational_logs ADD KEY idx_created (CreatedAt)').catch(() => {});
    await db.query('DELETE FROM johnny_operational_logs WHERE CreatedAt < DATE_SUB(NOW(), INTERVAL ? DAY)', [OPERATIONAL_LOG_RETENTION_DAYS]).catch(() => {});
}

const ready = ensureTables().catch(error => {
    console.error('[johnny-ai] ensureTables error:', error.message);
});

async function writeJohnnyLog({ level = 'info', operation, stage = null, userId: actorId = null, conversationId = null, documentId = null, model = null, httpStatus = null, latencyMs = null, message = null, meta = null }) {
    try {
        await db.query(
            `INSERT INTO johnny_operational_logs
             (Level,Operation,Stage,UserID,ConversationID,DocumentID,Model,HttpStatus,LatencyMs,Message,MetaJson)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [String(level).slice(0, 20), String(operation || 'unknown').slice(0, 50), stage ? String(stage).slice(0, 80) : null,
                actorId ? String(actorId).slice(0, 50) : null, Number(conversationId) || null, Number(documentId) || null,
                model ? String(model).slice(0, 80) : null, Number(httpStatus) || null, Number(latencyMs) || null,
                message ? String(message).slice(0, 900) : null, meta ? JSON.stringify(meta).slice(0, 60000) : null]
        );
    } catch (error) {
        console.error('[johnny-ai] operational log failed:', error.message);
    }
}

function normalizeObservabilityDays(value) {
    const days = Number.parseInt(value, 10);
    return [1, 7, 30, 90].includes(days) ? days : 7;
}

async function getJohnnyObservability(days) {
    const intervalSql = `DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
    const [[logSummary = {}]] = await db.query(`
        SELECT COUNT(*) AS totalLogs,
               SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors,
               SUM(CASE WHEN Level='warning' THEN 1 ELSE 0 END) AS warnings,
               SUM(CASE WHEN Level='info' THEN 1 ELSE 0 END) AS info,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               MAX(LatencyMs) AS maxLatencyMs,
               SUM(CASE WHEN CreatedAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR) AND Level='error' THEN 1 ELSE 0 END) AS errorsLastHour,
               MAX(CreatedAt) AS lastLogAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql}
    `);
    const [operations] = await db.query(`
        SELECT Operation AS operation, COUNT(*) AS total,
               SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors,
               SUM(CASE WHEN Level='warning' THEN 1 ELSE 0 END) AS warnings,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               MAX(LatencyMs) AS maxLatencyMs
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql}
        GROUP BY Operation
        ORDER BY total DESC, Operation ASC
        LIMIT 12
    `);
    const [stages] = await db.query(`
        SELECT Operation AS operation, Stage AS stage, Level AS level, COUNT(*) AS total, MAX(CreatedAt) AS lastAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql} AND Level IN ('error','warning')
        GROUP BY Operation, Stage, Level
        ORDER BY total DESC, lastAt DESC
        LIMIT 12
    `);
    const [models] = await db.query(`
        SELECT Model AS model, COUNT(*) AS total,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql} AND Model IS NOT NULL AND Model <> ''
        GROUP BY Model
        ORDER BY total DESC, model ASC
        LIMIT 8
    `);
    const [httpStatuses] = await db.query(`
        SELECT HttpStatus AS httpStatus, COUNT(*) AS total
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql} AND HttpStatus IS NOT NULL
        GROUP BY HttpStatus
        ORDER BY total DESC, HttpStatus ASC
        LIMIT 10
    `);
    const [[chatSummary = {}]] = await db.query(`
        SELECT COUNT(*) AS assistantMessages,
               COUNT(DISTINCT ConversationID) AS conversations,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               MAX(LatencyMs) AS maxLatencyMs,
               SUM(CASE WHEN SourceType IN ('not_verified','ai_general') THEN 1 ELSE 0 END) AS unverifiedAnswers,
               SUM(CASE WHEN SourceType IN ('company_document','safety_knowledge','system_data','external_research','image_analysis') THEN 1 ELSE 0 END) AS verifiedAnswers,
               SUM(CASE WHEN SourceType='image_analysis' THEN 1 ELSE 0 END) AS imageAnalyses,
               SUM(CASE WHEN SourceType='external_research' THEN 1 ELSE 0 END) AS externalResearchAnswers
        FROM johnny_chat_messages
        WHERE Role='assistant' AND CreatedAt >= ${intervalSql}
    `);
    const [sourceTypes] = await db.query(`
        SELECT SourceType AS sourceType, COUNT(*) AS total,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs
        FROM johnny_chat_messages
        WHERE Role='assistant' AND CreatedAt >= ${intervalSql}
        GROUP BY SourceType
        ORDER BY total DESC, sourceType ASC
        LIMIT 10
    `);
    const [daily] = await db.query(`
        SELECT bucketDate,
               SUM(logs) AS logs,
               SUM(errors) AS errors,
               SUM(assistantMessages) AS assistantMessages,
               SUM(unverifiedAnswers) AS unverifiedAnswers
        FROM (
            SELECT DATE(CreatedAt) AS bucketDate, COUNT(*) AS logs,
                   SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors,
                   0 AS assistantMessages, 0 AS unverifiedAnswers
            FROM johnny_operational_logs
            WHERE CreatedAt >= ${intervalSql}
            GROUP BY DATE(CreatedAt)
            UNION ALL
            SELECT DATE(CreatedAt) AS bucketDate, 0 AS logs, 0 AS errors,
                   COUNT(*) AS assistantMessages,
                   SUM(CASE WHEN SourceType IN ('not_verified','ai_general') THEN 1 ELSE 0 END) AS unverifiedAnswers
            FROM johnny_chat_messages
            WHERE Role='assistant' AND CreatedAt >= ${intervalSql}
            GROUP BY DATE(CreatedAt)
        ) x
        GROUP BY bucketDate
        ORDER BY bucketDate ASC
    `);
    const [recentIssues] = await db.query(`
        SELECT id,Level,Operation,Stage,UserID,ConversationID,DocumentID,Model,HttpStatus,LatencyMs,Message,MetaJson,CreatedAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql} AND Level IN ('error','warning')
        ORDER BY id DESC
        LIMIT 20
    `);
    const [slowSamples] = await db.query(`
        SELECT id,Level,Operation,Stage,Model,HttpStatus,LatencyMs,Message,CreatedAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= ${intervalSql} AND LatencyMs IS NOT NULL
        ORDER BY LatencyMs DESC, id DESC
        LIMIT 10
    `);
    const [[kb = {}]] = await db.query(`
        SELECT COUNT(*) AS totalDocs,
               SUM(CASE WHEN IsActive=1 THEN 1 ELSE 0 END) AS activeDocs,
               SUM(CASE WHEN IndexedStatus='ready' THEN 1 ELSE 0 END) AS readyDocs,
               SUM(CASE WHEN IndexedStatus='error' THEN 1 ELSE 0 END) AS errorDocs,
               SUM(CASE WHEN AuditStatus='warning' THEN 1 ELSE 0 END) AS warningDocs,
               SUM(CASE WHEN SourceType='manual' THEN 1 ELSE 0 END) AS manualDocs,
               SUM(CASE WHEN SourceType='document' THEN 1 ELSE 0 END) AS uploadedDocs,
               COALESCE(SUM(ChunkCount),0) AS declaredChunks,
               MAX(UpdatedAt) AS lastUpdatedAt
        FROM johnny_kb_documents
    `);
    const toNumber = value => Number(value || 0);
    return {
        marker: 'JOHNNY_PHASE4_OBSERVABILITY',
        days,
        generatedAt: new Date().toISOString(),
        logs: {
            total: toNumber(logSummary.totalLogs),
            errors: toNumber(logSummary.errors),
            warnings: toNumber(logSummary.warnings),
            info: toNumber(logSummary.info),
            errorsLastHour: toNumber(logSummary.errorsLastHour),
            avgLatencyMs: Math.round(toNumber(logSummary.avgLatencyMs)),
            maxLatencyMs: toNumber(logSummary.maxLatencyMs),
            lastLogAt: logSummary.lastLogAt || null,
            operations,
            stages,
            models,
            httpStatuses,
            recentIssues,
            slowSamples,
        },
        chat: {
            assistantMessages: toNumber(chatSummary.assistantMessages),
            conversations: toNumber(chatSummary.conversations),
            avgLatencyMs: Math.round(toNumber(chatSummary.avgLatencyMs)),
            maxLatencyMs: toNumber(chatSummary.maxLatencyMs),
            unverifiedAnswers: toNumber(chatSummary.unverifiedAnswers),
            verifiedAnswers: toNumber(chatSummary.verifiedAnswers),
            imageAnalyses: toNumber(chatSummary.imageAnalyses),
            externalResearchAnswers: toNumber(chatSummary.externalResearchAnswers),
            sourceTypes,
        },
        kb: {
            totalDocs: toNumber(kb.totalDocs),
            activeDocs: toNumber(kb.activeDocs),
            readyDocs: toNumber(kb.readyDocs),
            errorDocs: toNumber(kb.errorDocs),
            warningDocs: toNumber(kb.warningDocs),
            manualDocs: toNumber(kb.manualDocs),
            uploadedDocs: toNumber(kb.uploadedDocs),
            declaredChunks: toNumber(kb.declaredChunks),
            lastUpdatedAt: kb.lastUpdatedAt || null,
        },
        daily,
    };
}

function userId(req) {
    return String(req.user?.id || req.user?.EmployeeID || '').trim();
}

function userName(req) {
    return String(req.user?.name || req.user?.EmployeeName || req.user?.id || 'พนักงาน').trim();
}

function cleanMessage(value) {
    return String(value || '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function cleanKnowledgeText(value) {
    return String(value || '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 60000);
}

function cleanJohnnyAnswer(value) {
    const text = String(value || '')
        .replace(/^\s*\*?\s*wait\s*,?.*format.*$/gim, '')
        .replace(/###STK_[A-Z_]+###/g, '')
        .replace(/\[(?:D|S|E)\d+\]/g, '')
        .replace(/\n{1,2}\s*แหล่งข้อมูล\s*:[\s\S]*$/u, '')
        .replace(/\n\nแต่ถ้า[\s\S]*น้องจอห์นนี่ครับ$/u, '')
        .replace(/\*\*/g, '')
        .replace(/`+/g, '')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/^\s*>\s*/gm, '')
        .replace(/\*{2,}/g, '')
        .replace(/\/{2,}/g, '/')
        .replace(/_{2,}/g, '_')
        .replace(/^[ \t]*[-*][ \t]+/gm, '- ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!text) return text;
    const tidy = text.replace(/[,:;]\s*$/u, '').replace(/ผู้ครับ$/u, 'ทุกคนครับ');
    return /ครับ(?:ผม)?[.!?…]*$/u.test(tidy) ? tidy : `${tidy}ครับ`;
}

function ensureImageRiskRubricAnswer(value) {
    let text = cleanJohnnyAnswer(value);
    if (!text) text = 'สรุปจากรูป: ยังประเมินรายละเอียดจากรูปนี้ได้จำกัด ควรส่งรูปที่ชัดขึ้นและตรวจสอบหน้างานเพิ่มเติมครับ';
    const fallback = [
        ['สรุปจากรูป', 'สรุปจากรูป: รูปนี้ประเมินได้จากสิ่งที่มองเห็นเท่านั้น'],
        ['ประเภทความเสี่ยง', 'ประเภทความเสี่ยง: ควรตรวจว่าเป็น Unsafe Condition, Unsafe Act, PPE, Equipment, Environmental หรือไม่'],
        ['Severity', 'Severity: ยังประเมินได้จำกัดจากรูป ต้องดูสภาพหน้างานจริง'],
        ['Likelihood', 'Likelihood: ยังประเมินได้จำกัดจากรูป ต้องยืนยันความถี่การสัมผัสงาน'],
        ['Risk Level', 'Risk Level: ระดับเบื้องต้นยังไม่ควรฟันธง จนกว่าจะตรวจสอบหน้างาน'],
        ['สิ่งที่ควรทำทันที', 'สิ่งที่ควรทำทันที: หยุดงานที่เสี่ยง แยกพื้นที่ และแจ้งหัวหน้างานหรือ SHE ถ้ามีอันตรายทันที'],
        ['มาตรการป้องกันถาวร', 'มาตรการป้องกันถาวร: กำหนดมาตรการทางวิศวกรรม วิธีปฏิบัติ และการตรวจติดตามให้เหมาะกับผลตรวจจริง'],
        ['ความมั่นใจ', 'ความมั่นใจและข้อมูลที่ต้องตรวจเพิ่ม: ควรยืนยันด้วยรูปชัด มุมกว้าง พื้นที่งาน กิจกรรม และผู้เกี่ยวข้อง'],
    ];
    const missing = fallback.filter(([needle]) => !text.includes(needle)).map(([, line]) => line);
    if (missing.length) {
        text = `${text.replace(/ครับ(?:ผม)?[.!?…]*$/u, '').trim()}\n\n${missing.join('\n')}ครับ`;
    }
    return /ครับ(?:ผม)?[.!?…]*$/u.test(text) ? text : `${text}ครับ`;
}

const JOHNNY_PHASE1_MARKER = 'JOHNNY_PHASE1_ANSWER_QUALITY_GUARDRAIL';

function johnnyPhase1Text(...values) {
    return values.map(value => String(value || '')).join(' ').toLowerCase();
}

function johnnyPhase1LooksCompanyScoped(text) {
    return /(tsh|บริษัท|นโยบาย|กฎ|ระเบียบ|เอกสาร|คู่มือ|แบบฟอร์ม|หัวข้อ|เป้าหมาย|kpi|patrol|ky|hiyari|cccf|forklift|ผู้รับเหมา|จป|safety core)/iu.test(String(text || ''));
}

function johnnyPhase1LooksSafetyCritical(text) {
    return /(ไฟไหม้|เพลิง|ระเบิด|บาดเจ็บ|หมดสติ|สารเคมี|รั่วไหล|ไฟฟ้า|ช็อต|ตกจากที่สูง|อับอากาศ|confined|emergency|ฉุกเฉิน|อันตรายร้ายแรง|critical|หยุดงาน)/iu.test(String(text || ''));
}

function johnnyPhase1EmergencyFlag(text) {
    return /(ไฟไหม้|ระเบิด|บาดเจ็บ|หมดสติ|สารเคมี.*รั่ว|รั่วไหล|ไฟฟ้า.*เปลือย|ช็อต|อับอากาศ|collapse|ถล่ม|ฉุกเฉิน)/iu.test(String(text || ''));
}

function johnnyPhase1Confidence({ sourceType, citations = [], answerText = '', userMessage = '', scopedDocument = null }) {
    const normalizedSource = String(sourceType || '');
    const hasVerifiedSource = Array.isArray(citations) && citations.length > 0 && !['ai_general', 'not_verified'].includes(normalizedSource);
    const companyScoped = johnnyPhase1LooksCompanyScoped(userMessage) || Boolean(scopedDocument);
    const safetyCritical = johnnyPhase1LooksSafetyCritical(`${userMessage} ${answerText}`);
    if (normalizedSource === 'not_verified') return 'low';
    if (companyScoped && !hasVerifiedSource) return 'low';
    if (safetyCritical && !hasVerifiedSource && normalizedSource === 'ai_general') return 'medium';
    if (hasVerifiedSource) return 'high';
    return 'medium';
}

function johnnyPhase1Quality({ userMessage, answerText, sourceType, citations = [], sources = [], scopedDocument = null, groundingUsed = false, imageAnalysis = false }) {
    const normalizedSource = String(sourceType || '');
    const hasVerifiedSource = Array.isArray(citations) && citations.length > 0 && !['ai_general', 'not_verified'].includes(normalizedSource);
    const companyDataGuarded = johnnyPhase1LooksCompanyScoped(userMessage) || Boolean(scopedDocument);
    const safetyCritical = johnnyPhase1LooksSafetyCritical(`${userMessage} ${answerText}`);
    const emergencyEscalation = johnnyPhase1EmergencyFlag(`${userMessage} ${answerText}`);
    const noVerifiedSource = !hasVerifiedSource && (companyDataGuarded || normalizedSource === 'not_verified');
    const confidence = imageAnalysis
        ? (emergencyEscalation ? 'medium' : 'high')
        : johnnyPhase1Confidence({ sourceType, citations, answerText, userMessage, scopedDocument });
    return {
        phase: 1,
        marker: JOHNNY_PHASE1_MARKER,
        confidence,
        hasVerifiedSource,
        noVerifiedSource,
        companyDataGuarded,
        safetyCritical,
        emergencyEscalation,
        groundingUsed: Boolean(groundingUsed),
        scopedDocument: scopedDocument ? { id: scopedDocument.id, title: scopedDocument.Title || scopedDocument.OriginalName || 'Knowledge Base' } : null,
        sourceCount: Array.isArray(citations) ? citations.length : 0,
        sourceTypes: Array.from(new Set((sources || []).map(item => item?.type).filter(Boolean))),
    };
}

function johnnyPhase1NoVerifiedSourceAnswer(answerText, scopedDocument = null) {
    const base = scopedDocument
        ? `น้องยังไม่พบข้อมูลที่ยืนยันได้จากเอกสารที่พี่เลือก (${scopedDocument.Title || scopedDocument.OriginalName || 'Knowledge Base'}) สำหรับคำถามนี้ครับ`
        : 'น้องยังไม่พบข้อมูลที่ยืนยันได้จาก Knowledge Base หรือข้อมูลระบบของบริษัทสำหรับคำถามนี้ครับ';
    const guidance = 'เพื่อความปลอดภัย แนะนำให้ตรวจสอบกับ จป.วิชาชีพ หัวหน้างาน หรือ Admin ก่อนนำไปใช้เป็นข้อกำหนดบริษัทครับ';
    const cleaned = cleanJohnnyAnswer(answerText || '');
    if (!cleaned || cleaned.includes('ยังไม่พบข้อมูลที่ยืนยันได้')) return `${base}\n${guidance}`;
    return `${base}\n${guidance}\n\nข้อมูลประกอบทั่วไปที่น้องช่วยอธิบายได้:\n${cleaned}`;
}

function makeTitle(message) {
    const oneLine = message.replace(/\s+/g, ' ').trim();
    return oneLine.length > 70 ? `${oneLine.slice(0, 67)}...` : (oneLine || 'Johnny AI Chat');
}

function getUploadBaseUrl(req) {
    const configured = (process.env.PUBLIC_UPLOAD_BASE_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
}

function appendFilenameMetadata(publicUrl, originalName) {
    return `${publicUrl}?filename=${encodeURIComponent(cleanOriginalFilename(originalName))}`;
}

async function getAppSetting(key) {
    const [[row]] = await db.query('SELECT value FROM App_Settings WHERE key_name=? LIMIT 1', [key]).catch(() => [[null]]);
    return row?.value || '';
}

async function setAppSetting(key, value) {
    await db.query(
        'INSERT INTO App_Settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), UpdatedAt=NOW()',
        [key, value]
    );
}

async function deleteAppSetting(key) {
    await db.query('DELETE FROM App_Settings WHERE key_name=?', [key]);
}

function normalizeExtractedText(text) {
    return String(text || '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function extractedTextLooksBad(text) {
    const normalized = normalizeExtractedText(text);
    if (normalized.length < 120) return true;
    const chars = Array.from(normalized);
    let useful = 0;
    let bad = 0;
    for (const ch of chars) {
        if (/[\p{L}\p{N}\p{M}]/u.test(ch)) useful++;
        else if (!/[\s.,;:!?()[\]{}'"“”‘’\-–—_/\\|@#$%&*+=<>~`^°•·…]/u.test(ch)) bad++;
    }
    return (bad / Math.max(chars.length, 1)) > 0.18 || (useful / Math.max(chars.length, 1)) < 0.35;
}

function pdfTextNeedsAiFallback(text, filePath) {
    const normalized = normalizeExtractedText(text);
    if (extractedTextLooksBad(normalized)) return true;
    const size = fs.statSync(filePath).size;
    const artifactMatches = normalized.match(/\b(?:Adobe|Identity|UCS|en-US|ToUnicode|CID|Registry|Ordering|Supplement)\b/g) || [];
    const artifactPer10k = artifactMatches.length * 10000 / Math.max(normalized.length, 1);
    if (artifactMatches.length > 50 && artifactPer10k > 3) return true;
    const minLocalChars = Number(process.env.JOHNNY_PDF_MIN_LOCAL_TEXT_CHARS || 1000);
    const minSizeForShortText = Number(process.env.JOHNNY_PDF_MIN_SIZE_FOR_SHORT_TEXT_BYTES || 120 * 1024);
    const maxBytesPerTextChar = Number(process.env.JOHNNY_PDF_MAX_BYTES_PER_TEXT_CHAR || 180);
    if (size >= minSizeForShortText && normalized.length < minLocalChars) return true;
    if (size >= minSizeForShortText && size / Math.max(normalized.length, 1) > maxBytesPerTextChar) return true;
    return false;
}

function stripXml(xml) {
    return String(xml || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function readZipEntries(filePath) {
    const buf = fs.readFileSync(filePath);
    const eocdSig = 0x06054b50;
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
        if (buf.readUInt32LE(i) === eocdSig) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('Cannot read Office ZIP directory');
    const entries = [];
    const total = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < total; i++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50) break;
        const method = buf.readUInt16LE(offset + 10);
        const compressedSize = buf.readUInt32LE(offset + 20);
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const localOffset = buf.readUInt32LE(offset + 42);
        const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
        const localNameLen = buf.readUInt16LE(localOffset + 26);
        const localExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compressedSize);
        let data = Buffer.alloc(0);
        if (method === 0) data = raw;
        else if (method === 8) data = zlib.inflateRawSync(raw);
        entries.push({ name, data });
        offset += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function extractDocx(filePath) {
    const entries = readZipEntries(filePath);
    return normalizeExtractedText(entries
        .filter(e => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(e.name))
        .map(e => stripXml(e.data.toString('utf8')))
        .join('\n'));
}

function extractPptx(filePath) {
    const entries = readZipEntries(filePath);
    return normalizeExtractedText(entries
        .filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((e, idx) => `Slide ${idx + 1}\n${stripXml(e.data.toString('utf8'))}`)
        .join('\n\n'));
}

function extractPdf(filePath) {
    const buf = fs.readFileSync(filePath);
    const chunks = [];
    const raw = buf.toString('latin1');
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        const stream = Buffer.from(m[1], 'latin1');
        let text = '';
        try {
            text = zlib.inflateSync(stream).toString('latin1');
        } catch (_) {
            text = stream.toString('latin1');
        }
        chunks.push(text);
    }
    chunks.push(raw);
    const extracted = chunks.join('\n')
        .replace(/\\\)/g, '__RPAREN__')
        .replace(/\\\(/g, '__LPAREN__')
        .match(/\(([^()]{2,})\)/g)?.map(s => s.slice(1, -1)) || [];
    return normalizeExtractedText(extracted.join(' ')
        .replace(/__RPAREN__/g, ')')
        .replace(/__LPAREN__/g, '(')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\\t/g, ' '));
}

async function extractPdfWithGemini(filePath, originalName, trace = null, minimumExpectedChars = 0) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured for PDF extraction');
    const stat = fs.statSync(filePath);
    const maxBytes = Number(process.env.JOHNNY_PDF_GEMINI_MAX_MB || 18) * 1024 * 1024;
    if (stat.size > maxBytes) {
        throw new Error('PDF is too large for AI text extraction. Please upload DOCX/TXT or split the PDF.');
    }

    const pdfBase64 = fs.readFileSync(filePath).toString('base64');
    let lastError = null;
    for (const model of GEMINI_MODEL_CHAIN) {
        const attemptStarted = Date.now();
        let attemptLogged = false;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(process.env.JOHNNY_PDF_EXTRACT_TIMEOUT_MS || 90000));
        const url = `${GEMINI_ENDPOINT.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            {
                                text: [
                                    'Extract readable text from this PDF for a Thai safety knowledge base.',
                                    'Use OCR for scanned pages, screenshots, tables, and embedded images when needed.',
                                    'Preserve Thai text exactly, keep document order, include table text row-by-row, and do not summarize.',
                                    'Return plain text only. If no readable text is available, return __NO_TEXT__.',
                                    `Filename: ${originalName || path.basename(filePath)}`,
                                ].join('\n'),
                            },
                            {
                                inline_data: {
                                    mime_type: 'application/pdf',
                                    data: pdfBase64,
                                },
                            },
                        ],
                    }],
                    generationConfig: {
                        maxOutputTokens: Number(process.env.JOHNNY_PDF_EXTRACT_MAX_OUTPUT_TOKENS || 16384),
                    },
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const err = new Error(data?.error?.message || `Gemini PDF extraction error (${response.status})`);
                err.status = response.status;
                lastError = err;
                trace?.attempts.push({ stage: 'gemini_pdf', model, status: 'error', httpStatus: response.status, durationMs: Date.now() - attemptStarted, error: err.message.slice(0, 500) });
                attemptLogged = true;
                if (model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1] && shouldTryNextGeminiModel(err, data)) {
                    console.warn(`[johnny-ai] Gemini PDF extraction model ${model} failed, trying fallback: ${err.message}`);
                    continue;
                }
                throw err;
            }
            const text = normalizeExtractedText(extractText(data));
            if (!text || text === '__NO_TEXT__' || extractedTextLooksBad(text)) {
                lastError = new Error(`AI PDF extraction model ${model} did not return readable text`);
                trace?.attempts.push({ stage: 'gemini_pdf', model, status: 'low_quality', httpStatus: response.status, durationMs: Date.now() - attemptStarted, chars: text.length, finishReason: geminiFinishReason(data) || null, error: lastError.message });
                attemptLogged = true;
                if (model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1]) {
                    console.warn(`[johnny-ai] Gemini PDF extraction model ${model} returned low quality text, trying fallback`);
                    continue;
                }
                throw lastError;
            }
            if (minimumExpectedChars > 0 && text.length < minimumExpectedChars) {
                lastError = new Error(`AI PDF extraction model ${model} returned incomplete text (${text.length}/${minimumExpectedChars} expected chars)`);
                trace?.attempts.push({ stage: 'gemini_pdf', model, status: 'incomplete', httpStatus: response.status, durationMs: Date.now() - attemptStarted, chars: text.length, expectedChars: minimumExpectedChars, finishReason: geminiFinishReason(data) || null, error: lastError.message });
                attemptLogged = true;
                if (model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1]) {
                    console.warn(`[johnny-ai] Gemini PDF extraction model ${model} returned incomplete text, trying fallback`);
                    continue;
                }
                throw lastError;
            }
            trace?.attempts.push({ stage: 'gemini_pdf', model, status: 'success', httpStatus: response.status, durationMs: Date.now() - attemptStarted, chars: text.length, finishReason: geminiFinishReason(data) || null });
            if (trace) trace.selectedMethod = 'gemini_pdf';
            return text;
        } catch (error) {
            lastError = error;
            if (error.name === 'AbortError') error.statusCode = 504;
            if (!attemptLogged) {
                trace?.attempts.push({ stage: 'gemini_pdf', model, status: error.name === 'AbortError' ? 'timeout' : 'error', httpStatus: Number(error.status || error.statusCode || 0) || null, durationMs: Date.now() - attemptStarted, error: String(error.message || error).slice(0, 500) });
            }
            if (model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1] && shouldTryNextGeminiModel(error, null)) {
                console.warn(`[johnny-ai] Gemini PDF extraction model ${model} failed, trying fallback: ${error.message}`);
                continue;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError || new Error('AI PDF extraction did not return readable text');
}

function extractXlsx(filePath) {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const parts = [];
    for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName] || {});
        if (csv.trim()) parts.push(`Sheet: ${sheetName}\n${csv}`);
    }
    return normalizeExtractedText(parts.join('\n\n'));
}

async function extractDocumentText(filePath, originalName, trace = null) {
    const ext = path.extname(originalName || filePath).toLowerCase();
    if (['.txt', '.md', '.csv'].includes(ext)) {
        const text = normalizeExtractedText(fs.readFileSync(filePath, 'utf8'));
        trace?.attempts.push({ stage: 'local_parser', parser: ext.slice(1), status: 'success', chars: text.length });
        if (trace) trace.selectedMethod = 'local_parser';
        return text;
    }
    if (['.xlsx', '.docx', '.pptx'].includes(ext)) {
        const text = ext === '.xlsx' ? extractXlsx(filePath) : ext === '.docx' ? extractDocx(filePath) : extractPptx(filePath);
        trace?.attempts.push({ stage: 'local_parser', parser: ext.slice(1), status: extractedTextLooksBad(text) ? 'low_quality' : 'success', chars: text.length });
        if (trace) trace.selectedMethod = 'local_parser';
        return text;
    }
    if (ext === '.pdf') {
        const started = Date.now();
        const localText = extractPdf(filePath);
        const needsFallback = pdfTextNeedsAiFallback(localText, filePath);
        trace?.attempts.push({ stage: 'local_pdf', parser: 'lightweight', status: needsFallback ? 'fallback' : 'success', durationMs: Date.now() - started, chars: localText.length, reason: needsFallback ? 'quality_gate_requested_ai_ocr' : null });
        if (!needsFallback) {
            if (trace) trace.selectedMethod = 'local_pdf';
            return localText;
        }
        const size = fs.statSync(filePath).size;
        const maxBytesPerChar = Math.max(1, Number(process.env.JOHNNY_PDF_MAX_BYTES_PER_TEXT_CHAR || 180));
        const maxExpectedChars = Math.max(1000, Number(process.env.JOHNNY_PDF_AI_MAX_EXPECTED_CHARS || 12000));
        const minimumExpectedChars = Math.max(
            Number(process.env.JOHNNY_PDF_MIN_LOCAL_TEXT_CHARS || 1000),
            Math.min(maxExpectedChars, Math.floor(size / maxBytesPerChar))
        );
        if (trace) trace.minimumExpectedChars = minimumExpectedChars;
        return extractPdfWithGemini(filePath, originalName, trace, minimumExpectedChars);
    }
    throw new Error('ชนิดไฟล์นี้ยังไม่รองรับสำหรับ Knowledge Base');
}

function chunkText(text) {
    const clean = normalizeExtractedText(text);
    const max = Number(process.env.JOHNNY_CHUNK_CHARS || 3200);
    const overlap = Number(process.env.JOHNNY_CHUNK_OVERLAP_CHARS || 350);
    const chunks = [];
    let start = 0;
    while (start < clean.length) {
        let end = Math.min(clean.length, start + max);
        const nextBreak = clean.lastIndexOf('\n\n', end);
        if (nextBreak > start + Math.floor(max * 0.55)) end = nextBreak;
        const part = clean.slice(start, end).trim();
        if (part.length >= 80) chunks.push(part);
        if (end >= clean.length) break;
        start = Math.max(0, end - overlap);
    }
    return chunks.slice(0, Number(process.env.JOHNNY_MAX_CHUNKS_PER_DOC || 220));
}

function parseEmbedding(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value.map(Number).filter(n => Number.isFinite(n));
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number).filter(n => Number.isFinite(n)) : null;
    } catch (_) {
        return null;
    }
}

function summarizeExtractedChunks(chunks, doc = {}) {
    const totalChunks = chunks.length;
    const totalChars = chunks.reduce((sum, chunk) => sum + String(chunk.ChunkText || '').length, 0);
    const embeddingCount = chunks.filter(chunk => chunk.EmbeddingJson).length;
    const artifactMatches = chunks
        .map(chunk => String(chunk.ChunkText || '').match(/\b(?:Adobe|Identity|UCS|en-US|ToUnicode|CID|Registry|Ordering|Supplement)\b/g) || [])
        .reduce((sum, matches) => sum + matches.length, 0);
    const headings = chunks.slice(0, 30).map((chunk, idx) => {
        const text = normalizeExtractedText(chunk.ChunkText || '');
        const firstLine = text.split(/\n|[.!?。]/).map(line => line.trim()).find(Boolean) || text.slice(0, 140);
        return {
            chunkIndex: Number(chunk.ChunkIndex ?? idx),
            chars: Number(chunk.CharCount || text.length),
            title: firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine,
        };
    }).filter(item => item.title);
    const combined = normalizeExtractedText(chunks.map(chunk => chunk.ChunkText || '').join('\n'));
    const englishTerms = Array.from(new Set((combined.toLowerCase().match(/\b[a-z][a-z0-9-]{3,}\b/g) || [])
        .filter(term => !['this', 'that', 'with', 'from', 'page', 'document', 'revision', 'issue', 'date'].includes(term))))
        .slice(0, 12);
    const safetyTerms = [
        'PPE', 'KY', 'Hiyari', 'Patrol', 'Contractor', 'ผู้รับเหมา', 'อุบัติเหตุ', 'ความเสี่ยง',
        'อันตราย', 'ความปลอดภัย', 'ควบคุม', 'มาตรการ', 'ฉุกเฉิน', 'อบรม', 'ตรวจสอบ', 'เครื่องจักร',
    ].filter(term => combined.toLowerCase().includes(String(term).toLowerCase()));
    const fileSize = Number(doc.FileSize || 0);
    return {
        totalChunks,
        totalChars,
        embeddingCount,
        artifactMatches,
        quality: {
            noChunks: totalChunks === 0,
            embeddingMismatch: totalChunks > 0 && embeddingCount !== totalChunks,
            lowContent: String(doc.SourceType || 'document') === 'document' && fileSize >= 100000 && totalChars < 1000,
            artifactHeavy: artifactMatches > 50 && (artifactMatches * 10000 / Math.max(totalChars, 1)) > 3,
        },
        topics: headings,
        keywords: Array.from(new Set([...safetyTerms, ...englishTerms])).slice(0, 18),
        preview: combined.slice(0, 1600),
    };
}

function safeJsonParse(value, fallback = null) {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value));
    } catch (_) {
        return fallback;
    }
}

function cleanModelJsonText(value) {
    return String(value || '')
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
}

function normalizeAuditArray(value, limit = 10) {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, limit);
    if (typeof value === 'string' && value.trim()) return [value.trim()].slice(0, limit);
    return [];
}

function normalizeDocumentAudit(raw, doc = {}, chunks = []) {
    const parsed = typeof raw === 'string' ? safeJsonParse(cleanModelJsonText(raw), {}) : (raw && typeof raw === 'object' ? raw : {});
    const sourceSummary = summarizeExtractedChunks(chunks, doc);
    const relations = parsed.safetyRelations && typeof parsed.safetyRelations === 'object' ? parsed.safetyRelations : {};
    const confidence = String(parsed.confidence || '').toLowerCase();
    return {
        summary: String(parsed.summary || sourceSummary.preview || '').trim().slice(0, 1200),
        mainTopics: normalizeAuditArray(parsed.mainTopics || parsed.topics || sourceSummary.topics.map(item => item.title), 12),
        safetyRelations: {
            PPE: Boolean(relations.PPE),
            Contractor: Boolean(relations.Contractor),
            KY: Boolean(relations.KY),
            Hiyari: Boolean(relations.Hiyari),
            Patrol: Boolean(relations.Patrol),
        },
        requirements: normalizeAuditArray(parsed.requirements, 12),
        procedures: normalizeAuditArray(parsed.procedures, 12),
        prohibitions: normalizeAuditArray(parsed.prohibitions, 12),
        uncertainAreas: normalizeAuditArray(parsed.uncertainAreas, 12),
        qualityNotes: normalizeAuditArray(parsed.qualityNotes, 8),
        confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : (sourceSummary.quality.noChunks || sourceSummary.quality.lowContent || sourceSummary.quality.artifactHeavy ? 'low' : 'medium'),
        auditedAt: new Date().toISOString(),
    };
}

function buildAuditInput(chunks) {
    return chunks
        .slice(0, Number(process.env.JOHNNY_AUDIT_MAX_CHUNKS || 12))
        .map(chunk => {
            const text = cleanKnowledgeText(chunk.ChunkText || chunk.chunk || '').slice(0, Number(process.env.JOHNNY_AUDIT_CHUNK_CHARS || 1400));
            return `Chunk ${Number(chunk.ChunkIndex ?? chunk.idx ?? 0) + 1}:\n${text}`;
        })
        .join('\n\n---\n\n')
        .slice(0, Number(process.env.JOHNNY_AUDIT_MAX_INPUT_CHARS || 16000));
}

async function auditDocumentChunks(documentId, doc = {}) {
    const [chunks] = await db.query(
        `SELECT ChunkIndex, ChunkText, CHAR_LENGTH(ChunkText) AS CharCount, EmbeddingJson
         FROM johnny_kb_chunks
         WHERE DocumentID=?
         ORDER BY ChunkIndex ASC, id ASC
         LIMIT ?`,
        [documentId, Math.max(1, Number(process.env.JOHNNY_AUDIT_MAX_CHUNKS || 12))]
    );
    if (!chunks.length) {
        const audit = normalizeDocumentAudit({
            summary: '',
            confidence: 'low',
            uncertainAreas: ['No indexed chunks were available for audit.'],
            qualityNotes: ['No indexed text found.'],
        }, doc, chunks);
        await db.query(
            'UPDATE johnny_kb_documents SET AuditStatus=?, AuditJson=?, LastAuditAt=NOW() WHERE id=?',
            ['no_chunks', JSON.stringify(audit), documentId]
        );
        return audit;
    }

    await db.query('UPDATE johnny_kb_documents SET AuditStatus=? WHERE id=?', ['auditing', documentId]);
    try {
        const systemInstruction = [
            'You audit a Thai company safety Knowledge Base document after indexing.',
            'Use only the provided indexed chunks. Do not invent missing content.',
            'Return valid compact JSON only. No Markdown.',
            'JSON keys: summary, mainTopics, safetyRelations, requirements, procedures, prohibitions, uncertainAreas, qualityNotes, confidence.',
            'safetyRelations must be an object with boolean keys PPE, Contractor, KY, Hiyari, Patrol.',
            'confidence must be high, medium, or low.',
        ].join('\n');
        const contents = [{
            role: 'user',
            parts: [{
                text: [
                    `Document title: ${doc.Title || doc.OriginalName || 'Knowledge Base'}`,
                    `Category: ${doc.Category || 'general'}`,
                    'Audit these indexed chunks:',
                    buildAuditInput(chunks),
                ].join('\n\n'),
            }],
        }];
        const result = await callGemini({ systemInstruction, contents, enableWebSearch: false, operation: 'auto_audit', logContext: { documentId } });
        const audit = normalizeDocumentAudit(result.text, doc, chunks);
        audit.model = result.model || null;
        await db.query(
            'UPDATE johnny_kb_documents SET AuditStatus=?, AuditJson=?, LastAuditAt=NOW() WHERE id=?',
            ['ready', JSON.stringify(audit), documentId]
        );
        return audit;
    } catch (error) {
        const summary = summarizeExtractedChunks(chunks, doc);
        const audit = normalizeDocumentAudit({
            summary: summary.preview,
            mainTopics: summary.topics.map(item => item.title),
            qualityNotes: ['AI audit failed; fallback metadata was generated from indexed chunks.'],
            uncertainAreas: [String(error.message || error).slice(0, 240)],
            confidence: 'low',
        }, doc, chunks);
        await db.query(
            'UPDATE johnny_kb_documents SET AuditStatus=?, AuditJson=?, LastAuditAt=NOW() WHERE id=?',
            ['failed', JSON.stringify(audit), documentId]
        );
        return audit;
    }
}

function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0, ma = 0, mb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        ma += a[i] * a[i];
        mb += b[i] * b[i];
    }
    return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

function keywordTerms(question) {
    const normalized = String(question || '').toLowerCase();
    const terms = normalized
        .split(/[^\p{L}\p{N}_-]+/u)
        .map(term => term.trim())
        .filter(term => term.length >= 2 && !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'what', 'how', 'why'].includes(term));
    return Array.from(new Set(terms)).slice(0, 24);
}

function keywordScoreForRow(question, row) {
    const terms = keywordTerms(question);
    if (!terms.length) return 0;
    const query = String(question || '').trim().toLowerCase();
    const titleText = `${row.Title || ''} ${row.OriginalName || ''} ${row.Category || ''}`.toLowerCase();
    const bodyText = String(row.ChunkText || '').toLowerCase();
    let score = bodyText.includes(query) && query.length >= 4 ? 0.25 : 0;
    let matchedWeight = 0;
    let totalWeight = 0;
    for (const term of terms) {
        const weight = term.length >= 6 ? 1.25 : 1;
        totalWeight += weight;
        if (titleText.includes(term)) matchedWeight += weight * 1.5;
        else if (bodyText.includes(term)) matchedWeight += weight;
    }
    if (totalWeight > 0) score += Math.min(0.75, matchedWeight / Math.max(totalWeight * 1.4, 1));
    return Math.max(0, Math.min(1, score));
}

async function callGeminiEmbedding(text, mode = 'document', title = 'none') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const err = new Error('GEMINI_API_KEY is not configured');
        err.statusCode = 503;
        throw err;
    }
    const prepared = mode === 'query'
        ? `task: question answering | query: ${text}`
        : `title: ${title || 'none'} | text: ${text}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.GEMINI_TIMEOUT_MS || 30000));
    const url = `${GEMINI_ENDPOINT.replace(/\/+$/, '')}/models/${encodeURIComponent(DEFAULT_EMBEDDING_MODEL)}:embedContent`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                model: `models/${DEFAULT_EMBEDDING_MODEL}`,
                content: { parts: [{ text: prepared }] },
                outputDimensionality: Number(process.env.GEMINI_EMBEDDING_DIMENSION || 768),
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const err = new Error(data?.error?.message || `Gemini embedding error (${response.status})`);
            err.statusCode = response.status >= 500 ? 502 : 400;
            throw err;
        }
        const values = data?.embedding?.values || data?.embeddings?.[0]?.values || data?.embeddings?.[0]?.embedding?.values;
        if (!Array.isArray(values) || !values.length) throw new Error('Gemini embedding response is empty');
        return values.map(Number);
    } finally {
        clearTimeout(timeout);
    }
}

async function saveExtractionLog(documentId, trace, outcome, error = null) {
    const payload = {
        ...trace,
        outcome,
        completedAt: new Date().toISOString(),
        error: error ? String(error.message || error).slice(0, 900) : null,
    };
    await db.query(
        'UPDATE johnny_kb_documents SET ExtractionLogJson=?, LastExtractionAt=NOW() WHERE id=?',
        [JSON.stringify(payload), documentId]
    );
    await writeJohnnyLog({
        level: outcome === 'accepted' ? 'info' : 'error',
        operation: 'document_index',
        stage: 'extraction_complete',
        documentId,
        message: outcome === 'accepted' ? 'Document extraction accepted' : payload.error,
        meta: { outcome, selectedMethod: trace.selectedMethod, previousIndex: trace.previousIndex, candidate: trace.candidate, attempts: trace.attempts },
    });
    return payload;
}

async function indexDocument(documentId, filePath, title, originalName) {
    const [[before]] = await db.query(
        'SELECT COUNT(*) AS cnt, COALESCE(SUM(CHAR_LENGTH(ChunkText)), 0) AS chars FROM johnny_kb_chunks WHERE DocumentID=?',
        [documentId]
    );
    const previousCount = Number(before?.cnt || 0);
    const previousChars = Number(before?.chars || 0);
    const trace = {
        version: 1,
        startedAt: new Date().toISOString(),
        file: { name: String(originalName || ''), extension: path.extname(originalName || filePath).toLowerCase(), bytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0 },
        previousIndex: { chunks: previousCount, chars: previousChars },
        selectedMethod: null,
        attempts: [],
        candidate: null,
    };
    await db.query(
        'UPDATE johnny_kb_documents SET IndexedStatus=?, ErrorMessage=NULL, AuditStatus=NULL WHERE id=?',
        ['indexing', documentId]
    );
    try {
        const text = await extractDocumentText(filePath, originalName, trace);
        const chunks = chunkText(text);
        if (!chunks.length) throw new Error('ไม่พบข้อความที่อ่านได้จากเอกสารนี้');
        const nextChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        trace.candidate = { chunks: chunks.length, chars: nextChars };
        const suspiciousRegression = previousCount >= 2
            && previousChars >= 1000
            && chunks.length < previousCount * REINDEX_MIN_CHUNK_RATIO
            && nextChars < previousChars * REINDEX_MIN_CHAR_RATIO;
        if (suspiciousRegression) {
            throw new Error(`ผล Reindex มีข้อความลดลงผิดปกติ (${previousCount} → ${chunks.length} chunks, ${previousChars.toLocaleString()} → ${nextChars.toLocaleString()} ตัวอักษร) ระบบเก็บ index เดิมไว้ กรุณาตรวจไฟล์ต้นฉบับแล้วลองใหม่`);
        }
        const prepared = [];
        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            prepared.push({ chunk, embedding: await callGeminiEmbedding(chunk, 'document', title), idx });
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM johnny_kb_chunks WHERE DocumentID=?', [documentId]);
            for (const item of prepared) {
                await conn.query(
                    `INSERT INTO johnny_kb_chunks
                     (DocumentID, ChunkIndex, ChunkText, PageLabel, EmbeddingJson, EmbeddingModel, TokenEstimate)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [documentId, item.idx, item.chunk, `chunk ${item.idx + 1}`, JSON.stringify(item.embedding), DEFAULT_EMBEDDING_MODEL, Math.ceil(item.chunk.length / 4)]
                );
            }
            await conn.query(
                'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=NULL, LastIndexedAt=NOW() WHERE id=?',
                ['ready', chunks.length, documentId]
            );
            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
        const extractionLog = await saveExtractionLog(documentId, trace, 'accepted');
        const audit = await auditDocumentChunks(documentId, { id: documentId, Title: title, OriginalName: originalName, SourceType: 'document' });
        return {
            chunks: chunks.length,
            chars: nextChars,
            embeddings: prepared.length,
            audit,
            extractionLog,
        };
    } catch (error) {
        const message = String(error.message || error).slice(0, 900);
        await db.query(
            'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=?, LastIndexedAt=NOW() WHERE id=?',
            [previousCount > 0 ? 'ready' : 'failed', previousCount, previousCount > 0 ? `Reindex failed; previous index retained: ${message}` : message, documentId]
        );
        await saveExtractionLog(documentId, trace, 'rejected', error).catch(logError => {
            console.error('[johnny-ai] save extraction log failed:', logError.message);
        });
        throw error;
    }
}

async function indexManualKnowledge(documentId, title, content) {
    const [[before]] = await db.query('SELECT COUNT(*) AS cnt FROM johnny_kb_chunks WHERE DocumentID=?', [documentId]);
    const previousCount = Number(before?.cnt || 0);
    await db.query(
        'UPDATE johnny_kb_documents SET IndexedStatus=?, ErrorMessage=NULL, AuditStatus=NULL WHERE id=?',
        ['indexing', documentId]
    );
    try {
        const chunks = chunkText(content);
        if (!chunks.length) throw new Error('กรุณาระบุเนื้อหา safety knowledge อย่างน้อย 80 ตัวอักษร');
        const prepared = [];
        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            prepared.push({ chunk, embedding: await callGeminiEmbedding(chunk, 'document', title), idx });
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM johnny_kb_chunks WHERE DocumentID=?', [documentId]);
            for (const item of prepared) {
                await conn.query(
                    `INSERT INTO johnny_kb_chunks
                     (DocumentID, ChunkIndex, ChunkText, PageLabel, EmbeddingJson, EmbeddingModel, TokenEstimate)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [documentId, item.idx, item.chunk, `manual ${item.idx + 1}`, JSON.stringify(item.embedding), DEFAULT_EMBEDDING_MODEL, Math.ceil(item.chunk.length / 4)]
                );
            }
            await conn.query(
                'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=NULL, LastIndexedAt=NOW() WHERE id=?',
                ['ready', chunks.length, documentId]
            );
            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
        const audit = await auditDocumentChunks(documentId, { id: documentId, Title: title, OriginalName: title, SourceType: 'manual' });
        return {
            chunks: chunks.length,
            chars: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
            embeddings: prepared.length,
            audit,
        };
    } catch (error) {
        const message = String(error.message || error).slice(0, 900);
        await db.query(
            'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=?, LastIndexedAt=NOW() WHERE id=?',
            [previousCount > 0 ? 'ready' : 'failed', previousCount, previousCount > 0 ? `Reindex failed; previous index retained: ${message}` : message, documentId]
        );
        throw error;
    }
}

function cleanRefinedChunkText(value, fallback = '') {
    const text = cleanKnowledgeText(String(value || '')
        .replace(/^```(?:text|markdown)?/i, '')
        .replace(/```$/i, '')
        .replace(/^\s*(?:ข้อความที่เกลาแล้ว|ปรับภาษาแล้ว|ผลลัพธ์)\s*[:：]\s*/i, ''));
    return text.length >= 40 ? text : cleanKnowledgeText(fallback);
}

async function refineKbChunkText(chunkText, docTitle, chunkIndex, documentId = null) {
    const original = cleanKnowledgeText(chunkText);
    if (!original) return original;
    const systemInstruction = [
        'You are a careful Thai safety-document text editor for a company Knowledge Base.',
        'Rewrite the extracted/OCR text into correct, natural Thai while preserving the exact meaning.',
        'Do not summarize. Do not add facts. Do not remove requirements, warnings, numbers, dates, names, document codes, form codes, PPE names, or legal/safety terms.',
        'Keep important English technical terms if they appear in the source.',
        'Remove obvious OCR/PDF artifacts, broken spacing, duplicated headers/footers, and meaningless symbols only when they do not change meaning.',
        'Return only the corrected text. No explanation, no Markdown fence, no bullet conversion unless the source already implies a list.',
    ].join('\n');
    const contents = [{
        role: 'user',
        parts: [{
            text: [
                `Document: ${docTitle || 'Knowledge Base'}`,
                `Chunk: ${Number(chunkIndex || 0) + 1}`,
                'Please polish this extracted text without changing the meaning:',
                original,
            ].join('\n\n'),
        }],
    }];
    let lastError = null;
    for (let attempt = 0; attempt <= REFINE_TRANSIENT_RETRIES; attempt += 1) {
        try {
            const result = await callGemini({ systemInstruction, contents, enableWebSearch: false, operation: 'refine', logContext: { documentId, meta: { chunkIndex: Number(chunkIndex || 0) } } });
            return cleanRefinedChunkText(result.text, original);
        } catch (error) {
            lastError = error;
            const transient = [429, 500, 502, 503, 504].includes(Number(error?.statusCode || error?.status || 0))
                || error?.name === 'AbortError';
            if (!transient || attempt >= REFINE_TRANSIENT_RETRIES) throw error;
            await new Promise(resolve => setTimeout(resolve, REFINE_RETRY_DELAY_MS * (attempt + 1)));
        }
    }
    throw lastError || new Error('Gemini refine request failed');
}

async function refineDocumentChunks(documentId, title) {
    const [[before]] = await db.query('SELECT COUNT(*) AS cnt FROM johnny_kb_chunks WHERE DocumentID=?', [documentId]);
    const previousCount = Number(before?.cnt || 0);
    if (!previousCount) throw new Error('ยังไม่มีข้อความที่ index แล้วให้เกลา');
    await db.query(
        'UPDATE johnny_kb_documents SET IndexedStatus=?, ErrorMessage=NULL, AuditStatus=NULL WHERE id=?',
        ['indexing', documentId]
    );
    try {
        const limit = Math.max(1, Number(process.env.JOHNNY_REFINE_MAX_CHUNKS_PER_DOC || 60));
        const [chunks] = await db.query(
            `SELECT id, ChunkIndex, ChunkText, PageLabel
             FROM johnny_kb_chunks
             WHERE DocumentID=?
             ORDER BY ChunkIndex ASC, id ASC
             LIMIT ?`,
            [documentId, limit]
        );
        if (!chunks.length) throw new Error('ยังไม่มีข้อความที่ index แล้วให้เกลา');
        const prepared = [];
        for (const chunk of chunks) {
            const refined = await refineKbChunkText(chunk.ChunkText || '', title, chunk.ChunkIndex, documentId);
            prepared.push({
                id: chunk.id,
                chunkIndex: Number(chunk.ChunkIndex || 0),
                text: refined,
                embedding: await callGeminiEmbedding(refined, 'document', title),
            });
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            for (const item of prepared) {
                await conn.query(
                    `UPDATE johnny_kb_chunks
                     SET ChunkText=?, EmbeddingJson=?, EmbeddingModel=?, TokenEstimate=?
                     WHERE id=? AND DocumentID=?`,
                    [item.text, JSON.stringify(item.embedding), DEFAULT_EMBEDDING_MODEL, Math.ceil(item.text.length / 4), item.id, documentId]
                );
            }
            await conn.query(
                'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=NULL, LastIndexedAt=NOW() WHERE id=?',
                ['ready', previousCount, documentId]
            );
            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
        const audit = await auditDocumentChunks(documentId, { id: documentId, Title: title, OriginalName: title });
        return {
            chunks: prepared.length,
            chars: prepared.reduce((sum, item) => sum + item.text.length, 0),
            embeddings: prepared.length,
            limited: previousCount > prepared.length,
            audit,
        };
    } catch (error) {
        const message = String(error.message || error).slice(0, 900);
        await db.query(
            'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=?, LastIndexedAt=NOW() WHERE id=?',
            [previousCount > 0 ? 'ready' : 'failed', previousCount, previousCount > 0 ? `Refine failed; previous index retained: ${message}` : message, documentId]
        );
        throw error;
    }
}

async function getScopedKbDocument(documentId) {
    const id = Number.parseInt(documentId, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    const [[doc]] = await db.query(
        `SELECT id, Title, OriginalName, Category, SourceType, IsActive, IndexedStatus
         FROM johnny_kb_documents
         WHERE id=? AND IsActive=1 AND IndexedStatus='ready'
         LIMIT 1`,
        [id]
    );
    return doc || null;
}

async function searchKnowledgeBase(question, options = {}) {
    if (!process.env.GEMINI_API_KEY) return [];
    const queryEmbedding = await callGeminiEmbedding(question, 'query');
    const scopedDocumentId = Number.parseInt(options.documentId, 10);
    const hasScope = Number.isInteger(scopedDocumentId) && scopedDocumentId > 0;
    const [rows] = await db.query(
        `SELECT c.id AS chunkId, c.ChunkIndex, c.ChunkText, c.PageLabel, c.EmbeddingJson, c.TokenEstimate,
                d.id AS documentId, d.Title, d.OriginalName, d.FileUrl, d.Category, d.SourceType
         FROM johnny_kb_chunks c
         JOIN johnny_kb_documents d ON d.id = c.DocumentID
         WHERE d.IsActive=1 AND d.IndexedStatus='ready' AND c.EmbeddingJson IS NOT NULL
           ${hasScope ? 'AND d.id=?' : ''}`,
        hasScope ? [scopedDocumentId] : []
    );
    return rows
        .map(row => {
            const semanticScore = cosineSimilarity(queryEmbedding, parseEmbedding(row.EmbeddingJson));
            const keywordScore = keywordScoreForRow(question, row);
            const hybridScore = Math.max(0, Math.min(1, (semanticScore * KB_SEMANTIC_WEIGHT) + (keywordScore * KB_KEYWORD_WEIGHT)));
            return {
                ...row,
                semanticScore,
                keywordScore,
                hybridScore,
                score: hybridScore,
            };
        })
        .filter(row => hasScope || row.semanticScore >= KB_MIN_SCORE || row.keywordScore >= KB_KEYWORD_MIN_SCORE || row.hybridScore >= KB_HYBRID_MIN_SCORE)
        .sort((a, b) => b.hybridScore - a.hybridScore || b.semanticScore - a.semanticScore || b.keywordScore - a.keywordScore)
        .slice(0, KB_TOP_K);
}

async function getConversationForUser(conversationId, uid) {
    if (!conversationId) return null;
    const id = Number.parseInt(conversationId, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    const [rows] = await db.query(
        'SELECT id, UserID, Title, CreatedAt, UpdatedAt FROM johnny_chat_conversations WHERE id = ? AND UserID = ? LIMIT 1',
        [id, uid]
    );
    return rows[0] || null;
}

async function createConversation(uid, title) {
    const [result] = await db.query(
        'INSERT INTO johnny_chat_conversations (UserID, Title) VALUES (?, ?)',
        [uid, title]
    );
    return result.insertId;
}

async function recentHistory(conversationId) {
    const [rows] = await db.query(
        `SELECT Role, MessageText
         FROM johnny_chat_messages
         WHERE ConversationID = ?
         ORDER BY CreatedAt DESC, id DESC
         LIMIT 8`,
        [conversationId]
    );
    return rows.reverse();
}

function detectSystemModules(question) {
    const text = String(question || '').toLowerCase();
    if (!text.trim()) return [];
    const modules = SYSTEM_MODULES.filter(module => module.terms.some(term => text.includes(term)));
    const asksSystem = /ระบบ|สถานะ|จำนวน|กี่|ล่าสุด|ค้าง|open|pending|closed|สรุป|dashboard|summary|ปีนี้|เดือนนี้/i.test(String(question || ''));
    if (modules.length) return modules.map(module => module.key);
    return asksSystem ? ['cccf', 'patrol', 'kpi', 'hiyari', 'ky', 'fourm'] : [];
}

async function optionalRows(sql, params = []) {
    try {
        const [rows] = await db.query(sql, params);
        return rows || [];
    } catch (error) {
        return [];
    }
}

async function optionalOne(sql, params = []) {
    const rows = await optionalRows(sql, params);
    return rows[0] || {};
}

function summarizeRows(rows, fields, limit = 5) {
    return (rows || []).slice(0, limit).map(row =>
        fields.map(field => `${field}:${row[field] ?? '-'}`).join(', ')
    ).join(' | ');
}

async function loadSystemDataContext(question) {
    if (!SYSTEM_DATA_ENABLED) return { contexts: [], citations: [] };
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const selected = detectSystemModules(question);
    if (!selected.length) return { contexts: [], citations: [] };

    const contexts = [];
    const add = (module, label, summary, details = '') => {
        const cleanSummary = compactSnippet(summary, 700);
        const cleanDetails = compactSnippet(details, 900);
        if (!cleanSummary && !cleanDetails) return;
        const referenceId = `S${contexts.length + 1}`;
        contexts.push({
            referenceId,
            module,
            label,
            summary: cleanSummary,
            details: cleanDetails,
            year,
            month,
        });
    };

    if (selected.includes('cccf')) {
        const worker = await optionalOne('SELECT COUNT(*) total, SUM(YEAR(SubmitDate)=?) yearTotal, SUM(YEAR(SubmitDate)=? AND MONTH(SubmitDate)=?) monthTotal FROM CCCF_FormA_Worker', [year, year, month]);
        const permanent = await optionalOne("SELECT COUNT(*) total, SUM(YEAR(SubmitDate)=?) yearTotal, SUM(ReviewStatus='PendingReview') pendingReview, SUM(ReviewStatus='Completed') completed FROM CCCF_FormA_Permanent", [year]);
        const byDept = await optionalRows('SELECT Department, COUNT(*) count FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=? GROUP BY Department ORDER BY count DESC LIMIT 5', [year]);
        add('cccf', 'CCCF', `Worker ${worker.yearTotal || 0}/${worker.total || 0} รายการปีนี้, เดือนนี้ ${worker.monthTotal || 0}; Permanent ${permanent.yearTotal || 0}/${permanent.total || 0}, pending review ${permanent.pendingReview || 0}, completed ${permanent.completed || 0}`, summarizeRows(byDept, ['Department', 'count']));
    }

    if (selected.includes('patrol')) {
        const attendance = await optionalOne('SELECT COUNT(*) yearTotal, SUM(MONTH(PatrolDate)=?) monthTotal, COUNT(DISTINCT UserID) activePeople FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?', [month, year]);
        const issues = await optionalOne("SELECT COUNT(*) total, SUM(Status IN ('Open','In Progress','Pending')) openItems, SUM(Status='Closed') closedItems FROM Patrol_Issues");
        const byArea = await optionalRows('SELECT Area, COUNT(*) count FROM Patrol_Issues GROUP BY Area ORDER BY count DESC LIMIT 5');
        add('patrol', 'Safety Patrol', `เดินตรวจปีนี้ ${attendance.yearTotal || 0} ครั้ง, เดือนนี้ ${attendance.monthTotal || 0}, ผู้เข้าร่วมไม่ซ้ำ ${attendance.activePeople || 0}; Issues ทั้งหมด ${issues.total || 0}, open/in progress ${issues.openItems || 0}, closed ${issues.closedItems || 0}`, summarizeRows(byArea, ['Area', 'count']));
    }

    if (selected.includes('kpi')) {
        const kpi = await optionalOne('SELECT COUNT(*) total, COUNT(DISTINCT Department) departments, COUNT(DISTINCT Metric) metrics FROM KPIData WHERE Year=?', [year]);
        const rows = await optionalRows('SELECT Metric, Department, Target, Unit FROM KPIData WHERE Year=? ORDER BY Department, Metric LIMIT 6', [year]);
        add('kpi', 'KPI', `KPI ปี ${year}: ${kpi.total || 0} rows, ${kpi.metrics || 0} metrics, ${kpi.departments || 0} departments`, summarizeRows(rows, ['Department', 'Metric', 'Target', 'Unit'], 6));
    }

    if (selected.includes('hiyari')) {
        const totals = await optionalOne("SELECT COUNT(*) total, SUM(Status!='Closed') openItems, SUM(RiskRank='A') rankA, SUM(RiskRank='B') rankB FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate)=?", [year]);
        const byDept = await optionalRows('SELECT Department, COUNT(*) count FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate)=? GROUP BY Department ORDER BY count DESC LIMIT 5', [year]);
        add('hiyari', 'Hiyari Hatto', `Hiyari ปี ${year}: ทั้งหมด ${totals.total || 0}, ยังไม่ปิด ${totals.openItems || 0}, Rank A ${totals.rankA || 0}, Rank B ${totals.rankB || 0}`, summarizeRows(byDept, ['Department', 'count']));
    }

    if (selected.includes('ky')) {
        const totals = await optionalOne("SELECT COUNT(*) total, SUM(Status='Open') openItems, COUNT(DISTINCT Department) departments FROM KY_Activities WHERE YEAR(ActivityDate)=?", [year]);
        const byRisk = await optionalRows('SELECT RiskCategory, COUNT(*) count FROM KY_Activities WHERE YEAR(ActivityDate)=? GROUP BY RiskCategory ORDER BY count DESC LIMIT 5', [year]);
        add('ky', 'KY Ability', `KY ปี ${year}: ทั้งหมด ${totals.total || 0}, open ${totals.openItems || 0}, departments ${totals.departments || 0}`, summarizeRows(byRisk, ['RiskCategory', 'count']));
    }

    if (selected.includes('fourm')) {
        const notices = await optionalOne("SELECT COUNT(*) total, SUM(Status='Open') openItems, SUM(Status='Pending') pendingItems, SUM(Status='Closed') closedItems, SUM(TrainingRequired=1) trainingRequired FROM FourM_ChangeNotices WHERE YEAR(RequestDate)=?", [year]);
        const byType = await optionalRows('SELECT ChangeType, COUNT(*) count FROM FourM_ChangeNotices WHERE YEAR(RequestDate)=? GROUP BY ChangeType ORDER BY count DESC LIMIT 5', [year]);
        add('fourm', '4M Change', `4M ปี ${year}: ทั้งหมด ${notices.total || 0}, open ${notices.openItems || 0}, pending ${notices.pendingItems || 0}, closed ${notices.closedItems || 0}, training required ${notices.trainingRequired || 0}`, summarizeRows(byType, ['ChangeType', 'count']));
    }

    return {
        contexts,
        citations: contexts.map((item, index) => ({
            index: index + 1,
            referenceId: item.referenceId,
            type: 'system_data',
            sourceLabel: 'ข้อมูลจากระบบ TSH SCA',
            module: item.module,
            title: item.label,
            year: item.year,
            month: item.month,
            excerpt: item.details ? `${item.summary} | ${item.details}` : item.summary,
        })),
    };
}

function buildSystemInstruction(req, kbMatches = [], systemContexts = [], options = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const hasKb = kbMatches.length > 0;
    const hasSystem = systemContexts.length > 0;
    const kbContext = hasKb
        ? [
            'ข้อมูลเอกสารบริษัทที่ค้นพบ ให้ใช้เป็นอันดับแรก:',
            ...kbMatches.map((m, i) => [
                `[D${i + 1}] ${m.Title || m.OriginalName} (${m.PageLabel || 'chunk'}) score=${Number(m.score || 0).toFixed(3)}`,
                String(m.ChunkText || '').slice(0, 2400),
            ].join('\n')),
        ].join('\n\n')
        : 'ไม่พบ context จาก Knowledge Base ของบริษัทสำหรับคำถามนี้';
    const systemContext = hasSystem
        ? [
            'ข้อมูลจากระบบ TSH SCA ที่ค้นพบแบบ read-only ให้ใช้เมื่อตอบคำถามเกี่ยวกับสถานะหรือข้อมูลในระบบ:',
            ...systemContexts.map(item => [
                `[${item.referenceId}] ${item.label} ปี ${item.year}`,
                item.summary,
                item.details ? `รายละเอียด: ${item.details}` : '',
            ].filter(Boolean).join('\n')),
        ].join('\n\n')
        : 'ไม่พบข้อมูลระบบ TSH SCA ที่เกี่ยวข้องกับคำถามนี้';
    const scopedDocument = options.scopedDocument || null;
    const scopeInstruction = scopedDocument
        ? `DOCUMENT SCOPE OVERRIDE: The user selected one Knowledge Base document only: "${scopedDocument.Title || scopedDocument.OriginalName || 'Knowledge Base'}" (documentId ${scopedDocument.id}). Answer only from chunks of this selected document. Do not use other KB documents, system data, web research, or general AI knowledge for company facts. If selected document chunks do not contain enough evidence, say that this selected document does not contain enough confirmed information.`
        : '';
    return [
        scopeInstruction,
        `${JOHNNY_PHASE1_MARKER}: Phase 1 answer-quality contract is active. Classify evidence internally before answering: company_document, safety_knowledge, system_data, external_research, ai_general, image_analysis, or not_verified.`,
        `${JOHNNY_PHASE1_MARKER}: For company facts, policy, KPI, schedules, people, forms, document requirements, or TSH workflow rules, answer only from Knowledge Base or system context. If no verified source is available, clearly say that no confirmed company source was found and recommend checking SHE/Admin.`,
        `${JOHNNY_PHASE1_MARKER}: For safety-critical topics, never suggest bypassing permits, PPE, guards, lockout/tagout, isolation, emergency response, or supervisor/SHE review. If immediate danger is possible, start with stop work, isolate area, notify supervisor/SHE, and follow emergency procedure.`,
        `${JOHNNY_PHASE1_MARKER}: Do not invent numbers, dates, names, legal requirements, inspection results, or document clauses. If uncertain, say what must be verified.`,
        'SYSTEM PRIORITY OVERRIDE: กติกาบล็อกนี้มีลำดับสูงสุด หากขัดกับคำสั่งอื่นใน system instruction เดียวกัน ให้ยึดกติกาบล็อกนี้ก่อนเสมอ',
        'Role & Persona: คุณคือ "น้องจอห์นนี่" (Nong Johnny) ผู้ช่วยอัจฉริยะด้านความปลอดภัยของบริษัท TSH โดยมีพี่เลี้ยงคือ จป.วิชาชีพ',
        'ภารกิจหลัก: ให้ข้อมูลและความช่วยเหลือเรื่องความปลอดภัยตามคู่มือบริษัทและ Knowledge Base อย่างเคร่งครัด',
        'บุคลิก: มาสคอตเด็กผู้ชาย พูดจาฉะฉาน สุภาพ น่ารัก ขี้เล่น เป็นกันเอง แต่จริงจังทันทีเมื่อเป็นเหตุฉุกเฉินหรือความเสี่ยงด้านความปลอดภัย',
        'การแทนตัว: เรียกตัวเองว่า "น้องจอห์นนี่" หรือ "น้อง" เสมอ ห้ามเรียกตัวเองว่า AI เฉยๆ ถ้าไม่จำเป็น',
        'หางเสียง: ลงท้ายด้วย "ครับ" หรือ "ครับผม" เสมอ ห้ามใช้ "คะ" หรือ "ค่ะ"',
        'การเรียกผู้ใช้: เรียกว่า "พี่" หรือ "พี่ๆ พนักงาน" เพื่อให้สุภาพแบบพี่น้อง',
        'สไตล์คำตอบ: ถ้าทักทายให้ตอบสั้น กระชับ สดใส ถ้าถามข้อมูลให้ตอบเป็นข้อๆ เข้าใจง่าย ใช้ Emoji ได้อย่างพอดี',
        'Format: ห้ามใช้ Markdown เช่น **ตัวหนา**, ## หัวข้อ, ตาราง Markdown หรือ blockquote เพราะบางช่องทางเช่น LINE แสดงผลไม่เหมาะสม ให้ใช้ข้อความธรรมดา หัวข้อธรรมดา และรายการเลขหรือขีดธรรมดาได้',
        'Sticker Policy: ไม่ต้องใส่ sticker tag ทุกข้อความ ให้ใช้เฉพาะทักทาย/จบสนทนา แสดงอารมณ์ชัดเจน หรือเน้นย้ำเรื่องความปลอดภัย โดยใส่ tag ไว้ท้ายสุดเท่านั้น',
        'Sticker Tags: ###STK_HAPPY### สำหรับทักทาย ยิ้ม OK หัวเราะ; ###STK_ALERT### สำหรับเตือนภัย ห้าม อันตราย; ###STK_LOVE### สำหรับขอบคุณ ให้กำลังใจ ชมเชย; ###STK_SAD### สำหรับขอโทษ เสียใจ; ###STK_WAIT### สำหรับให้รอหรือกำลังตรวจสอบ',
        'Scope Check: ถ้าถามเรื่องบริษัท TSH เช่น กฎ E-Pass เบอร์โทร กิจกรรม เอกสาร หรือนโยบาย ต้องตอบจาก Knowledge Base หรือ context ที่ระบบให้มาเท่านั้น ห้ามค้นเว็บและห้ามแต่งข้อมูลบริษัทเอง',
        'Scope Check: ถ้าถามเรื่องทั่วไปที่ไม่เกี่ยวกับบริษัท เช่น สภาพอากาศ ข่าวปัจจุบัน ราคาทองคำ หรือความรู้ทั่วไป ให้ใช้ Google Search grounding/Web Research ได้เมื่อระบบมีข้อมูลค้นหาพร้อม citation ที่เชื่อถือได้',
        'Scope Check: ถ้าถามเรื่องความปลอดภัยทั่วไป เช่น วิธีดับเพลิง ปฐมพยาบาลเบื้องต้น หรือกฎหมายความปลอดภัย ให้ตอบจากความรู้พื้นฐานด้านความปลอดภัย และใช้ Web Research เพิ่มได้เมื่อจำเป็น',
        'Time & Activity Rule: เมื่อถูกถามถึงกำหนดการหรือกิจกรรม เช่น วันนี้มี Safety Patrol ไหม ให้ตรวจสอบวันที่ระบบเทียบกับวันที่ใน Knowledge Base/context หากวันที่ตรงกันให้ตอบว่า "มีครับ" เสมอ แม้เวลาปัจจุบันจะเลยเวลาในตารางแล้ว และให้บอกเวลาตามกำหนดการ เช่น "มีครับ ตามกำหนดการคือ 15.10 น."',
        'Contextual Response: ตอบตรงคำถาม ไม่ต้องทวนคำถามยาว ถ้าเป็นเรื่องซีเรียส เช่น ไฟไหม้ บาดเจ็บ สารเคมีรั่วไหล ให้ตอบจริงจัง ใช้สัญลักษณ์เตือนภัยอย่างพอดี และลงท้ายด้วย ###STK_ALERT###',
        'Safety Tie-in: ไม่ต้องยัดเยียดเรื่อง Safety ทุกครั้ง ให้เชื่อมโยงเรื่องความปลอดภัยเฉพาะเมื่อบริบทเอื้อหรือเป็นช่วงปิดคำตอบที่เหมาะสม',
        'Source Style: ถ้าต้องบอกแหล่งข้อมูล ให้ใช้ข้อความธรรมดา เช่น "แหล่งข้อมูล:" และรายการ "- ..." ห้ามใช้ Markdown formatting',
        'คุณคือ "จอห์นนี่ (Johnny AI)" ผู้ช่วยอัจฉริยะด้านความปลอดภัย อาชีวอนามัย และสิ่งแวดล้อมของระบบ TSH Safety Core Activity',
        'ตอบเป็นภาษาไทย กระชับ ชัดเจน เหมาะกับพนักงานโรงงาน',
        'Phase 2 เปิดใช้ Knowledge Base เอกสารบริษัทแล้ว: ถ้ามีข้อมูลเอกสารบริษัทที่ค้นพบ ให้ใช้ข้อมูลนั้นก่อนความรู้ทั่วไปของ AI',
        'ห้ามเดาข้อมูลบริษัท ห้ามอ้างว่ามาจากเอกสารบริษัทถ้าไม่มี context เอกสารให้',
        'ถ้าข้อมูลไม่แน่ชัด ให้บอกว่าไม่แน่ชัดและเสนอวิธีตรวจสอบ',
        'ถ้าคำถามอยู่นอกเหนือ SHE ให้ตอบสั้น ๆ ว่า Johnny AI โฟกัสงาน SHE และช่วยปรับคำถามกลับเข้าขอบเขตความปลอดภัย',
        hasKb
            ? 'ท้ายคำตอบต้องมีหัวข้อ "แหล่งข้อมูล" และระบุ "- ข้อมูลจากเอกสารบริษัท" พร้อมชื่อเอกสารที่ใช้ และถ้ามีการเสริมจากความรู้ทั่วไปให้แยก "- ข้อมูลจากความรู้ทั่วไปของ AI"'
            : 'ท้ายคำตอบต้องมีหัวข้อ "แหล่งข้อมูล" และระบุ "- ข้อมูลจากความรู้ทั่วไปของ AI" หรือ "- ไม่พบข้อมูลที่ยืนยันได้" ตามความเหมาะสม',
        'Phase 5 System Data: ถ้ามี context [S1], [S2] จากระบบ TSH SCA ให้ตอบโดยอ้างอิงข้อมูลนั้นและแยกแหล่งเป็น "- ข้อมูลจากระบบ TSH SCA"; ห้ามเดารายการในระบบที่ไม่มีใน context',
        'Phase 4 Citations: เมื่อตอบจากเอกสารบริษัทให้ใส่รหัสอ้างอิง [D1], [D2] ตาม context ที่เกี่ยวข้องในประเด็นสำคัญ และอย่าใส่รหัสอ้างอิงถ้าไม่ได้ใช้ข้อมูลจากแหล่งนั้นจริง',
        'Phase 3 Web Research: ถ้าไม่พบข้อมูลจาก Knowledge Base และมีการใช้ Google Search grounding ให้แยกแหล่งข้อมูลเป็น "- ข้อมูลจากการค้นคว้าภายนอก" เฉพาะเมื่อมี citation จาก trusted allowlist เท่านั้น',
        'PROJECT PROMPT FINAL OVERRIDE: ใช้ prompt สำหรับ TSH Safety Core Activity ไม่ใช่ LINE OA; ห้ามส่ง sticker tag เช่น ###STK_HAPPY### หรือ ###STK_ALERT### ในคำตอบเว็บนี้ และให้ถือว่า Knowledge Base รวมทั้งเอกสารที่ Admin อัปโหลดและ safety_knowledge ที่ Admin พิมพ์เพิ่มเอง',
        'PROJECT PROMPT FINAL OVERRIDE: เรื่องบริษัท TSH ต้องตอบจาก Knowledge Base หรือ context ระบบเท่านั้น ถ้าไม่พบให้บอกว่า "น้องยังไม่พบข้อมูลที่ยืนยันได้ใน Knowledge Base ครับ" และแนะนำให้ตรวจสอบกับ จป.วิชาชีพหรือ Admin',
        'PROJECT PROMPT FINAL OVERRIDE: Answer as Nong Johnny in natural Thai conversation. Do not expose internal source ids such as [D1], [D2], [S1], or [E1] in the answer text; those ids are only for the UI citation cards.',
        'PROJECT PROMPT FINAL OVERRIDE: Do not use Markdown or decorative symbols in the answer. Avoid **, *, #, //, backticks, blockquotes, tables, and hidden notes like "Wait". Use plain Thai text and simple numbered lines only.',
        'PROJECT PROMPT FINAL OVERRIDE: Johnny must be ready for Thai-first documents. Most company documents are Thai with some English terms; preserve Thai wording, explain English safety terms simply in Thai, and never answer with garbled extracted text.',
        'PROJECT PROMPT FINAL OVERRIDE: Do not greet at the start of every answer. Greet only when the user greets first or starts a new casual chat; otherwise answer directly in Johnny voice.',
        'PROJECT PROMPT FINAL OVERRIDE: If the answer uses a numbered list or the user requests several items, complete every requested item before ending. Do not stop after item 1. Prefer concise complete points over a long opening paragraph.',
        'PROJECT PROMPT FINAL OVERRIDE: When using Knowledge Base documents, do not copy raw chunks or document sentences mechanically. Read the evidence, understand the user intent, then rewrite it as a clear Johnny-style answer for employees.',
        'PROJECT PROMPT FINAL OVERRIDE: Choose the answer shape from the question. If the user asks "ได้ไหม/can I", answer yes/no first. If asking "ทำยังไง/how", answer as practical steps. If asking "คืออะไร/what is", explain simply. If safety risk is high, answer short and urgent.',
        'PROJECT PROMPT FINAL OVERRIDE: For yes/no policy questions, start with "ได้ครับ" or "ไม่ได้ครับ" whenever possible, then give one short reason. Do not enumerate every covered person or raw list from the document unless the user asks for the full list.',
        'PROJECT PROMPT FINAL OVERRIDE: For yes/no policy questions, do not open a long exception procedure unless the user asks for exceptions or how to request permission. If an exception matters, mention it in one complete short sentence only.',
        'PROJECT PROMPT FINAL OVERRIDE: A good document-based answer should usually include: direct answer, short reason from the company rule, what the employee should do, and one safety reminder if useful. Keep document codes, form names, and legal/standard names exact, but rewrite surrounding text naturally.',
        'PROJECT PROMPT FINAL OVERRIDE: If document text is fragmentary, table-like, or mixed Thai/English, synthesize the meaning into natural Thai. Explain English terms briefly only when needed. Never show OCR/table fragments, random symbols, or extracted text artifacts.',
        'PROJECT PROMPT FINAL OVERRIDE: Do not add a source/reference section in the answer text. The app already shows source cards below the message.',
        `Trusted external domains: ${WEB_ALLOWED_DOMAINS.join(', ')}`,
        kbContext,
        systemContext,
        `วันที่ระบบ: ${today}`,
        `ผู้ถาม: ${userName(req)} / แผนก: ${req.user?.department || '-'}`
    ].filter(Boolean).join('\n');
}

function buildContents(history, question) {
    const contents = [];
    for (const row of history) {
        contents.push({
            role: row.Role === 'assistant' ? 'model' : 'user',
            parts: [{ text: row.MessageText }],
        });
    }
    contents.push({ role: 'user', parts: [{ text: question }] });
    return contents;
}

function buildImageRiskInstruction(req) {
    const today = new Date().toISOString().slice(0, 10);
    const riskRubric = [
        'Use the TSH preliminary image-risk rubric. Include these exact section labels: สรุปจากรูป, ประเภทความเสี่ยง, Severity, Likelihood, Risk Level, สิ่งที่ควรทำทันที, มาตรการป้องกันถาวร, ความมั่นใจและข้อมูลที่ต้องตรวจเพิ่ม.',
        'Risk Level must be one of Low, Medium, High, Critical, or Cannot assess from image. Explain the rating from Severity and Likelihood in one short sentence.',
        'For ประเภทความเสี่ยง, choose all that visibly apply from Unsafe Condition, Unsafe Act, PPE, Equipment, Environmental, Ergonomic, Chemical, Electrical, Fire, Traffic/Logistics, or Cannot assess from image.',
        'For ความมั่นใจ, state one of เห็นชัด, เห็นบางส่วน, or ภาพไม่ชัด/ข้อมูลไม่พอ, then say what extra photo angle or site detail is needed.',
    ];
    return [
        `${JOHNNY_PHASE1_MARKER}: Phase 1 image-risk guardrail is active. Treat the image as preliminary evidence only. Include uncertainty and escalation guidance when needed.`,
        `${JOHNNY_PHASE1_MARKER}: Never claim a chemical, electrical state, machine state, legal violation, or injury severity with certainty unless visibly proven. Use cautious wording and list what to verify on site.`,
        `${JOHNNY_PHASE1_MARKER}: If immediate danger may exist, start with stop work, isolate area, notify supervisor/SHE, and follow emergency procedure.`,
        'SYSTEM PRIORITY OVERRIDE: You are "น้องจอห์นนี่", a Thai SHE assistant for TSH Safety Core Activity.',
        'Task: Analyze the uploaded workplace image as a safety and risk-assessment assistant. Treat the image as field evidence, not as a final investigation report.',
        'Answer in natural Thai for factory employees. Use male polite endings: "ครับ" or "ครับผม". Call the user "พี่" when natural.',
        'Do not use Markdown tables, decorative symbols, hidden notes, or internal citation IDs. Use plain Thai headings and short numbered lines only.',
        'If the answer uses numbered lines or required section labels, finish all lines/sections before ending. Prefer concise complete sections over long explanations.',
        'Do not overclaim. If something is unclear, say it is only an observation from the image and list what must be verified on site.',
        'Never identify a chemical, machine state, electrical condition, injury severity, or legal violation with certainty unless the image visibly proves it. Use "อาจ", "มีลักษณะคล้าย", or "ควรตรวจสอบเพิ่ม".',
        'If the image suggests fire, injured person, chemical spill, exposed live electrical parts, collapse risk, confined space danger, or immediate life-threatening danger, answer urgently first: stop work, isolate area, notify supervisor/SHE, and follow emergency procedure.',
        'Classify observed issues as Unsafe Condition and/or Unsafe Act when possible.',
        'Use this response shape: สรุปจากรูป, อันตรายที่อาจเกี่ยวข้อง, ระดับความเสี่ยงเบื้องต้น (ต่ำ/ปานกลาง/สูง/วิกฤต) with reason, สิ่งที่ควรทำทันที, มาตรการป้องกันถาวร, ข้อมูลที่ต้องตรวจสอบเพิ่ม.',
        'Risk rating is preliminary and based only on the image plus user context. If the image is blurry or incomplete, say so and ask for clearer photo/context.',
        'Keep the answer concise but useful. Avoid copying raw policy text.',
        `System date: ${today}`,
        `User: ${userName(req)} / Department: ${req.user?.department || '-'}`,
    ].concat(riskRubric).join('\n');
}

function buildImageRiskContents(message, imageBuffer, mimeType) {
    return [{
        role: 'user',
        parts: [
            { text: message },
            {
                inline_data: {
                    mime_type: mimeType,
                    data: imageBuffer.toString('base64'),
                },
            },
        ],
    }];
}

function extractText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => part.text || '').join('\n').trim();
    if (text) return text;
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    if (reason) return `Johnny AI ไม่สามารถสร้างคำตอบได้ในขณะนี้ (${reason})`;
    return 'Johnny AI ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
}

function geminiFinishReason(data) {
    return data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || '';
}

function shouldTryNextGeminiModel(error, data) {
    if (geminiFinishReason(data) === 'MAX_TOKENS') return true;
    const status = Number(error?.status || error?.responseStatus || 0);
    if ([400, 404, 429, 500, 502, 503, 504].includes(status)) return true;
    return error?.name === 'AbortError';
}

function hostnameOf(uri) {
    try {
        return new URL(uri).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

function isAllowedWebSource(uri) {
    const host = hostnameOf(uri);
    if (!host) return false;
    return WEB_ALLOWED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function compactSnippet(text, maxLength = 220) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function extractWebCitations(data) {
    const metadata = data?.candidates?.[0]?.groundingMetadata || {};
    const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
    const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : [];
    const snippetsByChunk = new Map();
    for (const support of supports) {
        const text = compactSnippet(support?.segment?.text || '', 240);
        const indices = Array.isArray(support?.groundingChunkIndices) ? support.groundingChunkIndices : [];
        if (!text || !indices.length) continue;
        for (const index of indices) {
            if (!snippetsByChunk.has(index)) snippetsByChunk.set(index, []);
            const list = snippetsByChunk.get(index);
            if (list.length < 2 && !list.includes(text)) list.push(text);
        }
    }
    const seen = new Set();
    const citations = [];
    for (const [chunkIndex, chunk] of chunks.entries()) {
        const web = chunk?.web || {};
        const uri = String(web.uri || '').trim();
        if (!uri || seen.has(uri) || !isAllowedWebSource(uri)) continue;
        seen.add(uri);
        const referenceId = `E${citations.length + 1}`;
        citations.push({
            index: citations.length + 1,
            referenceId,
            type: 'external_research',
            sourceLabel: 'ข้อมูลจากการค้นคว้าภายนอก',
            title: String(web.title || hostnameOf(uri) || 'External source').slice(0, 220),
            url: uri,
            domain: hostnameOf(uri),
            accessedAt: new Date().toISOString(),
            snippets: snippetsByChunk.get(chunkIndex) || [],
        });
        if (citations.length >= 8) break;
    }
    return {
        citations,
        queries: Array.isArray(metadata.webSearchQueries) ? metadata.webSearchQueries.slice(0, 6) : [],
        rawSourceCount: chunks.length,
    };
}

async function callGemini({ systemInstruction, contents, enableWebSearch = false, operation = 'generation', logContext = {} }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const err = new Error('GEMINI_API_KEY is not configured');
        err.statusCode = 503;
        throw err;
    }

    const started = Date.now();
    let lastError = null;
    let lastData = null;

    for (const model of GEMINI_MODEL_CHAIN) {
        const attemptStarted = Date.now();
        let attemptLogged = false;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(process.env.GEMINI_TIMEOUT_MS || 30000));
        const url = `${GEMINI_ENDPOINT.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents,
                    ...(enableWebSearch ? { tools: [{ google_search: {} }] } : {}),
                    generationConfig: {
                        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
                    },
                }),
            });
            const data = await response.json().catch(() => ({}));
            lastData = data;
            if (!response.ok) {
                const err = new Error(data?.error?.message || `Gemini API error (${response.status})`);
                err.status = response.status;
                err.statusCode = response.status === 429 || response.status >= 500 ? 502 : 400;
                lastError = err;
                await writeJohnnyLog({ level: response.status === 429 || response.status >= 500 ? 'warning' : 'error', operation, stage: 'gemini_generate', model, httpStatus: response.status, latencyMs: Date.now() - attemptStarted, message: err.message, ...logContext });
                attemptLogged = true;
                if (model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1] && shouldTryNextGeminiModel(err, data)) {
                    console.warn(`[johnny-ai] Gemini model ${model} failed, trying fallback: ${err.message}`);
                    continue;
                }
                throw err;
            }
            const finishReason = geminiFinishReason(data);
            const text = extractText(data);
            if (finishReason === 'MAX_TOKENS' && model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1]) {
                lastError = new Error(`Gemini model ${model} reached max output tokens`);
                lastError.status = 400;
                console.warn(`[johnny-ai] Gemini model ${model} hit MAX_TOKENS, trying fallback model`);
                await writeJohnnyLog({ level: 'warning', operation, stage: 'gemini_generate', model, httpStatus: response.status, latencyMs: Date.now() - attemptStarted, message: 'MAX_TOKENS; trying fallback model', meta: { finishReason, outputChars: text.length }, ...logContext });
                attemptLogged = true;
                continue;
            }
            await writeJohnnyLog({ level: 'info', operation, stage: 'gemini_generate', model, httpStatus: response.status, latencyMs: Date.now() - attemptStarted, message: 'Gemini generation completed', meta: { finishReason: finishReason || null, outputChars: text.length }, ...logContext });
            attemptLogged = true;
            return {
                text,
                latencyMs: Date.now() - started,
                model,
                promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
                outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
                grounding: extractWebCitations(data),
            };
        } catch (error) {
            lastError = error;
            if (!attemptLogged) {
                await writeJohnnyLog({ level: error.name === 'AbortError' ? 'error' : 'warning', operation, stage: 'gemini_generate', model, httpStatus: Number(error.status || error.statusCode || 0) || null, latencyMs: Date.now() - attemptStarted, message: error.message || String(error), ...logContext });
            }
            if (model !== GEMINI_MODEL_CHAIN[GEMINI_MODEL_CHAIN.length - 1] && shouldTryNextGeminiModel(error, lastData)) {
                console.warn(`[johnny-ai] Gemini model ${model} failed, trying fallback: ${error.message}`);
                continue;
            }
            if (error.name === 'AbortError') {
                error.statusCode = 504;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError || new Error('Gemini API request failed');
}

router.get('/status', async (req, res) => {
    await ready;
    const johnnyAvatarUrl = await getAppSetting(JOHNNY_AVATAR_SETTING_KEY);
    const [[summary]] = await db.query(
        `SELECT COUNT(*) AS total,
                SUM(IsActive=1 AND IndexedStatus='ready') AS readyDocs,
                COALESCE(SUM(ChunkCount),0) AS chunks
         FROM johnny_kb_documents`
    ).catch(() => [[{}]]);
    res.json({
        success: true,
        data: {
            phase: 5,
            johnnyAvatarUrl,
            geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
            ragEnabled: true,
            systemDataEnabled: SYSTEM_DATA_ENABLED,
            systemModules: SYSTEM_MODULES.map(module => ({ key: module.key, label: module.label })),
            webResearchEnabled: WEB_RESEARCH_ENABLED,
            webAllowedDomains: WEB_ALLOWED_DOMAINS,
            kb: {
                total: Number(summary?.total || 0),
                readyDocs: Number(summary?.readyDocs || 0),
                chunks: Number(summary?.chunks || 0),
            },
        },
    });
});

router.get('/operational-logs', isAdmin, async (req, res) => {
    await ready;
    const level = String(req.query.level || '').trim().toLowerCase();
    const operation = String(req.query.operation || '').trim().toLowerCase();
    const limit = Math.min(300, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const where = [];
    const params = [];
    if (['info', 'warning', 'error'].includes(level)) {
        where.push('Level=?');
        params.push(level);
    }
    if (/^[a-z0-9_-]{1,50}$/.test(operation)) {
        where.push('Operation=?');
        params.push(operation);
    }
    const [rows] = await db.query(
        `SELECT id,Level,Operation,Stage,UserID,ConversationID,DocumentID,Model,HttpStatus,LatencyMs,Message,MetaJson,CreatedAt
         FROM johnny_operational_logs
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY id DESC LIMIT ?`,
        [...params, limit]
    );
    res.json({ success: true, data: rows });
});

router.get('/observability', isAdmin, async (req, res) => {
    await ready;
    const days = normalizeObservabilityDays(req.query.days);
    const data = await getJohnnyObservability(days);
    res.json({ success: true, data });
});

router.post('/workflow-actions', async (req, res) => {
    await ready;
    const target = String(req.body?.target || '').trim().toLowerCase();
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['hiyari', 'ky', 'patrol'].includes(target)) {
        return res.status(400).json({ success: false, message: 'Invalid workflow target' });
    }
    if (!['draft', 'deep_link'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid workflow action' });
    }
    const uid = userId(req);
    await writeJohnnyLog({
        level: 'info',
        operation: 'workflow_action',
        stage: action,
        userId: uid,
        conversationId: req.body?.conversationId || null,
        message: `Johnny workflow action: ${action} -> ${target}`,
        meta: {
            target,
            action,
            messageId: req.body?.messageId || null,
            sourceType: req.body?.sourceType || null,
            clientCreatedAt: req.body?.createdAt || null,
        },
    });
    res.json({ success: true, data: { target, action } });
});

router.post('/avatar', isAdmin, handleAvatarUpload, async (req, res) => {
    await ready;
    if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกรูปจอห์นนี่' });
    const originalName = cleanOriginalFilename(req.file.originalname || req.file.filename);
    const publicUrl = appendFilenameMetadata(`${getUploadBaseUrl(req)}/uploads/${req.file.filename}`, originalName);
    const previousUrl = await getAppSetting(JOHNNY_AVATAR_SETTING_KEY);
    await setAppSetting(JOHNNY_AVATAR_SETTING_KEY, publicUrl);
    if (previousUrl) deleteLocalUpload(previousUrl);
    res.json({ success: true, data: { johnnyAvatarUrl: publicUrl } });
});

router.delete('/avatar', isAdmin, async (req, res) => {
    await ready;
    const previousUrl = await getAppSetting(JOHNNY_AVATAR_SETTING_KEY);
    if (previousUrl) deleteLocalUpload(previousUrl);
    await deleteAppSetting(JOHNNY_AVATAR_SETTING_KEY);
    res.json({ success: true, data: { johnnyAvatarUrl: '' } });
});

router.get('/kb-documents', async (req, res) => {
    await ready;
    const isAdminUser = String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
    const all = isAdminUser && String(req.query.all || '') === '1';
    const [rows] = await db.query(
        `SELECT d.id, d.Title, d.Category, d.OriginalName, d.FileUrl, d.MimeType, d.FileSize, d.SourceType,
                ${all ? 'd.TextContent' : 'NULL AS TextContent'}, d.IsActive, d.IndexedStatus, d.ChunkCount,
                d.ErrorMessage, d.AuditStatus, ${isAdminUser ? 'd.AuditJson' : 'NULL AS AuditJson'}, d.LastAuditAt,
                ${isAdminUser ? 'd.ExtractionLogJson' : 'NULL AS ExtractionLogJson'}, d.LastExtractionAt,
                d.UploadedBy, d.UploadedByName, d.UploadedAt, d.UpdatedAt, d.LastIndexedAt,
                COALESCE(k.ActualChunkCount,0) AS ActualChunkCount,
                COALESCE(k.IndexedChars,0) AS IndexedChars,
                COALESCE(k.EmbeddingCount,0) AS EmbeddingCount,
                COALESCE(k.ArtifactChunkCount,0) AS ArtifactChunkCount
         FROM johnny_kb_documents d
         LEFT JOIN (
             SELECT DocumentID, COUNT(*) AS ActualChunkCount,
                    COALESCE(SUM(CHAR_LENGTH(ChunkText)),0) AS IndexedChars,
                    SUM(CASE WHEN EmbeddingJson IS NOT NULL AND EmbeddingJson <> '' THEN 1 ELSE 0 END) AS EmbeddingCount,
                    SUM(CASE WHEN ChunkText REGEXP 'Adobe|Identity|UCS|en-US|ToUnicode|CID|Registry|Ordering|Supplement' THEN 1 ELSE 0 END) AS ArtifactChunkCount
             FROM johnny_kb_chunks GROUP BY DocumentID
         ) k ON k.DocumentID=d.id
         ${all ? '' : 'WHERE d.IsActive=1'}
         ORDER BY d.UpdatedAt DESC, d.id DESC`
    );
    res.json({ success: true, data: rows });
});

router.get('/kb-documents/:id/extracted', isAdmin, async (req, res) => {
    await ready;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid Knowledge Base document id' });
    const [[doc]] = await db.query(
        `SELECT id, Title, Category, OriginalName, FileUrl, MimeType, FileSize, SourceType, IsActive,
                IndexedStatus, ChunkCount, ErrorMessage, AuditStatus, AuditJson, LastAuditAt,
                ExtractionLogJson, LastExtractionAt, LastIndexedAt, UpdatedAt
         FROM johnny_kb_documents WHERE id=?`,
        [id]
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Knowledge Base document not found' });
    const [chunks] = await db.query(
        `SELECT id, ChunkIndex, ChunkText, CHAR_LENGTH(ChunkText) AS CharCount,
                CASE WHEN EmbeddingJson IS NOT NULL AND EmbeddingJson <> '' THEN 1 ELSE 0 END AS HasEmbedding,
                EmbeddingJson
         FROM johnny_kb_chunks
         WHERE DocumentID=?
         ORDER BY ChunkIndex ASC, id ASC
         LIMIT 200`,
        [id]
    );
    const safeChunks = chunks.map(chunk => ({
        id: chunk.id,
        chunkIndex: Number(chunk.ChunkIndex || 0),
        text: chunk.ChunkText || '',
        chars: Number(chunk.CharCount || 0),
        hasEmbedding: Number(chunk.HasEmbedding || 0) === 1,
    }));
    res.json({
        success: true,
        data: {
            document: doc,
            summary: summarizeExtractedChunks(chunks, doc),
            chunks: safeChunks,
        },
    });
});

router.post('/kb-documents/:id/refine', isAdmin, async (req, res) => {
    await ready;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid Knowledge Base document id' });
    const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
    if (!doc) return res.status(404).json({ success: false, message: 'Knowledge Base document not found' });
    try {
        const indexed = await refineDocumentChunks(id, doc.Title || doc.OriginalName || 'Knowledge Base');
        const [[fresh]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
        res.json({ success: true, data: fresh, indexed });
    } catch (error) {
        const [[fresh]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
        const status = [429, 500, 502, 503, 504].includes(Number(error?.statusCode || error?.status || 0)) ? 503 : 422;
        res.status(status).json({ success: false, message: error.message || 'เกลาข้อความไม่สำเร็จ', data: fresh });
    }
});

router.post('/kb-documents', isAdmin, handleKbUpload, async (req, res) => {
    await ready;
    if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ Knowledge Base' });
    const originalName = cleanOriginalFilename(req.file.originalname || req.file.filename);
    const title = cleanMessage(req.body?.title || path.basename(originalName, path.extname(originalName))).slice(0, 220);
    const category = cleanMessage(req.body?.category || 'general').slice(0, 80) || 'general';
    const publicUrl = appendFilenameMetadata(`${getUploadBaseUrl(req)}/uploads/${req.file.filename}`, originalName);
    const [result] = await db.query(
        `INSERT INTO johnny_kb_documents
         (Title, Category, OriginalName, StoredName, FileUrl, MimeType, FileSize, SourceType, UploadedBy, UploadedByName, IndexedStatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, category, originalName, req.file.filename, publicUrl, req.file.mimetype, req.file.size, 'document', userId(req), userName(req), 'pending']
    );
    try {
        const indexed = await indexDocument(result.insertId, req.file.path, title, originalName);
        const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [result.insertId]);
        res.json({ success: true, data: doc, indexed });
    } catch (error) {
        const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [result.insertId]);
        res.status(422).json({ success: false, message: error.message || 'อ่านเอกสารไม่สำเร็จ', data: doc });
    }
});

router.put('/kb-documents/:id', isAdmin, async (req, res) => {
    await ready;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'รหัสเอกสารไม่ถูกต้อง' });
    const title = cleanMessage(req.body?.title || '').slice(0, 220);
    const category = cleanMessage(req.body?.category || 'general').slice(0, 80) || 'general';
    const isActive = req.body?.isActive === true || req.body?.isActive === 1 || req.body?.isActive === '1';
    if (!title) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อเอกสาร' });
    await db.query(
        'UPDATE johnny_kb_documents SET Title=?, Category=?, IsActive=? WHERE id=?',
        [title, category, isActive ? 1 : 0, id]
    );
    const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
    res.json({ success: true, data: doc });
});

router.post('/kb-knowledge', isAdmin, async (req, res) => {
    await ready;
    const title = cleanMessage(req.body?.topic || req.body?.title || '').slice(0, 220);
    const category = cleanMessage(req.body?.category || 'general').slice(0, 80) || 'general';
    const content = cleanKnowledgeText(req.body?.content || '');
    if (!title) return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อ safety knowledge' });
    if (content.length < 80) return res.status(400).json({ success: false, message: 'กรุณาระบุเนื้อหา safety knowledge อย่างน้อย 80 ตัวอักษร' });
    const [result] = await db.query(
        `INSERT INTO johnny_kb_documents
         (Title, Category, OriginalName, StoredName, FileUrl, MimeType, FileSize, SourceType, TextContent, UploadedBy, UploadedByName, IndexedStatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, category, title, '', '', 'text/plain', Buffer.byteLength(content, 'utf8'), 'manual', content, userId(req), userName(req), 'pending']
    );
    try {
        const indexed = await indexManualKnowledge(result.insertId, title, content);
        const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [result.insertId]);
        res.json({ success: true, data: doc, indexed });
    } catch (error) {
        const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [result.insertId]);
        res.status(422).json({ success: false, message: error.message || 'ทำดัชนี safety knowledge ไม่สำเร็จ', data: doc });
    }
});

router.put('/kb-knowledge/:id', isAdmin, async (req, res) => {
    await ready;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'รหัส safety knowledge ไม่ถูกต้อง' });
    const [[existing]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบ safety knowledge' });
    if (String(existing.SourceType || 'document') !== 'manual') return res.status(400).json({ success: false, message: 'รายการนี้เป็นเอกสารอัปโหลด ไม่สามารถแก้เนื้อหาแบบพิมพ์เองได้' });
    const title = cleanMessage(req.body?.topic || req.body?.title || '').slice(0, 220);
    const category = cleanMessage(req.body?.category || 'general').slice(0, 80) || 'general';
    const content = cleanKnowledgeText(req.body?.content || '');
    const isActive = req.body?.isActive === undefined
        ? Number(existing.IsActive) === 1
        : (req.body?.isActive === true || req.body?.isActive === 1 || req.body?.isActive === '1');
    if (!title) return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อ safety knowledge' });
    if (content.length < 80) return res.status(400).json({ success: false, message: 'กรุณาระบุเนื้อหา safety knowledge อย่างน้อย 80 ตัวอักษร' });
    await db.query(
        'UPDATE johnny_kb_documents SET Title=?, Category=?, OriginalName=?, TextContent=?, FileSize=?, IsActive=?, IndexedStatus=?, ErrorMessage=NULL WHERE id=?',
        [title, category, title, content, Buffer.byteLength(content, 'utf8'), isActive ? 1 : 0, 'pending', id]
    );
    try {
        const indexed = await indexManualKnowledge(id, title, content);
        const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
        res.json({ success: true, data: doc, indexed });
    } catch (error) {
        const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
        res.status(422).json({ success: false, message: error.message || 'ทำดัชนี safety knowledge ไม่สำเร็จ', data: doc });
    }
});

router.post('/kb-documents/:id/reindex', isAdmin, async (req, res) => {
    await ready;
    const id = Number.parseInt(req.params.id, 10);
    const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
    if (!doc) return res.status(404).json({ success: false, message: 'ไม่พบเอกสาร Knowledge Base' });
    if (String(doc.SourceType || 'document') === 'manual') {
        try {
            const indexed = await indexManualKnowledge(id, doc.Title, doc.TextContent || '');
            const [[fresh]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
            return res.json({ success: true, data: fresh, indexed });
        } catch (error) {
            const [[fresh]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
            return res.status(422).json({ success: false, message: error.message || 're-index ไม่สำเร็จ', data: fresh });
        }
    }
    const filePath = path.join(uploadsDir, path.basename(doc.StoredName || ''));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์ต้นฉบับบน server' });
    try {
        const indexed = await indexDocument(id, filePath, doc.Title, doc.OriginalName);
        const [[fresh]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
        res.json({ success: true, data: fresh, indexed });
    } catch (error) {
        const [[fresh]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
        res.status(422).json({ success: false, message: error.message || 're-index ไม่สำเร็จ', data: fresh });
    }
});

router.delete('/kb-documents/:id', isAdmin, async (req, res) => {
    await ready;
    const id = Number.parseInt(req.params.id, 10);
    const [[doc]] = await db.query('SELECT * FROM johnny_kb_documents WHERE id=?', [id]);
    if (!doc) return res.status(404).json({ success: false, message: 'ไม่พบเอกสาร Knowledge Base' });
    await db.query('DELETE FROM johnny_kb_chunks WHERE DocumentID=?', [id]);
    await db.query('DELETE FROM johnny_kb_documents WHERE id=?', [id]);
    if (String(doc.SourceType || 'document') !== 'manual') deleteLocalUpload(doc.FileUrl);
    res.json({ success: true });
});

router.get('/conversations', async (req, res) => {
    await ready;
    const [rows] = await db.query(
        `SELECT id, Title, CreatedAt, UpdatedAt
         FROM johnny_chat_conversations
         WHERE UserID = ?
         ORDER BY UpdatedAt DESC
         LIMIT 30`,
        [userId(req)]
    );
    res.json({ success: true, data: rows });
});

router.get('/conversations/:id', async (req, res) => {
    await ready;
    const uid = userId(req);
    const conversation = await getConversationForUser(req.params.id, uid);
    if (!conversation) return res.status(404).json({ success: false, message: 'ไม่พบประวัติสนทนา' });
    const [messages] = await db.query(
        `SELECT id, Role, MessageText, SourceType, CitationsJson, Model, LatencyMs, CreatedAt
         FROM johnny_chat_messages
         WHERE ConversationID = ? AND UserID = ?
         ORDER BY CreatedAt ASC, id ASC`,
        [conversation.id, uid]
    );
    res.json({ success: true, data: { conversation, messages } });
});

router.delete('/conversations/:id', async (req, res) => {
    await ready;
    const uid = userId(req);
    const conversation = await getConversationForUser(req.params.id, uid);
    if (!conversation) return res.status(404).json({ success: false, message: 'ไม่พบประวัติสนทนา' });
    await db.query('DELETE FROM johnny_chat_messages WHERE ConversationID = ? AND UserID = ?', [conversation.id, uid]);
    await db.query('DELETE FROM johnny_chat_conversations WHERE id = ? AND UserID = ?', [conversation.id, uid]);
    res.json({ success: true });
});

router.post('/analyze-image', chatLimiter, handleRiskImageUpload, async (req, res) => {
    await ready;
    const uid = userId(req);
    const context = cleanMessage(req.body?.message || req.body?.context || '');
    if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกรูปภาพสำหรับวิเคราะห์ความเสี่ยง' });

    const originalName = cleanOriginalFilename(req.file.originalname || req.file.filename);
    const promptText = context
        ? `ช่วยวิเคราะห์อันตรายและประเมินความเสี่ยงจากรูปนี้ โดยมีบริบทจากผู้ใช้: ${context}`
        : 'ช่วยวิเคราะห์อันตรายและประเมินความเสี่ยงจากรูปนี้';
    const userMessage = context
        ? `วิเคราะห์ความเสี่ยงจากรูปภาพ: ${originalName}\nบริบท: ${context}`
        : `วิเคราะห์ความเสี่ยงจากรูปภาพ: ${originalName}`;

    let conversation = await getConversationForUser(req.body?.conversationId, uid);
    let conversationId = conversation?.id;
    if (!conversationId) {
        conversationId = await createConversation(uid, makeTitle(userMessage));
    }

    await db.query(
        'INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson) VALUES (?, ?, ?, ?, ?, ?)',
        [conversationId, uid, 'user', userMessage, 'user', JSON.stringify([])]
    );

    try {
        const imageBuffer = await fs.promises.readFile(req.file.path);
        const result = await callGemini({
            systemInstruction: buildImageRiskInstruction(req),
            contents: buildImageRiskContents(promptText, imageBuffer, req.file.mimetype),
            enableWebSearch: false,
            operation: 'image_analysis',
            logContext: { userId: uid, conversationId },
        });
        const answerText = ensureImageRiskRubricAnswer(result.text);
        const citations = [{
            index: 1,
            referenceId: 'IMG1',
            type: 'image_analysis',
            sourceLabel: 'การวิเคราะห์รูปภาพจากผู้ใช้',
            title: originalName,
            fileName: originalName,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            excerpt: context || 'ไม่มีบริบทเพิ่มเติมจากผู้ใช้',
        }];
        const sources = [{ type: 'image_analysis', label: 'การวิเคราะห์รูปภาพจากผู้ใช้', count: 1 }];
        const answerQuality = johnnyPhase1Quality({
            userMessage,
            answerText,
            sourceType: 'image_analysis',
            citations,
            sources,
            imageAnalysis: true,
        });
        const [insert] = await db.query(
            `INSERT INTO johnny_chat_messages
             (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model, LatencyMs, PromptTokens, OutputTokens)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [conversationId, uid, 'assistant', answerText, 'image_analysis', JSON.stringify(citations), result.model, result.latencyMs, result.promptTokens, result.outputTokens]
        );
        await db.query('UPDATE johnny_chat_conversations SET UpdatedAt = NOW() WHERE id = ? AND UserID = ?', [conversationId, uid]);
        res.json({
            success: true,
            data: {
                conversationId,
                messageId: insert.insertId,
                answer: answerText,
                sourceType: 'image_analysis',
                sources,
                citations,
                answerQuality,
                latencyMs: result.latencyMs,
            },
        });
    } catch (error) {
        console.error('[johnny-ai] image analysis failed:', error.message);
        const status = error.statusCode || (error.name === 'AbortError' ? 504 : 500);
        const msg = status === 503
            ? 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับ Johnny AI'
            : 'Johnny AI ยังวิเคราะห์รูปนี้ไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
        await db.query(
            `INSERT INTO johnny_chat_messages
             (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [conversationId, uid, 'assistant', msg, 'not_verified', JSON.stringify([]), DEFAULT_MODEL]
        ).catch(() => {});
        res.status(status).json({ success: false, message: msg });
    } finally {
        if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    }
});

router.post('/chat', chatLimiter, async (req, res) => {
    await ready;
    const uid = userId(req);
    const message = cleanMessage(req.body?.message);
    const scopedDocument = await getScopedKbDocument(req.body?.documentId);
    if (req.body?.documentId && !scopedDocument) {
        return res.status(404).json({ success: false, message: 'Selected Knowledge Base document is not ready or active' });
    }
    if (!message) return res.status(400).json({ success: false, message: 'กรุณาพิมพ์คำถามก่อนส่งถึง Johnny AI' });

    let conversation = await getConversationForUser(req.body?.conversationId, uid);
    let conversationId = conversation?.id;
    if (!conversationId) {
        conversationId = await createConversation(uid, makeTitle(message));
    }

    await db.query(
        'INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson) VALUES (?, ?, ?, ?, ?, ?)',
        [conversationId, uid, 'user', message, 'user', JSON.stringify([])]
    );

    const history = await recentHistory(conversationId);
    let kbMatches = [];
    try {
        kbMatches = await searchKnowledgeBase(message, scopedDocument ? { documentId: scopedDocument.id } : {});
        await writeJohnnyLog({ level: 'info', operation: 'chat', stage: 'kb_retrieval', userId: uid, conversationId, documentId: scopedDocument?.id || null, message: 'Knowledge retrieval completed', meta: { matches: kbMatches.length, scoped: Boolean(scopedDocument) } });
    } catch (error) {
        console.warn('[johnny-ai] KB search skipped:', error.message);
        await writeJohnnyLog({ level: 'error', operation: 'chat', stage: 'kb_retrieval', userId: uid, conversationId, documentId: scopedDocument?.id || null, message: error.message || String(error) });
    }
    let systemData = { contexts: [], citations: [] };
    if (!scopedDocument) {
        try {
            systemData = await loadSystemDataContext(message);
        } catch (error) {
            console.warn('[johnny-ai] system data skipped:', error.message);
        }
    }
    const systemInstruction = buildSystemInstruction(req, kbMatches, systemData.contexts, { scopedDocument });
    let citations = kbMatches.map((m, index) => ({
        index: index + 1,
        rank: index + 1,
        referenceId: `D${index + 1}`,
        type: String(m.SourceType || 'document') === 'manual' ? 'safety_knowledge' : 'company_document',
        sourceLabel: String(m.SourceType || 'document') === 'manual' ? 'ข้อมูลจาก safety knowledge' : 'ข้อมูลจากเอกสารบริษัท',
        documentId: m.documentId,
        chunkId: m.id || m.chunkId || null,
        chunkIndex: Number(m.ChunkIndex ?? index),
        title: m.Title || m.OriginalName,
        fileName: m.OriginalName || m.Title || '',
        fileUrl: m.FileUrl,
        pageLabel: m.PageLabel,
        score: Number(m.score || 0),
        similarityScore: Number(m.semanticScore ?? m.score ?? 0),
        similarityPercent: Math.round(Number(m.semanticScore ?? m.score ?? 0) * 1000) / 10,
        keywordScore: Number(m.keywordScore || 0),
        keywordPercent: Math.round(Number(m.keywordScore || 0) * 1000) / 10,
        hybridScore: Number(m.hybridScore ?? m.score ?? 0),
        hybridPercent: Math.round(Number(m.hybridScore ?? m.score ?? 0) * 1000) / 10,
        minScore: KB_HYBRID_MIN_SCORE,
        tokenEstimate: Number(m.TokenEstimate || Math.ceil(String(m.ChunkText || '').length / 4)),
        excerpt: compactSnippet(m.ChunkText || '', 700),
        trace: {
            method: 'hybrid_semantic_keyword',
            semanticMethod: 'gemini_embedding_cosine',
            queryMode: 'task: question answering',
            rank: index + 1,
            selected: true,
            scopedDocumentId: scopedDocument?.id || null,
            threshold: KB_HYBRID_MIN_SCORE,
            semanticThreshold: KB_MIN_SCORE,
            keywordThreshold: KB_KEYWORD_MIN_SCORE,
            semanticWeight: KB_SEMANTIC_WEIGHT,
            keywordWeight: KB_KEYWORD_WEIGHT,
            score: Number(m.hybridScore ?? m.score ?? 0),
            semanticScore: Number(m.semanticScore ?? m.score ?? 0),
            keywordScore: Number(m.keywordScore || 0),
            hybridScore: Number(m.hybridScore ?? m.score ?? 0),
            chunkChars: String(m.ChunkText || '').length,
        },
    }));
    if (systemData.citations.length) citations.push(...systemData.citations.map((item, index) => ({
        ...item,
        index: citations.length + index + 1,
    })));
    const kbSourceType = kbMatches.some(m => String(m.SourceType || 'document') === 'manual') ? 'safety_knowledge' : 'company_document';
    let sources = kbMatches.length
        ? [{ type: 'company_document', label: 'ข้อมูลจากเอกสารบริษัท', count: kbMatches.length }]
        : systemData.citations.length
            ? [{ type: 'system_data', label: 'ข้อมูลจากระบบ TSH SCA', count: systemData.citations.length }]
            : [{ type: 'ai_general', label: 'ข้อมูลจากความรู้ทั่วไปของ AI' }];
    if (kbMatches.length && systemData.citations.length) {
        sources.push({ type: 'system_data', label: 'ข้อมูลจากระบบ TSH SCA', count: systemData.citations.length });
    }
    if (kbMatches.length) {
        sources[0].type = kbSourceType;
        sources[0].label = kbSourceType === 'safety_knowledge' ? 'ข้อมูลจาก safety knowledge' : 'ข้อมูลจากเอกสารบริษัท';
    }
    let sourceType = kbMatches.length ? kbSourceType : (systemData.citations.length ? 'system_data' : 'ai_general');

    try {
        const enableWebSearch = !scopedDocument && WEB_RESEARCH_ENABLED && kbMatches.length === 0 && systemData.citations.length === 0;
        const result = await callGemini({ systemInstruction, contents: buildContents(history, message), enableWebSearch, operation: 'chat', logContext: { userId: uid, conversationId, documentId: scopedDocument?.id || null } });
        let answerText = cleanJohnnyAnswer(result.text);
        let groundingUsed = false;
        if (!kbMatches.length && result.grounding?.citations?.length) {
            citations = result.grounding.citations;
            sourceType = 'external_research';
            groundingUsed = true;
            sources = [{
                type: 'external_research',
                label: 'ข้อมูลจากการค้นคว้าภายนอก',
                count: citations.length,
                queries: result.grounding.queries || [],
            }];
        }
        let answerQuality = johnnyPhase1Quality({
            userMessage: message,
            answerText,
            sourceType,
            citations,
            sources,
            scopedDocument,
            groundingUsed,
        });
        if (answerQuality.noVerifiedSource && answerQuality.companyDataGuarded) {
            sourceType = 'not_verified';
            citations = [];
            sources = [{ type: 'not_verified', label: 'ไม่พบข้อมูลที่ยืนยันได้', count: 0 }];
            answerText = johnnyPhase1NoVerifiedSourceAnswer(answerText, scopedDocument);
            answerQuality = johnnyPhase1Quality({
                userMessage: message,
                answerText,
                sourceType,
                citations,
                sources,
                scopedDocument,
                groundingUsed: false,
            });
        }
        const [insert] = await db.query(
            `INSERT INTO johnny_chat_messages
             (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model, LatencyMs, PromptTokens, OutputTokens)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [conversationId, uid, 'assistant', answerText, sourceType, JSON.stringify(citations), result.model, result.latencyMs, result.promptTokens, result.outputTokens]
        );
        await db.query('UPDATE johnny_chat_conversations SET UpdatedAt = NOW() WHERE id = ? AND UserID = ?', [conversationId, uid]);
        res.json({
            success: true,
            data: {
                conversationId,
                messageId: insert.insertId,
                answer: answerText,
                sourceType,
                sources,
                citations,
                answerQuality,
                latencyMs: result.latencyMs,
            },
        });
    } catch (error) {
        console.error('[johnny-ai] chat failed:', error.message);
        const status = error.statusCode || (error.name === 'AbortError' ? 504 : 500);
        const msg = status === 503
            ? 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับ Johnny AI'
            : 'Johnny AI ยังตอบไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
        await db.query(
            `INSERT INTO johnny_chat_messages
             (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [conversationId, uid, 'assistant', msg, 'not_verified', JSON.stringify([]), DEFAULT_MODEL]
        ).catch(() => {});
        res.status(status).json({ success: false, message: msg });
    }
});

module.exports = router;
