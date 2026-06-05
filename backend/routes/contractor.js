// backend/routes/contractor.js
// Auth (authenticateToken) applied at mount level in server.js
// Write/delete operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { randomUUID } = require('crypto');
const { isAdmin } = require('../middleware/auth');
const { storage: uploadStorage, fileFilter, deleteLocalUpload } = require('../storage');

const upload = multer({
    storage: uploadStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_CATEGORIES = [
    'Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป',
];

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE TABLES
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_PARTY_TYPES = ['Contractor', 'Supplier'];
const ALLOWED_INCIDENT_TYPES = ['Accident', 'Near Miss', 'First Aid', 'Property Damage'];

let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_Documents (
            id          VARCHAR(36)  NOT NULL PRIMARY KEY,
            Title       VARCHAR(255) NOT NULL,
            PartyType   VARCHAR(20)  NOT NULL DEFAULT 'Contractor',
            Category    VARCHAR(100) DEFAULT 'ทั่วไป',
            Description TEXT,
            FileUrl     TEXT         NOT NULL,
            PublicID    VARCHAR(255),
            FileType    VARCHAR(20)  DEFAULT 'pdf',
            FileSize    BIGINT       DEFAULT 0,
            UploadedBy  VARCHAR(100),
            UploadedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            DeletedAt   DATETIME     DEFAULT NULL,
            DeletedBy   VARCHAR(100) DEFAULT NULL,
            KEY idx_cat  (Category),
            KEY idx_party (PartyType),
            KEY idx_date (UploadedAt)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_Activity_Log (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            ActionType VARCHAR(20)  NOT NULL,
            DocID      VARCHAR(36),
            DocTitle   VARCHAR(255),
            Category   VARCHAR(100),
            ActorName  VARCHAR(100),
            Detail     VARCHAR(255),
            CreatedAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_created (CreatedAt)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_Companies (
            id          VARCHAR(36)  NOT NULL PRIMARY KEY,
            CompanyName VARCHAR(255) NOT NULL,
            PartyType   VARCHAR(20)  NOT NULL DEFAULT 'Contractor',
            Status      VARCHAR(20)  NOT NULL DEFAULT 'Active',
            CreatedBy   VARCHAR(100),
            CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            DeletedAt   DATETIME     DEFAULT NULL,
            DeletedBy   VARCHAR(100) DEFAULT NULL,
            KEY idx_company_party (PartyType),
            KEY idx_company_name (CompanyName)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_AccidentRecords (
            id             VARCHAR(36)  NOT NULL PRIMARY KEY,
            IncidentDate   DATE         NOT NULL,
            IncidentType   VARCHAR(30)  NOT NULL,
            PartyType      VARCHAR(20)  NOT NULL DEFAULT 'Contractor',
            CompanyName    VARCHAR(255) NOT NULL,
            InvolvedPerson VARCHAR(255),
            Area           VARCHAR(255),
            Description    TEXT,
            CreatedBy      VARCHAR(100),
            CreatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            DeletedAt      DATETIME     DEFAULT NULL,
            DeletedBy      VARCHAR(100) DEFAULT NULL,
            KEY idx_incident_date (IncidentDate),
            KEY idx_incident_type (IncidentType),
            KEY idx_incident_party (PartyType)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Contractor_AccidentFiles (
            id         VARCHAR(36) NOT NULL PRIMARY KEY,
            RecordID   VARCHAR(36) NOT NULL,
            FileUrl    TEXT        NOT NULL,
            PublicID   VARCHAR(255),
            FileName   VARCHAR(255),
            FileType   VARCHAR(50),
            FileSize   BIGINT DEFAULT 0,
            UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_record (RecordID)
        )
    `);

    const colMigrations = [
        `ALTER TABLE Contractor_Documents ADD COLUMN PartyType VARCHAR(20) NOT NULL DEFAULT 'Contractor' AFTER Title`,
        `ALTER TABLE Contractor_Documents ADD COLUMN Description TEXT AFTER Category`,
        `ALTER TABLE Contractor_Documents ADD COLUMN PublicID VARCHAR(255) AFTER FileUrl`,
        `ALTER TABLE Contractor_Documents ADD COLUMN FileSize BIGINT DEFAULT 0 AFTER FileType`,
        `ALTER TABLE Contractor_Documents ADD COLUMN UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER UploadedAt`,
        `ALTER TABLE Contractor_Documents ADD COLUMN DeletedAt DATETIME DEFAULT NULL AFTER UpdatedAt`,
        `ALTER TABLE Contractor_Documents ADD COLUMN DeletedBy VARCHAR(100) DEFAULT NULL AFTER DeletedAt`,
    ];
    for (const sql of colMigrations) {
        try { await db.query(sql); } catch (_) { /* column already exists */ }
    }

    tablesReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function parseId(val) {
    const id = String(val || '').trim();
    if (!id) throw Object.assign(new Error('ID ไม่ถูกต้อง'), { status: 400 });
    return id;
}

function trim(val) {
    return typeof val === 'string' ? val.trim() : '';
}

function normalizePartyType(val) {
    const clean = trim(val);
    return ALLOWED_PARTY_TYPES.includes(clean) ? clean : 'Contractor';
}

function normalizeIncidentType(val) {
    const clean = trim(val);
    return ALLOWED_INCIDENT_TYPES.includes(clean) ? clean : 'Accident';
}

async function logActivity(type, doc, actorName) {
    try {
        await db.query(
            `INSERT INTO Contractor_Activity_Log (ActionType, DocID, DocTitle, Category, ActorName)
             VALUES (?, ?, ?, ?, ?)`,
            [type, doc.id || null, (doc.Title || '').slice(0, 255), (doc.Category || '').slice(0, 100), (actorName || '').slice(0, 100)]
        );
    } catch (e) {
        console.warn('Activity log write failed:', e.message);
    }
}

async function ensureCompany(companyName, partyType, actorName) {
    const name = trim(companyName).slice(0, 255);
    if (!name) return null;
    const party = normalizePartyType(partyType);
    try {
        const [rows] = await db.query(
            'SELECT id FROM Contractor_Companies WHERE CompanyName = ? AND PartyType = ? AND DeletedAt IS NULL LIMIT 1',
            [name, party]
        );
        if (rows.length) return rows[0].id;
        const id = randomUUID();
        await db.query(
            `INSERT INTO Contractor_Companies (id, CompanyName, PartyType, CreatedBy)
             VALUES (?, ?, ?, ?)`,
            [id, name, party, (actorName || '').slice(0, 100)]
        );
        return id;
    } catch (e) {
        console.warn('Contractor company ensure failed:', e.message);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents — list with optional filters + date range
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
    try {
        await ensureTables();
        const { category, q, dateFrom, dateTo, partyType } = req.query;

        let sql = 'SELECT * FROM Contractor_Documents WHERE DeletedAt IS NULL';
        const params = [];

        if (category && category !== 'all') {
            if (!ALLOWED_CATEGORIES.includes(category)) {
                return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้อง' });
            }
            sql += ' AND Category = ?';
            params.push(category);
        }

        if (partyType && partyType !== 'all') {
            if (!ALLOWED_PARTY_TYPES.includes(partyType)) {
                return res.status(400).json({ success: false, message: 'ประเภทไม่ถูกต้อง' });
            }
            sql += ' AND PartyType = ?';
            params.push(partyType);
        }

        if (q && q.trim()) {
            sql += ' AND (Title LIKE ? OR Description LIKE ?)';
            const like = `%${q.trim()}%`;
            params.push(like, like);
        }

        if (dateFrom) {
            sql += ' AND DATE(UploadedAt) >= ?';
            params.push(dateFrom);
        }

        if (dateTo) {
            sql += ' AND DATE(UploadedAt) <= ?';
            params.push(dateTo);
        }

        sql += ' ORDER BY UploadedAt DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows, total: rows.length });
    } catch (err) {
        console.error('Contractor documents fetch error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/stats — aggregate counts by category
// ─────────────────────────────────────────────────────────────────────────────
router.get('/documents/stats', async (req, res) => {
    try {
        await ensureTables();

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM Contractor_Documents WHERE DeletedAt IS NULL`
        );
        const [byCategory] = await db.query(
            `SELECT Category, COUNT(*) AS cnt FROM Contractor_Documents WHERE DeletedAt IS NULL GROUP BY Category ORDER BY cnt DESC`
        );
        const [byParty] = await db.query(
            `SELECT PartyType, COUNT(*) AS cnt FROM Contractor_Documents WHERE DeletedAt IS NULL GROUP BY PartyType ORDER BY PartyType`
        );
        const [[{ recentCount }]] = await db.query(
            `SELECT COUNT(*) AS recentCount FROM Contractor_Documents WHERE DeletedAt IS NULL AND UploadedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        res.json({
            success: true,
            data: { total, byCategory, byParty, recentCount },
        });
    } catch (err) {
        console.error('Contractor stats error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /activity — recent activity log
// ─────────────────────────────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
    try {
        await ensureTables();
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const [rows] = await db.query(
            `SELECT * FROM Contractor_Activity_Log ORDER BY CreatedAt DESC LIMIT ?`,
            [limit]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Contractor activity fetch error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลกิจกรรมได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents — upload (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
// -----------------------------------------------------------------------------
// GET /companies - Contractor/Supplier company master
// -----------------------------------------------------------------------------
router.get('/companies', async (req, res) => {
    try {
        await ensureTables();
        const { partyType, q } = req.query;
        let sql = 'SELECT * FROM Contractor_Companies WHERE DeletedAt IS NULL';
        const params = [];

        if (partyType && partyType !== 'all') {
            if (!ALLOWED_PARTY_TYPES.includes(partyType)) {
                return res.status(400).json({ success: false, message: 'ประเภทบริษัทไม่ถูกต้อง' });
            }
            sql += ' AND PartyType = ?';
            params.push(partyType);
        }
        if (q && q.trim()) {
            sql += ' AND CompanyName LIKE ?';
            params.push(`%${q.trim()}%`);
        }
        sql += ' ORDER BY PartyType ASC, CompanyName ASC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Contractor companies fetch error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลบริษัทได้' });
    }
});

router.post('/companies', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const companyName = trim(req.body.CompanyName);
        if (!companyName) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อบริษัท' });
        const partyType = normalizePartyType(req.body.PartyType);
        const actorName = req.user.name || req.user.id;
        const id = await ensureCompany(companyName, partyType, actorName);
        res.status(201).json({ success: true, message: 'บันทึกบริษัทสำเร็จ', id });
    } catch (err) {
        console.error('Contractor company create error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกบริษัทได้' });
    }
});

router.post('/documents', isAdmin, upload.single('file'), async (req, res) => {
    let uploadedUrl = null;
    try {
        await ensureTables();

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' });
        }

        uploadedUrl = req.file.path;
        res.on('finish', () => {
            if (uploadedUrl && res.statusCode >= 400) deleteLocalUpload(uploadedUrl);
        });

        const title = trim(req.body.Title);
        if (!title) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสาร' });
        }
        if (title.length > 255) {
            return res.status(400).json({ success: false, message: 'ชื่อเอกสารยาวเกินไป (สูงสุด 255 ตัวอักษร)' });
        }

        const category    = ALLOWED_CATEGORIES.includes(trim(req.body.Category)) ? trim(req.body.Category) : 'ทั่วไป';
        const partyType   = normalizePartyType(req.body.PartyType);
        const description = trim(req.body.Description).slice(0, 500) || null;
        const ext         = (req.file.originalname || '').split('.').pop().toLowerCase();
        const id          = randomUUID();
        const actorName   = req.user.name || req.user.id;

        await db.query(
            `INSERT INTO Contractor_Documents
                (id, Title, PartyType, Category, Description, FileUrl, PublicID, FileType, FileSize, UploadedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, partyType, category, description, req.file.path, req.file.filename || null, ext || 'pdf', req.file.size || 0, actorName]
        );

        await logActivity('upload', { id, Title: title, Category: category }, actorName);
        uploadedUrl = null;

        res.status(201).json({ success: true, message: 'อัปโหลดเอกสารสำเร็จ' });
    } catch (err) {
        if (uploadedUrl) {
            deleteLocalUpload(uploadedUrl);
            uploadedUrl = null;
        }
        console.error('Contractor document upload error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปโหลดเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /documents/:id — update metadata (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/documents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseId(req.params.id);

        const [rows] = await db.query('SELECT id, Title, PartyType, Category FROM Contractor_Documents WHERE id = ? AND DeletedAt IS NULL', [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการแก้ไข' });
        }

        const title = trim(req.body.Title);
        if (!title) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อเอกสาร' });
        }
        if (title.length > 255) {
            return res.status(400).json({ success: false, message: 'ชื่อเอกสารยาวเกินไป (สูงสุด 255 ตัวอักษร)' });
        }

        const category    = ALLOWED_CATEGORIES.includes(trim(req.body.Category)) ? trim(req.body.Category) : rows[0].Category;
        const partyType   = normalizePartyType(req.body.PartyType || rows[0].PartyType);
        const description = trim(req.body.Description).slice(0, 500) || null;
        const actorName   = req.user.name || req.user.id;

        await db.query(
            `UPDATE Contractor_Documents SET Title = ?, PartyType = ?, Category = ?, Description = ? WHERE id = ? AND DeletedAt IS NULL`,
            [title, partyType, category, description, id]
        );

        await logActivity('edit', { id, Title: title, Category: category }, actorName);

        res.json({ success: true, message: 'อัปเดตข้อมูลเอกสารสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor document update error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลเอกสารได้' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /documents/:id — soft delete (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/documents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseId(req.params.id);

        const [rows] = await db.query(
            'SELECT id, Title, Category FROM Contractor_Documents WHERE id = ? AND DeletedAt IS NULL',
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการลบ' });
        }

        const { Title, Category } = rows[0];
        const actorName = req.user.name || req.user.id;

        await db.query(
            'UPDATE Contractor_Documents SET DeletedAt = NOW(), DeletedBy = ? WHERE id = ? AND DeletedAt IS NULL',
            [actorName, id]
        );

        await logActivity('delete', { id, Title, Category }, actorName);

        res.json({ success: true, message: 'ลบเอกสารสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor document delete error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบเอกสารได้' });
    }
});

// -----------------------------------------------------------------------------
// GET /accidents - list external contractor/supplier incident records
// -----------------------------------------------------------------------------
router.get('/accidents', async (req, res) => {
    try {
        await ensureTables();
        const { year, type, partyType, q } = req.query;
        let sql = 'SELECT * FROM Contractor_AccidentRecords WHERE DeletedAt IS NULL';
        const params = [];

        if (year) {
            sql += ' AND YEAR(IncidentDate) = ?';
            params.push(parseInt(year, 10));
        }
        if (type && type !== 'all') {
            if (!ALLOWED_INCIDENT_TYPES.includes(type)) {
                return res.status(400).json({ success: false, message: 'ประเภทเหตุการณ์ไม่ถูกต้อง' });
            }
            sql += ' AND IncidentType = ?';
            params.push(type);
        }
        if (partyType && partyType !== 'all') {
            if (!ALLOWED_PARTY_TYPES.includes(partyType)) {
                return res.status(400).json({ success: false, message: 'ประเภทบริษัทไม่ถูกต้อง' });
            }
            sql += ' AND PartyType = ?';
            params.push(partyType);
        }
        if (q && q.trim()) {
            const like = `%${q.trim()}%`;
            sql += ' AND (CompanyName LIKE ? OR InvolvedPerson LIKE ? OR Area LIKE ? OR Description LIKE ?)';
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY IncidentDate DESC, CreatedAt DESC';

        const [records] = await db.query(sql, params);
        if (!records.length) return res.json({ success: true, data: [] });

        const ids = records.map(r => r.id);
        const [files] = await db.query(
            `SELECT * FROM Contractor_AccidentFiles WHERE RecordID IN (${ids.map(() => '?').join(',')}) ORDER BY UploadedAt ASC`,
            ids
        );
        const filesByRecord = files.reduce((acc, file) => {
            acc[file.RecordID] = acc[file.RecordID] || [];
            acc[file.RecordID].push(file);
            return acc;
        }, {});

        res.json({
            success: true,
            data: records.map(record => ({ ...record, Files: filesByRecord[record.id] || [] })),
        });
    } catch (err) {
        console.error('Contractor accident fetch error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลสถิติอุบัติเหตุได้' });
    }
});

// -----------------------------------------------------------------------------
// GET /accidents/stats - summary for zero external accident target
// -----------------------------------------------------------------------------
router.get('/accidents/stats', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();

        const [byType] = await db.query(
            `SELECT IncidentType, COUNT(*) AS cnt
             FROM Contractor_AccidentRecords
             WHERE DeletedAt IS NULL AND YEAR(IncidentDate) = ?
             GROUP BY IncidentType`,
            [year]
        );
        const [byParty] = await db.query(
            `SELECT PartyType, COUNT(*) AS cnt
             FROM Contractor_AccidentRecords
             WHERE DeletedAt IS NULL AND YEAR(IncidentDate) = ?
             GROUP BY PartyType`,
            [year]
        );
        const [[lastAccident]] = await db.query(
            `SELECT IncidentDate
             FROM Contractor_AccidentRecords
             WHERE DeletedAt IS NULL AND IncidentType = 'Accident'
             ORDER BY IncidentDate DESC
             LIMIT 1`
        );
        const [recent] = await db.query(
            `SELECT *
             FROM Contractor_AccidentRecords
             WHERE DeletedAt IS NULL
             ORDER BY IncidentDate DESC, CreatedAt DESC
             LIMIT 5`
        );

        res.json({
            success: true,
            data: { year, byType, byParty, lastAccident: lastAccident || null, recent },
        });
    } catch (err) {
        console.error('Contractor accident stats error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงสถิติอุบัติเหตุได้' });
    }
});

// -----------------------------------------------------------------------------
// POST /accidents - create simple incident statistic record with many files
// -----------------------------------------------------------------------------
router.post('/accidents', isAdmin, upload.array('files', 20), async (req, res) => {
    const uploadedUrls = (req.files || []).map(file => file.path).filter(Boolean);
    try {
        await ensureTables();

        const incidentDate = trim(req.body.IncidentDate);
        const companyName = trim(req.body.CompanyName);
        if (!incidentDate) {
            uploadedUrls.forEach(deleteLocalUpload);
            return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่เกิดเหตุ' });
        }
        if (!companyName) {
            uploadedUrls.forEach(deleteLocalUpload);
            return res.status(400).json({ success: false, message: 'กรุณาระบุบริษัทผู้รับเหมา/ซัพพลายเออร์' });
        }

        const id = randomUUID();
        const incidentType = normalizeIncidentType(req.body.IncidentType);
        const partyType = normalizePartyType(req.body.PartyType);
        const involvedPerson = trim(req.body.InvolvedPerson).slice(0, 255) || null;
        const area = trim(req.body.Area).slice(0, 255) || null;
        const description = trim(req.body.Description) || null;
        const actorName = req.user.name || req.user.id;
        await ensureCompany(companyName, partyType, actorName);

        await db.query(
            `INSERT INTO Contractor_AccidentRecords
                (id, IncidentDate, IncidentType, PartyType, CompanyName, InvolvedPerson, Area, Description, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, incidentDate, incidentType, partyType, companyName.slice(0, 255), involvedPerson, area, description, actorName]
        );

        for (const file of req.files || []) {
            const ext = (file.originalname || '').split('.').pop().toLowerCase();
            await db.query(
                `INSERT INTO Contractor_AccidentFiles
                    (id, RecordID, FileUrl, PublicID, FileName, FileType, FileSize)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [randomUUID(), id, file.path, file.filename || null, file.originalname || null, ext || null, file.size || 0]
            );
        }

        await logActivity('accident_create', { id, Title: `${incidentType}: ${companyName}`, Category: partyType }, actorName);

        res.status(201).json({ success: true, message: 'บันทึกสถิติอุบัติเหตุสำเร็จ', id });
    } catch (err) {
        uploadedUrls.forEach(deleteLocalUpload);
        console.error('Contractor accident create error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกสถิติอุบัติเหตุได้' });
    }
});

// -----------------------------------------------------------------------------
// PUT /accidents/:id - update record metadata
// -----------------------------------------------------------------------------
router.put('/accidents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseId(req.params.id);
        const [rows] = await db.query('SELECT id FROM Contractor_AccidentRecords WHERE id = ? AND DeletedAt IS NULL', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการแก้ไข' });

        const incidentDate = trim(req.body.IncidentDate);
        const companyName = trim(req.body.CompanyName);
        if (!incidentDate) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่เกิดเหตุ' });
        if (!companyName) return res.status(400).json({ success: false, message: 'กรุณาระบุบริษัทผู้รับเหมา/ซัพพลายเออร์' });

        const actorName = req.user.name || req.user.id;
        const partyType = normalizePartyType(req.body.PartyType);
        await ensureCompany(companyName, partyType, actorName);

        await db.query(
            `UPDATE Contractor_AccidentRecords
             SET IncidentDate = ?, IncidentType = ?, PartyType = ?, CompanyName = ?, InvolvedPerson = ?, Area = ?, Description = ?
             WHERE id = ? AND DeletedAt IS NULL`,
            [
                incidentDate,
                normalizeIncidentType(req.body.IncidentType),
                partyType,
                companyName.slice(0, 255),
                trim(req.body.InvolvedPerson).slice(0, 255) || null,
                trim(req.body.Area).slice(0, 255) || null,
                trim(req.body.Description) || null,
                id,
            ]
        );

        await logActivity('accident_edit', { id, Title: `${normalizeIncidentType(req.body.IncidentType)}: ${companyName}`, Category: partyType }, actorName);

        res.json({ success: true, message: 'อัปเดตรายการสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor accident update error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตรายการได้' });
    }
});

