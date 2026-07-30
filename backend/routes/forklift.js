const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const { storage, fileFilter, deleteLocalUpload } = require('../storage');
const { logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');

const PERMISSIONS = [
    'FORKLIFT_VIEW','FORKLIFT_REQUEST','FORKLIFT_MANAGE','FORKLIFT_APPROVE','FORKLIFT_RENEW','FORKLIFT_SUSPEND','FORKLIFT_PRINT',
    'FORKLIFT_EXPORT','FORKLIFT_DOCUMENT_MANAGE','FORKLIFT_TEMPLATE_MANAGE','FORKLIFT_SETTINGS_MANAGE','FORKLIFT_AUDIT_VIEW',
];
const ROLES = ['ADMIN','USER','VIEWER','EXECUTIVE','MANAGER','STAFF','SAFETY_OFFICER'];

const userId = req => String(req.user?.id || req.user?.EmployeeID || '');
const userName = req => String(req.user?.name || req.user?.EmployeeName || userId(req) || 'System');
const roleOf = req => String(req.user?.role || req.user?.Role || 'USER').toUpperCase();
const isAdminReq = req => roleOf(req) === 'ADMIN';
const clean = (value, max = 255) => String(value ?? '').trim().slice(0, max);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value, 10)) && !Number.isNaN(new Date(`${clean(value, 10)}T00:00:00`).getTime()) ? clean(value, 10) : null;
const sqlDate = value => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(value);
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return '';
};
const baseStatus = value => ['ACTIVE','SUSPENDED','ARCHIVED'].includes(clean(value, 30).toUpperCase()) ? clean(value, 30).toUpperCase() : 'ACTIVE';
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

function defaultTemplateFields() {
    return [
        ['employee_photo', { label: 'Employee photo', side: 'front', x: 6, y: 18, width: 22, height: 42, visible: true, type: 'image', fit: 'cover', objectX: 50, objectY: 50, objectScale: 1 }],
        ['employee_name', { label: 'Employee name', side: 'front', x: 32, y: 20, width: 56, height: 8, visible: true, type: 'text', fontSize: 9, fontWeight: 800, color: '#0f172a', align: 'left' }],
        ['employee_id', { label: 'Employee ID', side: 'front', x: 32, y: 31, width: 36, height: 6, visible: true, type: 'text', fontSize: 6, color: '#334155', align: 'left' }],
        ['department', { label: 'Department', side: 'front', x: 32, y: 39, width: 56, height: 6, visible: true, type: 'text', fontSize: 6, color: '#334155', align: 'left' }],
        ['unit', { label: 'Unit', side: 'front', x: 32, y: 47, width: 56, height: 6, visible: true, type: 'text', fontSize: 6, color: '#334155', align: 'left' }],
        ['position', { label: 'Position', side: 'front', x: 32, y: 55, width: 56, height: 6, visible: true, type: 'text', fontSize: 6, color: '#334155', align: 'left' }],
        ['license_type', { label: 'License type', side: 'front', x: 32, y: 63, width: 56, height: 6, visible: true, type: 'text', fontSize: 6, fontWeight: 800, color: '#064e3b', align: 'left' }],
        ['license_no', { label: 'License No.', side: 'front', x: 6, y: 68, width: 42, height: 7, visible: true, type: 'text', fontSize: 6, fontWeight: 800, color: '#064e3b', align: 'left' }],
        ['card_no', { label: 'Card No.', side: 'front', x: 52, y: 68, width: 36, height: 7, visible: true, type: 'text', fontSize: 6, color: '#064e3b', align: 'right' }],
        ['issue_date', { label: 'Issue date', side: 'front', x: 6, y: 79, width: 38, height: 6, visible: true, type: 'text', fontSize: 5.5, color: '#475569', align: 'left' }],
        ['expire_date', { label: 'Expire date', side: 'front', x: 52, y: 79, width: 36, height: 6, visible: true, type: 'text', fontSize: 5.5, fontWeight: 800, color: '#dc2626', align: 'right' }],
        ['manager_signature', { label: 'Manager signature', side: 'back', x: 8, y: 58, width: 34, height: 16, visible: true, type: 'signature', fit: 'contain', objectX: 50, objectY: 50, objectScale: 1 }],
        ['qr_code', { label: 'Verification QR', side: 'back', x: 72, y: 58, width: 18, height: 28, visible: true, type: 'qr' }],
        ['static_text', { label: 'Static note', side: 'back', x: 8, y: 14, width: 82, height: 34, visible: true, type: 'text', text: 'Powered Industrial Truck License', fontSize: 7, color: '#0f172a', align: 'center' }],
    ];
}

function normalizeField(row) {
    let config = row.FieldConfig || {};
    if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch (_) { config = {}; }
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
    return { ...row, FieldConfig: config };
}

async function seedTemplateFields(conn, versionId) {
    let sort = 10;
    for (const [key, config] of defaultTemplateFields()) {
        await conn.query('INSERT INTO forklift_card_template_fields(TemplateVersionID,FieldKey,FieldConfig,SortOrder) VALUES(?,?,?,?)', [versionId, key, JSON.stringify(config), sort]);
        sort += 10;
    }
}

function parseTypeIds(body, fallback = []) {
    const raw = body?.LicenseTypeIDs ?? body?.LicenseTypeIds ?? body?.licenseTypeIds ?? body?.LicenseTypes ?? body?.LicenseTypeID ?? fallback;
    const values = Array.isArray(raw) ? raw : String(raw ?? '').split(/[|,]/);
    const ids = [...new Set(values.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))];
    return ids.slice(0, 2);
}

function normalizeTypeIds(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values]).map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b).slice(0, 2);
}

function sameTypeSet(left = [], right = []) {
    const a = normalizeTypeIds(left);
    const b = normalizeTypeIds(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function syncTypeMap(conn, table, ownerColumn, ownerId, typeIds) {
    await conn.query(`DELETE FROM ${table} WHERE ${ownerColumn}=?`, [ownerId]);
    for (const typeId of typeIds.slice(0, 2)) {
        await conn.query(`INSERT IGNORE INTO ${table}(${ownerColumn},LicenseTypeID) VALUES(?,?)`, [ownerId, typeId]);
    }
}

async function attachTypeNames(rows, rowIdKey = 'ID', table = 'forklift_license_type_map', mapOwnerColumn = 'LicenseID') {
    if (!rows.length) return rows;
    const ids = rows.map(row => row[rowIdKey]).filter(Boolean);
    if (!ids.length) return rows;
    const [maps] = await db.query(
        `SELECT m.${mapOwnerColumn} AS OwnerID,t.ID,t.Code,t.NameTH,t.NameEN
         FROM ${table} m JOIN forklift_license_types t ON t.ID=m.LicenseTypeID
         WHERE m.${mapOwnerColumn} IN (?) ORDER BY m.ID ASC`,
        [ids]
    );
    const grouped = new Map();
    for (const item of maps) {
        const list = grouped.get(item.OwnerID) || [];
        list.push({ ID: item.ID, Code: item.Code, NameTH: item.NameTH, NameEN: item.NameEN });
        grouped.set(item.OwnerID, list);
    }
    return rows.map(row => {
        const types = grouped.get(row[rowIdKey]) || [{ ID: row.LicenseTypeID, Code: row.LicenseTypeCode, NameTH: row.LicenseTypeNameTH, NameEN: row.LicenseTypeNameEN }];
        return {
            ...row,
            LicenseTypes: types,
            LicenseTypeIDs: types.map(type => type.ID),
            LicenseTypeNames: types.map(type => type.NameTH || type.Code).filter(Boolean).join(', '),
        };
    });
}

async function hasActiveLicenseForAnyType(employeeId, typeIds, excludeId = null, conn = db) {
    if (!typeIds.length) return null;
    const params = [employeeId, typeIds];
    let exclude = '';
    if (excludeId) { exclude = 'AND l.ID<>?'; params.push(excludeId); }
    const [[row]] = await conn.query(
        `SELECT l.ID FROM forklift_licenses l
         LEFT JOIN forklift_license_type_map m ON m.LicenseID=l.ID
         WHERE l.EmployeeID=? AND COALESCE(m.LicenseTypeID,l.LicenseTypeID) IN (?)
           AND l.DeletedAt IS NULL AND l.CurrentStatus<>'ARCHIVED' AND l.ExpireDate>=CURDATE() ${exclude}
         LIMIT 1`,
        params
    );
    return row || null;
}

async function hasPendingRequestForAnyType(employeeId, typeIds, conn = db) {
    if (!typeIds.length) return null;
    const [[row]] = await conn.query(
        `SELECT r.ID FROM forklift_license_requests r
         LEFT JOIN forklift_request_type_map m ON m.RequestID=r.ID
         WHERE r.EmployeeID=? AND COALESCE(m.LicenseTypeID,r.LicenseTypeID) IN (?) AND r.RequestStatus IN ('DRAFT','RETURNED','SUBMITTED','UNDER_REVIEW','PENDING')
         LIMIT 1`,
        [employeeId, typeIds]
    );
    return row || null;
}

async function templatePayload(templateId = null) {
    const params = [];
    let where = '';
    if (templateId) { where = ' WHERE tpl.ID=?'; params.push(templateId); }
    let [templates] = await db.query(`SELECT tpl.*,typ.Code AS LicenseTypeCode,typ.NameTH AS LicenseTypeNameTH,typ.NameEN AS LicenseTypeNameEN,(SELECT COUNT(*) FROM forklift_card_template_versions pv JOIN forklift_card_print_logs pl ON pl.TemplateVersionID=pv.ID WHERE pv.TemplateID=tpl.ID) AS PrintLogCount FROM forklift_card_templates tpl LEFT JOIN forklift_license_types typ ON typ.ID=tpl.LicenseTypeID${where} ORDER BY COALESCE(tpl.ArchivedAt,'1000-01-01') ASC,tpl.UpdatedAt DESC,tpl.ID DESC`, params);
    templates = await attachTypeNames(templates, 'ID', 'forklift_card_template_type_map', 'TemplateID');
    for (const tpl of templates) {
        const [versions] = await db.query('SELECT * FROM forklift_card_template_versions WHERE TemplateID=? ORDER BY VersionNo DESC,ID DESC', [tpl.ID]);
        for (const ver of versions) {
            const [fields] = await db.query('SELECT * FROM forklift_card_template_fields WHERE TemplateVersionID=? ORDER BY SortOrder ASC,ID ASC', [ver.ID]);
            ver.Fields = fields.map(normalizeField);
        }
        tpl.Versions = versions;
        tpl.CurrentVersion = versions.find(v => String(v.Status).toLowerCase() === 'published') || versions[0] || null;
        tpl.PrintLogCount = Number(tpl.PrintLogCount || 0);
        tpl.TemplateStatus = tpl.ArchivedAt ? 'archived' : (tpl.CurrentVersion && String(tpl.CurrentVersion.Status).toLowerCase() === 'published' ? 'published' : 'draft');
    }
    return templates;
}

async function templateRow(templateId) {
    const [[row]] = await db.query('SELECT * FROM forklift_card_templates WHERE ID=? LIMIT 1', [templateId]);
    return row || null;
}

async function templatePrintLogCount(templateId) {
    const [[row]] = await db.query('SELECT COUNT(*) AS count FROM forklift_card_template_versions v JOIN forklift_card_print_logs l ON l.TemplateVersionID=v.ID WHERE v.TemplateID=?', [templateId]);
    return Number(row?.count || 0);
}

function uploadedFiles(req) {
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files && typeof req.files === 'object') {
        for (const value of Object.values(req.files)) if (Array.isArray(value)) files.push(...value);
    }
    return files;
}
function cleanupRequestUploads(req) {
    for (const file of uploadedFiles(req)) deleteLocalUpload(file?.publicUrl || file?.path || '');
}
function uploadCleanupGuard(req, res, next) {
    res.once('finish', () => {
        if (res.statusCode >= 400 && !req.forkliftUploadPersisted) cleanupRequestUploads(req);
    });
    next();
}
function markUploadPersisted(req) { req.forkliftUploadPersisted = true; }

function uploadedImage(req, field) {
    const file = req.files?.[field]?.[0] || null;
    if (!file) return null;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        deleteLocalUpload(file.publicUrl || file.path);
        const err = new Error(`${field} must be JPG, PNG, or WebP.`);
        err.statusCode = 400;
        throw err;
    }
    return file.publicUrl || file.path;
}

