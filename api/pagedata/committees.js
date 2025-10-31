// api/pagedata/committees.js
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
  // เลือกลำดับความสำคัญของคอลัมน์ที่น่าจะมี
  if (lower.has('year') && lower.has('department') && lower.has('name')) {
    return 'ORDER BY Year DESC, Department ASC, Name ASC';
  }
  if (lower.has('effective_date')) return 'ORDER BY Effective_Date DESC';
  if (lower.has('effectivedate'))  return 'ORDER BY EffectiveDate DESC';
  if (lower.has('created_at'))     return 'ORDER BY Created_At DESC';
  if (lower.has('createdat'))      return 'ORDER BY CreatedAt DESC';
  if (lower.has('updated_at'))     return 'ORDER BY Updated_At DESC';
  if (lower.has('updatedat'))      return 'ORDER BY UpdatedAt DESC';
  if (lower.has('id'))             return 'ORDER BY id DESC';
  return ''; // ไม่รู้จะสั่งเรียงอะไร ปล่อยว่าง
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const p = await getPool();

    const table = await pickExistingTable(p, [
      'Committees', 'committees', 'SafetyCommittees', 'tsh_committees', 'committee'
    ]);
    if (!table) {
      return res.status(500).json({ success: false, message: 'ไม่พบตาราง Committees ในฐานข้อมูล' });
    }

    const cols   = await getColumns(p, table);
    const order  = buildOrderBy(cols);
    const sql    = `SELECT * FROM \`${table}\` ${order}`;
    const [rows] = await p.query(sql);

    res.status(200).json({ success: true, items: rows || [] });
  } catch (e) {
    console.error('COMMITTEES ERROR:', e);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคณะกรรมการ',
      code: e.code,
      sqlMessage: e.sqlMessage
    });
  }
};
