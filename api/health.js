// api/health.js
const { getPool } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  try {
    const haveEnv = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET
    };
    const p = await getPool();               // ถ้า DB/โมดูลมีปัญหา จะ throw ที่นี่
    const [rows] = await p.query('SELECT VERSION() AS version');
    res.status(200).json({ ok: true, env: haveEnv, db: { ok: true, version: rows?.[0]?.version || null } });
  } catch (e) {
    console.error('HEALTH ERROR:', e);
    res.status(500).json({
      ok: false,
      code: e.code || e.name,
      message: e.message,
      errno: e.errno,
      sqlState: e.sqlState,
      address: e.address,
      port: e.port,
      host: e.host
    });
  }
};
