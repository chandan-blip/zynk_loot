-- Migration: Create daily_winners table
-- Display-only table populated on each draw completion for social proof on /api/lottery/winners

CREATE TABLE IF NOT EXISTS daily_winners (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    draw_id INT NOT NULL,
    json_data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_draw (draw_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
