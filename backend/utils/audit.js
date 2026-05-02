// backend/utils/audit.js
// Central audit logging for protected API mutations.

const db = require('../db');

let tableReady = false;

async function ensureAuditTable() {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_AuditLogs (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            ActionTime  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            AdminID     VARCHAR(50)  NOT NULL,
            AdminName   VARCHAR(100),
            Role        VARCHAR(50),
            Department  VARCHAR(100),
            Module      VARCHAR(80),
            Action      VARCHAR(80)  NOT NULL,
            Method      VARCHAR(10),
            Path        VARCHAR(255),
            StatusCode  INT,
            TargetType  VARCHAR(80),
            TargetID    VARCHAR(100),
            Detail      TEXT,
            Metadata    TEXT,
            IPAddress   VARCHAR(80),
            UserAgent   VARCHAR(255),
            INDEX idx_action (Action),
            INDEX idx_admin (AdminID),
            INDEX idx_module (Module),
            INDEX idx_actiontime (ActionTime)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const migrations = [
        `ALTER TABLE Admin_AuditLogs ADD COLUMN Role VARCHAR(50) AFTER AdminName`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN Department VARCHAR(100) AFTER Role`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN Module VARCHAR(80) AFTER Department`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN Method VARCHAR(10) AFTER Action`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN Path VARCHAR(255) AFTER Method`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN StatusCode INT AFTER Path`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN Metadata TEXT AFTER Detail`,
        `ALTER TABLE Admin_AuditLogs ADD COLUMN UserAgent VARCHAR(255) AFTER IPAddress`,
        `ALTER TABLE Admin_AuditLogs ADD INDEX idx_module (Module)`,
    ];
    for (const sql of migrations) {
        try { await db.query(sql); } catch (_) {}
    }
    tableReady = true;
}

function moduleFromPath(path = '') {
    const clean = String(path || '').replace(/^\/api\//, '');
    return clean.split('/')[0] || 'system';
}

function targetIdFromReq(req) {
    const params = req.params || {};
    return params.id || params.issueId || params.fileId || params.employeeId || params.empId || params.cfgId || params.ResponseID || null;
}

function actionFromReq(req, statusCode) {
    const method = String(req.method || '').toUpperCase();
    const mod = moduleFromPath(req.originalUrl || req.path).replace(/-/g, '_').toUpperCase();
    const prefix = statusCode >= 400 ? 'FAILED' :
        method === 'POST' ? 'CREATE' :
        method === 'PUT' || method === 'PATCH' ? 'UPDATE' :
        method === 'DELETE' ? 'DELETE' : method;
    return `${prefix}_${mod}`;
}

function metadataFromReq(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const safeKeys = Object.keys(body).filter(k => !/password|token|secret|authorization/i.test(k));
    return {
        params: req.params || {},
        query: req.query || {},
        bodyKeys: safeKeys.slice(0, 40),
        file: req.file ? { fieldname: req.file.fieldname, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : undefined,
        files: req.files ? Object.keys(req.files).slice(0, 20) : undefined,
    };
}

async function logAudit(req, {
    action,
    module,
    targetType,
    targetId,
    detail,
    metadata,
    statusCode,
    method,
    path,
} = {}) {
    try {
        await ensureAuditTable();
        const user = req.user || {};
        const finalPath = path || req.originalUrl || req.path || '';
        await db.query(
            `INSERT INTO Admin_AuditLogs
             (AdminID, AdminName, Role, Department, Module, Action, Method, Path, StatusCode,
              TargetType, TargetID, Detail, Metadata, IPAddress, UserAgent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.id || user.EmployeeID || 'system',
                user.name || user.EmployeeName || 'System',
                user.role || user.Role || null,
                user.department || user.Department || null,
                module || moduleFromPath(finalPath),
                action || actionFromReq(req, statusCode || 200),
                method || req.method || null,
                finalPath ? String(finalPath).slice(0, 255) : null,
                statusCode || null,
                targetType || module || moduleFromPath(finalPath),
                String(targetId || targetIdFromReq(req) || ''),
                detail || null,
                JSON.stringify(metadata || metadataFromReq(req)),
                req.ip || req.headers?.['x-forwarded-for'] || null,
                String(req.headers?.['user-agent'] || '').slice(0, 255) || null,
            ]
        );
        req.auditLogged = true;
    } catch (err) {
        console.warn('[audit] log failed:', err.message);
    }
}

function attachAuditLogger(req, res) {
    if (req.auditLoggerAttached) return;
    req.auditLoggerAttached = true;
    res.on('finish', () => {
        const method = String(req.method || '').toUpperCase();
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
        if (req.auditLogged) return;
        if (req.originalUrl?.startsWith('/api/session/verify')) return;

        logAudit(req, {
            statusCode: res.statusCode,
            detail: `${method} ${req.originalUrl || req.path} -> ${res.statusCode}`,
        }).catch(() => {});
    });
}

module.exports = { ensureAuditTable, logAudit, attachAuditLogger };
