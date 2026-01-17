-- Migration: Create numbers table

CREATE TABLE IF NOT EXISTS numbers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    number VARCHAR(7) NOT NULL UNIQUE,
    owner_id INT NULL,
    price DECIMAL(10,2) DEFAULT 10.00,
    total_votes INT DEFAULT 0,
    vote_trend DECIMAL(5,2) DEFAULT 0,
    times_won INT DEFAULT 0,
    last_won_date DATE NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_number (number),
    INDEX idx_owner (owner_id),
    INDEX idx_votes (total_votes DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
