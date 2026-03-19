-- Add preferred currency to users table
ALTER TABLE users
ADD COLUMN preferred_currency VARCHAR(20) DEFAULT 'ZYNK'
COMMENT 'User preferred display/investment currency code';