let ready = false;
async function schemaReady() {
    const tables = [
        'forklift_license_types','forklift_licenses','forklift_license_requests','forklift_license_type_map',
        'forklift_request_type_map','forklift_request_documents','forklift_request_events','forklift_license_renewals',
        'forklift_license_documents','forklift_employee_photos','forklift_card_templates','forklift_card_template_versions',
        'forklift_card_template_fields','forklift_card_template_type_map','forklift_layout_presets','forklift_card_print_logs','forklift_verification_tokens',
        'forklift_emailoutbox','forklift_sequences','forklift_settings',
    ];
    try {
        const marks = tables.map(() => '?').join(',');
        const [[schema]] = await db.query(
            `SELECT COUNT(DISTINCT LOWER(TABLE_NAME)) tableCount,
                SUM(CASE WHEN LOWER(TABLE_NAME)='forklift_license_requests' AND COLUMN_NAME IN ('RequestKind','SourceLicenseID','RequestedByID','SubmittedAt','ReviewStartedAt','ReturnedAt') THEN 1 ELSE 0 END)
                + SUM(CASE WHEN LOWER(TABLE_NAME)='forklift_card_templates' AND COLUMN_NAME IN ('ArchivedAt','ArchivedBy') THEN 1 ELSE 0 END) requiredColumns
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) IN (${marks})`,
            tables
        );
        const [[permissions]] = await db.query("SELECT COUNT(*) total FROM admin_rolepermissions WHERE permission LIKE 'FORKLIFT\\_%' ESCAPE '\\\\'");
        return Number(schema?.tableCount || 0) === tables.length
            && Number(schema?.requiredColumns || 0) === 8
            && Number(permissions?.total || 0) >= ROLES.length * PERMISSIONS.length;
    } catch (_) {
        return false;
    }
}
async function ensure() {
    if (ready) return;
    if (await schemaReady()) { ready = true; return; }
    await db.query(`CREATE TABLE IF NOT EXISTS admin_rolepermissions (id INT AUTO_INCREMENT PRIMARY KEY,role VARCHAR(50) NOT NULL,permission VARCHAR(80) NOT NULL,granted TINYINT NOT NULL DEFAULT 1,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_role_perm(role,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS admin_userpermissions (id INT AUTO_INCREMENT PRIMARY KEY,employee_id VARCHAR(50) NOT NULL,permission VARCHAR(80) NOT NULL,granted TINYINT NOT NULL DEFAULT 1,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_user_perm(employee_id,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    for (const role of ROLES) {
        for (const permission of PERMISSIONS) {
            let granted = 0;
            if (role === 'ADMIN') granted = 1;
            else if (role === 'SAFETY_OFFICER') granted = !['FORKLIFT_SETTINGS_MANAGE','FORKLIFT_TEMPLATE_MANAGE','FORKLIFT_AUDIT_VIEW'].includes(permission) ? 1 : 0;
            else if (role === 'MANAGER') granted = ['FORKLIFT_VIEW','FORKLIFT_PRINT','FORKLIFT_EXPORT'].includes(permission) ? 1 : 0;
            await db.query('INSERT IGNORE INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?)', [role, permission, granted]);
        }
    }
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_license_types (ID INT AUTO_INCREMENT PRIMARY KEY,Code VARCHAR(40) NOT NULL,NameTH VARCHAR(120) NOT NULL,NameEN VARCHAR(120),Description TEXT,DefaultValidityMonths INT NOT NULL DEFAULT 12,Color VARCHAR(30) DEFAULT 'emerald',IsActive TINYINT(1) NOT NULL DEFAULT 1,SortOrder INT NOT NULL DEFAULT 100,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_type_code(Code),KEY idx_active(IsActive,SortOrder)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_licenses (ID INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50) NOT NULL,LicenseTypeID INT NOT NULL,LicenseNo VARCHAR(80),CardNo VARCHAR(80),IssueDate DATE NOT NULL,LastRenewalDate DATE NULL,ExpireDate DATE NOT NULL,CertificateNo VARCHAR(120),CurrentStatus VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',SuspensionReason TEXT,SuspendedAt DATETIME NULL,Note TEXT,EmployeeNameSnapshot VARCHAR(150),DepartmentSnapshot VARCHAR(120),UnitSnapshot VARCHAR(120),PositionSnapshot VARCHAR(120),CreatedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100),UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),UNIQUE KEY uq_fl_license_no(LicenseNo),UNIQUE KEY uq_fl_card_no(CardNo),KEY idx_emp(EmployeeID),KEY idx_type(LicenseTypeID),KEY idx_expire(ExpireDate),KEY idx_status(CurrentStatus),KEY idx_deleted(DeletedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_license_requests (ID INT AUTO_INCREMENT PRIMARY KEY,RequestNo VARCHAR(80) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,LicenseTypeID INT NOT NULL,IssueDate DATE NOT NULL,ExpireDate DATE NOT NULL,CertificateNo VARCHAR(120),RequestStatus VARCHAR(30) NOT NULL DEFAULT 'PENDING',RequestNote TEXT,ReviewNote TEXT,LicenseID INT NULL,EmployeeNameSnapshot VARCHAR(150),DepartmentSnapshot VARCHAR(120),UnitSnapshot VARCHAR(120),PositionSnapshot VARCHAR(120),RequestedBy VARCHAR(100),RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,ReviewedBy VARCHAR(100),ReviewedAt DATETIME NULL,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_request_no(RequestNo),KEY idx_status(RequestStatus,RequestedAt),KEY idx_emp(EmployeeID),KEY idx_license(LicenseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_license_type_map (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,LicenseTypeID INT NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_license_type(LicenseID,LicenseTypeID),KEY idx_type(LicenseTypeID),KEY idx_license(LicenseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_request_type_map (ID INT AUTO_INCREMENT PRIMARY KEY,RequestID INT NOT NULL,LicenseTypeID INT NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_request_type(RequestID,LicenseTypeID),KEY idx_type(LicenseTypeID),KEY idx_request(RequestID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_request_documents (ID INT AUTO_INCREMENT PRIMARY KEY,RequestID INT NOT NULL,DocumentType VARCHAR(40) NOT NULL,OriginalName VARCHAR(255),StoredName VARCHAR(255),FileUrl TEXT NOT NULL,MimeType VARCHAR(100),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_request_doc(RequestID,DeletedAt),KEY idx_doc_type(DocumentType)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_request_events (ID INT AUTO_INCREMENT PRIMARY KEY,RequestID INT NOT NULL,EventType VARCHAR(40) NOT NULL,FromStatus VARCHAR(30),ToStatus VARCHAR(30),Comment TEXT,ActorID VARCHAR(50),ActorName VARCHAR(150),ActorRole VARCHAR(50),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_request_event(RequestID,CreatedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_license_renewals (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,OldIssueDate DATE,NewIssueDate DATE,OldExpireDate DATE,NewExpireDate DATE,OldCertificateNo VARCHAR(120),NewCertificateNo VARCHAR(120),RenewalNote TEXT,OperatedBy VARCHAR(100),OperatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_license(LicenseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_license_documents (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,DocumentType VARCHAR(50) NOT NULL DEFAULT 'certificate',OriginalName VARCHAR(255),StoredName VARCHAR(255),FileUrl TEXT,MimeType VARCHAR(100),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_license(LicenseID,DeletedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_employee_photos (ID INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50) NOT NULL,PhotoUrl TEXT NOT NULL,OriginalName VARCHAR(255),StoredName VARCHAR(255),MimeType VARCHAR(100),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_emp(EmployeeID,DeletedAt),KEY idx_uploaded(UploadedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_card_templates (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseTypeID INT NULL,TemplateName VARCHAR(150) NOT NULL,IsActive TINYINT(1) NOT NULL DEFAULT 1,IsDefault TINYINT(1) NOT NULL DEFAULT 0,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_card_template_versions (ID INT AUTO_INCREMENT PRIMARY KEY,TemplateID INT NOT NULL,VersionNo INT NOT NULL DEFAULT 1,FrontImageUrl TEXT,BackImageUrl TEXT,CardWidthMm DECIMAL(8,2) DEFAULT 60.00,CardHeightMm DECIMAL(8,2) DEFAULT 82.00,Dpi INT DEFAULT 300,Status VARCHAR(30) NOT NULL DEFAULT 'draft',CreatedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PublishedAt DATETIME NULL,UNIQUE KEY uq_template_version(TemplateID,VersionNo)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_card_template_fields (ID INT AUTO_INCREMENT PRIMARY KEY,TemplateVersionID INT NOT NULL,FieldKey VARCHAR(80) NOT NULL,FieldConfig JSON NULL,SortOrder INT NOT NULL DEFAULT 100,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_version(TemplateVersionID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_card_template_type_map (ID INT AUTO_INCREMENT PRIMARY KEY,TemplateID INT NOT NULL,LicenseTypeID INT NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_template_type(TemplateID,LicenseTypeID),KEY idx_type(LicenseTypeID),KEY idx_template(TemplateID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_layout_presets (ID INT AUTO_INCREMENT PRIMARY KEY,PresetName VARCHAR(150) NOT NULL,FieldsJson LONGTEXT NOT NULL,CreatedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100),UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_layout_preset_name(PresetName)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_card_print_logs (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,TemplateVersionID INT NULL,Action VARCHAR(40) NOT NULL,PrintedBy VARCHAR(100),PrintedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,SnapshotJson JSON NULL,RenderMetadata JSON NULL,KEY idx_license(LicenseID),KEY idx_printed(PrintedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_verification_tokens (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,Token VARCHAR(120) NOT NULL,IsActive TINYINT(1) NOT NULL DEFAULT 1,RevokedAt DATETIME NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,LastAccessedAt DATETIME NULL,AccessCount INT NOT NULL DEFAULT 0,UNIQUE KEY uq_fl_token(Token),KEY idx_license(LicenseID,IsActive)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS Forklift_EmailOutbox (id INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NULL,EmployeeID VARCHAR(50),EventType VARCHAR(80) NOT NULL DEFAULT 'General',Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,SentAt DATETIME NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_license(LicenseID),KEY idx_status(Status),KEY idx_created(CreatedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_sequences (ID INT AUTO_INCREMENT PRIMARY KEY,SequenceKey VARCHAR(80) NOT NULL,SeqYear INT NOT NULL,NextSeq INT NOT NULL DEFAULT 1,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_seq(SequenceKey,SeqYear)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS forklift_settings (SettingKey VARCHAR(80) PRIMARY KEY,SettingValue VARCHAR(255),UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query('ALTER TABLE forklift_card_templates ADD COLUMN ArchivedAt DATETIME NULL AFTER IsDefault').catch(() => {});
    await db.query('ALTER TABLE forklift_card_templates ADD COLUMN ArchivedBy VARCHAR(100) NULL AFTER ArchivedAt').catch(() => {});
    await db.query('ALTER TABLE forklift_card_templates ADD KEY idx_fl_tpl_archive (ArchivedAt,IsActive)').catch(() => {});
    await db.query("ALTER TABLE forklift_license_requests ADD COLUMN RequestKind VARCHAR(20) NOT NULL DEFAULT 'NEW' AFTER RequestNo").catch(() => {});
    await db.query('ALTER TABLE forklift_license_requests ADD COLUMN SourceLicenseID INT NULL AFTER RequestKind').catch(() => {});
    await db.query('ALTER TABLE forklift_license_requests ADD COLUMN RequestedByID VARCHAR(50) NULL AFTER RequestedBy').catch(() => {});
    await db.query('ALTER TABLE forklift_license_requests ADD COLUMN SubmittedAt DATETIME NULL AFTER RequestedAt').catch(() => {});
    await db.query('ALTER TABLE forklift_license_requests ADD COLUMN ReviewStartedAt DATETIME NULL AFTER ReviewedBy').catch(() => {});
    await db.query('ALTER TABLE forklift_license_requests ADD COLUMN ReturnedAt DATETIME NULL AFTER ReviewStartedAt').catch(() => {});
    await db.query(`INSERT IGNORE INTO forklift_license_types(Code,NameTH,NameEN,DefaultValidityMonths,Color,SortOrder) VALUES ('FORKLIFT','Forklift','Forklift',12,'emerald',10),('STACKER','Stacker','Stacker',12,'sky',20)`);
    await db.query(`INSERT IGNORE INTO forklift_settings(SettingKey,SettingValue) VALUES ('expiry_warn_days_primary','60'),('expiry_warn_days_secondary','30'),('expiry_warn_days_urgent','7'),('default_validity_months','12'),('document_max_upload_mb','5'),('manager_signature_url',''),('approval_queue_enabled','1'),('request_sla_days','3')`);
    await db.query(`INSERT IGNORE INTO forklift_license_type_map(LicenseID,LicenseTypeID) SELECT ID,LicenseTypeID FROM forklift_licenses WHERE LicenseTypeID IS NOT NULL`);
    await db.query(`INSERT IGNORE INTO forklift_request_type_map(RequestID,LicenseTypeID) SELECT ID,LicenseTypeID FROM forklift_license_requests WHERE LicenseTypeID IS NOT NULL`);
    await db.query(`INSERT IGNORE INTO forklift_card_template_type_map(TemplateID,LicenseTypeID) SELECT ID,LicenseTypeID FROM forklift_card_templates WHERE LicenseTypeID IS NOT NULL`);
    ready = true;
}

async function hasPermission(req, permission) {
    if (isAdminReq(req)) return true;
    if (['FORKLIFT_VIEW', 'FORKLIFT_REQUEST'].includes(permission)) return true;
    const uid = userId(req);
    if (uid) {
        const [[u]] = await db.query('SELECT granted FROM admin_userpermissions WHERE employee_id=? AND permission=? ORDER BY updated_at DESC LIMIT 1', [uid, permission]);
        if (u) return Number(u.granted) === 1;
    }
    const [[r]] = await db.query('SELECT granted FROM admin_rolepermissions WHERE role=? AND permission=? LIMIT 1', [roleOf(req), permission]);
    return r ? Number(r.granted) === 1 : false;
}
async function requirePermission(req, res, permission) {
    if (!(await hasPermission(req, permission))) {
        res.status(403).json({ success: false, message: 'Permission denied.' });
        return false;
    }
    return true;
}
async function warnDays() {
    const [[row]] = await db.query("SELECT SettingValue FROM forklift_settings WHERE SettingKey='expiry_warn_days_primary' LIMIT 1").catch(() => [[null]]);
    return Math.max(1, Number(row?.SettingValue || 60));
}
async function settingsMap() {
    const [rows] = await db.query('SELECT SettingKey,SettingValue,UpdatedAt FROM forklift_settings ORDER BY SettingKey');
    return Object.fromEntries(rows.map(row => [row.SettingKey, row.SettingValue]));
}
async function attachEffective(rows, warningDays = null) {
    const warn = warningDays == null ? await warnDays() : Math.max(1, Math.min(365, Number(warningDays) || 60));
    const today = new Date(new Date().toISOString().slice(0, 10));
    return rows.map(row => {
        let status = String(row.CurrentStatus || 'ACTIVE').toUpperCase();
        if (row.DeletedAt || status === 'ARCHIVED') status = 'ARCHIVED';
        else if (status === 'SUSPENDED') status = 'SUSPENDED';
        else {
            const expire = row.ExpireDate ? new Date(`${sqlDate(row.ExpireDate)}T00:00:00`) : null;
            if (expire && expire < today) status = 'EXPIRED';
            else if (expire && expire <= new Date(today.getTime() + warn * 86400000)) status = 'EXPIRING_SOON';
            else status = 'ACTIVE';
        }
        return { ...row, EffectiveStatus: status };
    });
}

function effectiveStatusWhere(status, warningDays) {
    const warn = Math.max(1, Math.min(365, Number(warningDays) || 60));
    const base = "UPPER(COALESCE(l.CurrentStatus,'ACTIVE'))";
    const current = `l.DeletedAt IS NULL AND ${base} NOT IN ('ARCHIVED','SUSPENDED')`;
    const clauses = {
        ACTIVE: `${current} AND (l.ExpireDate IS NULL OR l.ExpireDate>DATE_ADD(CURDATE(),INTERVAL ${warn} DAY))`,
        EXPIRING_SOON: `${current} AND l.ExpireDate>=CURDATE() AND l.ExpireDate<=DATE_ADD(CURDATE(),INTERVAL ${warn} DAY)`,
        EXPIRED: `${current} AND l.ExpireDate<CURDATE()`,
        SUSPENDED: `l.DeletedAt IS NULL AND ${base}='SUSPENDED'`,
        ARCHIVED: `(l.DeletedAt IS NOT NULL OR ${base}='ARCHIVED')`,
    };
    return clauses[String(status || '').toUpperCase()] || null;
}

const licenseNoOrderSql = "CASE WHEN l.LicenseNo IS NULL OR TRIM(l.LicenseNo)='' THEN 1 ELSE 0 END,l.LicenseNo ASC,l.ID ASC";
async function employee(id) {
    const [[row]] = await db.query('SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position FROM employees WHERE EmployeeID=? LIMIT 1', [id]);
    return row || null;
}
async function employeePhotoUrl(employeeId) {
    const [[row]] = await db.query(
        `SELECT PhotoUrl FROM forklift_employee_photos
         WHERE EmployeeID=? AND DeletedAt IS NULL
           AND PhotoUrl IS NOT NULL
           AND TRIM(PhotoUrl) <> ''
           AND LOWER(TRIM(PhotoUrl)) NOT IN ('0','false','null','undefined')
         ORDER BY UploadedAt DESC,ID DESC LIMIT 1`,
        [employeeId]
    );
    return row?.PhotoUrl || '';
}

const REQUEST_DOCUMENTS = [
    { type: 'TRAINING_CERTIFICATE', label: 'Certificate อบรม', requiredFor: ['NEW', 'RENEWAL'], accept: '.pdf,.jpg,.jpeg,.png,.webp', mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], licenseDocumentType: 'training_certificate' },
    { type: 'EMPLOYEE_PHOTO', label: 'รูปพนักงาน', requiredFor: ['NEW', 'RENEWAL'], accept: '.jpg,.jpeg,.png,.webp', mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], syncEmployeePhoto: true },
    { type: 'RENEWAL_DOCUMENT', label: 'เอกสารต่ออายุ', requiredFor: ['RENEWAL'], accept: '.pdf,.jpg,.jpeg,.png,.webp', mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], licenseDocumentType: 'renewal_document' },
    { type: 'OTHER', label: 'อื่นๆ', requiredFor: [], accept: '.pdf,.jpg,.jpeg,.png,.webp', mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], licenseDocumentType: 'other' },
];

const requestKindOf = request => String(request?.RequestKind || 'NEW').toUpperCase() === 'RENEWAL' ? 'RENEWAL' : 'NEW';
const requestDocumentItems = request => {
    const kind = requestKindOf(request);
    return REQUEST_DOCUMENTS
        .filter(item => item.requiredFor.includes(kind) || item.type === 'OTHER')
        .map(item => ({ ...item, required: item.requiredFor.includes(kind) }));
};
const requestRequiredDocuments = request => requestDocumentItems(request).filter(item => item.required);
const requestDocumentMeta = type => REQUEST_DOCUMENTS.find(item => item.type === String(type || '').toUpperCase()) || null;

async function requestCanAccess(req, request) {
    return (await hasPermission(req, 'FORKLIFT_MANAGE')) || (await hasPermission(req, 'FORKLIFT_APPROVE')) || String(request?.EmployeeID || '') === userId(req) || (request?.RequestedByID && String(request.RequestedByID) === userId(req));
}

async function requestEvent(conn, req, requestId, type, from, to, comment = '') {
    await conn.query('INSERT INTO forklift_request_events(RequestID,EventType,FromStatus,ToStatus,Comment,ActorID,ActorName,ActorRole) VALUES(?,?,?,?,?,?,?,?)', [requestId, type, from || null, to || null, clean(comment, 2000) || null, userId(req), userName(req), roleOf(req)]);
}

async function requestDetail(req, id) {
    const [[request]] = await db.query(`${requestSelectSql()} WHERE r.ID=? LIMIT 1`, [id]);
    if (!request || !(await requestCanAccess(req, request))) return null;
    const [attached] = await attachTypeNames([request], 'ID', 'forklift_request_type_map', 'RequestID');
    const [documents] = await db.query('SELECT ID,RequestID,DocumentType,OriginalName,FileUrl,MimeType,FileSize,UploadedBy,UploadedAt FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL ORDER BY UploadedAt DESC,ID DESC', [id]);
    const [events] = await db.query('SELECT * FROM forklift_request_events WHERE RequestID=? ORDER BY CreatedAt ASC,ID ASC', [id]);
    const present = new Set(documents.map(doc => doc.DocumentType));
    const checklist = requestDocumentItems(attached).map(item => ({ ...item, complete: present.has(item.type) }));
    return { ...attached, Documents: documents, Events: events, Checklist: checklist, CanSubmit: checklist.filter(item => item.required).every(item => item.complete) };
}

async function carryOverRequestDocuments(conn, requestId, licenseId, employeeId, actor) {
    const [docs] = await conn.query(
        'SELECT * FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL ORDER BY UploadedAt ASC,ID ASC',
        [requestId]
    );
    for (const doc of docs) {
        const meta = requestDocumentMeta(doc.DocumentType);
        if (!meta) continue;
        if (meta.licenseDocumentType) {
            await conn.query(
                'INSERT INTO forklift_license_documents(LicenseID,DocumentType,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?,?)',
                [licenseId, meta.licenseDocumentType, doc.OriginalName || null, doc.StoredName || null, doc.FileUrl, doc.MimeType || null, doc.FileSize || 0, actor]
            );
        }
        if (meta.syncEmployeePhoto) {
            await conn.query('UPDATE forklift_employee_photos SET DeletedAt=NOW(),DeletedBy=? WHERE EmployeeID=? AND DeletedAt IS NULL', [actor, employeeId]);
            await conn.query(
                'INSERT INTO forklift_employee_photos(EmployeeID,PhotoUrl,OriginalName,StoredName,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?)',
                [employeeId, doc.FileUrl, doc.OriginalName || null, doc.StoredName || null, doc.MimeType || null, doc.FileSize || 0, actor]
            );
        }
    }
    return docs.length;
}
async function nextNo(conn, key, prefix) {
    const year = new Date().getFullYear();
    await conn.query('INSERT INTO forklift_sequences(SequenceKey,SeqYear,NextSeq) VALUES(?,?,1) ON DUPLICATE KEY UPDATE NextSeq=NextSeq', [key, year]);
    const [[row]] = await conn.query('SELECT NextSeq FROM forklift_sequences WHERE SequenceKey=? AND SeqYear=? FOR UPDATE', [key, year]);
    const seq = Math.max(1, Number(row?.NextSeq || 1));
    await conn.query('UPDATE forklift_sequences SET NextSeq=? WHERE SequenceKey=? AND SeqYear=?', [seq + 1, key, year]);
    return `${prefix}${year}-${String(seq).padStart(4, '0')}`;
}
const selectSql = () => `SELECT l.*,t.Code AS LicenseTypeCode,t.NameTH AS LicenseTypeNameTH,t.NameEN AS LicenseTypeNameEN,e.EmployeeName,e.Department,e.Unit,e.Position,e.CompanyEmail FROM forklift_licenses l JOIN forklift_license_types t ON t.ID=l.LicenseTypeID LEFT JOIN employees e ON e.EmployeeID=l.EmployeeID`;
const requestSelectSql = () => `SELECT r.*,t.Code AS LicenseTypeCode,t.NameTH AS LicenseTypeNameTH,t.NameEN AS LicenseTypeNameEN,e.EmployeeName,e.Department,e.Unit,e.Position,e.CompanyEmail,src.LicenseNo AS SourceLicenseNo,src.CardNo AS SourceCardNo,src.IssueDate AS SourceIssueDate,src.ExpireDate AS SourceExpireDate,src.CertificateNo AS SourceCertificateNo FROM forklift_license_requests r JOIN forklift_license_types t ON t.ID=r.LicenseTypeID LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID LEFT JOIN forklift_licenses src ON src.ID=r.SourceLicenseID`;

function mailEscape(value) {
    return String(value ?? '').trim().replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function forkliftMailRow(label, value, { strong = false, color = '#0f172a' } = {}) {
    const content = strong ? `<strong>${mailEscape(value || '-')}</strong>` : mailEscape(value || '-');
    return `<tr><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;vertical-align:top">${mailEscape(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:${color};font-size:14px;vertical-align:top">${content}</td></tr>`;
}

function forkliftMailLayout({ tone = '#047857', soft = '#ecfdf5', eyebrow = 'TSH SAFETY CORE', title = 'Forklift License', subtitle = 'ระบบบริหารใบอนุญาตรถยก', badge = 'แจ้งเตือน', intro = '', rows = '', note = '', ctaUrl = '' } = {}) {
    const noteHtml = String(note || '').trim()
        ? `<tr><td style="padding:0 28px 22px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:14px 16px"><div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:5px">หมายเหตุ / Note</div><div style="font-size:14px;color:#334155;line-height:1.6">${mailEscape(note).replace(/\n/g, '<br>')}</div></td></tr></table></td></tr>`
        : '';
    const ctaHtml = String(ctaUrl || '').trim() ? `<tr><td style="padding:0 28px 22px"><a href="${mailEscape(ctaUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:${tone};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">เปิดรายละเอียดใบอนุญาต · View details</a></td></tr>` : '';
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Noto Sans Thai',Tahoma,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:6px;background:${tone};font-size:0">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><div style="font-size:11px;letter-spacing:1.4px;font-weight:700;color:${tone}">${mailEscape(eyebrow)}</div><div style="font-size:24px;line-height:1.3;font-weight:700;color:#0f172a;margin-top:7px">${mailEscape(title)}</div><div style="font-size:13px;color:#64748b;margin-top:5px">${mailEscape(subtitle)}</div></td><td align="right" valign="top"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:${soft};color:${tone};font-size:12px;font-weight:700">${mailEscape(badge)}</span></td></tr></table></td></tr><tr><td style="padding:0 28px 18px;font-size:14px;line-height:1.7;color:#334155">${intro}</td></tr><tr><td style="padding:0 28px 22px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">${rows}</table></td></tr>${noteHtml}${ctaHtml}<tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0"><div style="font-size:12px;color:#64748b;line-height:1.6">อีเมลนี้ส่งอัตโนมัติจาก <strong>TSH Safety Core</strong><br>Please do not reply directly to this automated message.</div></td></tr></table></td></tr></table></body></html>`;
}

function buildRequestMail(request, eventType, license = null, appUrl = '') {
    const status = String(eventType || 'Pending').toUpperCase();
    const name = request.EmployeeName || request.EmployeeNameSnapshot || request.EmployeeID || '-';
    const type = request.LicenseTypeNames || request.LicenseTypeNameTH || request.LicenseTypeCode || 'Forklift';
    const requestKind = requestKindOf(request);
    const requestKindLabel = requestKind === 'RENEWAL' ? 'ต่ออายุใบอนุญาต / RENEWAL' : 'ออกใบอนุญาตใหม่ / NEW';
    const requiredDocLabels = requestRequiredDocuments(request).map(item => item.label).join(', ');
    const statusMap = {
        PENDING: { subject: 'คำขอใบอนุญาตรถยกรอตรวจสอบ', title: 'คำขอใบอนุญาตรถยกใหม่', badge: 'รอตรวจสอบ · PENDING', tone: '#b45309', soft: '#fffbeb', intro: 'มีคำขอใบอนุญาตรถยกใหม่เข้าสู่ระบบ กรุณาตรวจสอบรายละเอียดและดำเนินการอนุมัติหรือปฏิเสธ' },
        APPROVED: { subject: 'อนุมัติคำขอใบอนุญาตรถยกแล้ว', title: 'คำขอใบอนุญาตรถยกได้รับการอนุมัติ', badge: 'อนุมัติแล้ว · APPROVED', tone: '#047857', soft: '#ecfdf5', intro: 'คำขอได้รับการอนุมัติและระบบได้สร้างข้อมูลใบอนุญาตเรียบร้อยแล้ว' },
        REJECTED: { subject: 'คำขอใบอนุญาตรถยกไม่ผ่านการอนุมัติ', title: 'คำขอใบอนุญาตรถยกถูกปฏิเสธ', badge: 'ไม่อนุมัติ · REJECTED', tone: '#b91c1c', soft: '#fef2f2', intro: 'คำขอนี้ไม่ได้รับการอนุมัติ กรุณาตรวจสอบหมายเหตุจากผู้พิจารณาด้านล่าง' },
        CANCELLED: { subject: 'ยกเลิกคำขอใบอนุญาตรถยกแล้ว', title: 'คำขอใบอนุญาตรถยกถูกยกเลิก', badge: 'ยกเลิก · CANCELLED', tone: '#475569', soft: '#f1f5f9', intro: 'คำขอนี้ถูกยกเลิกแล้ว กรุณาตรวจสอบหมายเหตุประกอบด้านล่าง' },
    };
    const view = statusMap[status] || statusMap.PENDING;
    const subject = `[TSH Safety] ${view.subject} | ${request.RequestNo || '-'}`;
    const lines = [
        `Forklift license request ${status}`,
        `Request No.: ${request.RequestNo || '-'}`,
        `Employee: ${name} (${request.EmployeeID || '-'})`,
        `Request kind: ${requestKind}`,
        `Type: ${type}`,
        `Required documents: ${requiredDocLabels || '-'}`,
        `Issue: ${sqlDate(request.IssueDate)}`,
        `Expire: ${sqlDate(request.ExpireDate)}`,
    ];
    if (license) {
        lines.push(`License No.: ${license.LicenseNo || '-'}`);
        lines.push(`Card No.: ${license.CardNo || '-'}`);
    }
    if (String(request.ReviewNote || '').trim()) lines.push(`Review note: ${request.ReviewNote}`);
    const body = lines.join('\n');
    let rows = forkliftMailRow('เลขที่คำขอ / Request No.', request.RequestNo || '-', { strong: true })
        + forkliftMailRow('พนักงาน / Employee', `${name} (${request.EmployeeID || '-'})`)
        + forkliftMailRow('ประเภทคำขอ / Request Kind', requestKindLabel, { strong: true })
        + forkliftMailRow('ฝ่าย / Department', request.Department || request.DepartmentSnapshot || '-')
        + forkliftMailRow('ประเภท / License Type', type)
        + forkliftMailRow('เอกสารบังคับ / Required Documents', requiredDocLabels || '-')
        + forkliftMailRow('วันที่ออก / Issue Date', sqlDate(request.IssueDate))
        + forkliftMailRow('วันหมดอายุ / Expire Date', sqlDate(request.ExpireDate));
    if (license) {
        rows += forkliftMailRow('เลขที่ใบอนุญาต / License No.', license.LicenseNo || '-', { strong: true, color: '#047857' });
        rows += forkliftMailRow('เลขที่บัตร / Card No.', license.CardNo || '-', { strong: true });
    }
    const ctaUrl = license?.ID && appUrl ? `${String(appUrl).replace(/\/+$/, '')}/?forkliftLicense=${encodeURIComponent(license.ID)}#forklift` : '';
    const html = forkliftMailLayout({ tone: view.tone, soft: view.soft, eyebrow: 'TSH SAFETY · FORKLIFT LICENSE', title: view.title, subtitle: 'Forklift & Powered Industrial Truck License', badge: view.badge, intro: view.intro, rows, note: request.ReviewNote || '', ctaUrl });
    return { subject, body, html };
}

async function reportRows(query = {}) {
    const where = [], params = [];
    if (query.includeArchived !== '1' && query.includeArchived !== 'true') where.push('l.DeletedAt IS NULL');
    if (query.year) { where.push('YEAR(l.ExpireDate)=?'); params.push(Number(query.year)); }
    if (query.type && query.type !== 'all') { where.push('EXISTS (SELECT 1 FROM forklift_license_type_map lm WHERE lm.LicenseID=l.ID AND lm.LicenseTypeID=?)'); params.push(query.type); }
    if (query.department && query.department !== 'all') { where.push('COALESCE(e.Department,l.DepartmentSnapshot)=?'); params.push(query.department); }
    if (query.unit && query.unit !== 'all') { where.push('COALESCE(e.Unit,l.UnitSnapshot)=?'); params.push(query.unit); }
    if (query.expireDays) { where.push('l.ExpireDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)'); params.push(Math.max(0, Number(query.expireDays) || 0)); }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [raw] = await db.query(`${selectSql()}${whereSql} ORDER BY l.ExpireDate ASC,l.ID DESC`, params);
    let rows = await attachTypeNames(await attachEffective(raw));
    if (query.status && query.status !== 'all') rows = rows.filter(row => row.EffectiveStatus === query.status || String(row.CurrentStatus).toUpperCase() === query.status);
    const summary = { total: rows.length, active: 0, expiringSoon: 0, expired: 0, suspended: 0, archived: 0, missingCertificate: 0, byType: {}, byDepartment: {}, byUnit: {} };
    for (const row of rows) {
        if (row.EffectiveStatus === 'ACTIVE') summary.active++;
        if (row.EffectiveStatus === 'EXPIRING_SOON') summary.expiringSoon++;
        if (row.EffectiveStatus === 'EXPIRED') summary.expired++;
        if (row.EffectiveStatus === 'SUSPENDED') summary.suspended++;
        if (row.EffectiveStatus === 'ARCHIVED') summary.archived++;
        if (!String(row.CertificateNo || '').trim()) summary.missingCertificate++;
        const type = row.LicenseTypeNames || row.LicenseTypeNameTH || row.LicenseTypeCode || 'Unknown';
        const dept = row.Department || row.DepartmentSnapshot || 'ไม่ระบุ';
        const unit = row.Unit || row.UnitSnapshot || 'ไม่ระบุ';
        summary.byType[type] = (summary.byType[type] || 0) + 1;
        summary.byDepartment[dept] = (summary.byDepartment[dept] || 0) + 1;
        summary.byUnit[unit] = (summary.byUnit[unit] || 0) + 1;
    }
    return { rows, summary };
}

function validEmail(value) {
    const email = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function forkliftAdminEmail() {
    return process.env.FORKLIFT_ADMIN_EMAIL || process.env.SAFETY_ADMIN_EMAIL || process.env.ADMIN_EMAIL || process.env.HIYARI_ADMIN_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '';
}

function buildReminderMail(row, eventType = 'ExpiryReminder', appUrl = '') {
    const name = row.EmployeeName || row.EmployeeNameSnapshot || row.EmployeeID || '-';
    const expire = sqlDate(row.ExpireDate);
    const expired = eventType === 'ExpiredReminder';
    const subject = `[TSH Safety] ${expired ? 'ใบอนุญาตรถยกหมดอายุแล้ว' : 'แจ้งเตือนใบอนุญาตรถยกใกล้หมดอายุ'} | ${row.LicenseNo || row.CardNo || row.EmployeeID}`;
    const body = [
        `เรียน ${name}`,
        '',
        `ระบบแจ้งเตือนใบอนุญาต ${row.LicenseTypeNameTH || row.LicenseTypeCode || 'Forklift'} ของคุณ`,
        `License No.: ${row.LicenseNo || '-'}`,
        `Card No.: ${row.CardNo || '-'}`,
        `วันหมดอายุ: ${expire || '-'}`,
        `สถานะ: ${row.EffectiveStatus || '-'}`,
        '',
        'กรุณาติดต่อ Safety/Admin เพื่อดำเนินการต่ออายุหรือทบทวนข้อมูล',
    ].join('\n');
    const type = row.LicenseTypeNames || row.LicenseTypeNameTH || row.LicenseTypeCode || 'Forklift';
    const rows = forkliftMailRow('พนักงาน / Employee', `${name} (${row.EmployeeID || '-'})`)
        + forkliftMailRow('ประเภท / License Type', type)
        + forkliftMailRow('เลขที่ใบอนุญาต / License No.', row.LicenseNo || '-', { strong: true })
        + forkliftMailRow('เลขที่บัตร / Card No.', row.CardNo || '-')
        + forkliftMailRow('วันหมดอายุ / Expire Date', expire || '-', { strong: true, color: '#b91c1c' })
        + forkliftMailRow('สถานะ / Status', row.EffectiveStatus || '-', { strong: true, color: expired ? '#b91c1c' : '#b45309' });
    const html = forkliftMailLayout({
        tone: expired ? '#b91c1c' : '#b45309',
        soft: expired ? '#fef2f2' : '#fffbeb',
        eyebrow: 'TSH SAFETY · FORKLIFT LICENSE',
        title: expired ? 'ใบอนุญาตรถยกหมดอายุแล้ว' : 'ใบอนุญาตรถยกใกล้หมดอายุ',
        subtitle: 'Forklift License Expiry Notification',
        badge: expired ? 'หมดอายุ · EXPIRED' : 'ใกล้หมดอายุ · EXPIRING',
        intro: `เรียน <strong>${mailEscape(name)}</strong><br>กรุณาติดต่อ Safety/Admin เพื่อดำเนินการต่ออายุหรือตรวจสอบข้อมูลใบอนุญาต`,
        rows,
        ctaUrl: row.ID && appUrl ? `${String(appUrl).replace(/\/+$/, '')}/?forkliftLicense=${encodeURIComponent(row.ID)}#forklift` : '',
    });
    return { subject, body, html };
}

async function sendForkliftOutboxItem(id) {
    const [[item]] = await db.query('SELECT * FROM Forklift_EmailOutbox WHERE id=? LIMIT 1', [id]);
    if (!item) throw new Error('Email queue item not found.');
    if (!smtpConfigured()) {
        await db.query("UPDATE Forklift_EmailOutbox SET Status='Queued', Error=? WHERE id=?", ['SMTP not configured', id]).catch(() => {});
        return { status: 'Queued', sent: false, reason: 'SMTP not configured' };
    }
    try {
        const result = await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body || '', html: item.HtmlBody || null });
        if (result?.skipped) {
            await db.query("UPDATE Forklift_EmailOutbox SET Status='Queued', Error=? WHERE id=?", [result.reason || 'Skipped', id]);
            return { status: 'Queued', sent: false, reason: result.reason || 'Skipped' };
        }
        await db.query("UPDATE Forklift_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?", [id]);
        return { status: 'Sent', sent: true };
    } catch (err) {
        await db.query("UPDATE Forklift_EmailOutbox SET Status='Failed', Error=? WHERE id=?", [err.message || String(err), id]).catch(() => {});
        throw err;
    }
}

