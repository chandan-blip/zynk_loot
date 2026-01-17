-- Migration: Create offers table

CREATE TABLE IF NOT EXISTS offers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    number_id INT NOT NULL,
    from_user_id INT NOT NULL,
    to_user_id INT NOT NULL,
    offer_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'accepted', 'rejected', 'expired', 'cancelled') DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    INDEX idx_number (number_id),
    INDEX idx_from_user (from_user_id),
    INDEX idx_pending_offers (status, to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
