-- Migration: Create job_schedule table for tracking scheduled jobs

CREATE TABLE IF NOT EXISTS job_schedule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    job_type ENUM('draw_generate', 'draw_complete', 'digit_reveal', 'winner_process', 'custom') NOT NULL,
    session_number TINYINT DEFAULT NULL,
    cron_expression VARCHAR(50) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    status ENUM('scheduled', 'running', 'completed', 'failed', 'disabled') DEFAULT 'scheduled',
    is_enabled BOOLEAN DEFAULT TRUE,
    last_run_at DATETIME DEFAULT NULL,
    last_run_status ENUM('success', 'failed', 'skipped') DEFAULT NULL,
    last_run_duration_ms INT DEFAULT NULL,
    last_error TEXT DEFAULT NULL,
    next_run_at DATETIME DEFAULT NULL,
    run_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_job_type (job_type),
    INDEX idx_status (status),
    INDEX idx_next_run (next_run_at),
    INDEX idx_session (session_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create job_schedule_history table for execution logs
CREATE TABLE IF NOT EXISTS job_schedule_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    session_number TINYINT DEFAULT NULL,
    status ENUM('started', 'completed', 'failed', 'skipped') NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME DEFAULT NULL,
    duration_ms INT DEFAULT NULL,
    result_summary TEXT DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job_id (job_id),
    INDEX idx_started_at (started_at),
    INDEX idx_status (status),
    FOREIGN KEY (job_id) REFERENCES job_schedule(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
