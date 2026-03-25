// backend/routes/activity-targets.js
// Auth applied at mount level (authenticateToken). Write ops require isAdmin.
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

// ─── Activity definitions (static metadata) ───────────────────────────────────
const ACTIVITIES = [
    { key: 'patrol',         label: 'Safety Patrol',           desc: 'จำนวนครั้งเดินตรวจ Safety Patrol' },
    { key: 'patrol_issue',   label: 'รายงานประเด็นปัญหา',     desc: 'ประเด็นปัญหาที่พบจากการเดินตรวจ' },
    { key: 'cccf_worker',    label: 'CCCF Form A Worker',      desc: 'แบบฟอร์มหยุด-เรียก-รอ (พนักงาน)' },
    { key: 'cccf_permanent', label: 'CCCF Form A Permanent',   desc: 'แบบฟอร์มหยุด-เรียก-รอ (หัวหน้า/ถาวร)' },
    { key: 'scw',            label: 'OJT Stop-Call-Wait',      desc: 'บันทึก Stop-Call-Wait (SCW)' },
    { key: 'training',       label: 'Safety Training',         desc: 'หลักสูตรอบรมที่ผ่านในปีนี้' },
    { key: 'yokoten',        label: 'Yokoten Response',        desc: 'การตอบกลับ Yokoten' },
    { key: 'hiyari',         label: 'Hiyari Near-Miss',        desc: 'รายงานเหตุการณ์เฉียดอุบัติเหตุ' },
    { key: 'ky',             label: 'KY Activity',             desc: 'กิจกรรมทำนายอันตราย (Kiken Yochi)' },
];
const VALID_KEYS = new Set(ACTIVITIES.map(a => a.key));