async function queueForkliftEmail({ licenseId, employeeId, eventType, recipients, subject, body, html }) {
    const [insert] = await db.query(
        'INSERT INTO Forklift_EmailOutbox(LicenseID,EmployeeID,EventType,Recipients,Subject,Body,HtmlBody,Status) VALUES(?,?,?,?,?,?,?,?)',
        [licenseId || null, employeeId || null, eventType || 'General', recipients, subject, body || '', html || null, 'Queued']
    );
    const outboxId = insert.insertId;
    const sent = outboxId ? await sendForkliftOutboxItem(outboxId).catch(err => ({ status: 'Failed', sent: false, reason: err.message })) : { status: 'Failed', sent: false, reason: 'Queue insert failed' };
    return { outboxId, ...sent };
}

async function reminderQueue(query = {}) {
    const days = Math.max(0, Math.min(365, Number(query.days || query.expireDays || (await warnDays())) || 60));
    const { rows } = await reportRows({});
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() + days);
    const [sentToday] = await db.query("SELECT LicenseID,EventType FROM Forklift_EmailOutbox WHERE CreatedAt>=CURDATE() AND EventType IN ('ExpiryReminder','ExpiredReminder') AND Status IN ('Queued','Sent')");
    const sentKeys = new Set(sentToday.map(row => `${row.LicenseID}:${row.EventType}`));
    return rows
        .filter(row => ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'].includes(row.EffectiveStatus))
        .filter(row => row.EffectiveStatus === 'EXPIRED' || new Date(`${sqlDate(row.ExpireDate)}T00:00:00`) <= cutoff)
        .map(row => {
            const email = validEmail(row.CompanyEmail || row.Email || row.EmployeeEmail);
            const admin = validEmail(forkliftAdminEmail());
            const recipients = [...new Set([email, admin].filter(Boolean))];
            const eventType = row.EffectiveStatus === 'EXPIRED' ? 'ExpiredReminder' : 'ExpiryReminder';
            const alreadySent = sentKeys.has(`${row.ID}:${eventType}`);
            return {
                key: `${row.ID}:${sqlDate(row.ExpireDate)}`,
                readiness: alreadySent ? 'already_sent_today' : (recipients.length ? 'ready' : 'missing_email'),
                reason: alreadySent ? 'Reminder already queued or sent today' : (recipients.length ? '' : 'ไม่พบ CompanyEmail หรือ admin email'),
                recipients,
                license: row,
                eventType,
            };
        });
}

