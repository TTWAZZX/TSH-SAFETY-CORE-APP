// backend/routes/training.js
// Auth (authenticateToken) applied at mount level
// Write operations require isAdmin

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const MODULE = 'training';

const TRAINING_AUDIT_DEFAULTS = [
    ['7.1', 'หลักสูตร Six hazard 20 view point for safety Management patrol', null, 'ทีม Safety patrol', 100, null, null, null, 'six hazard,20 view,management patrol', 'safety patrol,patrol', 1],
    ['7.2', 'หลักสูตร Safety dojo', null, 'ทีม Safety patrol', 100, null, null, null, 'safety dojo,dojo', 'safety patrol,patrol', 2],
    ['7.3', 'หลักสูตร CCCF', '(Safety Awareness, Safety Theory, Stop 5s Hazard & Rank Identify, CCCF Complete Check)', 'T7', 100, null, null, null, 'cccf,complete check,stop 5s,hazard', 't7', 3],
    ['7.3', 'หลักสูตร CCCF', '(Safety Awareness, Safety Theory, Stop 5s Hazard & Rank Identify, CCCF Complete Check)', 'Subcontract', 100, null, null, null, 'cccf,complete check,stop 5s,hazard', 'subcontract,contractor,supplier', 4],
    ['7.4', 'หลักสูตรการประเมินความเสี่ยงด้านความปลอดภัยในการทำงาน', null, 'G, M, Leader ฝ่ายโรงงาน', 100, null, null, null, 'ประเมินความเสี่ยง,risk assessment,risk', 'g, m,g/m,g m,leader,ฝ่ายโรงงาน,factory', 5],
    ['7.5', 'หลักสูตรการสร้างพฤติกรรมความปลอดภัย (Behavior Based Safety ; BBS)', null, 'G, M, Leader ฝ่ายโรงงาน', 100, null, null, null, 'behavior based safety,bbs,พฤติกรรมความปลอดภัย', 'g, m,g/m,g m,leader,ฝ่ายโรงงาน,factory', 6],
];

function serverError(res, err, message = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง') {
    console.error('[training]', err);
    return res.status(500).json({ success: false, message });
}

function userName(req) {
    return req.user?.name || req.user?.EmployeeName || req.user?.id || req.user?.EmployeeID || 'System';
}

function cleanText(value, max = 255) {
    return String(value || '').trim().slice(0, max);
}

function isPositiveId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function normalizeYear(value) {
    const n = Number(value);
    const cur = new Date().getFullYear();
    if (!Number.isInteger(n) || n < 2000 || n > cur + 5) return null;
    return n;
}

function normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return raw;
}

function nonNegativeInt(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
}

function nonNegativeNumber(value, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max) return null;
    return n;
}

