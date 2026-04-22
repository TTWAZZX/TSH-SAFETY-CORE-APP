// backend/routes/safety-culture.js
// Auth (authenticateToken) applied at mount level in server.js
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_PRINCIPLES = [
    { id: 'sc-p-01', sort: 1, title: 'เดินบน Walk Way ที่บริษัทจัดให้',
      description: 'พนักงานต้องเดินบนเส้นทาง Walk Way ที่กำหนดเท่านั้น เพื่อป้องกันอุบัติเหตุจากรถยนต์และรถ Forklift ภายในบริษัท' },
    { id: 'sc-p-02', sort: 2, title: 'ไม่ใช้โทรศัพท์มือถือขณะเดิน',
      description: 'ห้ามใช้โทรศัพท์มือถือขณะเดิน เพื่อให้สามารถสังเกตสภาพแวดล้อมรอบข้างได้อย่างเต็มที่และป้องกันอุบัติเหตุ' },
    { id: 'sc-p-03', sort: 3, title: 'ข้ามถนนบริเวณทางม้าลายของบริษัท',
      description: 'ต้องข้ามถนนบริเวณทางม้าลายที่กำหนดเท่านั้น ห้ามข้ามถนนในจุดที่ไม่ได้กำหนดโดยเด็ดขาด' },
    { id: 'sc-p-04', sort: 4, title: 'หยุดยืนชี้นิ้วตรวจสอบความปลอดภัยก่อนข้ามถนนทุกครั้ง',
      description: 'ก่อนข้ามถนนทุกครั้ง ต้องหยุด ยืน ชี้นิ้ว และมองซ้าย-ขวา เพื่อตรวจสอบความปลอดภัยก่อนข้าม (Pointing & Calling)' },
    { id: 'sc-p-05', sort: 5, title: 'ไม่เดินล้วงกระเป๋า เพื่อให้มือพร้อมช่วยพยุงตัวเมื่อเกิดเหตุไม่คาดคิด',
      description: 'ห้ามเดินโดยล้วงมือในกระเป๋า เพื่อให้มือพร้อมช่วยพยุงตัวเมื่อเกิดเหตุไม่คาดคิด เช่น การสะดุดหรือลื่นหกล้ม' },
    { id: 'sc-p-06', sort: 6, title: 'PPE Control แต่งกายตามระเบียบปฏิบัติ',
      description: 'พนักงานต้องสวมใส่อุปกรณ์ป้องกันภัยส่วนบุคคล (PPE) ตามที่กำหนดในแต่ละพื้นที่การทำงาน ใช้ PPE Inspection Checklist Form แยก' },
    { id: 'sc-p-07', sort: 7, title: 'แยกขยะถูกต้องตามมาตรฐานของบริษัท',
      description: 'พนักงานต้องแยกขยะตามประเภทที่บริษัทกำหนด เพื่อรักษาความสะอาดและลดผลกระทบต่อสิ่งแวดล้อมขององค์กร' },
];

let tableReady = false;

