-- Migration: Add approval status to winners table
-- Winners now require admin approval before prize is credited

ALTER TABLE winners
  ADD COLUMN status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' AFTER prize_amount,
  ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL,
  ADD INDEX idx_status (status);
