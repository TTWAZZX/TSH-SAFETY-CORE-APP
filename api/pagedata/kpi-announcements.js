// api/pagedata/kpi-announcements.js
const { getPool } = require('../_db');

async function pickExistingTable(p, candidates) {
  const [rows] = await p.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
  );
  const have = new Set(rows.map(r => r.table_name.toLowerCase()));
  return candidates.find(c => have.has(c.toLowerCase())) || null;
}

async function getColumns(p, table) {
  const [cols] = await p.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
    [table]
  );
  return cols.map(c => c.column_name);
}

function buildOrderBy(cols) {
  const lower = new Set(cols.map(c => c.toLowerCase()));
  // ถ้ามี Year/Month ให้เรียงตามปี-เดือน
  if (lower.has('year') && lower.has('month')) {
    // รองรับความแตกต่างของตัวพิมพ์
    return 'ORDER BY Year DESC, Month DESC';
  }
  // ถ้ามี CreatedAt / Created_At หรือ EffectiveDate ให้ใช้ตัวนั้น
  if (lower.has('created_at'))    return 'ORDER BY Created_At DESC';
  if (lower.has('createdat'))     return 'ORDER BY CreatedAt DESC';
  if (lower.has('effective_date'))return 'ORDER BY Effective_Date DESC';
  if (lower.has('effectivedate')) return 'ORDER BY EffectiveDate DESC';
  if (lower.has('id'))            return 'ORDER BY id DESC';
  return '';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const p = await getPool();

    const table = await pickExistingTable(p, [
      'KpiAnnouncements', 'kpi_announcements', 'KPIAnnouncements', 'kpiAnnouncements', 'kpi_announce'
    ]);
    if (!table) {
      return res.status(500).json({ success: false, message: 'ไม่พบตาราง KPI Announcements ในฐานข้อมูล' });
    }

    const cols   = await getColumns(p, table);
    const order  = buildOrderBy(cols);
    const sql    = `SELECT * FROM \`${table}\` ${order}`;
    const [rows] = await p.query(sql);

    const current = rows?.[0] || null;
    const past    = (rows || []).slice(1);
    res.status(200).json({ success: true, current, past });
  } catch (e) {
    console.error('KPI ANN ERROR:', e);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงประกาศ KPI',
      code: e.code,
      sqlMessage: e.sqlMessage
    });
  }
};
