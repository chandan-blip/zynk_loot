-- Migration: Update Zynk prices to 1 Z = $1

-- Update settings
UPDATE settings SET setting_value = '1.00' WHERE setting_key = 'zynk_to_usd';

-- Update zynk_packages prices (1 Z = $1)
UPDATE zynk_packages SET price = zynk_amount;
