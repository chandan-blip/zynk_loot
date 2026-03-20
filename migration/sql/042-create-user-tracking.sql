-- Migration: Create user activity tracking tables

CREATE TABLE IF NOT EXISTS user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    duration_seconds INT DEFAULT 0,
    device_type ENUM('desktop', 'mobile', 'tablet', 'unknown') DEFAULT 'unknown',
    browser VARCHAR(100) NULL,
    os VARCHAR(100) NULL,
    screen_resolution VARCHAR(20) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_session_user (user_id, started_at),
    INDEX idx_session_active (is_active, started_at),
    INDEX idx_session_started (started_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    session_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    event_data JSON NULL,
    page_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_user_type (user_id, event_type, created_at),
    INDEX idx_event_session (session_id),
    INDEX idx_event_type (event_type, created_at),
    INDEX idx_event_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_activity_daily (
    id INT PRIMARY KEY AUTO_INCREMENT,
    metric_date DATE NOT NULL,
    total_sessions INT DEFAULT 0,
    unique_users INT DEFAULT 0,
    total_page_views INT DEFAULT 0,
    total_clicks INT DEFAULT 0,
    avg_session_duration INT DEFAULT 0,
    avg_scroll_depth DECIMAL(5,2) DEFAULT 0,
    total_logins INT DEFAULT 0,
    total_game_plays INT DEFAULT 0,
    total_number_buys INT DEFAULT 0,
    total_votes INT DEFAULT 0,
    total_deposits INT DEFAULT 0,
    total_withdrawals INT DEFAULT 0,
    top_pages JSON NULL,
    device_breakdown JSON NULL,
    UNIQUE KEY uk_metric_date (metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
