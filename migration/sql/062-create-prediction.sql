-- Prediction admin module: per (game, card_count_type) toggles to pre-roll
-- the next round's cards and optionally push them to a Telegram channel
-- ~5 seconds after the round opens.
--
-- prediction_configs: 12 rows (3 games × 4 types) hold the on/off switches +
--   the custom telegram message text for each tile.
-- prediction_log: audit trail of every pre-rolled round and whether the
--   telegram broadcast succeeded.

CREATE TABLE IF NOT EXISTS prediction_configs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game ENUM('shuffle_card', 'mutka_king', 'uno_king') NOT NULL,
  card_count_type TINYINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  telegram_enabled TINYINT(1) NOT NULL DEFAULT 0,
  telegram_message TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_game_type (game, card_count_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed all 12 rows so the admin UI always has a row to flip.
INSERT IGNORE INTO prediction_configs (game, card_count_type, enabled, telegram_enabled) VALUES
  ('shuffle_card', 1, 0, 0),
  ('shuffle_card', 2, 0, 0),
  ('shuffle_card', 3, 0, 0),
  ('shuffle_card', 4, 0, 0),
  ('mutka_king',   1, 0, 0),
  ('mutka_king',   2, 0, 0),
  ('mutka_king',   3, 0, 0),
  ('mutka_king',   4, 0, 0),
  ('uno_king',     1, 0, 0),
  ('uno_king',     2, 0, 0),
  ('uno_king',     3, 0, 0),
  ('uno_king',     4, 0, 0);

CREATE TABLE IF NOT EXISTS prediction_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game ENUM('shuffle_card', 'mutka_king', 'uno_king') NOT NULL,
  card_count_type TINYINT UNSIGNED NOT NULL,
  round_id BIGINT UNSIGNED NOT NULL,
  period_id VARCHAR(32) NOT NULL,
  predicted_cards JSON NOT NULL,
  telegram_pushed TINYINT(1) NOT NULL DEFAULT 0,
  telegram_message_id BIGINT NULL,
  telegram_post_url VARCHAR(255) NULL,
  telegram_error TEXT NULL,
  pushed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_game_type_id (game, card_count_type, id),
  INDEX idx_round (round_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
