-- Add fixed daily return rate per tier (admin-controlled)
-- When set, this rate is used directly instead of growth-score-based calculation
ALTER TABLE investment_tiers
  ADD COLUMN daily_rate DECIMAL(8, 6) DEFAULT NULL AFTER multiplier;