function normalizeCourseId(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

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

    await db.query(`
        CREATE TABLE IF NOT EXISTS Training_Audit_Requirements (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            Year           INT          NOT NULL,
            RequirementNo  VARCHAR(20)  NOT NULL,
            CourseName     VARCHAR(500) NOT NULL,
            Detail         TEXT,
            TargetGroup    VARCHAR(255),
            TargetPct      INT          NOT NULL DEFAULT 100,
            AllCount       INT          DEFAULT NULL,
            IssuePct       INT          DEFAULT NULL,
            Status         VARCHAR(100) DEFAULT NULL,
            CourseKeys     TEXT,
            TargetKeys     TEXT,
            SortOrder      INT          NOT NULL DEFAULT 0,
            CreatedBy      VARCHAR(100),
            CreatedAt      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_year (Year),
            KEY idx_sort (SortOrder)
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
        await db.query('ALTER TABLE Training_Dept_Records DROP KEY uniq_dept_year');
    } catch { /* key did not exist */ }
    try {
        await db.query('ALTER TABLE Training_Dept_Records ADD UNIQUE KEY uq_dept_year_course (Department, Year, CourseID)');
    } catch { /* already exists */ }

    tablesReady = true;
}

function normalizeNullableInt(value, fallback = null, max = Number.MAX_SAFE_INTEGER) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > max) return null;
    return n;
}

function normalizeKeyList(value) {
    return [...new Set(String(value || '')
        .split(',')
        .map(v => cleanText(v, 100).toLowerCase())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'en'))
        .join(',') || null;
}

function auditPayload(body) {
    const year = normalizeYear(body.Year);
    const targetPct = normalizeNullableInt(body.TargetPct, 100, 100);
    const allCount = normalizeNullableInt(body.AllCount, null);
    const issuePct = normalizeNullableInt(body.IssuePct, null, 100);
    const sortOrder = normalizeNullableInt(body.SortOrder, 0);
    return {
        Year: year,
        RequirementNo: cleanText(body.RequirementNo, 20),
        CourseName: cleanText(body.CourseName, 500),
        Detail: cleanText(body.Detail, 5000) || null,
        TargetGroup: cleanText(body.TargetGroup, 255) || null,
        TargetPct: targetPct,
        AllCount: allCount,
        IssuePct: issuePct,
        Status: cleanText(body.Status, 100) || null,
        CourseKeys: normalizeKeyList(body.CourseKeys),
        TargetKeys: normalizeKeyList(body.TargetKeys),
        SortOrder: sortOrder,
    };
}

// ─── GET /api/training/courses ────────────────────────────────────────────────
router.get('/courses', async (req, res) => {
    try {
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
        return serverError(res, err, 'ไม่สามารถโหลดหลักสูตรอบรมได้');
    }
});

// ─── POST /api/training/courses (admin) ──────────────────────────────────────
router.post('/courses', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { CourseCode, CourseName, Description, DurationHours, PassScore } = req.body;
        const courseName = cleanText(CourseName, 255);
        const duration = nonNegativeNumber(DurationHours, 0, 999.5);
        const passScore = nonNegativeNumber(PassScore, 70, 100);
        if (!courseName) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อหลักสูตร' });
        }
        if (duration === null) {
            return res.status(400).json({ success: false, message: 'ระยะเวลาต้องเป็นตัวเลข 0 ขึ้นไป' });
        }
        if (passScore === null) {
            return res.status(400).json({ success: false, message: 'เกณฑ์ผ่านต้องอยู่ระหว่าง 0-100' });
        }
        await db.query(
            `INSERT INTO Training_Courses
             (CourseCode, CourseName, Description, DurationHours, PassScore, IsActive, CreatedBy)
             VALUES (?, ?, ?, ?, ?, 1, ?)`,
            [
                cleanText(CourseCode, 50) || null,
                courseName,
                cleanText(Description, 5000),
                duration,
                passScore,
                userName(req),
            ]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_TRAINING_COURSE',
            targetType: 'Training_Courses',
            targetId: courseName,
            detail: `Created training course: ${courseName}`,
            metadata: { CourseCode: cleanText(CourseCode, 50) || null, DurationHours: duration, PassScore: passScore }
        });
        res.status(201).json({ success: true, message: 'เพิ่มหลักสูตรสำเร็จ', data: { id: result.insertId } });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถเพิ่มหลักสูตรได้');
    }
});

// ─── PUT /api/training/courses/:id (admin) ────────────────────────────────────
router.put('/courses/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        }
        const { CourseCode, CourseName, Description, DurationHours, PassScore, IsActive } = req.body;
        const courseName = cleanText(CourseName, 255);
        const duration = nonNegativeNumber(DurationHours, 0, 999.5);
        const passScore = nonNegativeNumber(PassScore, 70, 100);
        if (!courseName) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อหลักสูตร' });
        }
        if (duration === null) {
            return res.status(400).json({ success: false, message: 'ระยะเวลาต้องเป็นตัวเลข 0 ขึ้นไป' });
        }
        if (passScore === null) {
            return res.status(400).json({ success: false, message: 'เกณฑ์ผ่านต้องอยู่ระหว่าง 0-100' });
        }
        const [result] = await db.query(
            `UPDATE Training_Courses
             SET CourseCode=?, CourseName=?, Description=?, DurationHours=?, PassScore=?, IsActive=?
             WHERE id=?`,
            [
                cleanText(CourseCode, 50) || null,
                courseName,
                cleanText(Description, 5000),
                duration,
                passScore,
                IsActive ? 1 : 0,
                req.params.id,
            ]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตรที่ต้องการแก้ไข' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_TRAINING_COURSE',
            targetType: 'Training_Courses',
            targetId: req.params.id,
            detail: `Updated training course: ${courseName}`,
            metadata: { CourseCode: cleanText(CourseCode, 50) || null, DurationHours: duration, PassScore: passScore, IsActive: IsActive ? 1 : 0 }
        });
        res.json({ success: true, message: 'อัปเดตหลักสูตรสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถอัปเดตหลักสูตรได้');
    }
});

// ─── DELETE /api/training/courses/:id (admin) ─────────────────────────────────
router.delete('/courses/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        }
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
        const [deptCheck] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Training_Dept_Records WHERE CourseID=?',
            [req.params.id]
        );
        if (deptCheck[0].cnt > 0) {
            return res.status(409).json({
                success: false,
                message: `ไม่สามารถลบได้ มีบันทึกอบรมรายแผนกในหลักสูตรนี้ ${deptCheck[0].cnt} รายการ`,
            });
        }
        const [result] = await db.query('DELETE FROM Training_Courses WHERE id=?', [req.params.id]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตรที่ต้องการลบ' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_TRAINING_COURSE',
            targetType: 'Training_Courses',
            targetId: req.params.id,
            detail: 'Deleted training course'
        });
        res.json({ success: true, message: 'ลบหลักสูตรสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบหลักสูตรได้');
    }
});

// ─── GET /api/training/summary ────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        const year = req.query.year ? normalizeYear(req.query.year) : null;
        if (req.query.year && !year) {
            return res.status(400).json({ success: false, message: 'ปีไม่ถูกต้อง' });
        }
        const yearFilter      = year ? 'AND YEAR(r.TrainingDate) = ?' : '';
        const yearFilterJoin  = year ? 'AND YEAR(r.TrainingDate) = ?' : '';

        const [overall] = await db.query(`
            SELECT
                COUNT(*)                          AS total,
                COALESCE(SUM(r.IsPassed), 0)      AS passed,
                COUNT(DISTINCT r.EmployeeID)       AS uniqueTrainees,
                COUNT(DISTINCT r.CourseID)         AS coursesUsed
            FROM Training_Records r
            WHERE 1=1 ${yearFilter}
        `, year ? [year] : []);

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
        `, year ? [year] : []);

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
        `, year ? [year] : []);

        res.json({ success: true, data: { overall: overall[0], byCourse, byDept } });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดสรุปการอบรมได้');
    }
});

// ─── GET /api/training/records ────────────────────────────────────────────────
router.get('/records', async (req, res) => {
    try {
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
        if (year) {
            const cleanYear = normalizeYear(year);
            if (!cleanYear) return res.status(400).json({ success: false, message: 'ปีไม่ถูกต้อง' });
            sql += ' AND YEAR(r.TrainingDate) = ?'; params.push(cleanYear);
        }
        sql += ' ORDER BY r.TrainingDate DESC, e.EmployeeName ASC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดบันทึกการอบรมได้');
    }
});

// ─── POST /api/training/records (admin) ───────────────────────────────────────
router.post('/records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { CourseID, EmployeeID, TrainingDate, Score, Trainer, Notes } = req.body;
        const courseId = normalizeCourseId(CourseID);
        const employeeId = cleanText(EmployeeID, 50);
        const trainingDate = normalizeDate(TrainingDate);
        const score = Score !== '' && Score !== null && Score !== undefined
            ? nonNegativeNumber(Score, null, 100)
            : null;

        if (!courseId || !employeeId || !trainingDate) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกข้อมูลให้ครบ (หลักสูตร / รหัสพนักงาน / วันที่)',
            });
        }
        if (score === null && Score !== '' && Score !== null && Score !== undefined) {
            return res.status(400).json({ success: false, message: 'คะแนนต้องอยู่ระหว่าง 0-100' });
        }

        // Verify employee from master data
        const [empRows] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE EmployeeID = ?',
            [employeeId]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${employeeId}" ใน Employee Master Data`,
            });
        }

        // Get PassScore from course
        const [courseRows] = await db.query(
            'SELECT PassScore FROM Training_Courses WHERE id = ?',
            [courseId]
        );
        if (courseRows.length === 0) {
            return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตร' });
        }

        const passScore = parseFloat(courseRows[0].PassScore);
        const isPassed  = score !== null ? (score >= passScore ? 1 : 0) : 0;

        const [result] = await db.query(
            `INSERT INTO Training_Records
             (CourseID, EmployeeID, TrainingDate, Score, IsPassed, Trainer, Notes, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [courseId, employeeId, trainingDate, score, isPassed, cleanText(Trainer, 255), cleanText(Notes, 5000), userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_TRAINING_RECORD',
            targetType: 'Training_Records',
            targetId: result.insertId,
            detail: `Created training record for ${employeeId}`,
            metadata: { CourseID: courseId, EmployeeID: employeeId, TrainingDate: trainingDate, Score: score, IsPassed: isPassed }
        });
        res.status(201).json({ success: true, message: 'บันทึกผลการอบรมสำเร็จ', data: { id: result.insertId } });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถบันทึกผลการอบรมได้');
    }
});

// ─── PUT /api/training/records/:id (admin) ────────────────────────────────────
router.put('/records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสบันทึกไม่ถูกต้อง' });
        }
        const { CourseID, EmployeeID, TrainingDate, Score, Trainer, Notes } = req.body;
        const courseId = normalizeCourseId(CourseID);
        const employeeId = cleanText(EmployeeID, 50);
        const trainingDate = normalizeDate(TrainingDate);
        const score = Score !== '' && Score !== null && Score !== undefined
            ? nonNegativeNumber(Score, null, 100)
            : null;

        if (!courseId || !employeeId || !trainingDate) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
        }
        if (score === null && Score !== '' && Score !== null && Score !== undefined) {
            return res.status(400).json({ success: false, message: 'คะแนนต้องอยู่ระหว่าง 0-100' });
        }

        const [empRows] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE EmployeeID = ?',
            [employeeId]
        );
        if (empRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `ไม่พบรหัสพนักงาน "${employeeId}" ใน Employee Master Data`,
            });
        }

        const [courseRows] = await db.query(
            'SELECT PassScore FROM Training_Courses WHERE id = ?',
            [courseId]
        );
        if (courseRows.length === 0) {
            return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตร' });
        }

        const passScore = parseFloat(courseRows[0].PassScore);
        const isPassed  = score !== null ? (score >= passScore ? 1 : 0) : 0;

        const [result] = await db.query(
            `UPDATE Training_Records
             SET CourseID=?, EmployeeID=?, TrainingDate=?, Score=?, IsPassed=?, Trainer=?, Notes=?
             WHERE id=?`,
            [courseId, employeeId, trainingDate, score, isPassed, cleanText(Trainer, 255), cleanText(Notes, 5000), req.params.id]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการอบรมที่ต้องการแก้ไข' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_TRAINING_RECORD',
            targetType: 'Training_Records',
            targetId: req.params.id,
            detail: `Updated training record for ${employeeId}`,
            metadata: { CourseID: courseId, EmployeeID: employeeId, TrainingDate: trainingDate, Score: score, IsPassed: isPassed }
        });
        res.json({ success: true, message: 'อัปเดตผลการอบรมสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถอัปเดตผลการอบรมได้');
    }
});

// ─── DELETE /api/training/records/:id (admin) ─────────────────────────────────
router.delete('/records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสบันทึกไม่ถูกต้อง' });
        }
        const [result] = await db.query('DELETE FROM Training_Records WHERE id=?', [req.params.id]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบบันทึกการอบรมที่ต้องการลบ' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_TRAINING_RECORD',
            targetType: 'Training_Records',
            targetId: req.params.id,
            detail: 'Deleted training record'
        });
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบบันทึกการอบรมได้');
    }
});

// ─── GET /api/training/dept-summary?year= ─────────────────────────────────────
router.get('/dept-summary', async (req, res) => {
    try {
        const year = req.query.year ? normalizeYear(req.query.year) : null;
        if (req.query.year && !year) {
            return res.status(400).json({ success: false, message: 'ปีไม่ถูกต้อง' });
        }
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
        return serverError(res, err, 'ไม่สามารถโหลดสรุปอบรมรายแผนกได้');
    }
});

// ─── Training Audit Requirements ─────────────────────────────────────────────
router.get('/audit-requirements', async (req, res) => {
    try {
        const year = req.query.year ? normalizeYear(req.query.year) : new Date().getFullYear();
        if (!year) return res.status(400).json({ success: false, message: 'ปีไม่ถูกต้อง' });
        const [rows] = await db.query(
            'SELECT * FROM Training_Audit_Requirements WHERE Year=? ORDER BY SortOrder ASC, id ASC',
            [year]
        );
        const data = rows.length ? rows : TRAINING_AUDIT_DEFAULTS.map((row, index) => ({
            id: null,
            Year: year,
            RequirementNo: row[0],
            CourseName: row[1],
            Detail: row[2],
            TargetGroup: row[3],
            TargetPct: row[4],
            AllCount: row[5],
            IssuePct: row[6],
            Status: row[7],
            CourseKeys: row[8],
            TargetKeys: row[9],
            SortOrder: row[10] ?? index + 1,
            isDefault: true,
        }));
        res.json({ success: true, data, synthesized: rows.length === 0 });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดตาราง Audit ได้');
    }
});

router.post('/audit-requirements', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const data = auditPayload(req.body);
        if (!data.Year || !data.RequirementNo || !data.CourseName || data.TargetPct === null || data.SortOrder === null) {
            return res.status(400).json({ success: false, message: 'ข้อมูล Audit ไม่ถูกต้อง' });
        }
        const [result] = await db.query(
            `INSERT INTO Training_Audit_Requirements
             (Year, RequirementNo, CourseName, Detail, TargetGroup, TargetPct, AllCount, IssuePct, Status, CourseKeys, TargetKeys, SortOrder, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.Year, data.RequirementNo, data.CourseName, data.Detail, data.TargetGroup, data.TargetPct, data.AllCount, data.IssuePct, data.Status, data.CourseKeys, data.TargetKeys, data.SortOrder, userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_TRAINING_AUDIT_REQUIREMENT',
            targetType: 'Training_Audit_Requirements',
            targetId: result.insertId,
            detail: `Created training audit requirement ${data.RequirementNo}`,
            metadata: data,
        });
        res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถเพิ่มแถว Audit ได้');
    }
});

