-- Migration: Custom landing pages (websites) published per subdomain

CREATE TABLE IF NOT EXISTS websites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    sub_domain VARCHAR(100) NOT NULL,
    domain VARCHAR(200) DEFAULT NULL,
    html LONGTEXT,
    css LONGTEXT,
    js LONGTEXT,
    content LONGTEXT,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    published_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_sub_domain (sub_domain),
    INDEX idx_status_active (status, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
