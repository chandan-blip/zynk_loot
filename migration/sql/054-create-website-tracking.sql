-- Per-website visit/click tracking.
-- One row per event for full fidelity (top targets, referrers, daily series).
-- Counters on `websites` are kept in sync by the tracking endpoint for cheap list display.

CREATE TABLE IF NOT EXISTS website_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    website_id INT NOT NULL,
    event_type ENUM('visit','click') NOT NULL,
    session_id VARCHAR(64) NULL,
    target VARCHAR(500) NULL,
    referrer VARCHAR(500) NULL,
    user_agent VARCHAR(500) NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_we_site_type_time (website_id, event_type, created_at),
    INDEX idx_we_site_session (website_id, session_id),
    INDEX idx_we_created (created_at),
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE websites
  ADD COLUMN visits INT NOT NULL DEFAULT 0,
  ADD COLUMN clicks INT NOT NULL DEFAULT 0,
  ADD COLUMN last_visit_at TIMESTAMP NULL DEFAULT NULL;
