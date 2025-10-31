// api/pagedata/committees.js
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
      'Committees', 'committees', 'SafetyCommittees', 'tsh_committees', 'committee'
    ]);
    if (!table) {
      return res.status(500).json({ success: false, message: 'ไม่พบตาราง Committees ในฐานข้อมูล' });
    }

    // ปรับคำสั่ง SQL ให้เหมาะกับคอลัมน์ของคุณเมื่อรู้ column ที่แท้จริงแล้ว
    // โค้ดด้านล่างคาดว่ามีคอลัมน์: Year, Department, Name, Role
    const [rows] = await p.query(
      `SELECT * FROM \`${table}\` ORDER BY Year DESC, Department ASC, Name ASC`
    );

    res.status(200).json({ success: true, items: rows || [] });
  } catch (e) {
    console.error('COMMITTEES ERROR:', e);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคณะกรรมการ',
      code: e.code, sqlMessage: e.sqlMessage
    });
  }
};
