const db = require('../config/database');

// Idempotent boot-time migration for credential-change session invalidation.
// Same pattern as ensureRbacSchema(): safe to run on every startup.
//
//  1. users.token_version column (INT, default 0). This value is baked into
//     every JWT at login time (the `tv` claim) and re-checked on every request
//     in authenticateToken — a mismatch forces re-login.
//  2. A BEFORE UPDATE trigger that bumps token_version whenever email, phone,
//     or password_hash changes. The trigger lives in the DB (not app code) on
//     purpose: it fires even for a *direct* `UPDATE users SET email=...` run
//     from a SQL client, which is exactly the scenario this guards against.
//
// Net effect: changing an admin's (or any user's) email/phone/password — by any
// path, including raw SQL — invalidates all their existing sessions on the next
// request, while leaving everyone else's sessions untouched.
const ensureTokenVersionSchema = async () => {
  // 1. users.token_version column (MySQL has no reliable ADD COLUMN IF NOT EXISTS).
  const [cols] = await db.pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version'`
  );
  if (!cols[0].c) {
    await db.pool.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0');
    console.log('[TokenVersion] Added users.token_version column');
  }

  // 2. BEFORE UPDATE trigger. Recreate it each boot so the definition stays in
  //    sync with this file. Null-safe equality (<=>) handles NULL email/phone.
  //    Requires the TRIGGER privilege; if the DB user lacks it we keep app-level
  //    versioning working and just warn (direct-DB edits won't auto-bump then).
  try {
    await db.pool.query('DROP TRIGGER IF EXISTS users_bump_token_version');
    await db.pool.query(`
      CREATE TRIGGER users_bump_token_version
      BEFORE UPDATE ON users
      FOR EACH ROW
      BEGIN
        IF (NOT (NEW.email <=> OLD.email)
            OR NOT (NEW.phone <=> OLD.phone)
            OR NOT (NEW.password_hash <=> OLD.password_hash)) THEN
          SET NEW.token_version = OLD.token_version + 1;
        END IF;
      END
    `);
    console.log('[TokenVersion] Installed users_bump_token_version trigger');
  } catch (err) {
    console.warn(
      '[TokenVersion] Could not install token_version trigger (TRIGGER privilege missing?). ' +
      'App-level versioning is active, but direct DB credential edits will NOT auto-invalidate sessions. ' +
      `Cause: ${err.message}`
    );
  }
};

module.exports = ensureTokenVersionSchema;
