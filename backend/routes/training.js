// backend/routes/training.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

// ─── ENSURE TABLES ────────────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Training_Courses (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            CourseCode    VARCHAR(50),
            CourseName    VARCHAR(255) NOT NULL,
            Description   TEXT,
            DurationHours DECIMAL(5,1) DEFAULT 0,
            PassScore     DECIMAL(5,2) DEFAULT 70,
            IsActive      TINYINT(1)   DEFAULT 1,
            CreatedBy     VARCHAR(100),
            CreatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_code (CourseCode)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Training_Records (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            CourseID     INT          NOT NULL,
            EmployeeID   VARCHAR(50)  NOT NULL,
            TrainingDate DATE         NOT NULL,
            Score        DECIMAL(5,2) DEFAULT NULL,
            IsPassed     TINYINT(1)   DEFAULT 0,
            Trainer      VARCHAR(255),
            Notes        TEXT,
            CreatedBy    VARCHAR(100),
            CreatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_course   (CourseID),
            KEY idx_employee (EmployeeID),
            KEY idx_date     (TrainingDate)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Training_Dept_Records (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            Department  VARCHAR(100) NOT NULL,
            Year        INT          NOT NULL,
            CourseID    INT          DEFAULT NULL,
            TotalEmp    INT          NOT NULL DEFAULT 0,
            PassedCount INT          NOT NULL DEFAULT 0,
            Notes       TEXT,
            CreatedBy   VARCHAR(100),
            CreatedAt   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_dept   (Department),
            KEY idx_year   (Year),
            KEY idx_course (CourseID),
            UNIQUE KEY uq_dept_year_course (Department, Year, CourseID)
        )
    `);

    // Migrate existing tables: add CourseID column and swap unique key
    try {
        await db.query('ALTER TABLE Training_Dept_Records ADD COLUMN CourseID INT DEFAULT NULL AFTER Year');
    } catch { /* column already exists */ }
    try {
        await db.query('ALTER TABLE Training_Dept_Records DROP KEY uq_dept_year');
    } catch { /* key did not exist */ }
    try {
        await db.query('ALTER TABLE Training_Dept_Records ADD UNIQUE KEY uq_dept_year_course (Department, Year, CourseID)');
    } catch { /* already exists */ }

    tablesReady = true;
}

// ─── GET /api/training/courses ────────────────────────────────────────────────
router.get('/courses', async (req, res) => {
    try {
        await ensureTables();
        const [rows] = await db.query(`
            SELECT c.*,
                   COUNT(r.id)                        AS TotalRecords,
                   COALESCE(SUM(r.IsPassed), 0)       AS PassedCount
            FROM Training_Courses c
            LEFT JOIN Training_Records r ON r.CourseID = c.id
            GROUP BY c.id
            ORDER BY c.IsActive DESC, c.CourseName ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/training/courses (admin) ──────────────────────────────────────
router.post('/courses', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { CourseCode, CourseName, Description, DurationHours, PassScore } = req.body;
        if (!CourseName) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อหลักสูตร' });
        }
        await db.query(
            `INSERT INTO Training_Courses
             (CourseCode, CourseName, Description, DurationHours, PassScore, IsActive, CreatedBy)
             VALUES (?, ?, ?, ?, ?, 1, ?)`,
            [
                CourseCode || null,
                CourseName,
                Description || '',
                parseFloat(DurationHours) || 0,
                parseFloat(PassScore) || 70,
                req.user.name,
            ]
        );
        res.json({ success: true, message: 'เพิ่มหลักสูตรสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/training/courses/:id (admin) ────────────────────────────────────
router.put('/courses/:id', isAdmin, async (req, res) => {
    try {
        const { CourseCode, CourseName, Description, DurationHours, PassScore, IsActive } = req.body;
        if (!CourseName) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อหลักสูตร' });
        }
        await db.query(
            `UPDATE Training_Courses
             SET CourseCode=?, CourseName=?, Description=?, DurationHours=?, PassScore=?, IsActive=?
             WHERE id=?`,
            [
                CourseCode || null,
                CourseName,
                Description || '',
                parseFloat(DurationHours) || 0,
                parseFloat(PassScore) || 70,
                IsActive ? 1 : 0,
                req.params.id,
            ]
        );
        res.json({ success: true, message: 'อัปเดตหลักสูตรสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/training/courses/:id (admin) ─────────────────────────────────
router.delete('/courses/:id', isAdmin, async (req, res) => {
    try {
        const [check] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Training_Records WHERE CourseID=?',
            [req.params.id]
        );
        if (check[0].cnt > 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่สามารถลบได้ มีผลการอบรมในหลักสูตรนี้ ${check[0].cnt} รายการ`,
            });
        }
        await db.query('DELETE FROM Training_Courses WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'ลบหลักสูตรสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/training/summary ────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || null;
        const yearFilter      = year ? `AND YEAR(r.TrainingDate) = ${year}` : '';
        const yearFilterJoin  = year ? `AND YEAR(r.TrainingDate) = ${year}` : '';

        const [overall] = await db.query(`
            SELECT
                COUNT(*)                          AS total,
                COALESCE(SUM(r.IsPassed), 0)      AS passed,
                COUNT(DISTINCT r.EmployeeID)       AS uniqueTrainees,
                COUNT(DISTINCT r.CourseID)         AS coursesUsed
            FROM Training_Records r
            WHERE 1=1 ${yearFilter}
        `);

        const [byCourse] = await db.query(`
            SELECT c.id, c.CourseName, c.CourseCode, c.PassScore, c.IsActive,
                   COUNT(r.id)                      AS total,
                   COALESCE(SUM(r.IsPassed), 0)     AS passed,
                   COUNT(DISTINCT r.EmployeeID)      AS uniqueTrainees
            FROM Training_Courses c
            LEFT JOIN Training_Records r
                   ON r.CourseID = c.id ${yearFilterJoin}
            GROUP BY c.id
            ORDER BY c.IsActive DESC, total DESC, c.CourseName ASC
        `);

        const [byDept] = await db.query(`
            SELECT COALESCE(e.Department, '(ไม่ระบุ)') AS Department,
                   COUNT(r.id)                         AS total,
                   COALESCE(SUM(r.IsPassed), 0)        AS passed,
                   COUNT(DISTINCT r.EmployeeID)         AS uniqueTrainees
            FROM Training_Records r
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE 1=1 ${yearFilter}
            GROUP BY e.Department
            ORDER BY total DESC
        `);

        res.json({ success: true, data: { overall: overall[0], byCourse, byDept } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/training/records ────────────────────────────────────────────────
router.get('/records', async (req, res) => {
    try {
        await ensureTables();
        const { courseId, department, year } = req.query;

        let sql = `
            SELECT r.*, c.CourseName, c.CourseCode, c.PassScore,
                   e.EmployeeName, e.Department, e.Team
            FROM Training_Records r
            JOIN  Training_Courses c ON c.id = r.CourseID
            LEFT JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE 1=1
        `;
        const params = [];
        if (courseId)   { sql += ' AND r.CourseID = ?';          params.push(courseId);   }
        if (department) { sql += ' AND e.Department = ?';         params.push(department); }
        if (year)       { sql += ' AND YEAR(r.TrainingDate) = ?'; params.push(year);       }
        sql += ' ORDER BY r.TrainingDate DESC, e.EmployeeName ASC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/training/records (admin) ───────────────────────────────────────
router.post('/records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { CourseID, EmployeeID, TrainingDate, Score, Trainer, Notes } = req.body;

        if (!CourseID || !EmployeeID || !TrainingDate) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกข้อมูลให้ครบ (หลักสูตร / รหัสพนักงาน / วันที่)',
            });
        }

        // Verify employee from master data
        const [empRows] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE EmployeeID = ?',
            [EmployeeID]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${EmployeeID}" ใน Employee Master Data`,
            });
        }

        // Get PassScore from course
        const [courseRows] = await db.query(
            'SELECT PassScore FROM Training_Courses WHERE id = ?',
            [CourseID]
        );
        if (courseRows.length === 0) {
            return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตร' });
        }

        const passScore = parseFloat(courseRows[0].PassScore);
        const numScore  = (Score !== '' && Score !== null && Score !== undefined)
            ? parseFloat(Score) : null;
        const isPassed  = numScore !== null ? (numScore >= passScore ? 1 : 0) : 0;

        await db.query(
            `INSERT INTO Training_Records
             (CourseID, EmployeeID, TrainingDate, Score, IsPassed, Trainer, Notes, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [CourseID, EmployeeID, TrainingDate, numScore, isPassed, Trainer || '', Notes || '', req.user.name]
        );
        res.json({ success: true, message: 'บันทึกผลการอบรมสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/training/records/:id (admin) ────────────────────────────────────
router.put('/records/:id', isAdmin, async (req, res) => {
    try {
        const { CourseID, EmployeeID, TrainingDate, Score, Trainer, Notes } = req.body;

        if (!CourseID || !EmployeeID || !TrainingDate) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
        }

        const [empRows] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE EmployeeID = ?',
            [EmployeeID]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${EmployeeID}" ใน Employee Master Data`,
            });
        }

        const [courseRows] = await db.query(
            'SELECT PassScore FROM Training_Courses WHERE id = ?',
            [CourseID]
        );
        if (courseRows.length === 0) {
            return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตร' });
        }

        const passScore = parseFloat(courseRows[0].PassScore);
        const numScore  = (Score !== '' && Score !== null && Score !== undefined)
            ? parseFloat(Score) : null;
        const isPassed  = numScore !== null ? (numScore >= passScore ? 1 : 0) : 0;

        await db.query(
            `UPDATE Training_Records
             SET CourseID=?, EmployeeID=?, TrainingDate=?, Score=?, IsPassed=?, Trainer=?, Notes=?
             WHERE id=?`,
            [CourseID, EmployeeID, TrainingDate, numScore, isPassed, Trainer || '', Notes || '', req.params.id]
        );
        res.json({ success: true, message: 'อัปเดตผลการอบรมสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/training/records/:id (admin) ─────────────────────────────────
router.delete('/records/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Training_Records WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/training/dept-summary?year= ─────────────────────────────────────
router.get('/dept-summary', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || null;
        const yf   = year ? 'AND Year = ?' : '';
        const params = year ? [year] : [];

        const [rows] = await db.query(
            `SELECT Department,
                    SUM(TotalEmp)    AS TotalEmp,
                    SUM(PassedCount) AS PassedCount,
                    COUNT(*)         AS RecordCount
             FROM Training_Dept_Records
             WHERE 1=1 ${yf}
             GROUP BY Department
             ORDER BY Department ASC`,
            params
        );

        const totalEmp    = rows.reduce((s, r) => s + (parseInt(r.TotalEmp)    || 0), 0);
        const totalPassed = rows.reduce((s, r) => s + (parseInt(r.PassedCount) || 0), 0);

        res.json({
            success: true,
            data: {
                byDept: rows,
                overall: {
                    deptCount:  rows.length,
                    totalEmp,
                    totalPassed,
                    passRate:   totalEmp ? Math.round(totalPassed * 100 / totalEmp) : 0,
                },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/training/dept-records ───────────────────────────────────────────
router.get('/dept-records', async (req, res) => {
    try {
        await ensureTables();
        const { year, department } = req.query;
        let sql = `
            SELECT r.*, c.CourseName, c.CourseCode
            FROM Training_Dept_Records r
            LEFT JOIN Training_Courses c ON c.id = r.CourseID
            WHERE 1=1`;
        const params = [];
        if (year)       { sql += ' AND r.Year = ?';       params.push(year); }
        if (department) { sql += ' AND r.Department = ?'; params.push(department); }
        sql += ' ORDER BY r.Year DESC, r.Department ASC, c.CourseName ASC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/training/dept-records (admin) ──────────────────────────────────
router.post('/dept-records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, Year, CourseID, TotalEmp, PassedCount, Notes } = req.body;
        if (!Department || !Year) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ (แผนก / ปี)' });
        }
        const totalEmp    = parseInt(TotalEmp)    || 0;
        const passedCount = parseInt(PassedCount) || 0;
        const courseId    = CourseID ? parseInt(CourseID) : null;
        if (passedCount > totalEmp) {
            return res.status(400).json({ success: false, message: 'จำนวนผ่านต้องไม่มากกว่าจำนวนพนักงาน' });
        }
        // Duplicate guard: same dept + year + course (NULL-safe)
        const [dup] = await db.query(
            `SELECT id FROM Training_Dept_Records
             WHERE Department = ? AND Year = ?
               AND (CourseID <=> ?)`,
            [Department, parseInt(Year), courseId]
        );
        if (dup.length > 0) {
            const courseLabel = courseId ? `หลักสูตรนี้` : `(ไม่ระบุหลักสูตร)`;
            return res.status(400).json({
                success: false,
                message: `มีข้อมูลของแผนก "${Department}" ปี ${Year} ${courseLabel} อยู่แล้ว`,
            });
        }
        await db.query(
            `INSERT INTO Training_Dept_Records (Department, Year, CourseID, TotalEmp, PassedCount, Notes, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [Department, parseInt(Year), courseId, totalEmp, passedCount, Notes || '', req.user.name]
        );
        res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/training/dept-records/:id (admin) ───────────────────────────────
router.put('/dept-records/:id', isAdmin, async (req, res) => {
    try {
        const { Department, Year, CourseID, TotalEmp, PassedCount, Notes } = req.body;
        if (!Department || !Year) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
        }
        const totalEmp    = parseInt(TotalEmp)    || 0;
        const passedCount = parseInt(PassedCount) || 0;
        const courseId    = CourseID ? parseInt(CourseID) : null;
        if (passedCount > totalEmp) {
            return res.status(400).json({ success: false, message: 'จำนวนผ่านต้องไม่มากกว่าจำนวนพนักงาน' });
        }
        // Duplicate guard — exclude current row (NULL-safe course comparison)
        const [dup] = await db.query(
            `SELECT id FROM Training_Dept_Records
             WHERE Department = ? AND Year = ? AND (CourseID <=> ?) AND id <> ?`,
            [Department, parseInt(Year), courseId, req.params.id]
        );
        if (dup.length > 0) {
            const courseLabel = courseId ? `หลักสูตรนี้` : `(ไม่ระบุหลักสูตร)`;
            return res.status(400).json({
                success: false,
                message: `มีข้อมูลของแผนก "${Department}" ปี ${Year} ${courseLabel} อยู่แล้ว`,
            });
        }
        await db.query(
            `UPDATE Training_Dept_Records
             SET Department=?, Year=?, CourseID=?, TotalEmp=?, PassedCount=?, Notes=?
             WHERE id=?`,
            [Department, parseInt(Year), courseId, totalEmp, passedCount, Notes || '', req.params.id]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/training/dept-records/:id (admin) ────────────────────────────
router.delete('/dept-records/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Training_Dept_Records WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/training/course-summary?year= ───────────────────────────────────
router.get('/course-summary', async (req, res) => {
    try {
        await ensureTables();
        const year = parseInt(req.query.year) || null;
        const params = year ? [year] : [];
        const [rows] = await db.query(`
            SELECT r.CourseID,
                   COALESCE(c.CourseName, '(ไม่ระบุหลักสูตร)') AS CourseName,
                   c.CourseCode,
                   COUNT(DISTINCT r.Department)                  AS deptCount,
                   SUM(r.TotalEmp)                               AS totalEmp,
                   SUM(r.PassedCount)                            AS passedCount
            FROM Training_Dept_Records r
            LEFT JOIN Training_Courses c ON c.id = r.CourseID
            WHERE 1=1 ${year ? 'AND r.Year = ?' : ''}
            GROUP BY r.CourseID, c.CourseName, c.CourseCode
            ORDER BY SUM(r.TotalEmp) DESC
        `, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/training/employees ──────────────────────────────────────────────
// Employee search for record form (reads from Employees master)
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
