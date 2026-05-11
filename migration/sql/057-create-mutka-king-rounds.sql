-- Mutka King: server-authoritative 60s round-based 52-card lottery.
-- Mirrors shuffle_card_* (migration 050) but draws 4 cards instead of 3.

CREATE TABLE IF NOT EXISTS mutka_king_rounds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id VARCHAR(32) NOT NULL UNIQUE,
  status ENUM('betting', 'locked', 'completed') NOT NULL DEFAULT 'betting',
  cards JSON NULL,
  result_summary JSON NULL,
  total_wager DECIMAL(14, 2) NOT NULL DEFAULT 0,
  total_win   DECIMAL(14, 2) NOT NULL DEFAULT 0,
  bet_count   INT UNSIGNED NOT NULL DEFAULT 0,
  player_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at  DATETIME NOT NULL,
  locked_at   DATETIME NULL,
  completed_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mutka_king_bets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  round_id BIGINT UNSIGNED NOT NULL,
  user_id  INT UNSIGNED NOT NULL,
  kind ENUM('cards', 'rank', 'suit', 'color') NOT NULL,
  amount DECIMAL(14, 2) NOT NULL,
  multiplier DECIMAL(10, 2) NOT NULL,
  details JSON NOT NULL,
  is_win TINYINT(1) NULL,
  win_amount DECIMAL(14, 2) NULL,
  status ENUM('pending', 'settled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at DATETIME NULL,
  PRIMARY KEY (id),
  INDEX idx_round (round_id),
  INDEX idx_user_round (user_id, round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
