-- Migration: Create transactions table

CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type ENUM('deposit', 'withdrawal', 'purchase', 'sale', 'vote', 'prize', 'refund', 'transfer_out', 'transfer_in') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    reference_type ENUM('number', 'offer', 'draw', 'admin', 'transfer') NULL,
    reference_id INT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_transactions (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
