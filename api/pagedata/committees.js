const { getPool } = require('../_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const p = await getPool();
    // ดึงรายชื่อคณะกรรมการล่าสุดก่อน
    const [rows] = await p.query('SELECT * FROM Committees ORDER BY Year DESC, Department ASC, Name ASC');
    res.status(200).json({ items: rows || [] });
  } catch (e) {
    console.error('COMMITTEES ERROR:', e);
    res.status(500).json({ success:false, message:'เกิดข้อผิดพลาดในการดึงข้อมูลคณะกรรมการ' });
  }
};
