-- Add payment currency and actual payment amount to orders
ALTER TABLE zynk_orders
  ADD COLUMN payment_currency VARCHAR(10) NULL DEFAULT NULL AFTER price,
  ADD COLUMN payment_amount DECIMAL(20, 8) NULL DEFAULT NULL AFTER payment_currency;
