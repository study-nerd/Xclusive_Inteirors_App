const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');

const clientUrl = process.env.CLIENT_URL || '';
const isHttpsClient = clientUrl.startsWith('https://');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && isHttpsClient,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const login = async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await db.query(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.cookie('token', token, COOKIE_OPTS);
  res.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
};

const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
};

const me = async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, email, role FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json({ success: true, user: rows[0] });
};

module.exports = { login, logout, me };
