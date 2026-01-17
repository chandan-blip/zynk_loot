-- Migration: Create votes table

CREATE TABLE IF NOT EXISTS votes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    number_id INT NOT NULL,
    draw_id INT NOT NULL,
    vote_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_vote (user_id, number_id, draw_id),
    INDEX idx_user (user_id),
    INDEX idx_number (number_id),
    INDEX idx_draw_votes (draw_id, number_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