router.put('/audit-requirements/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: 'รหัสไม่ถูกต้อง' });
        const data = auditPayload(req.body);
        if (!data.Year || !data.RequirementNo || !data.CourseName || data.TargetPct === null || data.SortOrder === null) {
            return res.status(400).json({ success: false, message: 'ข้อมูล Audit ไม่ถูกต้อง' });
        }
        const [result] = await db.query(
            `UPDATE Training_Audit_Requirements
             SET Year=?, RequirementNo=?, CourseName=?, Detail=?, TargetGroup=?, TargetPct=?, AllCount=?, IssuePct=?, Status=?, CourseKeys=?, TargetKeys=?, SortOrder=?
             WHERE id=?`,
            [data.Year, data.RequirementNo, data.CourseName, data.Detail, data.TargetGroup, data.TargetPct, data.AllCount, data.IssuePct, data.Status, data.CourseKeys, data.TargetKeys, data.SortOrder, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบแถว Audit' });
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_TRAINING_AUDIT_REQUIREMENT',
            targetType: 'Training_Audit_Requirements',
            targetId: req.params.id,
            detail: `Updated training audit requirement ${data.RequirementNo}`,
            metadata: data,
        });
        res.json({ success: true });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถแก้ไขแถว Audit ได้');
    }
});

