const { getPool } = require('../_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const p = await getPool();
    const [rows] = await p.query('SELECT * FROM KpiAnnouncements ORDER BY Year DESC, Month DESC, CreatedAt DESC');
    const current = rows?.[0] || null;
    const past = (rows || []).slice(1);
    res.status(200).json({ current, past });
  } catch (e) {
    console.error('KPI ANN ERROR:', e);
    res.status(500).json({ success:false, message:'เกิดข้อผิดพลาดในการดึงประกาศ KPI' });
  }
};
