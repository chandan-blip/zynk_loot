-- Add shuffle_card to game_type ENUM and create shuffle card round tables.

ALTER TABLE game_bets
  MODIFY COLUMN game_type ENUM('coin_flip', 'dice_roll', 'lucky_spin', 'balloon_pop', 'dragon_tower', 'ice_field', 'arrow_roulette', 'egg_hatch', 'fuse', 'mutka_king', 'uno_king', 'shuffle_card') NOT NULL;

CREATE TABLE IF NOT EXISTS shuffle_card_rounds (
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

CREATE TABLE IF NOT EXISTS shuffle_card_bets (
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