// -----------------------------------------------------------------------------
// DELETE /accidents/:id - soft delete record and keep files for audit trail
// -----------------------------------------------------------------------------
router.delete('/accidents/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const id = parseId(req.params.id);
        const actorName = req.user.name || req.user.id;
        const [rows] = await db.query('SELECT id, IncidentType, CompanyName, PartyType FROM Contractor_AccidentRecords WHERE id = ? AND DeletedAt IS NULL', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการลบ' });

        await db.query(
            'UPDATE Contractor_AccidentRecords SET DeletedAt = NOW(), DeletedBy = ? WHERE id = ? AND DeletedAt IS NULL',
            [actorName, id]
        );
        await logActivity('accident_delete', { id, Title: `${rows[0].IncidentType}: ${rows[0].CompanyName}`, Category: rows[0].PartyType }, actorName);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor accident delete error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบรายการได้' });
    }
});

// -----------------------------------------------------------------------------
// POST /accidents/:id/files - add more attachments to an accident record
// -----------------------------------------------------------------------------
router.post('/accidents/:id/files', isAdmin, upload.array('files', 20), async (req, res) => {
    const uploadedUrls = (req.files || []).map(file => file.path).filter(Boolean);
    try {
        await ensureTables();
        const id = parseId(req.params.id);
        const [rows] = await db.query(
            'SELECT id, IncidentType, CompanyName, PartyType FROM Contractor_AccidentRecords WHERE id = ? AND DeletedAt IS NULL',
            [id]
        );
        if (!rows.length) {
            uploadedUrls.forEach(deleteLocalUpload);
            return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการเพิ่มไฟล์' });
        }
        if (!req.files?.length) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์แนบ' });
        }

        for (const file of req.files) {
            const ext = (file.originalname || '').split('.').pop().toLowerCase();
            await db.query(
                `INSERT INTO Contractor_AccidentFiles
                    (id, RecordID, FileUrl, PublicID, FileName, FileType, FileSize)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [randomUUID(), id, file.path, file.filename || null, file.originalname || null, ext || null, file.size || 0]
            );
        }

        const actorName = req.user.name || req.user.id;
        await logActivity('accident_file_add', { id, Title: `${rows[0].IncidentType}: ${rows[0].CompanyName}`, Category: rows[0].PartyType }, actorName);
        res.status(201).json({ success: true, message: 'เพิ่มไฟล์แนบสำเร็จ' });
    } catch (err) {
        uploadedUrls.forEach(deleteLocalUpload);
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor accident file add error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มไฟล์แนบได้' });
    }
});

// -----------------------------------------------------------------------------
// DELETE /accident-files/:fileId - delete one accident attachment
// -----------------------------------------------------------------------------
router.delete('/accident-files/:fileId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const fileId = parseId(req.params.fileId);
        const [rows] = await db.query(
            `SELECT f.id, f.RecordID, f.FileUrl, r.IncidentType, r.CompanyName, r.PartyType
             FROM Contractor_AccidentFiles f
             LEFT JOIN Contractor_AccidentRecords r ON r.id = f.RecordID
             WHERE f.id = ?`,
            [fileId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์แนบที่ต้องการลบ' });

        await db.query('DELETE FROM Contractor_AccidentFiles WHERE id = ?', [fileId]);
        deleteLocalUpload(rows[0].FileUrl);

        const actorName = req.user.name || req.user.id;
        await logActivity('accident_file_delete', {
            id: rows[0].RecordID,
            Title: `${rows[0].IncidentType || 'Incident'}: ${rows[0].CompanyName || ''}`,
            Category: rows[0].PartyType || 'Contractor',
        }, actorName);

        res.json({ success: true, message: 'ลบไฟล์แนบสำเร็จ' });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        console.error('Contractor accident file delete error:', err);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบไฟล์แนบได้' });
    }
});

module.exports = router;
