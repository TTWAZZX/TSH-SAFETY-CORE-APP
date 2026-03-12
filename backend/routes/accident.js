// backend/routes/accident.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

// ─── ENSURE TABLE ─────────────────────────────────────────────────────────────
let tableReady = false;
async function ensureTable() {
    if (tableReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Accident_Reports (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            ReportDate       DATE         NOT NULL,
            AccidentDate     DATE         NOT NULL,
            AccidentTime     TIME         DEFAULT NULL,
            EmployeeID       VARCHAR(50)  NOT NULL,
            Department       VARCHAR(100) DEFAULT NULL,
            Area             VARCHAR(100) DEFAULT NULL,
            AccidentType     VARCHAR(50)  NOT NULL,
            Severity         VARCHAR(30)  DEFAULT 'Minor',
            Description      TEXT,
            RootCause        VARCHAR(100) DEFAULT NULL,
            RootCauseDetail  TEXT,
            CorrectiveAction TEXT,
            LostDays         INT          DEFAULT 0,
            IsRecordable     TINYINT(1)   DEFAULT 0,
            Status           VARCHAR(20)  DEFAULT 'Open',
            ReportedBy       VARCHAR(100) DEFAULT NULL,
            CreatedBy        VARCHAR(100),
            CreatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept  (Department),
            KEY idx_date  (AccidentDate),
            KEY idx_type  (AccidentType),
            KEY idx_emp   (EmployeeID)
        )
    `);

    tableReady = true;
}

// ─── GET /api/accident/reports ────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
    try {
        await ensureTable();
        const { year, department, type, status } = req.query;

        let sql = `
            SELECT r.*, e.EmployeeName, e.Team
            FROM   Accident_Reports r
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE  1=1
        `;
        const params = [];
        if (year)       { sql += ' AND YEAR(r.AccidentDate) = ?'; params.push(year); }
        if (department) { sql += ' AND r.Department = ?';          params.push(department); }
        if (type)       { sql += ' AND r.AccidentType = ?';        params.push(type); }
        if (status)     { sql += ' AND r.Status = ?';              params.push(status); }
        sql += ' ORDER BY r.AccidentDate DESC, r.id DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/summary?year= ──────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        await ensureTable();
        const year = parseInt(req.query.year) || null;
        const yf   = year ? `AND YEAR(AccidentDate) = ${year}` : '';

        // KPI totals
        const [kpi] = await db.query(`
            SELECT
                COUNT(*)                              AS total,
                COALESCE(SUM(IsRecordable), 0)        AS recordable,
                COALESCE(SUM(LostDays), 0)            AS lostDays,
                COALESCE(SUM(AccidentType = 'Near Miss'), 0) AS nearMiss,
                COALESCE(SUM(AccidentType = 'Fatal'), 0)     AS fatal
            FROM Accident_Reports
            WHERE 1=1 ${yf}
        `);

        // Days since last recordable accident
        const [lastRec] = await db.query(`
            SELECT AccidentDate FROM Accident_Reports
            WHERE IsRecordable = 1
            ORDER BY AccidentDate DESC LIMIT 1
        `);
        let daysSince = null;
        if (lastRec[0]) {
            const diff = Date.now() - new Date(lastRec[0].AccidentDate).getTime();
            daysSince  = Math.floor(diff / 86400000);
        }

        // Monthly trend (last 12 months always, or by year)
        const trendSql = year
            ? `SELECT MONTH(AccidentDate) AS mo, MONTHNAME(AccidentDate) AS mon,
                      COUNT(*) AS total, SUM(IsRecordable) AS recordable, SUM(LostDays) AS lostDays
               FROM Accident_Reports
               WHERE YEAR(AccidentDate) = ${year}
               GROUP BY MONTH(AccidentDate)
               ORDER BY mo`
            : `SELECT DATE_FORMAT(AccidentDate,'%Y-%m') AS period,
                      COUNT(*) AS total, SUM(IsRecordable) AS recordable, SUM(LostDays) AS lostDays
               FROM Accident_Reports
               WHERE AccidentDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
               GROUP BY period
               ORDER BY period`;
        const [trend] = await db.query(trendSql);

        // Type breakdown
        const [byType] = await db.query(`
            SELECT AccidentType, COUNT(*) AS cnt
            FROM Accident_Reports WHERE 1=1 ${yf}
            GROUP BY AccidentType ORDER BY cnt DESC
        `);

        res.json({
            success: true,
            data: { kpi: kpi[0], daysSince, trend, byType },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/analytics?year= ────────────────────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        await ensureTable();
        const year = parseInt(req.query.year) || null;
        const yf   = year ? `AND YEAR(AccidentDate) = ${year}` : '';

        // Dept Risk Ranking
        const [deptRank] = await db.query(`
            SELECT Department,
                   COUNT(*)                    AS total,
                   SUM(IsRecordable)           AS recordable,
                   SUM(LostDays)               AS lostDays,
                   SUM(AccidentType='Near Miss') AS nearMiss,
                   SUM(AccidentType='Fatal')     AS fatal,
                   SUM(Severity='Critical')      AS critical
            FROM Accident_Reports
            WHERE Department IS NOT NULL AND Department <> '' ${yf}
            GROUP BY Department
            ORDER BY (SUM(IsRecordable)*3 + SUM(LostDays)*2 + COUNT(*)) DESC
            LIMIT 10
        `);

        // Accident Hotspot (by Area)
        const [hotspot] = await db.query(`
            SELECT COALESCE(Area,'(ไม่ระบุ)') AS area, COUNT(*) AS cnt,
                   SUM(IsRecordable) AS recordable, SUM(LostDays) AS lostDays
            FROM Accident_Reports WHERE 1=1 ${yf}
            GROUP BY Area ORDER BY cnt DESC LIMIT 8
        `);

        // Top Root Causes
        const [rootCauses] = await db.query(`
            SELECT COALESCE(RootCause,'(ไม่ระบุ)') AS cause, COUNT(*) AS cnt
            FROM Accident_Reports WHERE 1=1 ${yf}
            GROUP BY RootCause ORDER BY cnt DESC LIMIT 8
        `);

        res.json({ success: true, data: { deptRank, hotspot, rootCauses } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/accident/reports (admin) ───────────────────────────────────────
router.post('/reports', isAdmin, async (req, res) => {
    try {
        await ensureTable();
        const {
            ReportDate, AccidentDate, AccidentTime, EmployeeID,
            Area, AccidentType, Severity, Description,
            RootCause, RootCauseDetail, CorrectiveAction,
            LostDays, IsRecordable, Status, ReportedBy,
        } = req.body;

        if (!ReportDate || !AccidentDate || !EmployeeID || !AccidentType) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกข้อมูลให้ครบ (วันที่รายงาน / วันที่เกิดเหตุ / รหัสพนักงาน / ประเภท)',
            });
        }

        // Verify employee from master data — enforce use of master only
        const [empRows] = await db.query(
            'SELECT EmployeeID, Department FROM Employees WHERE EmployeeID = ?',
            [EmployeeID]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${EmployeeID}" ใน Employee Master Data`,
            });
        }

        // Department auto-filled from employee master
        const department = empRows[0].Department || null;

        await db.query(
            `INSERT INTO Accident_Reports
             (ReportDate, AccidentDate, AccidentTime, EmployeeID, Department, Area,
              AccidentType, Severity, Description, RootCause, RootCauseDetail,
              CorrectiveAction, LostDays, IsRecordable, Status, ReportedBy, CreatedBy)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                ReportDate, AccidentDate, AccidentTime || null, EmployeeID, department,
                Area || null, AccidentType, Severity || 'Minor',
                Description || '', RootCause || null, RootCauseDetail || '',
                CorrectiveAction || '', parseInt(LostDays) || 0,
                IsRecordable ? 1 : 0, Status || 'Open',
                ReportedBy || req.user.name, req.user.name,
            ]
        );
        res.json({ success: true, message: 'บันทึกรายงานอุบัติเหตุสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/accident/reports/:id (admin) ────────────────────────────────────
router.put('/reports/:id', isAdmin, async (req, res) => {
    try {
        const {
            ReportDate, AccidentDate, AccidentTime, EmployeeID,
            Area, AccidentType, Severity, Description,
            RootCause, RootCauseDetail, CorrectiveAction,
            LostDays, IsRecordable, Status, ReportedBy,
        } = req.body;

        if (!ReportDate || !AccidentDate || !EmployeeID || !AccidentType) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
        }

        // Verify employee from master
        const [empRows] = await db.query(
            'SELECT EmployeeID, Department FROM Employees WHERE EmployeeID = ?',
            [EmployeeID]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${EmployeeID}" ใน Employee Master Data`,
            });
        }

        const department = empRows[0].Department || null;

        await db.query(
            `UPDATE Accident_Reports
             SET ReportDate=?, AccidentDate=?, AccidentTime=?, EmployeeID=?, Department=?,
                 Area=?, AccidentType=?, Severity=?, Description=?, RootCause=?,
                 RootCauseDetail=?, CorrectiveAction=?, LostDays=?, IsRecordable=?,
                 Status=?, ReportedBy=?
             WHERE id=?`,
            [
                ReportDate, AccidentDate, AccidentTime || null, EmployeeID, department,
                Area || null, AccidentType, Severity || 'Minor',
                Description || '', RootCause || null, RootCauseDetail || '',
                CorrectiveAction || '', parseInt(LostDays) || 0,
                IsRecordable ? 1 : 0, Status || 'Open',
                ReportedBy || req.user.name, req.params.id,
            ]
        );
        res.json({ success: true, message: 'อัปเดตรายงานอุบัติเหตุสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/accident/reports/:id (admin) ─────────────────────────────────
router.delete('/reports/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Accident_Reports WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/accident/employees?q= ──────────────────────────────────────────
router.get('/employees', async (req, res) => {
    try {
        const q = req.query.q || '';
        let sql = `SELECT EmployeeID, EmployeeName, Department, Team
                   FROM Employees WHERE 1=1`;
        const params = [];
        if (q) {
            sql += ` AND (EmployeeID LIKE ? OR EmployeeName LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`);
        }
        sql += ' ORDER BY EmployeeName ASC LIMIT 50';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
