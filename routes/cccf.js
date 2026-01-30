const express = require('express');
const router = express.Router();
const db = require('../db');

// Get All CCCF
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM CCCF_Activity ORDER BY ActivityDate DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save CCCF (แบบง่าย ไม่รวมรูปภาพเพื่อทดสอบก่อน)
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

module.exports = router;