router.delete('/audit-requirements/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: 'รหัสไม่ถูกต้อง' });
        const [result] = await db.query('DELETE FROM Training_Audit_Requirements WHERE id=?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบแถว Audit' });
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_TRAINING_AUDIT_REQUIREMENT',
            targetType: 'Training_Audit_Requirements',
            targetId: req.params.id,
            detail: 'Deleted training audit requirement',
        });
        res.json({ success: true });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบแถว Audit ได้');
    }
});

// ─── GET /api/training/dept-records ───────────────────────────────────────────
router.get('/dept-records', async (req, res) => {
    try {
        const { year, department } = req.query;
        const cleanYear = year ? normalizeYear(year) : null;
        if (year && !cleanYear) {
            return res.status(400).json({ success: false, message: 'ปีไม่ถูกต้อง' });
        }
        let sql = `
            SELECT r.*, c.CourseName, c.CourseCode
            FROM Training_Dept_Records r
            LEFT JOIN Training_Courses c ON c.id = r.CourseID
            WHERE 1=1`;
        const params = [];
        if (cleanYear)  { sql += ' AND r.Year = ?';       params.push(cleanYear); }
        if (department) { sql += ' AND r.Department = ?'; params.push(department); }
        sql += ' ORDER BY r.Year DESC, r.Department ASC, c.CourseName ASC';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถโหลดบันทึกอบรมรายแผนกได้');
    }
});

