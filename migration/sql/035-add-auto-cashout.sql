-- Add auto_cashout_at field to numbers table
-- When set, the system will automatically cash out the ticket when matched_digits reaches this value
ALTER TABLE numbers
  ADD COLUMN auto_cashout_at TINYINT NULL DEFAULT NULL AFTER cashout_payout;