async function ensureTables() {
    if (tableReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_Principles (
            PrincipleID    VARCHAR(36)  PRIMARY KEY,
            SortOrder      INT          NOT NULL DEFAULT 0,
            Title          VARCHAR(200) NOT NULL,
            Description    TEXT,
            ImageUrl       TEXT,
            AttachmentUrl  TEXT,
            AttachmentName VARCHAR(255),
            UpdatedAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    const [existing] = await db.query('SELECT COUNT(*) AS cnt FROM SC_Principles');
    if (existing[0].cnt === 0) {
        for (const p of DEFAULT_PRINCIPLES) {
            await db.query(
                `INSERT INTO SC_Principles (PrincipleID, SortOrder, Title, Description) VALUES (?,?,?,?)`,
                [p.id, p.sort, p.title, p.description]
            );
        }
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_Assessments (
            AssessmentID   VARCHAR(36)   PRIMARY KEY,
            AssessmentYear INT           NOT NULL,
            Area           VARCHAR(100)  DEFAULT 'ทั้งหมด',
            T1_Score       DECIMAL(3,1)  DEFAULT NULL,
            T2_Score       DECIMAL(3,1)  DEFAULT NULL,
            T3_Score       DECIMAL(3,1)  DEFAULT NULL,
            T4_Score       DECIMAL(3,1)  DEFAULT NULL,
            T5_Score       DECIMAL(3,1)  DEFAULT NULL,
            T7_Score       DECIMAL(3,1)  DEFAULT NULL,
            Notes          TEXT,
            CreatedBy      VARCHAR(100),
            CreatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_year (AssessmentYear)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPEInspections (
            InspectionID   VARCHAR(36)  PRIMARY KEY,
            InspectionDate DATE         NOT NULL,
            Area           VARCHAR(100) DEFAULT NULL,
            Department     VARCHAR(100) DEFAULT NULL,
            InspectorID    VARCHAR(50)  NOT NULL,
            InspectorName  VARCHAR(100) DEFAULT NULL,
            Helmet         VARCHAR(20)  DEFAULT NULL,
            Glasses        VARCHAR(20)  DEFAULT NULL,
            Gloves         VARCHAR(20)  DEFAULT NULL,
            Shoes          VARCHAR(20)  DEFAULT NULL,
            FaceShield     VARCHAR(20)  DEFAULT NULL,
            EarPlug        VARCHAR(20)  DEFAULT NULL,
            TotalItems     INT          DEFAULT 0,
            CompliantItems INT          DEFAULT 0,
            CompliancePct  DECIMAL(5,2) DEFAULT 0,
            Notes          TEXT,
            ImageUrl       TEXT,
            CreatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_date (InspectionDate),
            KEY idx_dept (Department)
        )
    `);

    await db.query(`ALTER TABLE SC_Assessments ADD COLUMN AssessmentDate DATE DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_Assessments ADD COLUMN WeekNo TINYINT DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_Assessments ADD COLUMN TopicAreas TEXT DEFAULT NULL`).catch(() => {});

    // Widen score columns from DECIMAL(3,1) to DECIMAL(5,2) to support 0–100% scale
    const scoreCols = ['T1_Score','T2_Score','T3_Score','T4_Score','T5_Score','T7_Score'];
    for (const col of scoreCols) {
        await db.query(`ALTER TABLE SC_Assessments MODIFY COLUMN ${col} DECIMAL(5,2) DEFAULT NULL`).catch(() => {});
    }

    // One-time migration: convert legacy 1–5 scores to 0–100% (multiply by 20)
    // Safe to re-run: WHERE condition only matches scores ≤ 5 (pre-migration values)
    await db.query(`
        UPDATE SC_Assessments
        SET T1_Score = IF(T1_Score IS NOT NULL AND T1_Score <= 5, T1_Score * 20, T1_Score),
            T2_Score = IF(T2_Score IS NOT NULL AND T2_Score <= 5, T2_Score * 20, T2_Score),
            T3_Score = IF(T3_Score IS NOT NULL AND T3_Score <= 5, T3_Score * 20, T3_Score),
            T4_Score = IF(T4_Score IS NOT NULL AND T4_Score <= 5, T4_Score * 20, T4_Score),
            T5_Score = IF(T5_Score IS NOT NULL AND T5_Score <= 5, T5_Score * 20, T5_Score),
            T7_Score = IF(T7_Score IS NOT NULL AND T7_Score <= 5, T7_Score * 20, T7_Score)
        WHERE (T1_Score IS NOT NULL AND T1_Score <= 5)
           OR (T2_Score IS NOT NULL AND T2_Score <= 5)
           OR (T3_Score IS NOT NULL AND T3_Score <= 5)
           OR (T4_Score IS NOT NULL AND T4_Score <= 5)
           OR (T5_Score IS NOT NULL AND T5_Score <= 5)
           OR (T7_Score IS NOT NULL AND T7_Score <= 5)
    `).catch(() => {});

    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_Assessment_Points (
            PointID      VARCHAR(36)  PRIMARY KEY,
            AssessmentID VARCHAR(36)  NOT NULL,
            PointNo      TINYINT      NOT NULL,
            TopicKey     VARCHAR(10)  NOT NULL,
            TotalPeople  INT          NOT NULL DEFAULT 0,
            ComplyPeople INT          NOT NULL DEFAULT 0,
            Pct          DECIMAL(5,2) DEFAULT NULL,
            KEY idx_asmpt (AssessmentID),
            KEY idx_topic (TopicKey)
        )
    `).catch(() => {});

    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPE_Items (
            ItemID    VARCHAR(36)  PRIMARY KEY,
            ItemName  VARCHAR(100) NOT NULL,
            SortOrder INT          NOT NULL DEFAULT 99,
            IsActive  TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const [itemCount] = await db.query('SELECT COUNT(*) AS cnt FROM SC_PPE_Items');
    if (itemCount[0].cnt === 0) {
        const defaultItems = [
            'Safety Helmet', 'Safety Glasses', 'Gloves',
            'Safety Shoes', 'Face Shield', 'Ear Plug',
        ];
        for (let i = 0; i < defaultItems.length; i++) {
            await db.query(
                `INSERT INTO SC_PPE_Items (ItemID, ItemName, SortOrder) VALUES (?,?,?)`,
                [uuidv4(), defaultItems[i], i + 1]
            );
        }
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPE_Inspection_Details (
            DetailID     VARCHAR(36) PRIMARY KEY,
            InspectionID VARCHAR(36) NOT NULL,
            ItemID       VARCHAR(36) NOT NULL,
            Status       VARCHAR(20) DEFAULT NULL,
            KEY idx_insp (InspectionID),
            KEY idx_item (ItemID)
        )
    `);

    // PPE Work Types (admin-configurable templates)
    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPE_WorkTypes (
            WorkTypeID  VARCHAR(36)  PRIMARY KEY,
            Name        VARCHAR(100) NOT NULL,
            Description TEXT,
            SortOrder   INT          NOT NULL DEFAULT 99,
            IsActive    TINYINT(1)   NOT NULL DEFAULT 1,
            CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Work Type → PPE Item mapping
    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPE_WorkType_Items (
            ID         INT AUTO_INCREMENT PRIMARY KEY,
            WorkTypeID VARCHAR(36) NOT NULL,
            ItemID     VARCHAR(36) NOT NULL,
            UNIQUE KEY uq_wt_item (WorkTypeID, ItemID),
            KEY idx_wt (WorkTypeID)
        )
    `);

    // Employee PPE violation records
    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPE_Violations (
            ViolationID   VARCHAR(36)  PRIMARY KEY,
            EmployeeID    VARCHAR(50)  NOT NULL,
            EmployeeName  VARCHAR(100),
            Department    VARCHAR(100),
            InspectionID  VARCHAR(36),
            ViolationNo   INT          NOT NULL DEFAULT 1,
            WarningLevel  VARCHAR(30)  NOT NULL DEFAULT 'verbal',
            InspectorID   VARCHAR(50),
            InspectorName VARCHAR(100),
            Note          TEXT,
            ViolationDate DATE         NOT NULL,
            CreatedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_emp  (EmployeeID),
            KEY idx_insp (InspectionID),
            KEY idx_date (ViolationDate)
        )
    `);

    // Extend SC_PPEInspections with new columns
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN WorkTypeID VARCHAR(36) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN WorkTypeName VARCHAR(100) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN InspectedEmployeeID VARCHAR(50) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN InspectedEmployeeName VARCHAR(100) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN IsPass TINYINT(1) DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN IsUnregistered TINYINT(1) DEFAULT 0`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN deleted_at DATETIME DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD COLUMN WorkTypeSnapshot JSON DEFAULT NULL`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPE_Violations  ADD COLUMN deleted_at DATETIME DEFAULT NULL`).catch(() => {});

    // Performance indexes
    await db.query(`ALTER TABLE SC_PPEInspections ADD INDEX idx_del  (deleted_at)`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD INDEX idx_emp2 (InspectedEmployeeID)`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPEInspections ADD INDEX idx_cat  (CreatedAt)`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPE_Violations  ADD INDEX idx_vdel (deleted_at)`).catch(() => {});
    await db.query(`ALTER TABLE SC_PPE_AuditLog    ADD INDEX idx_adel (CreatedAt)`).catch(() => {});

    // Normalize legacy Status values to lowercase enum before adding constraint
    await db.query(`UPDATE SC_PPE_Inspection_Details SET Status='compliant'     WHERE Status='Compliant'`).catch(() => {});
    await db.query(`UPDATE SC_PPE_Inspection_Details SET Status='non-compliant' WHERE Status='Non-Compliant'`).catch(() => {});
    await db.query(`UPDATE SC_PPE_Inspection_Details SET Status='na'            WHERE Status='' OR Status IS NULL`).catch(() => {});

    // CHECK constraint — enforced on TiDB ≥ 7.5; parsed but not enforced on older versions (still documents intent)
    await db.query(`ALTER TABLE SC_PPE_Inspection_Details ADD CONSTRAINT chk_ppe_status CHECK (Status IN ('compliant','non-compliant','na'))`).catch(() => {});

    // FK: Details → Inspections (TiDB Cloud supports FK since 6.6; safe to attempt)
    await db.query(`ALTER TABLE SC_PPE_Inspection_Details ADD CONSTRAINT fk_ppeid FOREIGN KEY (InspectionID) REFERENCES SC_PPEInspections(InspectionID)`).catch(() => {});
    // FK: Violations → Inspections (nullable — only for linked violations)
    await db.query(`ALTER TABLE SC_PPE_Violations ADD CONSTRAINT fk_viol_insp FOREIGN KEY (InspectionID) REFERENCES SC_PPEInspections(InspectionID)`).catch(() => {});

    // Audit log table for PPE mutations
    await db.query(`
        CREATE TABLE IF NOT EXISTS SC_PPE_AuditLog (
            AuditID    VARCHAR(36)  PRIMARY KEY,
            Action     VARCHAR(30)  NOT NULL,
            EntityType VARCHAR(30)  NOT NULL,
            EntityID   VARCHAR(36)  NOT NULL,
            UserID     VARCHAR(50)  NOT NULL,
            UserName   VARCHAR(100),
            Detail     TEXT,
            CreatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_entity (EntityType, EntityID),
            KEY idx_user   (UserID),
            KEY idx_ts     (CreatedAt)
        )
    `).catch(() => {});

    tableReady = true;
}

async function _ppeAudit(action, entityType, entityId, user, detail) {
    const sql  = `INSERT INTO SC_PPE_AuditLog (AuditID, Action, EntityType, EntityID, UserID, UserName, Detail) VALUES (?,?,?,?,?,?,?)`;
    const vals = (id) => [id, action, entityType, entityId, user?.id || '', user?.name || '', detail || null];
    try {
        await db.query(sql, vals(uuidv4()));
    } catch (e1) {
        // Retry once with a fresh UUID (handles transient connection drops)
        try {
            await db.query(sql, vals(uuidv4()));
        } catch (e2) {
            console.error('[PPE Audit] FAILED after retry — action:', action, 'entity:', entityType, entityId,
                '\n  attempt1:', e1.message, '\n  attempt2:', e2.message);
        }
    }
}

// Normalise incoming PPE Status to strict lowercase enum
const PPE_STATUS_ENUM = new Set(['compliant', 'non-compliant', 'na']);
function normalizeItemStatus(raw) {
    if (raw === null || raw === undefined) return null; // caller must reject nulls
    const s = String(raw).toLowerCase().trim();
    if (s === '' || s === 'na' || s === 'n/a') return 'na';
    if (s === 'compliant') return 'compliant';
    if (s === 'non-compliant' || s === 'noncompliant') return 'non-compliant';
    throw new Error(`ค่าสถานะ PPE ไม่ถูกต้อง: "${raw}"`);
}

// GET /api/safety-culture/principles
router.get('/principles', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query('SELECT * FROM SC_Principles ORDER BY SortOrder');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/safety-culture/principles/:id (admin)
router.put('/principles/:id', isAdmin, async (req, res) => {
    try {
        const { Title, Description, ImageUrl, AttachmentUrl, AttachmentName } = req.body;
        if (!Title) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อหัวข้อ' });
        await db.query(
            `UPDATE SC_Principles SET Title=?, Description=?, ImageUrl=?, AttachmentUrl=?, AttachmentName=? WHERE PrincipleID=?`,
            [Title, Description || null, ImageUrl || null, AttachmentUrl || null, AttachmentName || null, req.params.id]
        );
        res.json({ success: true, message: 'อัปเดตหลักการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const TOPIC_KEYS = ['T1','T2','T3','T4','T5','T7'];

// Parse and sanitize topicAreas JSON from client → returns JSON string or null
function _parseTopicAreas(raw) {
    if (!raw) return null;
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (typeof obj !== 'object' || Array.isArray(obj)) return null;
        const clean = {};
        TOPIC_KEYS.forEach(k => {
            if (obj[k] && typeof obj[k] === 'string' && obj[k].trim()) {
                clean[k] = obj[k].trim().substring(0, 200);
            }
        });
        return Object.keys(clean).length ? JSON.stringify(clean) : null;
    } catch { return null; }
}

// Validate a score field: empty/null → null, out-of-range → throws
function parseScore(val, key) {
    if (val === '' || val == null) return null;
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > 100) throw new Error(`${key} ต้องอยู่ระหว่าง 0–100`);
    return Math.round(n * 100) / 100;
}

// GET /api/safety-culture/assessments
router.get('/assessments', async (req, res) => {
    try {
        await ensureTables();
        const { year } = req.query;
        let sql = 'SELECT * FROM SC_Assessments';
        const params = [];
        if (year) { sql += ' WHERE AssessmentYear = ?'; params.push(parseInt(year)); }
        sql += ' ORDER BY COALESCE(AssessmentDate, MAKEDATE(AssessmentYear, 1)) DESC, WeekNo DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        if (rows.length) {
            const ids = rows.map(r => r.AssessmentID);
            const ph  = ids.map(() => '?').join(',');
            const [pts] = await db.query(
                `SELECT * FROM SC_Assessment_Points WHERE AssessmentID IN (${ph}) ORDER BY TopicKey, PointNo`,
                ids
            );
            const ptMap = {};
            pts.forEach(p => {
                if (!ptMap[p.AssessmentID]) ptMap[p.AssessmentID] = [];
                ptMap[p.AssessmentID].push(p);
            });
            rows.forEach(r => {
                r.points = ptMap[r.AssessmentID] || [];
                try { r.topicAreas = r.TopicAreas ? JSON.parse(r.TopicAreas) : {}; } catch { r.topicAreas = {}; }
            });
        }
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/safety-culture/assessments (admin)
router.post('/assessments', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { AssessmentDate, Area, Notes } = req.body;
        const rawYear = req.body.AssessmentYear;
        let AssessmentYear;
        if (AssessmentDate) {
            AssessmentYear = parseInt(String(AssessmentDate).split('-')[0], 10);
        } else if (rawYear) {
            AssessmentYear = parseInt(rawYear, 10);
        }
        if (!AssessmentYear) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่หรือปีการประเมิน' });
        let T1, T2, T3, T4, T5, T7;
        try {
            T1 = parseScore(req.body.T1_Score, 'T1');
            T2 = parseScore(req.body.T2_Score, 'T2');
            T3 = parseScore(req.body.T3_Score, 'T3');
            T4 = parseScore(req.body.T4_Score, 'T4');
            T5 = parseScore(req.body.T5_Score, 'T5');
            T7 = parseScore(req.body.T7_Score, 'T7');
        } catch (e) {
            return res.status(400).json({ success: false, message: e.message });
        }
        const id         = uuidv4();
        const weekNoRaw  = req.body.WeekNo != null ? parseInt(req.body.WeekNo, 10) : null;
        const weekNo     = weekNoRaw != null && !isNaN(weekNoRaw) ? Math.min(4, Math.max(1, weekNoRaw)) : null;
        const topicAreas = _parseTopicAreas(req.body.topicAreas);
        await db.query(
            `INSERT INTO SC_Assessments (AssessmentID, AssessmentYear, AssessmentDate, WeekNo, Area, T1_Score, T2_Score, T3_Score, T4_Score, T5_Score, T7_Score, Notes, CreatedBy, TopicAreas)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, AssessmentYear, AssessmentDate || null, weekNo, Area || 'ทั้งหมด', T1, T2, T3, T4, T5, T7, Notes || null, req.user.name, topicAreas]
        );
        // Save observation points
        const rawPoints = req.body.points;
        if (rawPoints) {
            try {
                const pts = typeof rawPoints === 'string' ? JSON.parse(rawPoints) : rawPoints;
                for (const pt of (Array.isArray(pts) ? pts : [])) {
                    if (!pt.TopicKey || !pt.PointNo) continue;
                    const total  = Math.max(0, parseInt(pt.TotalPeople)  || 0);
                    const comply = Math.max(0, parseInt(pt.ComplyPeople) || 0);
                    const pct    = total > 0 ? Math.round((comply / total) * 10000) / 100 : null;
                    await db.query(
                        `INSERT INTO SC_Assessment_Points (PointID, AssessmentID, PointNo, TopicKey, TotalPeople, ComplyPeople, Pct) VALUES (?,?,?,?,?,?,?)`,
                        [uuidv4(), id, pt.PointNo, pt.TopicKey, total, comply, pct]
                    );
                }
            } catch (e) { /* ignore malformed points */ }
        }
        res.json({ success: true, message: 'บันทึกผลการประเมินสำเร็จ', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/safety-culture/assessments/:id (admin)
router.put('/assessments/:id', isAdmin, async (req, res) => {
    try {
        const [chk] = await db.query('SELECT AssessmentID FROM SC_Assessments WHERE AssessmentID=?', [req.params.id]);
        if (!chk.length) return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการประเมิน' });
        const { AssessmentDate, Area, Notes } = req.body;
        const rawYear = req.body.AssessmentYear;
        let AssessmentYear;
        if (AssessmentDate) {
            AssessmentYear = parseInt(String(AssessmentDate).split('-')[0], 10);
        } else if (rawYear) {
            AssessmentYear = parseInt(rawYear, 10);
        }
        let T1, T2, T3, T4, T5, T7;
        try {
            T1 = parseScore(req.body.T1_Score, 'T1');
            T2 = parseScore(req.body.T2_Score, 'T2');
            T3 = parseScore(req.body.T3_Score, 'T3');
            T4 = parseScore(req.body.T4_Score, 'T4');
            T5 = parseScore(req.body.T5_Score, 'T5');
            T7 = parseScore(req.body.T7_Score, 'T7');
        } catch (e) {
            return res.status(400).json({ success: false, message: e.message });
        }
        const weekNoRaw  = req.body.WeekNo != null ? parseInt(req.body.WeekNo, 10) : null;
        const weekNo     = weekNoRaw != null && !isNaN(weekNoRaw) ? Math.min(4, Math.max(1, weekNoRaw)) : null;
        const topicAreas = _parseTopicAreas(req.body.topicAreas);
        await db.query(
            `UPDATE SC_Assessments SET AssessmentYear=?, AssessmentDate=?, WeekNo=?, Area=?, T1_Score=?, T2_Score=?, T3_Score=?, T4_Score=?, T5_Score=?, T7_Score=?, Notes=?, TopicAreas=? WHERE AssessmentID=?`,
            [AssessmentYear || null, AssessmentDate || null, weekNo, Area || 'ทั้งหมด', T1, T2, T3, T4, T5, T7, Notes || null, topicAreas, req.params.id]
        );
        // Replace observation points
        await db.query('DELETE FROM SC_Assessment_Points WHERE AssessmentID = ?', [req.params.id]);
        const rawPoints = req.body.points;
        if (rawPoints) {
            try {
                const pts = typeof rawPoints === 'string' ? JSON.parse(rawPoints) : rawPoints;
                for (const pt of (Array.isArray(pts) ? pts : [])) {
                    if (!pt.TopicKey || !pt.PointNo) continue;
                    const total  = Math.max(0, parseInt(pt.TotalPeople)  || 0);
                    const comply = Math.max(0, parseInt(pt.ComplyPeople) || 0);
                    const pct    = total > 0 ? Math.round((comply / total) * 10000) / 100 : null;
                    await db.query(
                        `INSERT INTO SC_Assessment_Points (PointID, AssessmentID, PointNo, TopicKey, TotalPeople, ComplyPeople, Pct) VALUES (?,?,?,?,?,?,?)`,
                        [uuidv4(), req.params.id, pt.PointNo, pt.TopicKey, total, comply, pct]
                    );
                }
            } catch (e) { /* ignore malformed points */ }
        }
        res.json({ success: true, message: 'อัปเดตผลการประเมินสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/safety-culture/assessments/:id (admin)
router.delete('/assessments/:id', isAdmin, async (req, res) => {
    try {
        const [chk] = await db.query('SELECT AssessmentID FROM SC_Assessments WHERE AssessmentID=?', [req.params.id]);
        if (!chk.length) return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการประเมิน' });
        await db.query('DELETE FROM SC_Assessment_Points WHERE AssessmentID = ?', [req.params.id]);
        await db.query('DELETE FROM SC_Assessments WHERE AssessmentID = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบผลการประเมินสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/safety-culture/ppe-items
router.get('/ppe-items', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(
            'SELECT * FROM SC_PPE_Items WHERE IsActive = 1 ORDER BY SortOrder, CreatedAt'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/safety-culture/ppe-items (admin)
router.post('/ppe-items', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { ItemName, SortOrder } = req.body;
        if (!ItemName?.trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อรายการ PPE' });
        const [maxSort] = await db.query('SELECT COALESCE(MAX(SortOrder),0)+1 AS next FROM SC_PPE_Items');
        const sort = SortOrder ? parseInt(SortOrder) : maxSort[0].next;
        const id   = uuidv4();
        await db.query('INSERT INTO SC_PPE_Items (ItemID, ItemName, SortOrder) VALUES (?,?,?)', [id, ItemName.trim(), sort]);
        res.json({ success: true, message: 'เพิ่มรายการ PPE สำเร็จ', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/safety-culture/ppe-items/:id (admin)
router.put('/ppe-items/:id', isAdmin, async (req, res) => {
    try {
        const { ItemName, SortOrder } = req.body;
        if (!ItemName?.trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อรายการ PPE' });
        await db.query(
            'UPDATE SC_PPE_Items SET ItemName=?, SortOrder=? WHERE ItemID=?',
            [ItemName.trim(), SortOrder ? parseInt(SortOrder) : 99, req.params.id]
        );
        res.json({ success: true, message: 'แก้ไขรายการ PPE สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/safety-culture/ppe-items/:id (admin)
router.delete('/ppe-items/:id', isAdmin, async (req, res) => {
    try {
        const [used] = await db.query('SELECT COUNT(*) AS cnt FROM SC_PPE_Inspection_Details WHERE ItemID=?', [req.params.id]);
        if (used[0].cnt > 0) {
            // Soft-delete if used in existing inspections
            await db.query('UPDATE SC_PPE_Items SET IsActive=0 WHERE ItemID=?', [req.params.id]);
        } else {
            await db.query('DELETE FROM SC_PPE_Items WHERE ItemID=?', [req.params.id]);
        }
        res.json({ success: true, message: 'ลบรายการ PPE สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PPE Work Types ──────────────────────────────────────────────────────────

// GET /api/safety-culture/ppe-work-types
router.get('/ppe-work-types', async (req, res) => {
    try {
        await ensureTables();
        const [wts] = await db.query('SELECT * FROM SC_PPE_WorkTypes WHERE IsActive=1 ORDER BY SortOrder, Name');
        if (wts.length) {
            const ph = wts.map(() => '?').join(',');
            const [items] = await db.query(
                `SELECT wi.WorkTypeID, wi.ItemID, pi.ItemName, pi.SortOrder
                 FROM SC_PPE_WorkType_Items wi JOIN SC_PPE_Items pi ON wi.ItemID = pi.ItemID
                 WHERE wi.WorkTypeID IN (${ph}) ORDER BY pi.SortOrder`,
                wts.map(w => w.WorkTypeID)
            );
            const itemMap = {};
            items.forEach(it => { if (!itemMap[it.WorkTypeID]) itemMap[it.WorkTypeID] = []; itemMap[it.WorkTypeID].push(it); });
            wts.forEach(w => { w.items = itemMap[w.WorkTypeID] || []; });
        }
        res.json({ success: true, data: wts });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/safety-culture/ppe-work-types (admin)
router.post('/ppe-work-types', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Name, Description, SortOrder, itemIds } = req.body;
        if (!Name?.trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อประเภทงาน' });
        const id = uuidv4();
        await db.query('INSERT INTO SC_PPE_WorkTypes (WorkTypeID, Name, Description, SortOrder) VALUES (?,?,?,?)',
            [id, Name.trim().substring(0, 100), Description || null, parseInt(SortOrder) || 99]);
        const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];
        for (const itemId of ids) {
            await db.query('INSERT IGNORE INTO SC_PPE_WorkType_Items (WorkTypeID, ItemID) VALUES (?,?)', [id, itemId]);
        }
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/safety-culture/ppe-work-types/:id (admin)
router.put('/ppe-work-types/:id', isAdmin, async (req, res) => {
    try {
        const { Name, Description, SortOrder, itemIds } = req.body;
        if (!Name?.trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อประเภทงาน' });
        await db.query('UPDATE SC_PPE_WorkTypes SET Name=?, Description=?, SortOrder=? WHERE WorkTypeID=?',
            [Name.trim().substring(0, 100), Description || null, parseInt(SortOrder) || 99, req.params.id]);
        await db.query('DELETE FROM SC_PPE_WorkType_Items WHERE WorkTypeID=?', [req.params.id]);
        const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];
        for (const itemId of ids) {
            await db.query('INSERT IGNORE INTO SC_PPE_WorkType_Items (WorkTypeID, ItemID) VALUES (?,?)', [req.params.id, itemId]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/safety-culture/ppe-work-types/:id (admin)
router.delete('/ppe-work-types/:id', isAdmin, async (req, res) => {
    try {
        await db.query('UPDATE SC_PPE_WorkTypes SET IsActive=0 WHERE WorkTypeID=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PPE Violations ──────────────────────────────────────────────────────────

// GET /api/safety-culture/ppe-violations/summary — must be before /:id
router.get('/ppe-violations/summary', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { year } = req.query;
        let sql = `SELECT EmployeeID, EmployeeName, Department,
                   COUNT(*) AS total, MAX(ViolationNo) AS highestNo,
                   SUBSTRING_INDEX(GROUP_CONCAT(WarningLevel ORDER BY ViolationNo DESC SEPARATOR ','), ',', 1) AS latestLevel,
                   MAX(ViolationDate) AS lastDate
                   FROM SC_PPE_Violations WHERE (deleted_at IS NULL)`;
        const params = [];
        if (year) { sql += ' AND YEAR(ViolationDate)=?'; params.push(parseInt(year)); }
        sql += ' GROUP BY EmployeeID, EmployeeName, Department ORDER BY total DESC, lastDate DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/safety-culture/ppe-violations
router.get('/ppe-violations', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { year, employeeId, department } = req.query;
        let sql = 'SELECT * FROM SC_PPE_Violations WHERE (deleted_at IS NULL)';
        const params = [];
        if (year)       { sql += ' AND YEAR(ViolationDate)=?'; params.push(parseInt(year)); }
        if (employeeId) { sql += ' AND EmployeeID=?';          params.push(employeeId); }
        if (department) { sql += ' AND Department=?';           params.push(department); }
        sql += ' ORDER BY ViolationDate DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/safety-culture/ppe-violations (admin — atomic violation count)
router.post('/ppe-violations', isAdmin, async (req, res) => {
    const { EmployeeID, EmployeeName, Department, InspectionID, InspectorID, InspectorName, Note, ViolationDate } = req.body;
    const cleanEmpId   = (EmployeeID   || '').trim();
    const cleanEmpName = (EmployeeName || '').trim();
    if (!cleanEmpId && !cleanEmpName)
        return res.status(400).json({ success: false, message: 'กรุณาระบุพนักงานที่ละเมิด (รหัสพนักงานหรือชื่อ)' });
    if (!ViolationDate)
        return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่' });
    // Stable lookup key: registered = EmployeeID, unregistered = name-based prefix
    const stableKey = cleanEmpId || `__unreg__:${cleanEmpName.toLowerCase()}`;
    const conn = await db.getConnection();
    try {
        await ensureTables();
        await conn.beginTransaction();
        const [[cnt]] = await conn.query(
            'SELECT COUNT(*) AS c FROM SC_PPE_Violations WHERE (deleted_at IS NULL) AND EmployeeID=? FOR UPDATE',
            [stableKey]
        );
        const violationNo  = (cnt.c || 0) + 1;
        const warningLevel = violationNo >= 3 ? 'written_warning' : violationNo === 2 ? 'safety_notice' : 'verbal';
        const id = uuidv4();
        await conn.query(
            `INSERT INTO SC_PPE_Violations
             (ViolationID, EmployeeID, EmployeeName, Department, InspectionID, ViolationNo, WarningLevel, InspectorID, InspectorName, Note, ViolationDate)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [id, stableKey, cleanEmpName || cleanEmpId, Department || null, InspectionID || null,
             violationNo, warningLevel, InspectorID || null, InspectorName || null, Note || null, ViolationDate]
        );
        await conn.commit();
        await _ppeAudit('create', 'violation', id, req.user,
            `Emp:${cleanEmpName||cleanEmpId} No:${violationNo} Level:${warningLevel}`);
        res.json({ success: true, id, violationNo, warningLevel });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

// DELETE /api/safety-culture/ppe-violations/:id (admin — soft delete)
router.delete('/ppe-violations/:id', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT ViolationID, EmployeeName, ViolationNo FROM SC_PPE_Violations WHERE ViolationID=? AND (deleted_at IS NULL)', [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการฝ่าฝืน' });
        await db.query('UPDATE SC_PPE_Violations SET deleted_at=NOW() WHERE ViolationID=?', [req.params.id]);
        await _ppeAudit('delete', 'violation', req.params.id, req.user,
            `Emp:${rows[0].EmployeeName||'—'} No:${rows[0].ViolationNo}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PPE Inspections ─────────────────────────────────────────────────────────

// GET /api/safety-culture/ppe-inspections
router.get('/ppe-inspections', async (req, res) => {
    try {
        await ensureTables();
        const { year, department } = req.query;
        let sql = 'SELECT * FROM SC_PPEInspections WHERE (deleted_at IS NULL)';
        const params = [];
        if (year)       { sql += ' AND YEAR(InspectionDate) = ?'; params.push(parseInt(year)); }
        if (department) { sql += ' AND Department = ?';            params.push(department); }
        sql += ' ORDER BY InspectionDate DESC';
        const [rows] = await db.query(sql, params);
        if (rows.length) {
            const ids = rows.map(r => r.InspectionID);
            const ph  = ids.map(() => '?').join(',');
            const [details] = await db.query(
                `SELECT d.*, i.ItemName, i.SortOrder FROM SC_PPE_Inspection_Details d
                 JOIN SC_PPE_Items i ON d.ItemID = i.ItemID
                 WHERE d.InspectionID IN (${ph}) ORDER BY i.SortOrder`,
                ids
            );
            const detMap = {};
            details.forEach(d => {
                if (!detMap[d.InspectionID]) detMap[d.InspectionID] = [];
                detMap[d.InspectionID].push(d);
            });
            // Fetch violation counts for inspected employees
            const empIds = [...new Set(rows.map(r => r.InspectedEmployeeID).filter(Boolean))];
            let violMap = {};
            if (empIds.length) {
                const eph = empIds.map(() => '?').join(',');
                const [vcnts] = await db.query(
                    `SELECT EmployeeID, COUNT(*) AS cnt, MAX(WarningLevel) AS level FROM SC_PPE_Violations WHERE (deleted_at IS NULL) AND EmployeeID IN (${eph}) GROUP BY EmployeeID`,
                    empIds
                );
                vcnts.forEach(v => { violMap[v.EmployeeID] = { cnt: v.cnt, level: v.level }; });
            }
            rows.forEach(r => {
                r.details = detMap[r.InspectionID] || [];
                if (r.InspectedEmployeeID && violMap[r.InspectedEmployeeID]) {
                    r.violationCount = violMap[r.InspectedEmployeeID].cnt;
                    r.warningLevel   = violMap[r.InspectedEmployeeID].level;
                }
            });
        }
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/safety-culture/ppe-inspections (admin only)
router.post('/ppe-inspections', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { InspectionDate, Area, Department, Notes, ImageUrl,
                WorkTypeID, WorkTypeName,
                InspectedEmployeeID, InspectedEmployeeName,
                InspectorID, InspectorName } = req.body;
        if (!InspectionDate) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่ตรวจ' });
        if (!Department?.trim()) return res.status(400).json({ success: false, message: 'กรุณาเลือกแผนก/หน่วยงาน' });

        // Parse dynamic items
        let dynamicItems = [];
        if (req.body.items) {
            try {
                dynamicItems = typeof req.body.items === 'string'
                    ? JSON.parse(req.body.items) : req.body.items;
            } catch (e) { /* ignore */ }
        }

        // Normalize + validate every item's Status to strict enum
        let normalizedItems;
        try {
            normalizedItems = Array.isArray(dynamicItems) ? dynamicItems.map(d => {
                const status = normalizeItemStatus(d.Status); // throws on invalid
                if (status === null)
                    throw new Error('ทุก PPE item ต้องมีสถานะที่ชัดเจน (compliant / non-compliant / na)');
                return { ItemID: d.ItemID, Status: status };
            }) : [];
        } catch (ve) {
            return res.status(400).json({ success: false, message: ve.message });
        }

        // Must have at least one assessed (non-na) item
        const counted = normalizedItems.filter(d => d.Status === 'compliant' || d.Status === 'non-compliant');
        if (counted.length === 0)
            return res.status(400).json({ success: false, message: 'กรุณาเลือกสถานะ PPE อย่างน้อย 1 รายการ (compliant หรือ non-compliant)' });

        // Validate department exists in master
        const [deptRows] = await db.query(
            'SELECT id FROM Master_Departments WHERE Name = ? LIMIT 1', [Department.trim()]
        );
        if (!deptRows.length)
            return res.status(400).json({ success: false, message: `ไม่พบแผนก "${Department}" ในระบบ` });

        // Validate work type exists and has PPE items assigned
        if (WorkTypeID) {
            const [wtRows] = await db.query(
                'SELECT WorkTypeID FROM SC_PPE_WorkTypes WHERE WorkTypeID=? AND IsActive=1 LIMIT 1', [WorkTypeID]
            );
            if (!wtRows.length)
                return res.status(400).json({ success: false, message: 'ไม่พบประเภทงานที่เลือกในระบบ' });
            const [wtItems] = await db.query(
                'SELECT COUNT(*) AS cnt FROM SC_PPE_WorkType_Items WHERE WorkTypeID=?', [WorkTypeID]
            );
            if ((wtItems[0].cnt || 0) === 0)
                return res.status(400).json({ success: false, message: 'ประเภทงานที่เลือกยังไม่มีรายการ PPE กำหนดไว้' });
        }

        const totalItems     = counted.length;
        const compliantItems = counted.filter(d => d.Status === 'compliant').length;
        const compliancePct  = ((compliantItems / totalItems) * 100).toFixed(2);
        // Pass = 100% of assessed items compliant
        const isPass         = compliantItems === totalItems ? 1 : 0;

        // Inspector: accept override from body, fallback to req.user
        const finalInspectorID   = (InspectorID   || '').trim() || req.user.id;
        const finalInspectorName = (InspectorName || '').trim() || req.user.name;

        // Employee: unregistered entries use a stable name-based key instead of a per-request UUID
        // (UUID would reset violation count to 0 every inspection — escalation never triggers)
        const rawEmpId   = (InspectedEmployeeID || '').trim();
        const empName    = (InspectedEmployeeName || '').trim();
        const isUnreg    = empName && !rawEmpId ? 1 : 0;
        const finalEmpId = rawEmpId || (isUnreg ? `__unreg__:${empName.toLowerCase()}` : null);

        // Snapshot work-type PPE template at time of inspection (preserves history if template later changes)
        let workTypeSnapshot = null;
        if (WorkTypeID) {
            const [snapItems] = await db.query(
                `SELECT pi.ItemID, pi.ItemName, pi.SortOrder
                 FROM SC_PPE_WorkType_Items wi JOIN SC_PPE_Items pi ON wi.ItemID = pi.ItemID
                 WHERE wi.WorkTypeID = ? ORDER BY pi.SortOrder`, [WorkTypeID]
            );
            workTypeSnapshot = JSON.stringify({ workTypeId: WorkTypeID, name: WorkTypeName || '', items: snapItems });
        }

        // ── Single atomic transaction: inspection + details + violation + audit ──
        const id   = uuidv4();
        const conn = await db.getConnection();
        let violationResult = null;
        try {
            await conn.beginTransaction();

            await conn.query(
                `INSERT INTO SC_PPEInspections
                 (InspectionID, InspectionDate, Area, Department, InspectorID, InspectorName,
                  WorkTypeID, WorkTypeName, WorkTypeSnapshot, InspectedEmployeeID, InspectedEmployeeName, IsPass,
                  IsUnregistered, TotalItems, CompliantItems, CompliancePct, Notes, ImageUrl)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [id, InspectionDate, Area || null, Department.trim(),
                 finalInspectorID, finalInspectorName,
                 WorkTypeID || null, WorkTypeName || null, workTypeSnapshot,
                 finalEmpId, empName || null, isPass,
                 isUnreg, totalItems, compliantItems, compliancePct,
                 Notes || null, ImageUrl || null]
            );

            for (const d of normalizedItems) {
                if (!d.ItemID) continue;
                await conn.query(
                    'INSERT INTO SC_PPE_Inspection_Details (DetailID, InspectionID, ItemID, Status) VALUES (?,?,?,?)',
                    [uuidv4(), id, d.ItemID, d.Status]
                );
            }

            // Violation: same transaction — failure rolls back inspection too
            // finalEmpId is stable: registered=EmployeeID, unregistered="__unreg__:<name>"
            if (!isPass && empName) {
                const [[cnt]] = await conn.query(
                    'SELECT COUNT(*) AS c FROM SC_PPE_Violations WHERE (deleted_at IS NULL) AND EmployeeID=? FOR UPDATE',
                    [finalEmpId || '']
                );
                const violationNo  = (cnt.c || 0) + 1;
                const warningLevel = violationNo >= 3 ? 'written_warning' : violationNo === 2 ? 'safety_notice' : 'verbal';
                const vid = uuidv4();
                await conn.query(
                    `INSERT INTO SC_PPE_Violations
                     (ViolationID, EmployeeID, EmployeeName, Department, InspectionID, ViolationNo, WarningLevel,
                      InspectorID, InspectorName, Note, ViolationDate)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                    [vid, finalEmpId || '', empName, Department.trim(), id,
                     violationNo, warningLevel,
                     finalInspectorID, finalInspectorName,
                     `ไม่ผ่าน PPE Checklist วันที่ ${InspectionDate}`, InspectionDate]
                );
                violationResult = { id: vid, violationNo, warningLevel };
            }

            // Audit rows inside transaction for strict consistency
            const auditSql = `INSERT INTO SC_PPE_AuditLog (AuditID,Action,EntityType,EntityID,UserID,UserName,Detail) VALUES (?,?,?,?,?,?,?)`;
            await conn.query(auditSql, [uuidv4(), 'create', 'inspection', id,
                req.user.id, req.user.name,
                `Date:${InspectionDate} Dept:${Department} Pass:${isPass} Emp:${empName||rawEmpId||'—'}`]);
            if (violationResult) {
                await conn.query(auditSql, [uuidv4(), 'create', 'violation', violationResult.id,
                    req.user.id, req.user.name,
                    `Auto from inspection:${id} Emp:${empName} No:${violationResult.violationNo} Level:${violationResult.warningLevel}`]);
            }

            await conn.commit();
        } catch (txErr) {
            await conn.rollback();
            throw txErr;
        } finally {
            conn.release();
        }

        res.json({ success: true, message: 'บันทึกผลการตรวจ PPE สำเร็จ', id, isPass, violationResult });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/safety-culture/ppe-inspections/:id (admin — update notes/status only)
router.put('/ppe-inspections/:id', isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const [rows] = await db.query(
            'SELECT InspectionID FROM SC_PPEInspections WHERE InspectionID=? AND (deleted_at IS NULL)', [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการตรวจ PPE' });

        const { Notes } = req.body;
        await db.query('UPDATE SC_PPEInspections SET Notes=? WHERE InspectionID=? AND deleted_at IS NULL',
            [Notes != null ? String(Notes).substring(0, 1000) : null, id]);
        await _ppeAudit('update', 'inspection', id, req.user, `Notes updated`);
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/safety-culture/ppe-inspections/:id (admin — soft delete)
router.delete('/ppe-inspections/:id', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT InspectionID FROM SC_PPEInspections WHERE InspectionID=? AND (deleted_at IS NULL)', [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการตรวจ PPE' });
        await db.query('UPDATE SC_PPEInspections SET deleted_at=NOW() WHERE InspectionID=?', [req.params.id]);
        await _ppeAudit('delete', 'inspection', req.params.id, req.user, null);
        res.json({ success: true, message: 'ลบผลการตรวจ PPE สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/safety-culture/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const [avgScores] = await db.query(
            `SELECT AVG(T1_Score) AS avg_t1, AVG(T2_Score) AS avg_t2,
                    AVG(T3_Score) AS avg_t3, AVG(T4_Score) AS avg_t4,
                    AVG(T5_Score) AS avg_t5, AVG(T7_Score) AS avg_t7
             FROM SC_Assessments WHERE AssessmentYear = ?`, [year]
        );

        // overall_pct from inspection-level compliance; per-item breakdown from Details table (legacy columns always NULL for new records)
        const [[overallRow]] = await db.query(
            `SELECT AVG(CompliancePct) AS overall_pct FROM SC_PPEInspections
             WHERE (deleted_at IS NULL) AND YEAR(InspectionDate) = ?`, [year]
        );
        const [itemBreakdown] = await db.query(
            `SELECT pi.ItemID, pi.ItemName, pi.SortOrder,
                    SUM(CASE WHEN d.Status='compliant' THEN 1 ELSE 0 END) AS ok_count,
                    COUNT(*) AS total_count
             FROM SC_PPE_Inspection_Details d
             JOIN SC_PPE_Items pi ON d.ItemID = pi.ItemID
             JOIN SC_PPEInspections ins ON d.InspectionID = ins.InspectionID
             WHERE ins.deleted_at IS NULL AND YEAR(ins.InspectionDate) = ?
               AND d.Status != 'na'
             GROUP BY pi.ItemID, pi.ItemName, pi.SortOrder
             ORDER BY pi.SortOrder`, [year]
        );
        const ppeStats = [{ ...overallRow, itemBreakdown }];

        const [yearTrend] = await db.query(
            `SELECT AssessmentYear,
                    AVG(
                        (COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+COALESCE(T3_Score,0)+
                         COALESCE(T4_Score,0)+COALESCE(T5_Score,0)+COALESCE(T7_Score,0)) /
                        NULLIF(
                            (T1_Score IS NOT NULL)+(T2_Score IS NOT NULL)+(T3_Score IS NOT NULL)+
                            (T4_Score IS NOT NULL)+(T5_Score IS NOT NULL)+(T7_Score IS NOT NULL),
                            0
                        )
                    ) AS avg_score,
                    COUNT(*) AS record_count
             FROM SC_Assessments
             GROUP BY AssessmentYear ORDER BY AssessmentYear ASC`
        );

        res.json({ success: true, data: { avgScores: avgScores[0], ppeStats: ppeStats[0], yearTrend, year } });
        // ppeStats shape: { overall_pct, itemBreakdown: [{ ItemID, ItemName, SortOrder, ok_count, total_count }] }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
