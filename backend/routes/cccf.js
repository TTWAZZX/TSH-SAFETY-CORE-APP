const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

const upload = multer({ storage: cloudinaryStorage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Auto-migrate & auto-create tables
(async () => {
    try {
        await db.query(`ALTER TABLE CCCF_FormA_Worker ADD COLUMN SafetyUnit VARCHAR(100) NOT NULL DEFAULT '' AFTER Department`);
    } catch (e) { /* column already exists or table not yet created */ }
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS CCCF_Unit_Targets (
                id                INT AUTO_INCREMENT PRIMARY KEY,
                unit_name         VARCHAR(200) NOT NULL,
                yearly_target     INT NOT NULL DEFAULT 1,
                achieved_override INT DEFAULT NULL,
                UpdatedBy         VARCHAR(100),
                UpdatedAt         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_unit (unit_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } catch (e) { console.error('[cccf] CCCF_Unit_Targets create:', e.message); }
    try {
        await db.query(`ALTER TABLE CCCF_Unit_Targets ADD COLUMN achieved_override INT DEFAULT NULL`);
    } catch (e) { /* column already exists */ }
})();

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY: CCCF Activity (gallery) — keep for backward compat
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM CCCF_Activity ORDER BY ActivityDate DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/activity', async (req, res) => {
    try {
        const { ActivityDate, Area, Department, Description, Outcome } = req.body;
        await db.query(
            `INSERT INTO CCCF_Activity (ActivityDate, Area, Department, Description, Outcome, CreatedBy) VALUES (?, ?, ?, ?, ?, ?)`,
            [ActivityDate, Area, Department, Description, Outcome, req.user?.name || 'User']
        );
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// FORM A WORKER — Hazard Identification by Worker
// ─────────────────────────────────────────────────────────────────────────────

// GET /cccf/form-a-worker
router.get('/form-a-worker', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM CCCF_FormA_Worker ORDER BY SubmitDate DESC`
        );
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /cccf/form-a-worker
router.post('/form-a-worker', async (req, res) => {
    try {
        // ดึงข้อมูลพนักงานจาก JWT — ไม่รับจาก req.body เพื่อป้องกันการปลอมข้อมูล
        const EmployeeName = req.user.name;
        const EmployeeID   = req.user.id;
        const Department   = req.user.department;

        const {
            SubmitDate, JobArea, Equipment, SafetyUnit,
            HazardDescription, HowItHappened, BodyPart, Suggestion,
            StopType, Rank
        } = req.body;

        if (!HazardDescription || !StopType || !Rank) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        await db.query(
            `INSERT INTO CCCF_FormA_Worker
             (EmployeeName, EmployeeID, Department, SafetyUnit, SubmitDate, JobArea, Equipment,
              HazardDescription, HowItHappened, BodyPart, Suggestion, StopType, \`Rank\`, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                EmployeeName, EmployeeID, Department, SafetyUnit || '',
                SubmitDate || new Date(), JobArea || '', Equipment || '',
                HazardDescription, HowItHappened || '', BodyPart || '', Suggestion || '',
                StopType, Rank, EmployeeName
            ]
        );
        res.json({ success: true, message: 'ส่งแบบฟอร์ม CCCF สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ success: false, message: 'ยังไม่มีตาราง CCCF_FormA_Worker — กรุณาสร้างตารางก่อน' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /cccf/form-a-worker/:id  (owner or admin)
router.put('/form-a-worker/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await db.query('SELECT EmployeeID FROM CCCF_FormA_Worker WHERE id = ?', [id]);
        if (!existing.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

        const isAdminUser = req.user.role === 'Admin';
        if (!isAdminUser && existing[0].EmployeeID !== req.user.id) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์แก้ไขรายการของผู้อื่น' });
        }

        const {
            SubmitDate, JobArea, Equipment, SafetyUnit,
            HazardDescription, HowItHappened, BodyPart, Suggestion,
            StopType, Rank
        } = req.body;

        if (!HazardDescription || !StopType || !Rank) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        await db.query(
            `UPDATE CCCF_FormA_Worker SET
             SafetyUnit=?, SubmitDate=?, JobArea=?, Equipment=?,
             HazardDescription=?, HowItHappened=?, BodyPart=?, Suggestion=?,
             StopType=?, \`Rank\`=?
             WHERE id=?`,
            [
                SafetyUnit || '', SubmitDate || new Date(),
                JobArea || '', Equipment || '',
                HazardDescription, HowItHappened || '', BodyPart || '', Suggestion || '',
                StopType, Rank, id
            ]
        );
        res.json({ success: true, message: 'อัพเดตสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /cccf/form-a-worker/:id  (owner or admin)
router.delete('/form-a-worker/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const isAdminUser = req.user.role === 'Admin';
        if (!isAdminUser) {
            // verify ownership
            const [existing] = await db.query('SELECT EmployeeID FROM CCCF_FormA_Worker WHERE id = ?', [id]);
            if (!existing.length) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
            if (existing[0].EmployeeID !== req.user.id) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ลบรายการของผู้อื่น' });
            }
        }
        await db.query('DELETE FROM CCCF_FormA_Worker WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// FORM A PERMANENT — Supervisor Submission
// ─────────────────────────────────────────────────────────────────────────────

// GET /cccf/form-a-permanent
router.get('/form-a-permanent', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM CCCF_FormA_Permanent ORDER BY SubmitDate DESC`
        );
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /cccf/form-a-permanent  (with optional file upload)
router.post('/form-a-permanent', upload.single('FormFile'), async (req, res) => {
    try {
        // ดึงข้อมูลผู้ส่งจาก JWT — ไม่รับจาก req.body เพื่อป้องกันการปลอมข้อมูล
        const SubmitterName = req.user.name;
        const Department    = req.user.department;

        const { JobArea, SubmitDate, Summary, AssigneeID } = req.body;

        const fileUrl = req.file?.path || req.file?.secure_url || null;

        await db.query(
            `INSERT INTO CCCF_FormA_Permanent
             (SubmitterName, Department, JobArea, SubmitDate, Summary, FileUrl, AssigneeID, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                SubmitterName, Department, JobArea || '', SubmitDate || new Date(),
                Summary || '', fileUrl, AssigneeID || null,
                SubmitterName
            ]
        );
        res.json({ success: true, message: 'ส่งเอกสาร CCCF Permanent สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ success: false, message: 'ยังไม่มีตาราง CCCF_FormA_Permanent — กรุณาสร้างตารางก่อน' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /cccf/form-a-permanent/:id
router.delete('/form-a-permanent/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM CCCF_FormA_Permanent WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TARGETS — Admin sets yearly target per Safety Unit
// ─────────────────────────────────────────────────────────────────────────────

// GET /cccf/unit-targets
router.get('/unit-targets', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM CCCF_Unit_Targets ORDER BY unit_name ASC');
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /cccf/unit-targets/:unit  (admin only — checked in handler)
router.put('/unit-targets/:unit', async (req, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้น' });
    try {
        const unitName       = decodeURIComponent(req.params.unit);
        const target         = parseInt(req.body.yearly_target) || 0;
        const achRaw         = req.body.achieved_override;
        const achOverride    = (achRaw === null || achRaw === undefined || achRaw === '') ? null : parseInt(achRaw);
        await db.query(
            `INSERT INTO CCCF_Unit_Targets (unit_name, yearly_target, achieved_override, UpdatedBy)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               yearly_target=VALUES(yearly_target),
               achieved_override=VALUES(achieved_override),
               UpdatedBy=VALUES(UpdatedBy)`,
            [unitName, target, achOverride, req.user.name]
        );
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS — Admin manages who must submit Form A Permanent
// ─────────────────────────────────────────────────────────────────────────────

// GET /cccf/assignments
router.get('/assignments', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM CCCF_Assignments ORDER BY Department ASC');
        res.json(rows);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /cccf/assignments
router.post('/assignments', async (req, res) => {
    try {
        const { AssigneeName, Department } = req.body;
        if (!AssigneeName || !Department) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและหน่วยงาน' });
        }
        await db.query(
            'INSERT INTO CCCF_Assignments (AssigneeName, Department, CreatedBy) VALUES (?, ?, ?)',
            [AssigneeName, Department, req.user?.name || 'Admin']
        );
        res.json({ success: true, message: 'เพิ่มรายการมอบหมายสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ success: false, message: 'ยังไม่มีตาราง CCCF_Assignments' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /cccf/assignments/:id
router.delete('/assignments/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM CCCF_Assignments WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
