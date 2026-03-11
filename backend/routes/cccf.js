const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage: cloudinaryStorage, fileFilter } = require('../cloudinary');

const upload = multer({ storage: cloudinaryStorage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

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
        // table might not exist yet — return empty gracefully
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /cccf/form-a-worker
router.post('/form-a-worker', async (req, res) => {
    try {
        const {
            EmployeeName, EmployeeID, Department, SubmitDate,
            JobArea, Equipment,
            HazardDescription, HowItHappened, BodyPart, Suggestion,
            StopType, Rank
        } = req.body;

        if (!EmployeeName || !EmployeeID || !Department || !HazardDescription || !StopType || !Rank) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        await db.query(
            `INSERT INTO CCCF_FormA_Worker
             (EmployeeName, EmployeeID, Department, SubmitDate, JobArea, Equipment,
              HazardDescription, HowItHappened, BodyPart, Suggestion, StopType, Rank, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                EmployeeName, EmployeeID, Department, SubmitDate || new Date(),
                JobArea || '', Equipment || '',
                HazardDescription, HowItHappened || '', BodyPart || '', Suggestion || '',
                StopType, Rank, req.user?.name || EmployeeName
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

// DELETE /cccf/form-a-worker/:id  (admin only — middleware applied at server mount)
router.delete('/form-a-worker/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM CCCF_FormA_Worker WHERE id = ?', [req.params.id]);
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
        const { SubmitterName, Department, JobArea, SubmitDate, Summary, AssigneeID } = req.body;

        if (!SubmitterName || !Department) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        const fileUrl = req.file?.path || req.file?.secure_url || null;

        await db.query(
            `INSERT INTO CCCF_FormA_Permanent
             (SubmitterName, Department, JobArea, SubmitDate, Summary, FileUrl, AssigneeID, CreatedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                SubmitterName, Department, JobArea || '', SubmitDate || new Date(),
                Summary || '', fileUrl, AssigneeID || null,
                req.user?.name || SubmitterName
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
