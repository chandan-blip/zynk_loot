-- Migration: Create smm_queue table for async SMM panel orders
--
-- Every Telegram post that wants SMM views/reactions INSERTs a row here
-- instead of calling the panel synchronously. A background worker
-- (`smmQueueService`) pulls the oldest `pending` row every 10–20s and
-- places the orders, then marks the row `done` or `failed`.
--
-- Rationale:
--   - Decouples Telegram send latency from SMM panel latency.
--   - Natural rate limit for cheap panels that drop bursts.
--   - Failed orders stay in the table for audit / retry.

CREATE TABLE IF NOT EXISTS smm_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_url VARCHAR(500) NOT NULL,
    context_label VARCHAR(64) NOT NULL DEFAULT 'generic',
    status ENUM('pending', 'processing', 'done', 'failed') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    placed INT NOT NULL DEFAULT 0,
    views_order_id VARCHAR(64) NULL,
    reactions_order_id VARCHAR(64) NULL,
    last_error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    processed_at TIMESTAMP NULL,
    INDEX idx_status_created (status, created_at),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
