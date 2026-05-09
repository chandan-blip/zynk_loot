-- Migration: Public enrollment leads captured from external websites via /api/enroll

CREATE TABLE IF NOT EXISTS website_leads (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    origin VARCHAR(500) DEFAULT NULL,
    referer VARCHAR(500) DEFAULT NULL,
    name VARCHAR(255) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(50) DEFAULT NULL,
    message TEXT DEFAULT NULL,
    payload JSON DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_origin (origin),
    INDEX idx_created (created_at),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
