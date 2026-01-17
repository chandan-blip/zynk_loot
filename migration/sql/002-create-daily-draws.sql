-- Migration: Create daily_draws table

CREATE TABLE IF NOT EXISTS daily_draws (
    id INT PRIMARY KEY AUTO_INCREMENT,
    period_id VARCHAR(20) NOT NULL UNIQUE,
    draw_date DATE NOT NULL,
    winning_number VARCHAR(7) NOT NULL,
    revealed_digits INT DEFAULT 0,
    generate_time TIME NOT NULL DEFAULT '20:00:00',
    result_time TIME NOT NULL DEFAULT '21:00:00',
    status ENUM('pending', 'active', 'revealing', 'completed') DEFAULT 'pending',
    total_pool DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_period (period_id),
    INDEX idx_date (draw_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
