// api/login.js
const { getPool } = require('./_db');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // รองรับทั้ง req.body (ที่ถูก parse แล้ว) และสตริง JSON
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(req.body || '{}'); } catch {}
  }

  const { employeeId, password } = body || {};
  if (!employeeId) {
    res.status(400).json({ success: false, message: 'missing employeeId' });
    return;
  }

  try {
    const p = await getPool();
    const [rows] = await p.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
    const user = rows?.[0];
    if (!user) {
      res.status(401).json({ success: false, message: 'รหัสพนักงานไม่ถูกต้อง' });
      return;
    }
    if (password !== user.EmployeeID) {
      res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
      return;
    }

    const userData = {
      id: user.EmployeeID,
      name: user.EmployeeName,
      department: user.Department,
      role: user.Role,
      team: user.Team
    };
    const token = jwt.sign(userData, process.env.JWT_SECRET || 'dev', { expiresIn: '6h' });
    res.status(200).json({ success: true, user: userData, token });
  } catch (e) {
    console.error('LOGIN ERROR:', e);
    res.status(500).json({ success: false, code: e.code || e.name, message: e.message });
  }
};
