-- Migration: Create referral system

-- Add referral columns to users table
ALTER TABLE users
  ADD COLUMN referral_code VARCHAR(20) UNIQUE DEFAULT NULL,
  ADD COLUMN referred_by INT DEFAULT NULL,
  ADD INDEX idx_referral_code (referral_code),
  ADD INDEX idx_referred_by (referred_by);

-- Referral commissions log table
CREATE TABLE IF NOT EXISTS referral_commissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id INT NOT NULL,
  referred_id INT NOT NULL,
  transaction_id INT NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  transaction_amount DECIMAL(15,2) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  commission_amount DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_referrer (referrer_id),
  INDEX idx_referred (referred_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add referral_commission transaction type + referral reference type
ALTER TABLE transactions
  MODIFY COLUMN type ENUM('deposit','withdrawal','purchase','sale','vote','prize','refund','transfer_out','transfer_in','cashout','referral_commission') NOT NULL,
  MODIFY COLUMN reference_type ENUM('number','offer','draw','admin','transfer','referral') NULL;

-- Add default commission rate setting (5%)
INSERT INTO settings (setting_key, setting_value, description)
VALUES ('referral_commission_rate', '5', 'Referral commission percentage on all transactions')
ON DUPLICATE KEY UPDATE description = VALUES(description);