// ─── POST /api/training/dept-records (admin) ──────────────────────────────────
router.post('/dept-records', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, Year, CourseID, TotalEmp, PassedCount, Notes } = req.body;
        const department = cleanText(Department, 100);
        const year = normalizeYear(Year);
        const totalEmp = nonNegativeInt(TotalEmp, 0);
        const passedCount = nonNegativeInt(PassedCount, 0);
        const courseId = CourseID ? normalizeCourseId(CourseID) : null;
        if (!department || !year) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ (แผนก / ปี)' });
        }
        if (totalEmp === null || passedCount === null) {
            return res.status(400).json({ success: false, message: 'จำนวนพนักงานและจำนวนที่ผ่านต้องเป็นตัวเลข 0 ขึ้นไป' });
        }
        if (CourseID && !courseId) {
            return res.status(400).json({ success: false, message: 'หลักสูตรไม่ถูกต้อง' });
        }
        if (passedCount > totalEmp) {
            return res.status(400).json({ success: false, message: 'จำนวนผ่านต้องไม่มากกว่าจำนวนพนักงาน' });
        }
        if (courseId) {
            const [[course]] = await db.query('SELECT id FROM Training_Courses WHERE id=?', [courseId]);
            if (!course) return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตรที่เลือก' });
        }
        // Duplicate guard: same dept + year + course (NULL-safe)
        const [dup] = await db.query(
            `SELECT id FROM Training_Dept_Records
             WHERE Department = ? AND Year = ?
               AND (CourseID <=> ?)`,
            [department, year, courseId]
        );
        if (dup.length > 0) {
            const courseLabel = courseId ? `หลักสูตรนี้` : `(ไม่ระบุหลักสูตร)`;
            return res.status(409).json({
                success: false,
                message: `มีข้อมูลของแผนก "${department}" ปี ${year} ${courseLabel} อยู่แล้ว`,
            });
        }
        const [result] = await db.query(
            `INSERT INTO Training_Dept_Records (Department, Year, CourseID, TotalEmp, PassedCount, Notes, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [department, year, courseId, totalEmp, passedCount, cleanText(Notes, 5000), userName(req)]
        );
        await logAudit(req, {
            module: MODULE,
            action: 'CREATE_TRAINING_DEPT_RECORD',
            targetType: 'Training_Dept_Records',
            targetId: result.insertId,
            detail: `Created department training record for ${department}`,
            metadata: { Department: department, Year: year, CourseID: courseId, TotalEmp: totalEmp, PassedCount: passedCount }
        });
        res.status(201).json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: { id: result.insertId } });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถบันทึกข้อมูลอบรมรายแผนกได้');
    }
});

// ─── PUT /api/training/dept-records/:id (admin) ───────────────────────────────
router.put('/dept-records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสบันทึกไม่ถูกต้อง' });
        }
        const { Department, Year, CourseID, TotalEmp, PassedCount, Notes } = req.body;
        const department = cleanText(Department, 100);
        const year = normalizeYear(Year);
        const totalEmp = nonNegativeInt(TotalEmp, 0);
        const passedCount = nonNegativeInt(PassedCount, 0);
        const courseId = CourseID ? normalizeCourseId(CourseID) : null;
        if (!department || !year) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
        }
        if (totalEmp === null || passedCount === null) {
            return res.status(400).json({ success: false, message: 'จำนวนพนักงานและจำนวนที่ผ่านต้องเป็นตัวเลข 0 ขึ้นไป' });
        }
        if (CourseID && !courseId) {
            return res.status(400).json({ success: false, message: 'หลักสูตรไม่ถูกต้อง' });
        }
        if (passedCount > totalEmp) {
            return res.status(400).json({ success: false, message: 'จำนวนผ่านต้องไม่มากกว่าจำนวนพนักงาน' });
        }
        if (courseId) {
            const [[course]] = await db.query('SELECT id FROM Training_Courses WHERE id=?', [courseId]);
            if (!course) return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตรที่เลือก' });
        }
        // Duplicate guard — exclude current row (NULL-safe course comparison)
        const [dup] = await db.query(
            `SELECT id FROM Training_Dept_Records
             WHERE Department = ? AND Year = ? AND (CourseID <=> ?) AND id <> ?`,
            [department, year, courseId, req.params.id]
        );
        if (dup.length > 0) {
            const courseLabel = courseId ? `หลักสูตรนี้` : `(ไม่ระบุหลักสูตร)`;
            return res.status(409).json({
                success: false,
                message: `มีข้อมูลของแผนก "${department}" ปี ${year} ${courseLabel} อยู่แล้ว`,
            });
        }
        const [result] = await db.query(
            `UPDATE Training_Dept_Records
             SET Department=?, Year=?, CourseID=?, TotalEmp=?, PassedCount=?, Notes=?
             WHERE id=?`,
            [department, year, courseId, totalEmp, passedCount, cleanText(Notes, 5000), req.params.id]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบบันทึกอบรมรายแผนกที่ต้องการแก้ไข' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'UPDATE_TRAINING_DEPT_RECORD',
            targetType: 'Training_Dept_Records',
            targetId: req.params.id,
            detail: `Updated department training record for ${department}`,
            metadata: { Department: department, Year: year, CourseID: courseId, TotalEmp: totalEmp, PassedCount: passedCount }
        });
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถอัปเดตข้อมูลอบรมรายแผนกได้');
    }
});

// ─── DELETE /api/training/dept-records/:id (admin) ────────────────────────────
router.delete('/dept-records/:id', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        if (!isPositiveId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'รหัสบันทึกไม่ถูกต้อง' });
        }
        const [result] = await db.query('DELETE FROM Training_Dept_Records WHERE id=?', [req.params.id]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'ไม่พบบันทึกอบรมรายแผนกที่ต้องการลบ' });
        }
        await logAudit(req, {
            module: MODULE,
            action: 'DELETE_TRAINING_DEPT_RECORD',
            targetType: 'Training_Dept_Records',
            targetId: req.params.id,
            detail: 'Deleted department training record'
        });
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        return serverError(res, err, 'ไม่สามารถลบข้อมูลอบรมรายแผนกได้');
    }
});

// ─── GET /api/training/course-summary?year= ───────────────────────────────────
router.get('/course-summary', async (req, res) => {
    try {
        const year = req.query.year ? normalizeYear(req.query.year) : null;
        if (req.query.year && !year) {
            return res.status(400).json({ success: false, message: 'ปีไม่ถูกต้อง' });
        }
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
        return serverError(res, err, 'ไม่สามารถโหลดสรุปอบรมรายหลักสูตรได้');
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
        return serverError(res, err, 'ไม่สามารถค้นหาพนักงานได้');
    }
});

module.exports = router;