function publicBaseUrl(req) {
    const configured = String(process.env.PUBLIC_APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
}

async function activeToken(conn, licenseId) {
    const [[existing]] = await conn.query('SELECT Token FROM forklift_verification_tokens WHERE LicenseID=? AND IsActive=1 AND RevokedAt IS NULL ORDER BY ID DESC LIMIT 1', [licenseId]);
    if (existing?.Token) return existing.Token;
    const token = crypto.randomBytes(32).toString('hex');
    await conn.query('INSERT INTO forklift_verification_tokens(LicenseID,Token) VALUES(?,?)', [licenseId, token]);
    return token;
}

async function cardPayload(req, licenseId, templateVersionId = null) {
    const [[licenseRaw]] = await db.query(`${selectSql()} WHERE l.ID=? AND l.DeletedAt IS NULL LIMIT 1`, [licenseId]);
    if (!licenseRaw) return null;
    const license = (await attachTypeNames(await attachEffective([licenseRaw])))[0];
    const licenseTypeIds = normalizeTypeIds(license.LicenseTypeIDs?.length ? license.LicenseTypeIDs : [license.LicenseTypeID]);
    const primaryTypeId = Number(license.LicenseTypeID || licenseTypeIds[0] || 0);
    const templateParams = [];
    let versionWhere = "v.Status='published'";
    if (templateVersionId) {
        versionWhere = 'v.ID=?';
        templateParams.push(templateVersionId);
    }
    const [candidateVersions] = await db.query(
        `SELECT v.*,tpl.TemplateName,tpl.LicenseTypeID AS TemplateLicenseTypeID,tpl.IsDefault
         FROM forklift_card_template_versions v
         JOIN forklift_card_templates tpl ON tpl.ID=v.TemplateID
         WHERE ${versionWhere} AND tpl.IsActive=1 AND tpl.ArchivedAt IS NULL
         ORDER BY tpl.IsDefault DESC, v.PublishedAt DESC, v.ID DESC`,
        templateParams
    );
    const templateIds = [...new Set(candidateVersions.map(row => row.TemplateID).filter(Boolean))];
    const templateTypes = new Map();
    if (templateIds.length) {
        const [maps] = await db.query('SELECT TemplateID,LicenseTypeID FROM forklift_card_template_type_map WHERE TemplateID IN (?) ORDER BY ID ASC', [templateIds]);
        for (const item of maps) {
            const list = templateTypes.get(item.TemplateID) || [];
            list.push(Number(item.LicenseTypeID));
            templateTypes.set(item.TemplateID, list);
        }
    }
    const rankedVersions = candidateVersions.map(row => {
        const mapped = templateTypes.get(row.TemplateID);
        const typeIds = normalizeTypeIds(mapped?.length ? mapped : (row.TemplateLicenseTypeID ? [row.TemplateLicenseTypeID] : []));
        let matchRank = null;
        if (typeIds.length === 0) matchRank = 20;
        else if (sameTypeSet(typeIds, licenseTypeIds)) matchRank = 0;
        else if (typeIds.length === 1 && licenseTypeIds.includes(typeIds[0])) matchRank = typeIds[0] === primaryTypeId ? 10 : 11;
        if (matchRank === null) return null;
        return { ...row, TemplateTypeIDs: typeIds, _matchRank: matchRank };
    }).filter(Boolean).sort((a, b) => {
        if (a._matchRank !== b._matchRank) return a._matchRank - b._matchRank;
        if (Number(a.IsDefault || 0) !== Number(b.IsDefault || 0)) return Number(b.IsDefault || 0) - Number(a.IsDefault || 0);
        const ap = a.PublishedAt ? new Date(a.PublishedAt).getTime() : 0;
        const bp = b.PublishedAt ? new Date(b.PublishedAt).getTime() : 0;
        if (ap !== bp) return bp - ap;
        return Number(b.ID || 0) - Number(a.ID || 0);
    });
    const version = rankedVersions[0] || null;
    if (!version) return { license, template: null, version: null, fields: [], values: {}, verification: null };
    const [fields] = await db.query('SELECT * FROM forklift_card_template_fields WHERE TemplateVersionID=? ORDER BY SortOrder ASC,ID ASC', [version.ID]);
    version.Fields = fields.map(normalizeField);
    const conn = await db.getConnection();
    let token;
    try {
        token = await activeToken(conn, license.ID);
    } finally {
        conn.release();
    }
    const verificationUrl = `${publicBaseUrl(req)}/api/forklift/verify/${encodeURIComponent(token)}`;
    const settings = await settingsMap().catch(() => ({}));
    const typedLicense = (await attachTypeNames([license]))[0] || license;
    const values = {
        employee_photo: await employeePhotoUrl(license.EmployeeID || ''),
        employee_name: license.EmployeeName || license.EmployeeNameSnapshot || '',
        employee_id: license.EmployeeID || '',
        department: license.Department || license.DepartmentSnapshot || '',
        unit: license.Unit || license.UnitSnapshot || '',
        position: license.Position || license.PositionSnapshot || '',
        license_no: license.LicenseNo || '',
        card_no: license.CardNo || '',
        issue_date: sqlDate(license.IssueDate),
        expire_date: sqlDate(license.ExpireDate),
        certificate_no: license.CertificateNo || '',
        license_type: typedLicense.LicenseTypeNames || license.LicenseTypeNameTH || license.LicenseTypeCode || '',
        manager_signature: settings.manager_signature_url || '',
        qr_code: verificationUrl,
        static_text: '',
    };
    return {
        license,
        template: { ID: version.TemplateID, TemplateName: version.TemplateName, LicenseTypeID: version.TemplateLicenseTypeID, LicenseTypeIDs: version.TemplateTypeIDs || [], IsDefault: version.IsDefault },
        version,
        fields: version.Fields,
        values,
        verification: { token, url: verificationUrl },
    };
}

async function publicVerify(req, res) {
    try {
        await ensure();
        const token = clean(req.params.token, 140);
        const [[row]] = await db.query(
            `${selectSql()} JOIN forklift_verification_tokens vt ON vt.LicenseID=l.ID
             WHERE vt.Token=? AND vt.IsActive=1 AND vt.RevokedAt IS NULL AND l.DeletedAt IS NULL LIMIT 1`,
            [token]
        );
        const wantsHtml = String(req.get('accept') || '').includes('text/html');
        if (!row) {
            if (wantsHtml) {
                return res.status(404).type('html').send(verifyHtml({ success: false, message: 'Verification token not found.' }));
            }
            return res.status(404).json({ success: false, message: 'Verification token not found.' });
        }
        await db.query('UPDATE forklift_verification_tokens SET LastAccessedAt=NOW(),AccessCount=AccessCount+1 WHERE Token=?', [token]);
        const license = (await attachEffective([row]))[0];
        const payload = {
            success: true,
            data: {
                valid: ['ACTIVE', 'EXPIRING_SOON'].includes(license.EffectiveStatus),
                status: license.EffectiveStatus,
                EmployeeID: license.EmployeeID,
                EmployeeName: license.EmployeeName || license.EmployeeNameSnapshot,
                EmployeePhotoUrl: await employeePhotoUrl(license.EmployeeID),
                Department: license.Department || license.DepartmentSnapshot,
                Unit: license.Unit || license.UnitSnapshot,
                Position: license.Position || license.PositionSnapshot,
                LicenseType: license.LicenseTypeNameTH || license.LicenseTypeCode,
                LicenseNo: license.LicenseNo,
                CardNo: license.CardNo,
                IssueDate: license.IssueDate,
                ExpireDate: license.ExpireDate,
                CertificateNo: license.CertificateNo,
            },
        };
        if (wantsHtml) return res.type('html').send(verifyHtml(payload));
        res.json(payload);
    } catch (err) {
        console.error('[forklift public verify]', err);
        res.status(500).json({ success: false, message: 'Verification failed.' });
    }
}

function verifyHtml(payload = {}) {
    const data = payload.data || {};
    const valid = Boolean(data.valid);
    const status = data.status || (payload.success ? 'UNKNOWN' : 'INVALID');
    const escHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    const rows = [
        ['Employee', `${data.EmployeeName || '-'} (${data.EmployeeID || '-'})`],
        ['Department / Unit', `${data.Department || '-'} / ${data.Unit || '-'}`],
        ['Position', data.Position || '-'],
        ['License type', data.LicenseType || '-'],
        ['License no.', data.LicenseNo || '-'],
        ['Card no.', data.CardNo || '-'],
        ['Issue date', sqlDate(data.IssueDate) || '-'],
        ['Expire date', sqlDate(data.ExpireDate) || '-'],
        ['Certificate no.', data.CertificateNo || '-'],
    ];
    const photo = data.EmployeePhotoUrl ? `<img class="photo" src="${escHtml(data.EmployeePhotoUrl)}" alt="${escHtml(data.EmployeeName || 'Employee photo')}">` : '';
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forklift License Verification</title><style>
body{margin:0;font-family:Kanit,Arial,sans-serif;background:#ecfdf5;color:#0f172a}.wrap{max-width:680px;margin:0 auto;padding:28px 16px}.card{background:#fff;border:1px solid #bbf7d0;border-radius:18px;box-shadow:0 16px 40px rgba(15,23,42,.12);overflow:hidden}.head{padding:22px;background:${valid ? '#047857' : '#b91c1c'};color:#fff}.photo{display:block;width:84px;height:104px;object-fit:cover;object-position:center;border-radius:10px;background:#fff;margin:14px 0 10px;box-shadow:0 0 0 3px rgba(255,255,255,.3)}.badge{display:inline-block;border-radius:999px;background:rgba(255,255,255,.18);padding:5px 10px;font-size:12px;font-weight:800}.title{font-size:24px;font-weight:900;margin:12px 0 4px}.body{padding:18px}.status{border-radius:14px;padding:14px;margin-bottom:14px;background:${valid ? '#ecfdf5' : '#fef2f2'};color:${valid ? '#047857' : '#b91c1c'};font-weight:900}.row{display:grid;grid-template-columns:150px 1fr;gap:10px;padding:11px 0;border-bottom:1px solid #e2e8f0}.label{color:#64748b;font-size:13px;font-weight:800}.value{font-weight:800}.foot{padding:14px 18px;background:#f8fafc;color:#64748b;font-size:12px}@media(max-width:520px){.row{grid-template-columns:1fr}.label{font-size:12px}.title{font-size:20px}}</style></head><body><main class="wrap"><section class="card"><div class="head"><span class="badge">TSH Safety Core</span>${photo}<h1 class="title">Forklift License Verification</h1><div>${escHtml(data.EmployeeName || payload.message || '-')}</div></div><div class="body"><div class="status">${valid ? 'VALID' : 'NOT VALID'} · ${escHtml(status)}</div>${payload.success ? rows.map(([label,value]) => `<div class="row"><div class="label">${escHtml(label)}</div><div class="value">${escHtml(value)}</div></div>`).join('') : `<p>${escHtml(payload.message || 'Verification failed.')}</p>`}</div><div class="foot">This page verifies the current forklift license status from TSH Safety Core Activity.</div></section></main></body></html>`;
}

router.use(async (req, res, next) => { try { await ensure(); next(); } catch (err) { console.error('[forklift]', err); res.status(500).json({ success: false, message: 'ไม่สามารถเตรียมโมดูลใบอนุญาตรถยกได้' }); } });

router.get('/permissions', async (req, res) => {
    const data = {};
    for (const p of PERMISSIONS) data[p] = await hasPermission(req, p);
    data.IS_ADMIN = isAdminReq(req);
    res.json({ success: true, data });
});

router.use(async (req, res, next) => { if (await requirePermission(req, res, 'FORKLIFT_VIEW')) next(); });

router.get('/license-types', async (req, res) => {
    const [rows] = await db.query('SELECT * FROM forklift_license_types ORDER BY SortOrder,NameTH');
    res.json({ success: true, data: rows });
});

router.get('/employees', async (req, res) => {
    const q = `%${clean(req.query.q, 100)}%`;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const [rows] = await db.query(`SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position FROM employees WHERE (?='%%' OR EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? OR Unit LIKE ? OR Position LIKE ?) ORDER BY EmployeeName LIMIT ${limit}`, [q,q,q,q,q,q]);
    res.json({ success: true, data: rows });
});

router.get('/dashboard', async (req, res) => {
    const [raw] = await db.query(`${selectSql()} WHERE l.DeletedAt IS NULL ORDER BY l.CreatedAt DESC`);
    const rows = await attachTypeNames(await attachEffective(raw));
    const counts = { distinctEmployees: new Set(rows.map(r => r.EmployeeID)).size, total: rows.length, forklift: 0, stacker: 0, active: 0, expiring60: 0, expiring30: 0, expiring7: 0, expired: 0, suspended: 0 };
    const byType = {}, byDepartment = {}, byUnit = {};
    const today = new Date(new Date().toISOString().slice(0, 10));
    for (const r of rows) {
        const codes = (r.LicenseTypes || []).map(type => type.Code).filter(Boolean);
        if (codes.includes('FORKLIFT') || r.LicenseTypeCode === 'FORKLIFT') counts.forklift++;
        if (codes.includes('STACKER') || r.LicenseTypeCode === 'STACKER') counts.stacker++;
        if (r.EffectiveStatus === 'ACTIVE') counts.active++;
        if (r.EffectiveStatus === 'EXPIRED') counts.expired++;
        if (r.EffectiveStatus === 'SUSPENDED') counts.suspended++;
        const days = r.ExpireDate ? (new Date(`${sqlDate(r.ExpireDate)}T00:00:00`) - today) / 86400000 : 99999;
        if (days >= 0 && days <= 60) counts.expiring60++;
        if (days >= 0 && days <= 30) counts.expiring30++;
        if (days >= 0 && days <= 7) counts.expiring7++;
        const typeLabel = r.LicenseTypeNames || r.LicenseTypeNameTH || r.LicenseTypeCode || 'Unknown';
        byType[typeLabel] = (byType[typeLabel] || 0) + 1;
        byDepartment[r.Department || r.DepartmentSnapshot || 'ไม่ระบุ'] = (byDepartment[r.Department || r.DepartmentSnapshot || 'ไม่ระบุ'] || 0) + 1;
        byUnit[r.Unit || r.UnitSnapshot || 'ไม่ระบุ'] = (byUnit[r.Unit || r.UnitSnapshot || 'ไม่ระบุ'] || 0) + 1;
    }
    const alerts = {
        expired: rows.filter(r => r.EffectiveStatus === 'EXPIRED').slice(0, 10),
        urgent7: rows.filter(r => {
            const days = r.ExpireDate ? (new Date(`${sqlDate(r.ExpireDate)}T00:00:00`) - today) / 86400000 : 99999;
            return days >= 0 && days <= 7;
        }).slice(0, 10),
        missingCertificate: rows.filter(r => !String(r.CertificateNo || '').trim()).slice(0, 10),
    };
    res.json({ success: true, data: { counts, byType, byDepartment, byUnit, recent: rows.slice(0, 8), alerts } });
});

router.get('/settings', async (req, res) => {
    res.json({ success: true, data: await settingsMap() });
});

router.put('/settings', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SETTINGS_MANAGE'))) return;
    const allowed = {
        expiry_warn_days_primary: [1, 365],
        expiry_warn_days_secondary: [1, 365],
        expiry_warn_days_urgent: [0, 90],
        default_validity_months: [1, 120],
        document_max_upload_mb: [1, 20],
        request_sla_days: [1, 30],
    };
    for (const [key, range] of Object.entries(allowed)) {
        if (req.body[key] === undefined) continue;
        const value = Math.max(range[0], Math.min(range[1], Number(req.body[key]) || range[0]));
        await db.query('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)', [key, String(value)]);
    }
    if (req.body.approval_queue_enabled !== undefined) {
        const value = req.body.approval_queue_enabled && String(req.body.approval_queue_enabled) !== '0' ? '1' : '0';
        await db.query('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)', ['approval_queue_enabled', value]);
    }
    await logAudit(req, { action: 'UPDATE_SETTINGS', module: 'forklift', targetType: 'forklift_settings', targetId: 'global', metadata: req.body, statusCode: 200 });
    res.json({ success: true, data: await settingsMap() });
});

router.post('/settings/manager-signature', upload.single('signature'), uploadCleanupGuard, async (req, res) => {
    const uploadedUrl = req.file?.publicUrl || req.file?.path || '';
    let allowed;
    try {
        allowed = await requirePermission(req, res, 'FORKLIFT_SETTINGS_MANAGE');
    } catch (err) {
        deleteLocalUpload(uploadedUrl);
        throw err;
    }
    if (!allowed) {
        deleteLocalUpload(uploadedUrl);
        return;
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No signature uploaded.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
        deleteLocalUpload(uploadedUrl);
        return res.status(400).json({ success: false, message: 'Signature must be JPG, PNG, or WebP.' });
    }
    let persisted = false;
    try {
        await db.query('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)', ['manager_signature_url', uploadedUrl]);
        persisted = true;
        markUploadPersisted(req);
        await logAudit(req, { action: 'UPDATE_SETTINGS', module: 'forklift', targetType: 'forklift_settings', targetId: 'manager_signature_url', metadata: { file: req.file.originalName || req.file.originalname }, statusCode: 200 });
        res.json({ success: true, data: await settingsMap() });
    } catch (err) {
        if (!persisted) deleteLocalUpload(uploadedUrl);
        throw err;
    }
});

router.delete('/settings/manager-signature', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SETTINGS_MANAGE'))) return;
    await db.query('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)', ['manager_signature_url', '']);
    await logAudit(req, { action: 'UPDATE_SETTINGS', module: 'forklift', targetType: 'forklift_settings', targetId: 'manager_signature_url', metadata: { removed: true }, statusCode: 200 });
    res.json({ success: true, data: await settingsMap() });
});

