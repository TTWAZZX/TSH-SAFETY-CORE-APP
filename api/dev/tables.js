// api/dev/tables.js
const { getPool } = require('../_db');

module.exports = async (req, res) => {
  try {
    const p = await getPool();
    const [rows] = await p.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name'
    );
    res.status(200).json({ ok: true, tables: rows.map(r => r.table_name) });
  } catch (e) {
    res.status(500).json({ ok: false, code: e.code, message: e.message });
  }
};
