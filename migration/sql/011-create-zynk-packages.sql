-- Migration: Create zynk_packages table

CREATE TABLE IF NOT EXISTS zynk_packages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    zynk_amount INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    bonus_percent INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default Zynk packages (1 Z = $1)
INSERT INTO zynk_packages (name, zynk_amount, price, bonus_percent) VALUES
    ('Starter', 100, 100.00, 0),
    ('Popular', 500, 500.00, 10),
    ('Pro', 1000, 1000.00, 15),
    ('Ultimate', 5000, 5000.00, 25)
ON DUPLICATE KEY UPDATE name = VALUES(name);
