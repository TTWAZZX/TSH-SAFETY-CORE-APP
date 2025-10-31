// api/session/verify.js
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(req.body || '{}'); } catch {}
  }
  const { token } = body || {};
  if (!token) return res.status(400).json({ success: false, message: 'missing token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || '');
    // อาจออก token ใหม่ (refresh แบบง่าย ๆ) ก็ได้
    const newToken = jwt.sign(payload, process.env.JWT_SECRET || '', { expiresIn: '6h' });
    res.status(200).json({ success: true, user: payload, token: newToken });
  } catch (e) {
    res.status(401).json({ success: false, message: 'invalid token' });
  }
};
