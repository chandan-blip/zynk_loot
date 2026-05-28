const db = require('../config/database');

// Idempotent boot-time migration for the admin RBAC feature. There is no
// dedicated migration runner in this project (schema is provisioned externally,
// seeds run on boot), so this mirrors the seedAdmin() pattern: safe to run on
// every startup.
//
//  1. admin_roles table (id, name, permissions JSON, is_system, timestamps)
//  2. users.admin_role_id column (guarded by information_schema — MySQL has no
//     reliable ADD COLUMN IF NOT EXISTS)
//  3. a seeded "Super Admin" system role with the wildcard permission
//  4. backfill: any is_admin=1 user without a role is bound to Super Admin so
//     existing admins keep full access and nobody is locked out.
//
// Returns the Super Admin role id.
const ensureRbacSchema = async () => {
  // 1. Roles table
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      permissions JSON NOT NULL,
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // 2. users.admin_role_id column
  const [cols] = await db.pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'admin_role_id'`
  );
  if (!cols[0].c) {
    await db.pool.query('ALTER TABLE users ADD COLUMN admin_role_id INT NULL');
    console.log('[RBAC] Added users.admin_role_id column');
  }

  // 3. Seed the Super Admin system role (wildcard access).
  let [roles] = await db.pool.query(
    'SELECT id FROM admin_roles WHERE is_system = 1 ORDER BY id ASC LIMIT 1'
  );
  let superRoleId;
  if (roles.length) {
    superRoleId = roles[0].id;
  } else {
    const [ins] = await db.pool.query(
      `INSERT INTO admin_roles (name, permissions, is_system) VALUES (?, ?, 1)`,
      ['Super Admin', JSON.stringify(['*'])]
    );
    superRoleId = ins.insertId;
    console.log('[RBAC] Seeded Super Admin role');
  }

  // 4. Backfill: existing admins with no role → Super Admin.
  const [res] = await db.pool.query(
    'UPDATE users SET admin_role_id = ? WHERE is_admin = 1 AND admin_role_id IS NULL',
    [superRoleId]
  );
  if (res.affectedRows) {
    console.log(`[RBAC] Bound ${res.affectedRows} existing admin(s) to Super Admin`);
  }

  return superRoleId;
};

module.exports = ensureRbacSchema;
