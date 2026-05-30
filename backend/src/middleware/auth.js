const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { hasModule } = require('../config/adminModules');

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
      `SELECT u.id, u.username, u.email, u.balance, u.is_admin, u.is_active, u.admin_role_id, u.token_version,
              r.name AS role_name, r.permissions AS role_permissions, r.is_system AS role_is_system
         FROM users u
         LEFT JOIN admin_roles r ON r.id = u.admin_role_id
        WHERE u.id = ?`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!users[0].is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    // Credential-change session invalidation: the token carries the user's
    // token_version (tv) as of login; the DB bumps token_version whenever
    // email/phone/password changes (see ensureTokenVersionSchema). A mismatch
    // means the credentials changed after this token was issued — force re-login.
    if ((users[0].token_version || 0) !== (decoded.tv || 0)) {
      return res.status(401).json({ success: false, message: 'Session expired, please log in again' });
    }

    const u = users[0];
    // Parse the role's module permissions (JSON column may arrive as a string
    // or already-parsed array depending on the driver). Super = system role or
    // wildcard permission.
    let permissions = [];
    if (u.role_permissions != null) {
      try {
        permissions = typeof u.role_permissions === 'string'
          ? JSON.parse(u.role_permissions)
          : u.role_permissions;
      } catch (_) { permissions = []; }
    }
    if (!Array.isArray(permissions)) permissions = [];
    u.permissions = permissions;
    u.role_name = u.role_name || null;
    u.is_super = !!u.role_is_system || permissions.includes('*');

    req.user = u;
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

// Gate a route (or router) on a specific admin module. Assumes requireAdmin
// has already run. Super admins always pass. Used by route files whose admin
// endpoints live outside admin.js (support.js, notifications.js).
const requireModule = (moduleKey) => (req, res, next) => {
  if (hasModule(req.user, moduleKey)) return next();
  return res.status(403).json({ success: false, message: 'You do not have access to this module' });
};

const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ userId, tv: tokenVersion }, JWT_SECRET, { expiresIn: '7d' });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireModule,
  generateToken,
  JWT_SECRET
};