router.get('/reports', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_EXPORT'))) return;
    const data = await reportRows(req.query || {});
    res.json({ success: true, data: { ...data, generatedAt: new Date().toISOString() } });
});

router.get('/audit', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_AUDIT_VIEW'))) return;
    const where = ["Module='forklift'"], params = [];
    if (req.query.action && req.query.action !== 'all') { where.push('Action=?'); params.push(clean(req.query.action, 80)); }
    if (req.query.targetId) { where.push('TargetID=?'); params.push(clean(req.query.targetId, 100)); }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const [rows] = await db.query(`SELECT id,ActionTime,AdminID,AdminName,Role,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata FROM admin_auditlogs WHERE ${where.join(' AND ')} ORDER BY ActionTime DESC,id DESC LIMIT ${limit}`, params);
    res.json({ success: true, data: rows.map(row => ({ ...row, Metadata: typeof row.Metadata === 'string' ? JSON.parse(row.Metadata || '{}') : (row.Metadata || {}) })) });
});

router.get('/reminder-queue', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_EXPORT'))) return;
    const rows = await reminderQueue(req.query || {});
    res.json({
        success: true,
        data: {
            rows,
            ready: rows.filter(row => row.readiness === 'ready').length,
            missingEmail: rows.filter(row => row.readiness === 'missing_email').length,
            sentToday: rows.filter(row => row.readiness === 'already_sent_today').length,
            smtpConfigured: smtpConfigured(),
        },
    });
});

router.post('/reminders/send', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SETTINGS_MANAGE'))) return;
    const rows = await reminderQueue(req.body || {});
    const requested = Array.isArray(req.body?.keys) && req.body.keys.length ? new Set(req.body.keys.map(String)) : null;
    const targets = rows.filter(row => row.readiness === 'ready' && (!requested || requested.has(row.key)));
    const results = [];
    for (const target of targets) {
        const mail = buildReminderMail(target.license, target.eventType, publicBaseUrl(req));
        const queued = await queueForkliftEmail({
            licenseId: target.license.ID,
            employeeId: target.license.EmployeeID,
            eventType: target.eventType,
            recipients: target.recipients.join(','),
            subject: mail.subject,
            body: mail.body,
            html: mail.html,
        });
        results.push({ key: target.key, licenseId: target.license.ID, recipients: target.recipients, ...queued });
    }
    await logAudit(req, { action: 'SEND_REMINDERS', module: 'forklift', targetType: 'forklift_email', targetId: 'bulk', metadata: { requested: requested ? requested.size : 'all', queued: results.length }, statusCode: 200 });
    res.json({ success: true, data: { queued: results.length, results, smtpConfigured: smtpConfigured() } });
});

router.get('/email-outbox', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_AUDIT_VIEW'))) return;
    const where = [], params = [];
    if (req.query.status && req.query.status !== 'all') { where.push('Status=?'); params.push(clean(req.query.status, 30)); }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const sql = `SELECT id,LicenseID,EmployeeID,EventType,Recipients,Subject,Status,Error,SentAt,CreatedAt FROM Forklift_EmailOutbox${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY CreatedAt DESC,id DESC LIMIT ${limit}`;
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows, smtpConfigured: smtpConfigured() });
});

router.post('/email-outbox/retry-queued', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SETTINGS_MANAGE'))) return;
    if (!smtpConfigured()) return res.status(400).json({ success: false, message: 'SMTP is not configured.' });
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 50);
    const [rows] = await db.query("SELECT id FROM Forklift_EmailOutbox WHERE Status IN ('Queued','Failed') ORDER BY CreatedAt ASC,id ASC LIMIT ?", [limit]);
    const results = [];
    for (const row of rows) {
        try { results.push({ id: row.id, ...(await sendForkliftOutboxItem(row.id)) }); }
        catch (err) { results.push({ id: row.id, status: 'Failed', error: err.message }); }
    }
    res.json({ success: true, data: results, processed: results.length });
});

router.post('/email-outbox/:id/retry', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SETTINGS_MANAGE'))) return;
    if (!smtpConfigured()) return res.status(400).json({ success: false, message: 'SMTP is not configured.' });
    const result = await sendForkliftOutboxItem(req.params.id);
    res.json({ success: true, data: result });
});

router.post('/licenses/bulk-renew', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_RENEW'))) return;
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ success: false, message: 'No licenses selected.' });
    const newIssue = validDate(req.body.NewIssueDate || req.body.IssueDate);
    const newExpire = validDate(req.body.NewExpireDate || req.body.ExpireDate);
    if (!newIssue || !newExpire || new Date(newExpire) < new Date(newIssue)) return res.status(400).json({ success: false, message: 'ข้อมูลการต่ออายุไม่ถูกต้อง' });
    const results = [];
    let ok = 0, failed = 0;
    for (const id of ids) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [[row]] = await conn.query('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL', [id]);
            if (!row) throw new Error('License not found.');
            const newCert = clean(req.body.NewCertificateNo || req.body.CertificateNo, 120) || row.CertificateNo || null;
            await conn.query('INSERT INTO forklift_license_renewals(LicenseID,OldIssueDate,NewIssueDate,OldExpireDate,NewExpireDate,OldCertificateNo,NewCertificateNo,RenewalNote,OperatedBy) VALUES(?,?,?,?,?,?,?,?,?)', [id, row.IssueDate, newIssue, row.ExpireDate, newExpire, row.CertificateNo, newCert, req.body.RenewalNote || 'Bulk renewal campaign', userName(req)]);
            await conn.query("UPDATE forklift_licenses SET IssueDate=?,LastRenewalDate=CURDATE(),ExpireDate=?,CertificateNo=?,CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=?", [newIssue, newExpire, newCert, userName(req), id]);
            await conn.commit();
            ok += 1;
            results.push({ id, success: true });
        } catch (err) {
            await conn.rollback().catch(() => {});
            failed += 1;
            results.push({ id, success: false, message: err.message });
        } finally {
            conn.release();
        }
    }
    await logAudit(req, { action: 'BULK_RENEW_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: 'bulk', metadata: { requested: ids.length, success: ok, failed, newExpireDate: newExpire }, statusCode: 200 });
    res.json({ success: true, data: { requested: ids.length, success: ok, failed, results } });
});

router.post('/licenses/bulk-status', async (req, res) => {
    const action = clean(req.body?.action, 30).toUpperCase();
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ success: false, message: 'No licenses selected.' });
    if (!['SUSPEND', 'RESTORE', 'ARCHIVE'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid bulk action.' });
    if (!(await requirePermission(req, res, action === 'ARCHIVE' ? 'FORKLIFT_MANAGE' : 'FORKLIFT_SUSPEND'))) return;
    const reason = clean(req.body.reason || req.body.ReviewNote || '', 500);
    const results = [];
    let ok = 0, failed = 0;
    for (const id of ids) {
        try {
            let result;
            if (action === 'SUSPEND') [result] = await db.query("UPDATE forklift_licenses SET CurrentStatus='SUSPENDED',SuspensionReason=?,SuspendedAt=NOW(),UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL", [reason || 'Bulk suspend', userName(req), id]);
            else if (action === 'RESTORE') [result] = await db.query("UPDATE forklift_licenses SET CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL", [userName(req), id]);
            else [result] = await db.query("UPDATE forklift_licenses SET CurrentStatus='ARCHIVED',DeletedAt=NOW(),DeletedBy=? WHERE ID=? AND DeletedAt IS NULL", [userName(req), id]);
            if (Number(result?.affectedRows || 0) !== 1) throw new Error('License not found or state did not change.');
            ok += 1;
            results.push({ id, success: true });
        } catch (err) {
            failed += 1;
            results.push({ id, success: false, message: err.message });
        }
    }
    await logAudit(req, { action: `BULK_${action}_LICENSE`, module: 'forklift', targetType: 'forklift_license', targetId: 'bulk', metadata: { requested: ids.length, success: ok, failed, reason }, statusCode: 200 });
    res.json({ success: true, data: { requested: ids.length, success: ok, failed, results } });
});

router.get('/requests', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const where = [], params = [];
    const global = (await hasPermission(req, 'FORKLIFT_MANAGE')) || (await hasPermission(req, 'FORKLIFT_APPROVE'));
    if (!global) { where.push('(r.EmployeeID=? OR r.RequestedByID=?)'); params.push(userId(req), userId(req)); }
    if (req.query.status && req.query.status !== 'all') { where.push('r.RequestStatus=?'); params.push(clean(req.query.status, 30).toUpperCase()); }
    if (req.query.kind && req.query.kind !== 'all') { where.push('r.RequestKind=?'); params.push(clean(req.query.kind, 20).toUpperCase()); }
    if (String(req.query.overdue || '') === '1') {
        const [[setting]] = await db.query("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1");
        where.push("r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>?");
        params.push(Math.max(1, Math.min(30, Number(setting?.SettingValue) || 3)));
    }
    if (req.query.q) {
        const q = `%${clean(req.query.q, 100)}%`;
        where.push('(r.RequestNo LIKE ? OR r.EmployeeID LIKE ? OR e.EmployeeName LIKE ?)');
        params.push(q, q, q);
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const [rows] = await db.query(`${requestSelectSql()}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY CASE r.RequestStatus WHEN 'SUBMITTED' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'RETURNED' THEN 3 WHEN 'DRAFT' THEN 4 WHEN 'APPROVED' THEN 5 WHEN 'REJECTED' THEN 6 ELSE 7 END,COALESCE(r.SubmittedAt,r.RequestedAt) DESC,r.ID DESC LIMIT ${limit}`, params);
    res.json({ success: true, data: await attachTypeNames(rows, 'ID', 'forklift_request_type_map', 'RequestID') });
});

router.get('/request-profile', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const emp = await employee(userId(req));
    if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้ใน Employee Master' });
    res.json({ success: true, data: emp });
});

