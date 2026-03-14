-- Add phone column to users table (email remains, phone is optional alternative)
ALTER TABLE users
  ADD COLUMN phone VARCHAR(20) NULL DEFAULT NULL AFTER email,
  ADD UNIQUE INDEX idx_phone (phone);
