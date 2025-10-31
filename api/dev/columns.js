// api/dev/columns.js
const { getPool } = require('../_db');

module.exports = async (req, res) => {
  try {
    const table = (req.query?.table || '').trim();
    if (!table) return res.status(400).json({ ok: false, message: 'missing table' });

    const p = await getPool();
    const [cols] = await p.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
      [table]
    );
    // เสริม: ดูตัวอย่าง 5 แถว
    const [sample] = await p.query(`SELECT * FROM \`${table}\` LIMIT 5`);
    res.status(200).json({ ok: true, columns: cols, sample });
  } catch (e) {
    res.status(500).json({ ok: false, code: e.code, message: e.message });
  }
};
