-- Migration: Create payment_methods table

CREATE TABLE IF NOT EXISTS payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('upi', 'crypto', 'bank') NOT NULL,
    label VARCHAR(100) NULL,
    -- UPI fields
    upi_id VARCHAR(100) NULL,
    -- Crypto fields
    wallet_address VARCHAR(255) NULL,
    wallet_type VARCHAR(50) NULL,
    -- Bank fields
    bank_name VARCHAR(100) NULL,
    account_number VARCHAR(50) NULL,
    ifsc_code VARCHAR(20) NULL,
    account_holder VARCHAR(100) NULL,
    -- Meta
    is_primary BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
