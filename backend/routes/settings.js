// =================================================================
// App Settings — key/value store shared across all users
// GET  /api/settings/:key    — any authenticated user
// PUT  /api/settings/:key    — admin only
// =================================================================
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

// Ensure table exists on first load
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS App_Settings (
                key_name  VARCHAR(100) PRIMARY KEY,
                value     TEXT,
                UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (e) { console.error('[settings] ensureTable error:', e.message); }
})();

// GET /api/settings/:key
router.get('/:key', async (req, res) => {
    const [rows] = await db.query(
        'SELECT value FROM App_Settings WHERE key_name = ?',
        [req.params.key]
    );
    res.json({ value: rows.length ? rows[0].value : null });
});

// PUT /api/settings/:key  (admin only)
router.put('/:key', isAdmin, async (req, res) => {
    const { value } = req.body;
    if (value === null || value === undefined) {
        await db.query('DELETE FROM App_Settings WHERE key_name = ?', [req.params.key]);
    } else {
        await db.query(
            `INSERT INTO App_Settings (key_name, value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), UpdatedAt = NOW()`,
            [req.params.key, typeof value === 'string' ? value : JSON.stringify(value)]
        );
    }
    res.json({ ok: true });
});

module.exports = router;
