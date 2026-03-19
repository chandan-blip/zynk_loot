const jwt = require('jsonwebtoken');
const db = require('../config/database');

if (!process.env.JWT_SECRET) {
  console.error('[SECURITY] JWT_SECRET not set! Set JWT_SECRET environment variable before running in production.');
}
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [users] = await db.pool.query(
      'SELECT id, username, email, balance, is_admin, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!users[0].is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  generateToken,
  JWT_SECRET
};
