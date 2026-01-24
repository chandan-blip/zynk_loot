-- Migration: Add session_number column to daily_draws table
-- Supports 3 lottery sessions per day instead of single daily draw

ALTER TABLE daily_draws
ADD COLUMN session_number TINYINT NOT NULL DEFAULT 1
COMMENT 'Session number (1=Morning 8AM-3PM, 2=Evening 3PM-11PM, 3=Night 11PM-6AM)'
AFTER draw_date;

-- Add index for faster session-based queries
ALTER TABLE daily_draws
ADD INDEX idx_session (session_number);

-- Add composite index for date + session lookups
ALTER TABLE daily_draws
ADD INDEX idx_date_session (draw_date, session_number);
