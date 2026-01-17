-- Migration: Create zynk_orders table

CREATE TABLE IF NOT EXISTS zynk_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    package_id INT NULL,
    zynk_amount INT NOT NULL,
    bonus_amount INT DEFAULT 0,
    price DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_account_id INT NULL,
    payment_id VARCHAR(255) NULL,
    payment_proof VARCHAR(500) NULL,
    payment_reference VARCHAR(100) NULL,
    payment_note TEXT NULL,
    status ENUM('pending', 'awaiting_approval', 'approved', 'rejected', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    admin_id INT NULL,
    admin_note VARCHAR(255) NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_awaiting (status, created_at DESC),
    INDEX idx_payment_account (payment_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
