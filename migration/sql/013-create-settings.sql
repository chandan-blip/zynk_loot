-- Migration: Create settings table

CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(50) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
    ('number_base_price', '10', 'Base price for buying a number'),
    ('vote_cost', '1', 'Cost per vote'),
    ('generate_time', '20:00:00', 'Time when new number is generated (8 PM)'),
    ('result_time', '21:00:00', 'Time when result is revealed (9 PM)'),
    ('prize_pool_percentage', '80', 'Percentage of pool distributed to winners'),
    ('current_period_id', '', 'Current active period ID'),
    ('zynk_to_usd', '1.00', 'Zynk to USD exchange rate (1 Z = $1.00)')
ON DUPLICATE KEY UPDATE description = VALUES(description);
