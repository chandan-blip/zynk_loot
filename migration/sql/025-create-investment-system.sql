-- Migration: Create investment system

-- Investment Tiers
CREATE TABLE IF NOT EXISTS investment_tiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    lock_days INT NOT NULL,
    multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    min_amount DECIMAL(15,2) NOT NULL DEFAULT 100,
    max_amount DECIMAL(15,2) NOT NULL DEFAULT 100000,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed 3 default tiers
INSERT INTO investment_tiers (name, slug, lock_days, multiplier, min_amount, max_amount, is_active, sort_order, description) VALUES
  ('Starter', 'starter', 7, 0.80, 100, 10000, TRUE, 1, 'Short-term investment with moderate returns. 7-day lock period.'),
  ('Growth', 'growth', 30, 1.20, 500, 50000, TRUE, 2, 'Medium-term investment with enhanced returns. 30-day lock period.'),
  ('Premium', 'premium', 90, 1.80, 1000, 100000, TRUE, 3, 'Long-term investment with maximum returns. 90-day lock period.');

-- Investments
CREATE TABLE IF NOT EXISTS investments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tier_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status ENUM('active', 'matured', 'withdrawn', 'cancelled') NOT NULL DEFAULT 'active',
    total_returns DECIMAL(15,2) DEFAULT 0,
    current_value DECIMAL(15,2) NOT NULL,
    locked_until DATETIME NOT NULL,
    invested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    matured_at DATETIME DEFAULT NULL,
    withdrawn_at DATETIME DEFAULT NULL,
    INDEX idx_user_status (user_id, status),
    INDEX idx_status_locked (status, locked_until),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tier_id) REFERENCES investment_tiers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform Metrics (daily snapshot)
CREATE TABLE IF NOT EXISTS platform_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metric_date DATE NOT NULL UNIQUE,
    total_users INT DEFAULT 0,
    new_users_today INT DEFAULT 0,
    active_users_today INT DEFAULT 0,
    total_transactions INT DEFAULT 0,
    transaction_volume DECIMAL(15,2) DEFAULT 0,
    total_draws INT DEFAULT 0,
    total_pool_today DECIMAL(15,2) DEFAULT 0,
    total_invested DECIMAL(15,2) DEFAULT 0,
    active_investments INT DEFAULT 0,
    growth_score DECIMAL(5,2) DEFAULT 0,
    base_daily_rate DECIMAL(8,6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Investment Returns (daily distribution log)
CREATE TABLE IF NOT EXISTS investment_returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    investment_id INT NOT NULL,
    user_id INT NOT NULL,
    metric_date DATE NOT NULL,
    base_rate DECIMAL(8,6) NOT NULL,
    tier_multiplier DECIMAL(5,2) NOT NULL,
    effective_rate DECIMAL(8,6) NOT NULL,
    return_amount DECIMAL(15,2) NOT NULL,
    value_before DECIMAL(15,2) NOT NULL,
    value_after DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_investment_date (investment_id, metric_date),
    INDEX idx_user_date (user_id, metric_date),
    FOREIGN KEY (investment_id) REFERENCES investments(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend transactions ENUM to include investment types
ALTER TABLE transactions
  MODIFY COLUMN type ENUM('deposit','withdrawal','purchase','sale','vote','prize','refund','transfer_out','transfer_in','cashout','referral_commission','invest','invest_return','invest_withdraw') NOT NULL,
  MODIFY COLUMN reference_type ENUM('number','offer','draw','admin','transfer','referral','investment') NULL;

-- Add investment tracking columns to users
ALTER TABLE users
  ADD COLUMN total_invested DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN total_invest_returns DECIMAL(15,2) DEFAULT 0;

-- Insert default investment settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('invest_enabled', 'true', 'Enable/disable investment feature'),
  ('invest_min_amount', '100', 'Minimum investment amount'),
  ('invest_max_amount', '100000', 'Maximum single investment amount'),
  ('invest_max_per_user', '500000', 'Maximum total invested per user'),
  ('invest_base_rate_min', '0.001', 'Minimum daily base rate (0.1%)'),
  ('invest_base_rate_max', '0.01', 'Maximum daily base rate (1%)'),
  ('invest_early_withdraw_penalty', '0.10', 'Early withdrawal penalty rate (10%)'),
  ('invest_growth_score_weights', '{"user_growth":0.30,"tx_volume":0.30,"active_users":0.25,"pool":0.15}', 'Growth score component weights')
ON DUPLICATE KEY UPDATE description = VALUES(description);
