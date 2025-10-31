// api/pagedata/kpi-announcements.js
const { getPool } = require('../_db');

async function pickExistingTable(p, candidates) {
  const [rows] = await p.query('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()');
  const have = new Set(rows.map(r => r.table_name.toLowerCase()));
  return candidates.find(c => have.has(c.toLowerCase())) || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const p = await getPool();

    // เดาชื่อ table ที่เป็นไปได้
    const table = await pickExistingTable(p, [
      'KpiAnnouncements', 'kpi_announcements', 'KPIAnnouncements', 'kpiAnnouncements', 'kpi_announce'
    ]);
    if (!table) {
      return res.status(500).json({ success: false, message: 'ไม่พบตาราง KPI Announcements ในฐานข้อมูล' });
    }

    // ปรับ SQL ให้ตรงคอลัมน์จริงหลังตรวจด้วย /api/dev/columns
    // คาดคอลัมน์: Year, Month, Title, CreatedAt
    const [rows] = await p.query(
      `SELECT * FROM \`${table}\` ORDER BY Year DESC, Month DESC, CreatedAt DESC`
    );

    const current = rows?.[0] || null;
    const past = (rows || []).slice(1);
    res.status(200).json({ success: true, current, past });
  } catch (e) {
    console.error('KPI ANN ERROR:', e);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงประกาศ KPI',
      code: e.code, sqlMessage: e.sqlMessage
    });
  }
};
