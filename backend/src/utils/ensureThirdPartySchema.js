const db = require('../config/database');

// Ensures the `third_party_games` table exists. These are admin-uploaded
// catalog entries (just an image, optional name + external game URL) shown on
// the "Third Party" tab of the Games page. Clicking one is gated behind a
// first deposit on the frontend.
async function ensureThirdPartySchema() {
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS third_party_games (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NULL,
      image_url VARCHAR(512) NOT NULL,
      game_url VARCHAR(512) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = ensureThirdPartySchema;
