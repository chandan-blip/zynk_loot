-- Migration: Create payment_accounts table

CREATE TABLE IF NOT EXISTS payment_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('upi', 'bank', 'crypto_btc', 'crypto_eth', 'crypto_usdt') NOT NULL,
    label VARCHAR(100) NOT NULL,
    -- UPI fields
    upi_id VARCHAR(100) NULL,
    upi_name VARCHAR(100) NULL,
    -- Bank fields
    bank_name VARCHAR(100) NULL,
    bank_account VARCHAR(50) NULL,
    bank_ifsc VARCHAR(20) NULL,
    bank_holder VARCHAR(100) NULL,
    -- Crypto fields
    wallet_address VARCHAR(255) NULL,
    wallet_network VARCHAR(50) NULL,
    -- Meta
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    usage_count INT DEFAULT 0,
    daily_limit DECIMAL(15, 2) NULL,
    daily_used DECIMAL(15, 2) DEFAULT 0,
    last_used_at TIMESTAMP NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_active (is_active, type),
    INDEX idx_priority (priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample payment accounts
INSERT INTO payment_accounts (type, label, upi_id, upi_name, is_active, priority) VALUES
    ('upi', 'Primary UPI', 'payments@loot', 'Loot Payments', TRUE, 10),
    ('upi', 'Secondary UPI', 'loot@ybl', 'Loot YBL', TRUE, 5)
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO payment_accounts (type, label, bank_name, bank_account, bank_ifsc, bank_holder, is_active, priority) VALUES
    ('bank', 'HDFC Account', 'HDFC Bank', '1234567890123', 'HDFC0001234', 'Loot Pvt Ltd', TRUE, 10)
ON DUPLICATE KEY UPDATE label = VALUES(label);
