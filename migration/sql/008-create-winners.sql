-- Migration: Create winners table

CREATE TABLE IF NOT EXISTS winners (
    id INT PRIMARY KEY AUTO_INCREMENT,
    draw_id INT NOT NULL,
    user_id INT NOT NULL,
    number_id INT NOT NULL,
    period_id VARCHAR(20) NOT NULL,
    matching_digits INT NOT NULL,
    prize_amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_draw (draw_id),
    INDEX idx_user (user_id),
    INDEX idx_period (period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