// ─── Auto-create tables ───────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Position_Templates (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            PositionName VARCHAR(100) NOT NULL,
            ActivityKey  VARCHAR(50)  NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pos_act (PositionName, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    try {
        await db.query('ALTER TABLE Activity_Position_Templates ADD COLUMN IsNA TINYINT(1) NOT NULL DEFAULT 0');
    } catch (_) { /* column already exists — ignore */ }
    await db.query(`
        CREATE TABLE IF NOT EXISTS Employee_Activity_Targets (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID   VARCHAR(50)  NOT NULL,
            ActivityKey  VARCHAR(50)  NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp_act (EmployeeID, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // migrate existing table — add IsNA if not exists
    try {
        await db.query('ALTER TABLE Employee_Activity_Targets ADD COLUMN IsNA TINYINT(1) NOT NULL DEFAULT 0');
    } catch (_) { /* column already exists — ignore */ }
    tablesReady = true;
}

// ─── Helper: safe count query (silent fail if table doesn't exist yet) ─────────
async function safeCount(sql, params) {
    try {
        const [[r]] = await db.query(sql, params);
        return r?.cnt ?? 0;
    } catch { return 0; }
}

// ─── Helper: merge position template + per-person override ────────────────────
async function getMergedTargets(empId) {
    const [[emp]] = await db.query('SELECT Position FROM Employees WHERE EmployeeID = ?', [empId]);
    const position = emp?.Position || null;

    const [posTemplates] = position
        ? await db.query(
            'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates WHERE PositionName = ?',
            [position])
        : [[]];

    const [overrides] = await db.query(
        'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Employee_Activity_Targets WHERE EmployeeID = ?',
        [empId]);

    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.ActivityKey] = { ...o, source: 'override' }; });
    const templateMap = {};
    posTemplates.forEach(t => { templateMap[t.ActivityKey] = { ...t, source: 'template' }; });

    return { position, overrideMap, templateMap };
}

// ─── GET /api/activity-targets/activities — static list ───────────────────────
router.get('/activities', (req, res) => {
    res.json({ success: true, data: ACTIVITIES });
});

// ─── GET /api/activity-targets/position-templates?position=X ─────────────────
router.get('/position-templates', async (req, res) => {
    try {
        await ensureTables();
        const { position } = req.query;
        const [rows] = position
            ? await db.query(
                'SELECT * FROM Activity_Position_Templates WHERE PositionName = ? ORDER BY ActivityKey',
                [position])
            : await db.query(
                'SELECT * FROM Activity_Position_Templates ORDER BY PositionName, ActivityKey');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/position-templates — upsert template (admin) ───
router.put('/position-templates', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { PositionName, ActivityKey, YearlyTarget, PassPct, IsNA } = req.body;
        if (!PositionName || !ActivityKey)
            return res.status(400).json({ success: false, message: 'PositionName และ ActivityKey จำเป็น' });
        if (!VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });
        const isNA = IsNA ? 1 : 0;
        await db.query(`
            INSERT INTO Activity_Position_Templates (PositionName, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
        `, [PositionName, ActivityKey, isNA ? 0 : (YearlyTarget ?? 0), PassPct ?? 80, isNA, req.user.name]);
        res.json({ success: true, message: isNA ? 'บันทึก N/A สำเร็จ' : 'บันทึกเทมเพลตสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/activity-targets/position-templates/bulk-apply ─────────────────
// Apply position template to ALL employees in that position (admin)
router.post('/position-templates/bulk-apply', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { PositionName } = req.body;
        if (!PositionName)
            return res.status(400).json({ success: false, message: 'PositionName จำเป็น' });

        const [templates] = await db.query(
            'SELECT ActivityKey, YearlyTarget, PassPct FROM Activity_Position_Templates WHERE PositionName = ?',
            [PositionName]);
        if (!templates.length)
            return res.status(400).json({ success: false, message: 'ยังไม่มีเทมเพลตสำหรับตำแหน่งนี้' });

        const [employees] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE Position = ?', [PositionName]);
        if (!employees.length)
            return res.json({ success: true, message: 'ไม่มีพนักงานตำแหน่งนี้', updated: 0 });

        for (const emp of employees) {
            for (const tpl of templates) {
                await db.query(`
                    INSERT INTO Employee_Activity_Targets (EmployeeID, ActivityKey, YearlyTarget, PassPct, UpdatedBy)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), UpdatedBy=VALUES(UpdatedBy)
                `, [emp.EmployeeID, tpl.ActivityKey, tpl.YearlyTarget, tpl.PassPct, req.user.name]);
            }
        }
        res.json({
            success: true,
            message: `ใช้เทมเพลตกับ ${employees.length} คน (${templates.length} กิจกรรม) สำเร็จ`,
            updated: employees.length * templates.length,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/activity-targets/employee/:empId ────────────────────────────────
// Merged targets for one employee (admin view)
router.get('/employee/:empId', async (req, res) => {
    try {
        await ensureTables();
        const { overrideMap, templateMap, position } = await getMergedTargets(req.params.empId);

        const targets = ACTIVITIES.map(a => {
            const d = overrideMap[a.key] || templateMap[a.key] || null;
            return {
                activityKey:  a.key,
                label:        a.label,
                desc:         a.desc,
                yearlyTarget: d?.YearlyTarget ?? null,
                passPct:      d?.PassPct      ?? null,
                isNA:         d?.IsNA ?? 0,
                source:       d?.source       ?? 'none',
            };
        });
        res.json({ success: true, data: { empId: req.params.empId, position, targets } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/employee/:empId — save/delete override (admin) ─
router.put('/employee/:empId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { empId } = req.params;
        const { ActivityKey, YearlyTarget, PassPct, IsNA } = req.body;
        if (!ActivityKey || !VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });

        if (YearlyTarget === null || YearlyTarget === undefined) {
            // null = remove override → revert to position template
            await db.query(
                'DELETE FROM Employee_Activity_Targets WHERE EmployeeID = ? AND ActivityKey = ?',
                [empId, ActivityKey]);
            return res.json({ success: true, message: 'ลบ override สำเร็จ (ใช้ค่าเทมเพลตตำแหน่ง)' });
        }
        const isNA = IsNA ? 1 : 0;
        await db.query(`
            INSERT INTO Employee_Activity_Targets (EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
        `, [empId, ActivityKey, isNA ? 0 : (YearlyTarget ?? 0), PassPct ?? 80, isNA, req.user.name]);
        res.json({ success: true, message: isNA ? 'บันทึก N/A สำเร็จ' : 'บันทึก override สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/activity-targets/me — my targets + actual counts for current year
router.get('/me', async (req, res) => {
    try {
        await ensureTables();
        const empId   = req.user.id;
        const empName = req.user.name;
        const year    = new Date().getFullYear();

        const { overrideMap, templateMap } = await getMergedTargets(empId);

        // Actual counts in parallel (silent fail per table)
        const [
            patrolCount, cccfWorkerCount, cccfPermCount, scwCount,
            trainingCount, yokotenCount, hiyariCount, kyCount,
        ] = await Promise.all([
            safeCount('SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE UserID = ? AND YEAR(PatrolDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE EmployeeID = ? AND YEAR(SubmitDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM CCCF_FormA_Permanent WHERE SubmitterName = ? AND YEAR(SubmitDate) = ?', [empName, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM SCW_Documents WHERE UploadedBy = ? AND YEAR(UploadedAt) = ?', [empName, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM Training_Records WHERE EmployeeID = ? AND YEAR(TrainingDate) = ? AND IsPassed = 1', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM YokotenResponses WHERE EmployeeID = ? AND YEAR(ResponseDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM HiyariReports WHERE ReporterID = ? AND YEAR(ReportDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM KY_Activities WHERE ReporterID = ? AND YEAR(ActivityDate) = ?', [empId, year]),
        ]);

        const actualMap = {
            patrol:         patrolCount,
            patrol_issue:   null,          // Patrol_Issues ไม่มี ReporterID — ยังไม่รองรับ
            cccf_worker:    cccfWorkerCount,
            cccf_permanent: cccfPermCount,
            scw:            scwCount,
            training:       trainingCount,
            yokoten:        yokotenCount,
            hiyari:         hiyariCount,
            ky:             kyCount,
        };

        const targets = ACTIVITIES.map(a => {
            const d           = overrideMap[a.key] || templateMap[a.key] || null;
            const yearlyTarget = d?.YearlyTarget ?? null;
            const passPct     = d?.PassPct       ?? 80;
            const isNA        = d?.IsNA ? true : false;
            const actual      = actualMap[a.key];
            const pct         = yearlyTarget && !isNA && actual !== null
                ? Math.min(Math.round((actual / yearlyTarget) * 100), 100)
                : null;
            return {
                activityKey:   a.key,
                label:         a.label,
                desc:          a.desc,
                yearlyTarget,
                passPct,
                isNA,
                source:        d ? (overrideMap[a.key] ? 'override' : 'template') : 'none',
                actualCount:   actual,
                completionPct: pct,
                passed:        pct !== null ? pct >= passPct : null,
            };
        }).filter(t => t.yearlyTarget !== null && !t.isNA); // เฉพาะกิจกรรมที่มีเป้าหมาย และไม่ใช่ N/A

        res.json({ success: true, data: { year, targets } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
