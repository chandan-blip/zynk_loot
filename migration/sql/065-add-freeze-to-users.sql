-- Migration: Account freeze flag on users
--
-- Adds an admin-controlled freeze: when is_frozen = 1, the user sees a
-- fullscreen overlay on every page with the admin's note + a "Deposit"
-- button. Freeze auto-clears the moment any deposit gets admin-approved.

ALTER TABLE users
  ADD COLUMN is_frozen TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN freeze_note VARCHAR(500) NULL AFTER is_frozen,
  ADD COLUMN frozen_at DATETIME NULL AFTER freeze_note,
  ADD COLUMN frozen_by INT NULL AFTER frozen_at,
  ADD INDEX idx_is_frozen (is_frozen);
