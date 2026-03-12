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

    tableReady = true;
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

// GET /api/safety-culture/assessments
router.get('/assessments', async (req, res) => {
    try {
        await ensureTables();
        const { year } = req.query;
        let sql = 'SELECT * FROM SC_Assessments';
        const params = [];
        if (year) { sql += ' WHERE AssessmentYear = ?'; params.push(parseInt(year)); }
        sql += ' ORDER BY AssessmentYear DESC, CreatedAt DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/safety-culture/assessments (admin)
router.post('/assessments', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { AssessmentYear, Area, T1_Score, T2_Score, T3_Score, T4_Score, T5_Score, T7_Score, Notes } = req.body;
        if (!AssessmentYear) return res.status(400).json({ success: false, message: 'กรุณาระบุปีการประเมิน' });
        const id = uuidv4();
        await db.query(
            `INSERT INTO SC_Assessments (AssessmentID, AssessmentYear, Area, T1_Score, T2_Score, T3_Score, T4_Score, T5_Score, T7_Score, Notes, CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [id, AssessmentYear, Area || 'ทั้งหมด',
             T1_Score || null, T2_Score || null, T3_Score || null,
             T4_Score || null, T5_Score || null, T7_Score || null,
             Notes || null, req.user.name]
        );
        res.json({ success: true, message: 'บันทึกผลการประเมินสำเร็จ', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/safety-culture/assessments/:id (admin)
router.put('/assessments/:id', isAdmin, async (req, res) => {
    try {
        const { AssessmentYear, Area, T1_Score, T2_Score, T3_Score, T4_Score, T5_Score, T7_Score, Notes } = req.body;
        await db.query(
            `UPDATE SC_Assessments SET AssessmentYear=?, Area=?, T1_Score=?, T2_Score=?, T3_Score=?, T4_Score=?, T5_Score=?, T7_Score=?, Notes=? WHERE AssessmentID=?`,
            [AssessmentYear, Area || 'ทั้งหมด',
             T1_Score || null, T2_Score || null, T3_Score || null,
             T4_Score || null, T5_Score || null, T7_Score || null,
             Notes || null, req.params.id]
        );
        res.json({ success: true, message: 'อัปเดตผลการประเมินสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/safety-culture/assessments/:id (admin)
router.delete('/assessments/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM SC_Assessments WHERE AssessmentID = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบผลการประเมินสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/safety-culture/ppe-inspections
router.get('/ppe-inspections', async (req, res) => {
    try {
        await ensureTables();
        const { year, department } = req.query;
        let sql = 'SELECT * FROM SC_PPEInspections WHERE 1=1';
        const params = [];
        if (year) { sql += ' AND YEAR(InspectionDate) = ?'; params.push(parseInt(year)); }
        if (department) { sql += ' AND Department = ?'; params.push(department); }
        sql += ' ORDER BY InspectionDate DESC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/safety-culture/ppe-inspections
router.post('/ppe-inspections', async (req, res) => {
    try {
        await ensureTables();
        const { InspectionDate, Area, Department, Helmet, Glasses, Gloves, Shoes, FaceShield, EarPlug, Notes, ImageUrl } = req.body;
        if (!InspectionDate) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่ตรวจ' });

        const items = [Helmet, Glasses, Gloves, Shoes, FaceShield, EarPlug].filter(v => v != null && v !== '');
        const totalItems = items.length;
        const compliantItems = items.filter(v => v === 'Compliant').length;
        const compliancePct = totalItems > 0 ? ((compliantItems / totalItems) * 100).toFixed(2) : 0;

        const id = uuidv4();
        await db.query(
            `INSERT INTO SC_PPEInspections
             (InspectionID, InspectionDate, Area, Department, InspectorID, InspectorName,
              Helmet, Glasses, Gloves, Shoes, FaceShield, EarPlug,
              TotalItems, CompliantItems, CompliancePct, Notes, ImageUrl)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, InspectionDate, Area || null,
             Department || req.user.department,
             req.user.id, req.user.name,
             Helmet || null, Glasses || null, Gloves || null,
             Shoes || null, FaceShield || null, EarPlug || null,
             totalItems, compliantItems, compliancePct,
             Notes || null, ImageUrl || null]
        );
        res.json({ success: true, message: 'บันทึกผลการตรวจ PPE สำเร็จ', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/safety-culture/ppe-inspections/:id (admin)
router.delete('/ppe-inspections/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM SC_PPEInspections WHERE InspectionID = ?', [req.params.id]);
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

        const [ppeStats] = await db.query(
            `SELECT AVG(CompliancePct) AS overall_pct,
                    SUM(CASE WHEN Helmet='Compliant' THEN 1 ELSE 0 END) AS helmet_ok,
                    COUNT(CASE WHEN Helmet IS NOT NULL AND Helmet != '' THEN 1 END) AS helmet_total,
                    SUM(CASE WHEN Glasses='Compliant' THEN 1 ELSE 0 END) AS glasses_ok,
                    COUNT(CASE WHEN Glasses IS NOT NULL AND Glasses != '' THEN 1 END) AS glasses_total,
                    SUM(CASE WHEN Gloves='Compliant' THEN 1 ELSE 0 END) AS gloves_ok,
                    COUNT(CASE WHEN Gloves IS NOT NULL AND Gloves != '' THEN 1 END) AS gloves_total,
                    SUM(CASE WHEN Shoes='Compliant' THEN 1 ELSE 0 END) AS shoes_ok,
                    COUNT(CASE WHEN Shoes IS NOT NULL AND Shoes != '' THEN 1 END) AS shoes_total,
                    SUM(CASE WHEN FaceShield='Compliant' THEN 1 ELSE 0 END) AS shield_ok,
                    COUNT(CASE WHEN FaceShield IS NOT NULL AND FaceShield != '' THEN 1 END) AS shield_total,
                    SUM(CASE WHEN EarPlug='Compliant' THEN 1 ELSE 0 END) AS earplug_ok,
                    COUNT(CASE WHEN EarPlug IS NOT NULL AND EarPlug != '' THEN 1 END) AS earplug_total
             FROM SC_PPEInspections WHERE YEAR(InspectionDate) = ?`, [year]
        );

        const [yearTrend] = await db.query(
            `SELECT AssessmentYear,
                    AVG((COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+COALESCE(T3_Score,0)+
                         COALESCE(T4_Score,0)+COALESCE(T5_Score,0)+COALESCE(T7_Score,0))/6) AS avg_score,
                    COUNT(*) AS record_count
             FROM SC_Assessments
             GROUP BY AssessmentYear ORDER BY AssessmentYear ASC`
        );

        res.json({ success: true, data: { avgScores: avgScores[0], ppeStats: ppeStats[0], yearTrend, year } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