router.post('/requests', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const manage = await hasPermission(req, 'FORKLIFT_MANAGE');
    const emp = await employee(manage ? clean(req.body.EmployeeID, 50) : userId(req));
    if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงานใน Employee Master' });
    const typeIds = parseTypeIds(req.body);
    const type = typeIds[0] || 0, issue = validDate(req.body.IssueDate), expire = validDate(req.body.ExpireDate);
    if (!type || !issue || !expire || new Date(expire) < new Date(issue)) return res.status(400).json({ success: false, message: 'ข้อมูลคำขอใบอนุญาตไม่ถูกต้อง' });
    const dupeLicense = await hasActiveLicenseForAnyType(emp.EmployeeID, typeIds);
    if (dupeLicense) return res.status(409).json({ success: false, message: 'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว' });
    const dupeRequest = await hasPendingRequestForAnyType(emp.EmployeeID, typeIds);
    if (dupeRequest) return res.status(409).json({ success: false, message: 'มีคำขอที่รออนุมัติอยู่แล้ว' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const requestNo = await nextNo(conn, 'REQUEST', 'FLR');
        const [insert] = await conn.query("INSERT INTO forklift_license_requests(RequestNo,RequestKind,EmployeeID,LicenseTypeID,IssueDate,ExpireDate,CertificateNo,RequestStatus,RequestNote,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,RequestedBy,RequestedByID) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [requestNo, 'NEW', emp.EmployeeID, type, issue, expire, clean(req.body.CertificateNo, 120) || null, 'DRAFT', req.body.Note || req.body.RequestNote || null, emp.EmployeeName, emp.Department, emp.Unit, emp.Position, userName(req), userId(req)]);
        await syncTypeMap(conn, 'forklift_request_type_map', 'RequestID', insert.insertId, typeIds);
        await requestEvent(conn, req, insert.insertId, 'CREATED', null, 'DRAFT');
        await conn.commit();
        await logAudit(req, { action: 'CREATE_REQUEST_DRAFT', module: 'forklift', targetType: 'forklift_license_request', targetId: insert.insertId, metadata: { RequestNo: requestNo, EmployeeID: emp.EmployeeID }, statusCode: 201 });
        res.status(201).json({ success: true, id: insert.insertId, RequestNo: requestNo, RequestStatus: 'DRAFT' });
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.post('/licenses/:id/renewal-request', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const [[license]] = await db.query('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL', [req.params.id]);
    if (!license) return res.status(404).json({ success: false, message: 'License not found.' });
    const manage = await hasPermission(req, 'FORKLIFT_MANAGE');
    if (!manage && String(license.EmployeeID) !== userId(req)) return res.status(403).json({ success: false, message: 'You can only renew your own license.' });
    const [[existing]] = await db.query("SELECT ID FROM forklift_license_requests WHERE SourceLicenseID=? AND RequestKind='RENEWAL' AND RequestStatus IN ('DRAFT','RETURNED','SUBMITTED','UNDER_REVIEW','PENDING') LIMIT 1", [license.ID]);
    if (existing) return res.status(409).json({ success: false, message: 'A renewal request is already open for this license.', id: existing.ID });
    const issue = validDate(req.body.NewIssueDate || req.body.IssueDate);
    const expire = validDate(req.body.NewExpireDate || req.body.ExpireDate);
    if (!issue || !expire || new Date(expire) < new Date(issue)) return res.status(400).json({ success: false, message: 'Invalid renewal dates.' });
    const emp = await employee(license.EmployeeID);
    const [mappedTypes] = await db.query('SELECT LicenseTypeID FROM forklift_license_type_map WHERE LicenseID=? ORDER BY ID ASC', [license.ID]);
    const typeIds = mappedTypes.length ? mappedTypes.map(row => Number(row.LicenseTypeID)).filter(Boolean) : [Number(license.LicenseTypeID)];
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const requestNo = await nextNo(conn, 'REQUEST', 'FLR');
        const [insert] = await conn.query("INSERT INTO forklift_license_requests(RequestNo,RequestKind,SourceLicenseID,EmployeeID,LicenseTypeID,IssueDate,ExpireDate,CertificateNo,RequestStatus,RequestNote,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,RequestedBy,RequestedByID) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [requestNo, 'RENEWAL', license.ID, license.EmployeeID, license.LicenseTypeID, issue, expire, clean(req.body.NewCertificateNo || req.body.CertificateNo, 120) || license.CertificateNo || null, 'DRAFT', req.body.RenewalNote || req.body.Note || null, emp?.EmployeeName || license.EmployeeNameSnapshot, emp?.Department || license.DepartmentSnapshot, emp?.Unit || license.UnitSnapshot, emp?.Position || license.PositionSnapshot, userName(req), userId(req)]);
        await syncTypeMap(conn, 'forklift_request_type_map', 'RequestID', insert.insertId, typeIds);
        await requestEvent(conn, req, insert.insertId, 'RENEWAL_DRAFT_CREATED', null, 'DRAFT', `License ${license.LicenseNo || license.ID}`);
        await conn.commit();
        await logAudit(req, { action: 'CREATE_RENEWAL_REQUEST_DRAFT', module: 'forklift', targetType: 'forklift_license_request', targetId: insert.insertId, metadata: { SourceLicenseID: license.ID, EmployeeID: license.EmployeeID }, statusCode: 201 });
        res.status(201).json({ success: true, id: insert.insertId, RequestNo: requestNo, RequestStatus: 'DRAFT', RequestKind: 'RENEWAL' });
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.get('/requests/summary', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const global = (await hasPermission(req, 'FORKLIFT_MANAGE')) || (await hasPermission(req, 'FORKLIFT_APPROVE'));
    const [[setting]] = await db.query("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1");
    const slaDays = Math.max(1, Math.min(30, Number(setting?.SettingValue) || 3));
    const where = global ? '' : 'WHERE (r.EmployeeID=? OR r.RequestedByID=?)';
    const params = global ? [] : [userId(req), userId(req)];
    const [[row]] = await db.query(`SELECT COUNT(*) total,
        SUM(r.RequestStatus='DRAFT') draft,
        SUM(r.RequestStatus='RETURNED') returned,
        SUM(r.RequestStatus IN ('SUBMITTED','PENDING')) submitted,
        SUM(r.RequestStatus='UNDER_REVIEW') underReview,
        SUM(r.RequestStatus='APPROVED') approved,
        SUM(r.RequestStatus='REJECTED') rejected,
        SUM(r.RequestKind='RENEWAL') renewals,
        SUM(r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>?) overdue,
        ROUND(AVG(CASE WHEN r.ReviewedAt IS NOT NULL AND r.SubmittedAt IS NOT NULL THEN TIMESTAMPDIFF(HOUR,r.SubmittedAt,r.ReviewedAt) END),1) avgReviewHours
        FROM forklift_license_requests r ${where}`, [slaDays, ...params]);
    res.json({ success: true, data: { ...row, slaDays, scope: global ? 'ALL' : 'SELF' } });
});

router.get('/requests/overdue', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_APPROVE'))) return;
    const [[setting]] = await db.query("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1");
    const slaDays = Math.max(1, Math.min(30, Number(setting?.SettingValue) || 3));
    const [rows] = await db.query(`${requestSelectSql()} WHERE r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>? ORDER BY COALESCE(r.SubmittedAt,r.RequestedAt) ASC`, [slaDays]);
    res.json({ success: true, data: (await attachTypeNames(rows, 'ID', 'forklift_request_type_map', 'RequestID')).map(row => ({ ...row, AgeDays: Math.max(0, Math.floor((Date.now() - new Date(row.SubmittedAt || row.RequestedAt).getTime()) / 86400000)), SlaDays: slaDays })) });
});

router.post('/requests/escalations/send', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_APPROVE'))) return;
    const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Boolean))];
    const [[setting]] = await db.query("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1");
    const slaDays = Math.max(1, Math.min(30, Number(setting?.SettingValue) || 3));
    const params = [slaDays];
    const idSql = ids.length ? ` AND r.ID IN (${ids.map(() => '?').join(',')})` : '';
    params.push(...ids);
    const [rows] = await db.query(`${requestSelectSql()} WHERE r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>?${idSql} ORDER BY r.ID`, params);
    const recipient = validEmail(forkliftAdminEmail());
    if (!recipient) return res.status(400).json({ success: false, message: 'Forklift admin email is not configured.' });
    let queued = 0;
    for (const row of rows) {
        const ageDays = Math.max(0, Math.floor((Date.now() - new Date(row.SubmittedAt || row.RequestedAt).getTime()) / 86400000));
        const subject = `[SLA] Forklift request ${row.RequestNo} overdue ${ageDays} days`;
        const body = `Forklift request ${row.RequestNo} for ${row.EmployeeName || row.EmployeeID} is ${ageDays} days old (SLA ${slaDays} days).`;
        await queueForkliftEmail({ employeeId: row.EmployeeID, eventType: 'ForkliftRequestSlaEscalation', recipients: recipient, subject, body, html: `<p>${mailEscape(body)}</p>` });
        const conn = await db.getConnection();
        try { await requestEvent(conn, req, row.ID, 'SLA_ESCALATED', row.RequestStatus, row.RequestStatus, `${ageDays} days`); } finally { conn.release(); }
        queued += 1;
    }
    await logAudit(req, { action: 'ESCALATE_OVERDUE_REQUESTS', module: 'forklift', targetType: 'forklift_license_request', targetId: 'bulk', metadata: { requested: ids.length || 'all', queued, slaDays }, statusCode: 200 });
    res.json({ success: true, data: { queued, slaDays } });
});

router.get('/requests/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const detail = await requestDetail(req, req.params.id);
    if (!detail) return res.status(404).json({ success: false, message: 'Request not found.' });
    res.json({ success: true, data: detail });
});

router.post('/requests/:id/documents', upload.single('file'), uploadCleanupGuard, async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const [[request]] = await db.query('SELECT * FROM forklift_license_requests WHERE ID=?', [req.params.id]);
    if (!request || !(await requestCanAccess(req, request)) || !['DRAFT', 'RETURNED'].includes(String(request.RequestStatus))) {
        if (req.file) deleteLocalUpload(req.file.publicUrl || req.file.path);
        return res.status(request ? 409 : 404).json({ success: false, message: request ? 'Documents cannot be changed after submission.' : 'Request not found.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    const type = clean(req.body.DocumentType, 40).toUpperCase();
    const meta = requestDocumentMeta(type);
    if (!meta || !meta.mimeTypes.includes(req.file.mimetype)) {
        deleteLocalUpload(req.file.publicUrl || req.file.path);
        return res.status(400).json({ success: false, message: 'Invalid document type or file format.' });
    }
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE forklift_request_documents SET DeletedAt=NOW(),DeletedBy=? WHERE RequestID=? AND DocumentType=? AND DeletedAt IS NULL', [userName(req), req.params.id, type]);
        const [insert] = await conn.query('INSERT INTO forklift_request_documents(RequestID,DocumentType,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?,?)', [req.params.id, type, req.file.originalName || req.file.originalname, req.file.storedName || req.file.filename, req.file.publicUrl || req.file.path, req.file.mimetype, req.file.size, userName(req)]);
        await requestEvent(conn, req, req.params.id, 'DOCUMENT_UPLOADED', request.RequestStatus, request.RequestStatus, type);
        await conn.commit();
        markUploadPersisted(req);
        await logAudit(req, { action: 'UPLOAD_REQUEST_DOCUMENT', module: 'forklift', targetType: 'forklift_request_document', targetId: insert.insertId, metadata: { RequestID: req.params.id, DocumentType: type }, statusCode: 201 });
        res.status(201).json({ success: true, id: insert.insertId });
    } catch (err) { await conn.rollback(); if (!req.forkliftUploadPersisted) deleteLocalUpload(req.file.publicUrl || req.file.path); throw err; } finally { conn.release(); }
});

router.delete('/request-documents/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const [[doc]] = await db.query('SELECT d.*,r.EmployeeID,r.RequestedByID,r.RequestStatus FROM forklift_request_documents d JOIN forklift_license_requests r ON r.ID=d.RequestID WHERE d.ID=? AND d.DeletedAt IS NULL', [req.params.id]);
    if (!doc || !(await requestCanAccess(req, doc))) return res.status(404).json({ success: false, message: 'Document not found.' });
    if (!['DRAFT', 'RETURNED'].includes(String(doc.RequestStatus))) return res.status(409).json({ success: false, message: 'Document cannot be removed after submission.' });
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); await conn.query('UPDATE forklift_request_documents SET DeletedAt=NOW(),DeletedBy=? WHERE ID=?', [userName(req), req.params.id]); await requestEvent(conn, req, doc.RequestID, 'DOCUMENT_REMOVED', doc.RequestStatus, doc.RequestStatus, doc.DocumentType); await conn.commit(); res.json({ success: true }); }
    catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.post('/requests/:id/submit', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const [[request]] = await db.query('SELECT * FROM forklift_license_requests WHERE ID=?', [req.params.id]);
    if (!request || !(await requestCanAccess(req, request))) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (!['DRAFT', 'RETURNED'].includes(String(request.RequestStatus))) return res.status(409).json({ success: false, message: 'Request is not ready for submission.' });
    const detail = await requestDetail(req, req.params.id);
    if (!detail.CanSubmit) return res.status(409).json({ success: false, message: 'Required documents are incomplete.', checklist: detail.Checklist });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query("UPDATE forklift_license_requests SET RequestStatus='SUBMITTED',SubmittedAt=NOW(),ReviewNote=NULL,ReturnedAt=NULL WHERE ID=?", [req.params.id]);
        await requestEvent(conn, req, req.params.id, 'SUBMITTED', request.RequestStatus, 'SUBMITTED');
        await conn.commit();
        const [[updated]] = await db.query(`${requestSelectSql()} WHERE r.ID=? LIMIT 1`, [req.params.id]);
        const admin = validEmail(forkliftAdminEmail());
        if (admin) { try { const mail = buildRequestMail(updated, 'Pending', null, publicBaseUrl(req)); await queueForkliftEmail({ employeeId: request.EmployeeID, eventType: 'ForkliftRequestSubmitted', recipients: admin, subject: mail.subject, body: mail.body, html: mail.html }); } catch (err) { console.warn('[forklift request email]', err.message); } }
        await logAudit(req, { action: 'SUBMIT_REQUEST', module: 'forklift', targetType: 'forklift_license_request', targetId: req.params.id, statusCode: 200 });
        res.json({ success: true });
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.post('/requests/:id/start-review', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_APPROVE'))) return;
    const [[request]] = await db.query('SELECT * FROM forklift_license_requests WHERE ID=?', [req.params.id]);
    if (!request || !['SUBMITTED', 'PENDING'].includes(String(request.RequestStatus))) return res.status(409).json({ success: false, message: 'Request is not awaiting review.' });
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); await conn.query("UPDATE forklift_license_requests SET RequestStatus='UNDER_REVIEW',ReviewedBy=?,ReviewStartedAt=NOW() WHERE ID=?", [userName(req), req.params.id]); await requestEvent(conn, req, req.params.id, 'REVIEW_STARTED', request.RequestStatus, 'UNDER_REVIEW'); await conn.commit(); res.json({ success: true }); }
    catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.post('/requests/:id/return', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_APPROVE'))) return;
    const note = clean(req.body.ReviewNote || req.body.reason || '', 1000);
    if (!note) return res.status(400).json({ success: false, message: 'Return reason is required.' });
    const [[request]] = await db.query('SELECT * FROM forklift_license_requests WHERE ID=?', [req.params.id]);
    if (!request || !['SUBMITTED', 'UNDER_REVIEW', 'PENDING'].includes(String(request.RequestStatus))) return res.status(409).json({ success: false, message: 'Request cannot be returned.' });
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); await conn.query("UPDATE forklift_license_requests SET RequestStatus='RETURNED',ReviewNote=?,ReviewedBy=?,ReturnedAt=NOW() WHERE ID=?", [note, userName(req), req.params.id]); await requestEvent(conn, req, req.params.id, 'RETURNED', request.RequestStatus, 'RETURNED', note); await conn.commit(); const [[updated]] = await db.query(`${requestSelectSql()} WHERE r.ID=? LIMIT 1`, [req.params.id]); const recipient = validEmail(updated?.CompanyEmail); if (recipient) { try { const mail = buildRequestMail(updated, 'Returned', null, publicBaseUrl(req)); await queueForkliftEmail({ employeeId: updated.EmployeeID, eventType: 'ForkliftRequestReturned', recipients: recipient, subject: mail.subject, body: mail.body, html: mail.html }); } catch (err) { console.warn('[forklift request email]', err.message); } } await logAudit(req, { action: 'RETURN_REQUEST', module: 'forklift', targetType: 'forklift_license_request', targetId: req.params.id, metadata: { ReviewNote: note }, statusCode: 200 }); res.json({ success: true }); }
    catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.post('/requests/:id/approve', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_APPROVE'))) return;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[request]] = await conn.query('SELECT * FROM forklift_license_requests WHERE ID=? FOR UPDATE', [req.params.id]);
        if (!request) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Request not found.' }); }
        if (!['SUBMITTED', 'UNDER_REVIEW', 'PENDING'].includes(String(request.RequestStatus))) { await conn.rollback(); return res.status(409).json({ success: false, message: 'Request is not ready for approval.' }); }
        const selfApproval = String(request.RequestedByID || request.EmployeeID || '') === userId(req);
        const overrideReason = clean(req.body.OverrideReason || '', 500);
        if (selfApproval && !(roleOf(req).toLowerCase() === 'admin' && overrideReason)) { await conn.rollback(); return res.status(403).json({ success: false, message: 'The requester cannot approve this request. Admin override requires a reason.' }); }
        const [requestDocs] = await conn.query('SELECT DocumentType FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL', [req.params.id]);
        const presentDocs = new Set(requestDocs.map(doc => doc.DocumentType));
        const missingDocs = requestRequiredDocuments(request).filter(item => !presentDocs.has(item.type));
        if (missingDocs.length) {
            await conn.rollback();
            return res.status(409).json({ success: false, message: 'Required documents are incomplete.', checklist: requestDocumentItems(request).map(item => ({ ...item, complete: presentDocs.has(item.type) })) });
        }
        const [requestTypes] = await conn.query('SELECT LicenseTypeID FROM forklift_request_type_map WHERE RequestID=? ORDER BY ID ASC', [req.params.id]);
        const typeIds = requestTypes.length ? requestTypes.map(row => Number(row.LicenseTypeID)).filter(Boolean) : [Number(request.LicenseTypeID)];
        const renewal = String(request.RequestKind).toUpperCase() === 'RENEWAL';
        let licenseId, licenseNo, cardNo;
        if (renewal) {
            const [[source]] = await conn.query('SELECT * FROM forklift_licenses WHERE ID=? AND EmployeeID=? AND DeletedAt IS NULL FOR UPDATE', [request.SourceLicenseID, request.EmployeeID]);
            if (!source) { await conn.rollback(); return res.status(409).json({ success: false, message: 'Source license is unavailable for renewal.' }); }
            await conn.query('INSERT INTO forklift_license_renewals(LicenseID,OldIssueDate,NewIssueDate,OldExpireDate,NewExpireDate,OldCertificateNo,NewCertificateNo,RenewalNote,OperatedBy) VALUES(?,?,?,?,?,?,?,?,?)', [source.ID, source.IssueDate, sqlDate(request.IssueDate), source.ExpireDate, sqlDate(request.ExpireDate), source.CertificateNo, request.CertificateNo || source.CertificateNo, request.RequestNote || req.body.ReviewNote || null, userName(req)]);
            await conn.query("UPDATE forklift_licenses SET IssueDate=?,LastRenewalDate=CURDATE(),ExpireDate=?,CertificateNo=?,CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=?", [sqlDate(request.IssueDate), sqlDate(request.ExpireDate), request.CertificateNo || source.CertificateNo, userName(req), source.ID]);
            licenseId = Number(source.ID); licenseNo = source.LicenseNo; cardNo = source.CardNo;
        } else {
            const dupe = await hasActiveLicenseForAnyType(request.EmployeeID, typeIds, null, conn);
            if (dupe) { await conn.rollback(); return res.status(409).json({ success: false, message: 'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว' }); }
            licenseNo = await nextNo(conn, 'LICENSE', 'FL');
            cardNo = await nextNo(conn, 'CARD', 'FLC');
            const [insert] = await conn.query('INSERT INTO forklift_licenses(EmployeeID,LicenseTypeID,LicenseNo,CardNo,IssueDate,ExpireDate,CertificateNo,CurrentStatus,Note,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [request.EmployeeID, request.LicenseTypeID, licenseNo, cardNo, sqlDate(request.IssueDate), sqlDate(request.ExpireDate), request.CertificateNo || null, 'ACTIVE', request.RequestNote || null, request.EmployeeNameSnapshot, request.DepartmentSnapshot, request.UnitSnapshot, request.PositionSnapshot, userName(req)]);
            licenseId = Number(insert.insertId);
            await syncTypeMap(conn, 'forklift_license_type_map', 'LicenseID', licenseId, typeIds);
            await conn.query('INSERT INTO forklift_verification_tokens(LicenseID,Token) VALUES(?,?)', [licenseId, crypto.randomBytes(32).toString('hex')]);
        }
        const copiedDocumentCount = await carryOverRequestDocuments(conn, req.params.id, licenseId, request.EmployeeID, userName(req));
        await conn.query("UPDATE forklift_license_requests SET RequestStatus='APPROVED',ReviewNote=?,LicenseID=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=?", [req.body.ReviewNote || overrideReason || null, licenseId, userName(req), req.params.id]);
        await requestEvent(conn, req, req.params.id, 'APPROVED', request.RequestStatus, 'APPROVED', req.body.ReviewNote || overrideReason || '');
        await conn.commit();
        const [[requestFull]] = await db.query(`${requestSelectSql()} WHERE r.ID=? LIMIT 1`, [req.params.id]);
        const [[license]] = await db.query(`${selectSql()} WHERE l.ID=? LIMIT 1`, [licenseId]);
        const recipients = [...new Set([validEmail(requestFull.CompanyEmail), validEmail(forkliftAdminEmail())].filter(Boolean))];
        if (recipients.length) {
            try {
                const mail = buildRequestMail(requestFull, 'Approved', license, publicBaseUrl(req));
                await queueForkliftEmail({ licenseId, employeeId: requestFull.EmployeeID, eventType: renewal ? 'ForkliftRenewalRequestApproved' : 'ForkliftRequestApproved', recipients: recipients.join(','), subject: mail.subject, body: mail.body, html: mail.html });
            } catch (err) { console.warn('[forklift request email]', err.message); }
        }
        await logAudit(req, { action: renewal ? 'APPROVE_RENEWAL_REQUEST' : 'APPROVE_REQUEST', module: 'forklift', targetType: 'forklift_license_request', targetId: req.params.id, metadata: { LicenseID: licenseId, LicenseNo: licenseNo, copiedDocumentCount }, statusCode: 200 });
        res.json({ success: true, id: licenseId, LicenseNo: licenseNo, CardNo: cardNo, RequestKind: renewal ? 'RENEWAL' : 'NEW', copiedDocumentCount });
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.post('/requests/:id/reject', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_APPROVE'))) return;
    const note = clean(req.body.ReviewNote || req.body.reason || '', 500);
    if (!note) return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    const [[before]] = await db.query('SELECT * FROM forklift_license_requests WHERE ID=?', [req.params.id]);
    if (!before) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (!['SUBMITTED', 'UNDER_REVIEW', 'PENDING'].includes(String(before.RequestStatus))) return res.status(409).json({ success: false, message: 'Request cannot be rejected.' });
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); await conn.query("UPDATE forklift_license_requests SET RequestStatus='REJECTED',ReviewNote=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=?", [note, userName(req), req.params.id]); await requestEvent(conn, req, req.params.id, 'REJECTED', before.RequestStatus, 'REJECTED', note); await conn.commit(); }
    catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
    const [[request]] = await db.query(`${requestSelectSql()} WHERE r.ID=? LIMIT 1`, [req.params.id]);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    const recipients = [...new Set([validEmail(request.CompanyEmail), validEmail(forkliftAdminEmail())].filter(Boolean))];
    if (recipients.length) {
        try {
            const mail = buildRequestMail(request, 'Rejected');
            await queueForkliftEmail({ employeeId: request.EmployeeID, eventType: 'ForkliftRequestRejected', recipients: recipients.join(','), subject: mail.subject, body: mail.body, html: mail.html });
        } catch (err) { console.warn('[forklift request email]', err.message); }
    }
    await logAudit(req, { action: 'REJECT_REQUEST', module: 'forklift', targetType: 'forklift_license_request', targetId: req.params.id, metadata: { ReviewNote: note }, statusCode: 200 });
    res.json({ success: true });
});

