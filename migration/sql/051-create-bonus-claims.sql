-- Bonus module: daily / weekly / monthly check-in bonuses + first-deposit 2x bonus.
-- Run by the migration runner; tracked in `_migrations` so this executes exactly once.

-- 1) Ledger of every bonus claim. Indexed on (user, type, claimed_at) so the
--    cooldown lookup `MAX(claimed_at) WHERE user_id = ? AND type = ?` is cheap.
CREATE TABLE IF NOT EXISTS bonus_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('daily', 'weekly', 'monthly', 'first_deposit') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_type_time (user_id, type, claimed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) One-shot flag on users so the first-deposit bonus path is O(1) and
--    naturally idempotent under concurrent deposits (FOR UPDATE on the row).
ALTER TABLE users
  ADD COLUMN first_deposit_bonus_claimed TINYINT(1) NOT NULL DEFAULT 0;

-- 3) Default settings — admin can edit any of these from /admin/settings.
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('bonus_daily_amount',             '5',    'Daily login bonus amount (Z)'),
  ('bonus_weekly_amount',            '50',   'Weekly bonus amount (Z)'),
  ('bonus_monthly_amount',           '200',  'Monthly bonus amount (Z)'),
  ('bonus_first_deposit_multiplier', '2',    'First-deposit bonus multiplier (e.g. 2 = 2x deposit)'),
  ('bonus_first_deposit_cap',        '1000', 'Maximum first-deposit bonus paid (Z)'),
  ('bonus_daily_cooldown_hours',     '24',   'Hours between daily bonus claims'),
  ('bonus_weekly_cooldown_hours',    '168',  'Hours between weekly bonus claims (168 = 7 days)'),
  ('bonus_monthly_cooldown_hours',   '720',  'Hours between monthly bonus claims (720 = 30 days)')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

