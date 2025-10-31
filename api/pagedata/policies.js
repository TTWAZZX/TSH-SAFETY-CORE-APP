const { getPool } = require('../_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const p = await getPool();
    const [rows] = await p.query('SELECT *, id AS rowIndex FROM Policies ORDER BY EffectiveDate DESC');
    if (!rows?.length) return res.status(200).json({ current: null, past: [] });
    const current = rows.find(r => r.IsCurrent === 1) || rows[0];
    const past = rows.filter(r => r.id !== current.id);
    res.status(200).json({ current, past });
  } catch (e) {
    console.error('POLICIES ERROR:', e);
    res.status(500).json({ success:false, message:'เกิดข้อผิดพลาดในการดึงข้อมูลนโยบาย' });
  }
};