router.post('/requests/:id/cancel', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_REQUEST'))) return;
    const manage = await hasPermission(req, 'FORKLIFT_MANAGE');
    const [[before]] = await db.query('SELECT * FROM forklift_license_requests WHERE ID=?', [req.params.id]);
    if (!before || (!manage && !(await requestCanAccess(req, before)))) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (!['DRAFT', 'RETURNED', 'SUBMITTED', 'PENDING'].includes(String(before.RequestStatus))) return res.status(409).json({ success: false, message: 'Request cannot be cancelled after review starts.' });
    const conn = await db.getConnection();
    let cancelled;
    try {
        await conn.beginTransaction();
        [cancelled] = await conn.query("UPDATE forklift_license_requests SET RequestStatus='CANCELLED',ReviewNote=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=?", [clean(req.body.ReviewNote || '', 500), userName(req), req.params.id]);
        await requestEvent(conn, req, req.params.id, 'CANCELLED', before.RequestStatus, 'CANCELLED', req.body.ReviewNote || '');
        await conn.commit();
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
    const [[request]] = await db.query(`${requestSelectSql()} WHERE r.ID=? LIMIT 1`, [req.params.id]);
    if (cancelled.affectedRows > 0 && request?.RequestStatus === 'CANCELLED') {
        const recipients = [...new Set([validEmail(request.CompanyEmail), validEmail(forkliftAdminEmail())].filter(Boolean))];
        if (recipients.length) {
            const mail = buildRequestMail(request, 'Cancelled');
            await queueForkliftEmail({ employeeId: request.EmployeeID, eventType: 'ForkliftRequestCancelled', recipients: recipients.join(','), subject: mail.subject, body: mail.body, html: mail.html });
        }
    }
    await logAudit(req, { action: 'CANCEL_REQUEST', module: 'forklift', targetType: 'forklift_license_request', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.get('/licenses', async (req, res) => {
    const requestedStatus = String(req.query.status || 'all').toUpperCase();
    const allowedStatuses = new Set(['ALL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'SUSPENDED', 'ARCHIVED']);
    if (!allowedStatuses.has(requestedStatus)) return res.status(400).json({ success: false, message: 'Invalid forklift license status filter.' });
    const where = [], params = [];
    const warningDays = await warnDays();
    if (requestedStatus === 'ALL') where.push('l.DeletedAt IS NULL');
    else where.push(effectiveStatusWhere(requestedStatus, warningDays));
    const map = { department: 'e.Department', unit: 'e.Unit' };
    for (const [key, col] of Object.entries(map)) if (req.query[key] && req.query[key] !== 'all') { where.push(`${col}=?`); params.push(req.query[key]); }
    if (req.query.type && req.query.type !== 'all') { where.push('EXISTS (SELECT 1 FROM forklift_license_type_map lm WHERE lm.LicenseID=l.ID AND lm.LicenseTypeID=?)'); params.push(req.query.type); }
    if (req.query.q) { const q = `%${clean(req.query.q, 100)}%`; where.push('(l.EmployeeID LIKE ? OR e.EmployeeName LIKE ? OR l.LicenseNo LIKE ? OR l.CardNo LIKE ? OR l.CertificateNo LIKE ?)'); params.push(q,q,q,q,q); }
    if (req.query.expireFrom) {
        const value = validDate(req.query.expireFrom);
        if (!value) return res.status(400).json({ success: false, message: 'Invalid expireFrom date.' });
        where.push('l.ExpireDate>=?'); params.push(value);
    }
    if (req.query.expireTo) {
        const value = validDate(req.query.expireTo);
        if (!value) return res.status(400).json({ success: false, message: 'Invalid expireTo date.' });
        where.push('l.ExpireDate<=?'); params.push(value);
    }
    if (req.query.certificate === 'yes') where.push("l.CertificateNo IS NOT NULL AND TRIM(l.CertificateNo)<>''");
    if (req.query.certificate === 'no') where.push("(l.CertificateNo IS NULL OR TRIM(l.CertificateNo)='')");
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const whereSql = ` WHERE ${where.join(' AND ')}`;
    const [[count]] = await db.query(`SELECT COUNT(*) n FROM forklift_licenses l LEFT JOIN employees e ON e.EmployeeID=l.EmployeeID${whereSql}`, params);
    const [rows] = await db.query(`${selectSql()}${whereSql} ORDER BY ${licenseNoOrderSql} LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ success: true, data: await attachTypeNames(await attachEffective(rows, warningDays)), total: Number(count?.n || 0), page, limit });
});

router.get('/licenses/:id', async (req, res) => {
    const [[row]] = await db.query(`${selectSql()} WHERE l.ID=? LIMIT 1`, [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: (await attachTypeNames(await attachEffective([row])))[0] });
});

router.post('/licenses', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_MANAGE'))) return;
    const emp = await employee(clean(req.body.EmployeeID, 50));
    if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงานใน Employee Master' });
    const typeIds = parseTypeIds(req.body);
    const type = typeIds[0] || 0, issue = validDate(req.body.IssueDate), expire = validDate(req.body.ExpireDate);
    if (!type || !issue || !expire || new Date(expire) < new Date(issue)) return res.status(400).json({ success: false, message: 'ข้อมูลใบอนุญาตไม่ถูกต้อง' });
    const dupe = await hasActiveLicenseForAnyType(emp.EmployeeID, typeIds);
    if (dupe) return res.status(409).json({ success: false, message: 'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const licenseNo = clean(req.body.LicenseNo, 80) || await nextNo(conn, 'LICENSE', 'FL');
        const cardNo = clean(req.body.CardNo, 80) || await nextNo(conn, 'CARD', 'FLC');
        const [result] = await conn.query('INSERT INTO forklift_licenses(EmployeeID,LicenseTypeID,LicenseNo,CardNo,IssueDate,ExpireDate,CertificateNo,CurrentStatus,Note,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [emp.EmployeeID, type, licenseNo, cardNo, issue, expire, clean(req.body.CertificateNo, 120) || null, baseStatus(req.body.CurrentStatus), req.body.Note || null, emp.EmployeeName, emp.Department, emp.Unit, emp.Position, userName(req)]);
        await syncTypeMap(conn, 'forklift_license_type_map', 'LicenseID', result.insertId, typeIds);
        await conn.query('INSERT INTO forklift_verification_tokens(LicenseID,Token) VALUES(?,?)', [result.insertId, crypto.randomBytes(32).toString('hex')]);
        await conn.commit();
        await logAudit(req, { action: 'CREATE_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: result.insertId, metadata: { EmployeeID: emp.EmployeeID, LicenseNo: licenseNo }, statusCode: 201 });
        res.status(201).json({ success: true, id: result.insertId, LicenseNo: licenseNo, CardNo: cardNo });
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

router.put('/licenses/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_MANAGE'))) return;
    const [[row]] = await db.query('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const emp = await employee(clean(req.body.EmployeeID || row.EmployeeID, 50));
    const typeIds = parseTypeIds(req.body, [row.LicenseTypeID]);
    const type = typeIds[0] || 0, issue = validDate(req.body.IssueDate || row.IssueDate), expire = validDate(req.body.ExpireDate || row.ExpireDate);
    if (!emp || !type || !issue || !expire || new Date(expire) < new Date(issue)) return res.status(400).json({ success: false, message: 'ข้อมูลใบอนุญาตไม่ถูกต้อง' });
    const dupe = await hasActiveLicenseForAnyType(emp.EmployeeID, typeIds, req.params.id);
    if (dupe) return res.status(409).json({ success: false, message: 'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว' });
    await db.query('UPDATE forklift_licenses SET EmployeeID=?,LicenseTypeID=?,LicenseNo=?,CardNo=?,IssueDate=?,ExpireDate=?,CertificateNo=?,CurrentStatus=?,SuspensionReason=?,SuspendedAt=?,Note=?,UpdatedBy=? WHERE ID=?', [emp.EmployeeID, type, clean(req.body.LicenseNo, 80) || null, clean(req.body.CardNo, 80) || null, issue, expire, clean(req.body.CertificateNo, 120) || null, baseStatus(req.body.CurrentStatus || row.CurrentStatus), req.body.SuspensionReason || null, req.body.SuspensionReason ? new Date() : row.SuspendedAt, req.body.Note || null, userName(req), req.params.id]);
    await syncTypeMap(db, 'forklift_license_type_map', 'LicenseID', req.params.id, typeIds);
    await logAudit(req, { action: 'UPDATE_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: req.params.id, metadata: { EmployeeID: emp.EmployeeID, ExpireDate: expire }, statusCode: 200 });
    res.json({ success: true });
});

router.delete('/licenses/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_MANAGE'))) return;
    const [result] = await db.query("UPDATE forklift_licenses SET CurrentStatus='ARCHIVED',DeletedAt=NOW(),DeletedBy=? WHERE ID=? AND DeletedAt IS NULL", [userName(req), req.params.id]);
    if (Number(result.affectedRows) !== 1) return res.status(404).json({ success: false, message: 'License not found or already archived.' });
    await logAudit(req, { action: 'ARCHIVE_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.post('/licenses/:id/suspend', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SUSPEND'))) return;
    const [result] = await db.query("UPDATE forklift_licenses SET CurrentStatus='SUSPENDED',SuspensionReason=?,SuspendedAt=NOW(),UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL", [req.body.reason || null, userName(req), req.params.id]);
    if (Number(result.affectedRows) !== 1) return res.status(404).json({ success: false, message: 'License not found.' });
    await logAudit(req, { action: 'SUSPEND_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: req.params.id, metadata: { reason: req.body.reason || null }, statusCode: 200 });
    res.json({ success: true });
});

router.post('/licenses/:id/restore', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_SUSPEND'))) return;
    const [result] = await db.query("UPDATE forklift_licenses SET CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL", [userName(req), req.params.id]);
    if (Number(result.affectedRows) !== 1) return res.status(404).json({ success: false, message: 'License not found.' });
    await logAudit(req, { action: 'RESTORE_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.get('/licenses/:id/renewals', async (req, res) => {
    const [rows] = await db.query('SELECT * FROM forklift_license_renewals WHERE LicenseID=? ORDER BY OperatedAt DESC,ID DESC', [req.params.id]);
    res.json({ success: true, data: rows });
});

router.post('/licenses/:id/renew', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_RENEW'))) return;
    const [[row]] = await db.query('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const newIssue = validDate(req.body.NewIssueDate || req.body.IssueDate);
    const newExpire = validDate(req.body.NewExpireDate || req.body.ExpireDate);
    if (!newIssue || !newExpire || new Date(newExpire) < new Date(newIssue)) return res.status(400).json({ success: false, message: 'ข้อมูลการต่ออายุไม่ถูกต้อง' });
    const newCert = clean(req.body.NewCertificateNo || req.body.CertificateNo, 120) || row.CertificateNo || null;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('INSERT INTO forklift_license_renewals(LicenseID,OldIssueDate,NewIssueDate,OldExpireDate,NewExpireDate,OldCertificateNo,NewCertificateNo,RenewalNote,OperatedBy) VALUES(?,?,?,?,?,?,?,?,?)', [req.params.id, row.IssueDate, newIssue, row.ExpireDate, newExpire, row.CertificateNo, newCert, req.body.RenewalNote || null, userName(req)]);
        await conn.query("UPDATE forklift_licenses SET IssueDate=?,LastRenewalDate=CURDATE(),ExpireDate=?,CertificateNo=?,CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=?", [newIssue, newExpire, newCert, userName(req), req.params.id]);
        await conn.commit();
        await logAudit(req, { action: 'RENEW_LICENSE', module: 'forklift', targetType: 'forklift_license', targetId: req.params.id, metadata: { oldExpireDate: row.ExpireDate, newExpireDate: newExpire }, statusCode: 200 });
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

router.get('/licenses/:id/documents', async (req, res) => {
    const [rows] = await db.query('SELECT * FROM forklift_license_documents WHERE LicenseID=? AND DeletedAt IS NULL ORDER BY UploadedAt DESC,ID DESC', [req.params.id]);
    res.json({ success: true, data: rows });
});

router.get('/employees/:id/photo', async (req, res) => {
    const emp = await employee(clean(req.params.id, 50));
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });
    res.json({ success: true, data: { EmployeeID: emp.EmployeeID, PhotoUrl: await employeePhotoUrl(emp.EmployeeID) } });
});

router.post('/employees/:id/photo', upload.single('photo'), uploadCleanupGuard, async (req, res) => {
    const uploadedUrl = req.file?.publicUrl || req.file?.path || '';
    let allowed;
    try {
        allowed = await requirePermission(req, res, 'FORKLIFT_DOCUMENT_MANAGE');
    } catch (err) {
        deleteLocalUpload(uploadedUrl);
        throw err;
    }
    if (!allowed) {
        deleteLocalUpload(uploadedUrl);
        return;
    }
    let emp;
    try {
        emp = await employee(clean(req.params.id, 50));
    } catch (err) {
        deleteLocalUpload(uploadedUrl);
        throw err;
    }
    if (!emp) {
        deleteLocalUpload(uploadedUrl);
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
        deleteLocalUpload(uploadedUrl);
        return res.status(400).json({ success: false, message: 'Photo must be JPG, PNG, or WebP.' });
    }
    const conn = await db.getConnection();
    let persisted = false;
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE forklift_employee_photos SET DeletedAt=NOW(),DeletedBy=? WHERE EmployeeID=? AND DeletedAt IS NULL', [userName(req), emp.EmployeeID]);
        const [insert] = await conn.query('INSERT INTO forklift_employee_photos(EmployeeID,PhotoUrl,OriginalName,StoredName,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?)', [emp.EmployeeID, uploadedUrl, req.file.originalName || req.file.originalname, req.file.storedName || req.file.filename, req.file.mimetype, req.file.size, userName(req)]);
        await conn.commit();
        persisted = true;
        markUploadPersisted(req);
        await logAudit(req, { action: 'UPLOAD_EMPLOYEE_PHOTO', module: 'forklift', targetType: 'forklift_employee_photo', targetId: emp.EmployeeID, metadata: { photoId: insert.insertId }, statusCode: 201 });
        res.status(201).json({ success: true, data: { EmployeeID: emp.EmployeeID, PhotoUrl: uploadedUrl, id: insert.insertId } });
    } catch (err) {
        await conn.rollback().catch(() => {});
        if (!persisted) deleteLocalUpload(uploadedUrl);
        throw err;
    } finally {
        conn.release();
    }
});

router.delete('/employees/:id/photo', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_DOCUMENT_MANAGE'))) return;
    await db.query('UPDATE forklift_employee_photos SET DeletedAt=NOW(),DeletedBy=? WHERE EmployeeID=? AND DeletedAt IS NULL', [userName(req), clean(req.params.id, 50)]);
    await logAudit(req, { action: 'DELETE_EMPLOYEE_PHOTO', module: 'forklift', targetType: 'forklift_employee_photo', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.get('/licenses/:id/card', async (req, res) => {
    const payload = await cardPayload(req, req.params.id, req.query.templateVersionId || null);
    if (!payload) return res.status(404).json({ success: false, message: 'License not found.' });
    if (!payload.version) return res.status(404).json({ success: false, message: 'No published card template found for this license type.' });
    res.json({ success: true, data: payload });
});

router.get('/licenses/:id/print-logs', async (req, res) => {
    const [rows] = await db.query('SELECT ID,LicenseID,TemplateVersionID,Action,PrintedBy,PrintedAt,RenderMetadata FROM forklift_card_print_logs WHERE LicenseID=? ORDER BY PrintedAt DESC,ID DESC LIMIT 50', [req.params.id]);
    res.json({ success: true, data: rows.map(row => ({ ...row, RenderMetadata: typeof row.RenderMetadata === 'string' ? JSON.parse(row.RenderMetadata || '{}') : (row.RenderMetadata || {}) })) });
});

router.post('/licenses/:id/print-log', async (req, res) => {
    if (!(await requirePermission(req, res, req.body.Action === 'EXPORT_PNG' ? 'FORKLIFT_EXPORT' : 'FORKLIFT_PRINT'))) return;
    const [[row]] = await db.query('SELECT ID FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'License not found.' });
    const action = ['PREVIEW', 'PRINT', 'EXPORT_PNG', 'EXPORT_PDF'].includes(clean(req.body.Action, 30).toUpperCase()) ? clean(req.body.Action, 30).toUpperCase() : 'PREVIEW';
    const snapshot = req.body.Snapshot && typeof req.body.Snapshot === 'object' ? req.body.Snapshot : {};
    const metadata = req.body.RenderMetadata && typeof req.body.RenderMetadata === 'object' ? req.body.RenderMetadata : {};
    const [insert] = await db.query(
        'INSERT INTO forklift_card_print_logs(LicenseID,TemplateVersionID,Action,PrintedBy,SnapshotJson,RenderMetadata) VALUES(?,?,?,?,?,?)',
        [req.params.id, req.body.TemplateVersionID || null, action, userName(req), JSON.stringify(snapshot), JSON.stringify(metadata)]
    );
    await logAudit(req, { action: `CARD_${action}`, module: 'forklift', targetType: 'forklift_license', targetId: req.params.id, metadata: { printLogId: insert.insertId, TemplateVersionID: req.body.TemplateVersionID || null }, statusCode: 201 });
    res.status(201).json({ success: true, id: insert.insertId });
});

router.post('/licenses/:id/documents', upload.single('file'), uploadCleanupGuard, async (req, res) => {
    const uploadedUrl = req.file?.publicUrl || req.file?.path || '';
    let allowed;
    try {
        allowed = await requirePermission(req, res, 'FORKLIFT_DOCUMENT_MANAGE');
    } catch (err) {
        deleteLocalUpload(uploadedUrl);
        throw err;
    }
    if (!allowed) {
        deleteLocalUpload(uploadedUrl);
        return;
    }
    let row;
    try {
        [[row]] = await db.query('SELECT ID FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL', [req.params.id]);
    } catch (err) {
        deleteLocalUpload(uploadedUrl);
        throw err;
    }
    if (!row) {
        deleteLocalUpload(uploadedUrl);
        return res.status(404).json({ success: false, message: 'Not found.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    const type = clean(req.body.DocumentType || 'certificate', 50) || 'certificate';
    let persisted = false;
    try {
        const [result] = await db.query('INSERT INTO forklift_license_documents(LicenseID,DocumentType,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?,?)', [req.params.id, type, req.file.originalName || req.file.originalname, req.file.storedName || req.file.filename, uploadedUrl, req.file.mimetype, req.file.size, userName(req)]);
        persisted = true;
        markUploadPersisted(req);
        await logAudit(req, { action: 'UPLOAD_DOCUMENT', module: 'forklift', targetType: 'forklift_document', targetId: result.insertId, metadata: { LicenseID: req.params.id, DocumentType: type, OriginalName: req.file.originalName || req.file.originalname }, statusCode: 201 });
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        if (!persisted) deleteLocalUpload(uploadedUrl);
        throw err;
    }
});

router.delete('/documents/:docId', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_DOCUMENT_MANAGE'))) return;
    await db.query('UPDATE forklift_license_documents SET DeletedAt=NOW(),DeletedBy=? WHERE ID=? AND DeletedAt IS NULL', [userName(req), req.params.docId]);
    await logAudit(req, { action: 'DELETE_DOCUMENT', module: 'forklift', targetType: 'forklift_document', targetId: req.params.docId, statusCode: 200 });
    res.json({ success: true });
});

router.get('/layout-presets', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const [rows] = await db.query('SELECT ID,PresetName,FieldsJson,CreatedBy,CreatedAt,UpdatedBy,UpdatedAt FROM forklift_layout_presets ORDER BY PresetName');
    res.json({ success: true, data: rows.map(row => ({ ...row, FieldsJson: undefined, fields: (() => { try { return JSON.parse(row.FieldsJson) || []; } catch (_) { return []; } })() })) });
});

router.post('/layout-presets', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const name = clean(req.body.PresetName, 150), fields = Array.isArray(req.body.fields) ? req.body.fields : [];
    if (!name || !fields.length) return res.status(400).json({ success: false, message: 'PresetName and fields are required.' });
    await db.query('INSERT INTO forklift_layout_presets(PresetName,FieldsJson,CreatedBy,UpdatedBy) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE FieldsJson=VALUES(FieldsJson),UpdatedBy=VALUES(UpdatedBy)', [name, JSON.stringify(fields), userName(req), userName(req)]);
    await logAudit(req, { action: 'SAVE_LAYOUT_PRESET', module: 'forklift', targetType: 'forklift_layout_preset', targetId: name, metadata: { fieldCount: fields.length }, statusCode: 200 });
    res.json({ success: true });
});

router.delete('/layout-presets/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    await db.query('DELETE FROM forklift_layout_presets WHERE ID=?', [req.params.id]);
    await logAudit(req, { action: 'DELETE_LAYOUT_PRESET', module: 'forklift', targetType: 'forklift_layout_preset', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.get('/templates', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    res.json({ success: true, data: await templatePayload() });
});

router.post('/templates', upload.fields([{ name: 'FrontImage', maxCount: 1 }, { name: 'BackImage', maxCount: 1 }]), uploadCleanupGuard, async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const name = clean(req.body.TemplateName, 150);
    if (!name) return res.status(400).json({ success: false, message: 'TemplateName is required.' });
    const typeIds = parseTypeIds(req.body);
    const primaryTypeId = typeIds[0] || null;
    const front = uploadedImage(req, 'FrontImage');
    const back = uploadedImage(req, 'BackImage');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [tpl] = await conn.query('INSERT INTO forklift_card_templates(LicenseTypeID,TemplateName,IsActive,IsDefault) VALUES(?,?,1,?)', [primaryTypeId, name, req.body.IsDefault ? 1 : 0]);
        await syncTypeMap(conn, 'forklift_card_template_type_map', 'TemplateID', tpl.insertId, typeIds);
        const [ver] = await conn.query('INSERT INTO forklift_card_template_versions(TemplateID,VersionNo,FrontImageUrl,BackImageUrl,CardWidthMm,CardHeightMm,Dpi,Status,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?)', [tpl.insertId, 1, front, back, Number(req.body.CardWidthMm || 60), Number(req.body.CardHeightMm || 82), Number(req.body.Dpi || 300), 'draft', userName(req)]);
        await seedTemplateFields(conn, ver.insertId);
        await conn.commit();
        markUploadPersisted(req);
        await logAudit(req, { action: 'UPDATE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template', targetId: tpl.insertId, metadata: { versionId: ver.insertId }, statusCode: 201 });
        res.status(201).json({ success: true, id: tpl.insertId, versionId: ver.insertId });
    } catch (err) {
        await conn.rollback();
        if (!req.forkliftUploadPersisted) {
            deleteLocalUpload(front);
            deleteLocalUpload(back);
        }
        throw err;
    } finally {
        conn.release();
    }
});

router.get('/templates/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const data = await templatePayload(req.params.id);
    if (!data.length) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.json({ success: true, data: data[0] });
});

router.delete('/templates/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const tpl = await templateRow(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found.' });
    const used = await templatePrintLogCount(req.params.id);
    const force = String(req.query.force || '') === '1';
    if (force && !isAdminReq(req)) return res.status(403).json({ success: false, message: 'Force delete is restricted to Admin.' });
    if (used > 0 && !force) return res.status(409).json({ success: false, message: 'Template has print/export history. Archive it instead of hard delete.', printLogCount: used });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [versions] = await conn.query('SELECT ID FROM forklift_card_template_versions WHERE TemplateID=?', [req.params.id]);
        for (const ver of versions) {
            if (force) await conn.query('DELETE FROM forklift_card_print_logs WHERE TemplateVersionID=?', [ver.ID]);
            await conn.query('DELETE FROM forklift_card_template_fields WHERE TemplateVersionID=?', [ver.ID]);
        }
        await conn.query('DELETE FROM forklift_card_template_type_map WHERE TemplateID=?', [req.params.id]);
        await conn.query('DELETE FROM forklift_card_template_versions WHERE TemplateID=?', [req.params.id]);
        await conn.query('DELETE FROM forklift_card_templates WHERE ID=?', [req.params.id]);
        await conn.commit();
        await logAudit(req, { action: force ? 'DELETE_TEMPLATE_FORCE' : 'DELETE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template', targetId: req.params.id, metadata: { printLogCount: used, force }, statusCode: 200 });
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

router.post('/templates/:id/archive', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const tpl = await templateRow(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found.' });
    await db.query('UPDATE forklift_card_templates SET IsActive=0,ArchivedAt=NOW(),ArchivedBy=? WHERE ID=? AND ArchivedAt IS NULL', [userName(req), req.params.id]);
    await logAudit(req, { action: 'ARCHIVE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.post('/templates/:id/restore', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const tpl = await templateRow(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found.' });
    await db.query('UPDATE forklift_card_templates SET IsActive=1,ArchivedAt=NULL,ArchivedBy=NULL WHERE ID=?', [req.params.id]);
    await logAudit(req, { action: 'RESTORE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template', targetId: req.params.id, statusCode: 200 });
    res.json({ success: true });
});

router.post('/templates/:id/active', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const tpl = await templateRow(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found.' });
    if (tpl.ArchivedAt) return res.status(409).json({ success: false, message: 'Restore archived template before activating it.' });
    const active = req.body.IsActive === undefined || req.body.IsActive ? 1 : 0;
    await db.query('UPDATE forklift_card_templates SET IsActive=? WHERE ID=?', [active, req.params.id]);
    await logAudit(req, { action: 'UPDATE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template', targetId: req.params.id, metadata: { IsActive: active }, statusCode: 200 });
    res.json({ success: true });
});

router.post('/templates/:id/versions', upload.fields([{ name: 'FrontImage', maxCount: 1 }, { name: 'BackImage', maxCount: 1 }]), uploadCleanupGuard, async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const tpl = await templateRow(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found.' });
    if (tpl.ArchivedAt) return res.status(409).json({ success: false, message: 'Archived template cannot create a new version. Restore it first.' });
    const [[prev]] = await db.query('SELECT * FROM forklift_card_template_versions WHERE TemplateID=? ORDER BY VersionNo DESC,ID DESC LIMIT 1', [req.params.id]);
    if (!prev) return res.status(404).json({ success: false, message: 'Template not found.' });
    const front = uploadedImage(req, 'FrontImage');
    const back = uploadedImage(req, 'BackImage');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const next = Number(prev.VersionNo || 1) + 1;
        const [ver] = await conn.query('INSERT INTO forklift_card_template_versions(TemplateID,VersionNo,FrontImageUrl,BackImageUrl,CardWidthMm,CardHeightMm,Dpi,Status,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?)', [req.params.id, next, front || prev.FrontImageUrl, back || prev.BackImageUrl, prev.CardWidthMm, prev.CardHeightMm, prev.Dpi, 'draft', userName(req)]);
        const [fields] = await conn.query('SELECT FieldKey,FieldConfig,SortOrder FROM forklift_card_template_fields WHERE TemplateVersionID=? ORDER BY SortOrder ASC', [prev.ID]);
        if (fields.length) {
            for (const f of fields) await conn.query('INSERT INTO forklift_card_template_fields(TemplateVersionID,FieldKey,FieldConfig,SortOrder) VALUES(?,?,?,?)', [ver.insertId, f.FieldKey, typeof f.FieldConfig === 'string' ? f.FieldConfig : JSON.stringify(f.FieldConfig || {}), f.SortOrder]);
        } else {
            await seedTemplateFields(conn, ver.insertId);
        }
        await conn.commit();
        markUploadPersisted(req);
        await logAudit(req, { action: 'UPDATE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template', targetId: req.params.id, metadata: { versionId: ver.insertId, versionNo: next }, statusCode: 201 });
        res.status(201).json({ success: true, versionId: ver.insertId, versionNo: next });
    } catch (err) {
        await conn.rollback();
        if (!req.forkliftUploadPersisted) {
            deleteLocalUpload(front);
            deleteLocalUpload(back);
        }
        throw err;
    } finally {
        conn.release();
    }
});

router.put('/template-versions/:versionId/fields', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const [[ver]] = await db.query('SELECT v.*,tpl.ArchivedAt FROM forklift_card_template_versions v JOIN forklift_card_templates tpl ON tpl.ID=v.TemplateID WHERE v.ID=? LIMIT 1', [req.params.versionId]);
    if (!ver) return res.status(404).json({ success: false, message: 'Version not found.' });
    if (ver.ArchivedAt) return res.status(409).json({ success: false, message: 'Archived template cannot be edited. Restore it first.' });
    if (String(ver.Status).toLowerCase() === 'published' && !isAdminReq(req)) return res.status(409).json({ success: false, message: 'Published template version can only be edited by Admin.' });
    const items = Array.isArray(req.body.fields) ? req.body.fields : [];
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM forklift_card_template_fields WHERE TemplateVersionID=?', [req.params.versionId]);
        let sort = 10;
        for (const item of items) {
            const key = clean(item.FieldKey || item.fieldKey, 80);
            if (!key) continue;
            const cfg = item.FieldConfig || item.config || {};
            await conn.query('INSERT INTO forklift_card_template_fields(TemplateVersionID,FieldKey,FieldConfig,SortOrder) VALUES(?,?,?,?)', [req.params.versionId, key, JSON.stringify(cfg && typeof cfg === 'object' ? cfg : {}), sort]);
            sort += 10;
        }
        await conn.commit();
        await logAudit(req, { action: 'UPDATE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template_version', targetId: req.params.versionId, metadata: { fieldCount: items.length }, statusCode: 200 });
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

router.post('/template-versions/:versionId/publish', async (req, res) => {
    if (!(await requirePermission(req, res, 'FORKLIFT_TEMPLATE_MANAGE'))) return;
    const [[ver]] = await db.query('SELECT v.TemplateID,tpl.ArchivedAt FROM forklift_card_template_versions v JOIN forklift_card_templates tpl ON tpl.ID=v.TemplateID WHERE v.ID=? LIMIT 1', [req.params.versionId]);
    if (!ver) return res.status(404).json({ success: false, message: 'Version not found.' });
    if (ver.ArchivedAt) return res.status(409).json({ success: false, message: 'Archived template cannot be published. Restore it first.' });
    await db.query("UPDATE forklift_card_template_versions SET Status='published',PublishedAt=NOW() WHERE ID=?", [req.params.versionId]);
    await logAudit(req, { action: 'UPDATE_TEMPLATE', module: 'forklift', targetType: 'forklift_card_template_version', targetId: req.params.versionId, metadata: { published: true }, statusCode: 200 });
    res.json({ success: true });
});

module.exports = router;
module.exports.publicVerify = publicVerify;
