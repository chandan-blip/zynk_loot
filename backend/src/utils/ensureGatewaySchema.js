const db = require('../config/database');

// Ensures the payment-gateway bridge tables exist.
//
//  gateway_merchants — each registered client domain ("merchant" from the
//    bridge's point of view). We issue api_key/api_secret; clients call our
//    /api/gateway/* API and we proxy to our single OkPay account. Optional
//    self-serve portal (own subdomain + username/password) lets a merchant view
//    their own transactions.
//
//  gateway_orders — one row per payment we create on OkPay on a merchant's
//    behalf. `bridge_unique_id` is the globally-unique order ref WE send OkPay;
//    when OkPay calls back we look the order up by it to know which merchant to
//    forward the (re-signed) callback to.
async function ensureGatewaySchema() {
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_merchants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      domain VARCHAR(255) NULL,
      api_key VARCHAR(64) NOT NULL,
      api_secret VARCHAR(128) NOT NULL,
      callback_url VARCHAR(512) NULL,
      currency VARCHAR(16) NOT NULL DEFAULT 'USDT',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      portal_subdomain VARCHAR(63) NULL,
      portal_username VARCHAR(64) NULL,
      portal_password_hash VARCHAR(255) NULL,
      portal_enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_api_key (api_key),
      UNIQUE KEY uniq_portal_subdomain (portal_subdomain),
      UNIQUE KEY uniq_portal_username (portal_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      bridge_unique_id VARCHAR(80) NOT NULL,
      client_unique_id VARCHAR(190) NULL,
      okpay_order_id VARCHAR(190) NULL,
      amount DECIMAL(20,8) NOT NULL DEFAULT 0,
      coin VARCHAR(16) NULL,
      status TINYINT NOT NULL DEFAULT 0,
      type VARCHAR(16) NOT NULL DEFAULT 'deposit',
      return_url VARCHAR(512) NULL,
      client_callback_url VARCHAR(512) NULL,
      pay_url VARCHAR(512) NULL,
      raw_callback TEXT NULL,
      forwarded TINYINT(1) NOT NULL DEFAULT 0,
      forward_attempts INT NOT NULL DEFAULT 0,
      last_forward_code INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_bridge_unique_id (bridge_unique_id),
      KEY idx_merchant (merchant_id),
      KEY idx_merchant_client (merchant_id, client_unique_id),
      CONSTRAINT fk_gateway_orders_merchant
        FOREIGN KEY (merchant_id) REFERENCES gateway_merchants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Idempotent column adds for tables that predate a column (e.g. `currency`
  // added after the bridge first shipped).
  await ensureColumn('gateway_merchants', 'currency', `VARCHAR(16) NOT NULL DEFAULT 'USDT'`);
}

// Add a column only if it isn't already present (MySQL has no portable
// ADD COLUMN IF NOT EXISTS before 8.0.x in all builds, so check first).
async function ensureColumn(table, column, definition) {
  const [rows] = await db.pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]
  );
  if (!rows.length) {
    await db.pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

module.exports = ensureGatewaySchema;
