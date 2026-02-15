-- 026: Add live activity feed settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('activity_enabled', 'true', 'Enable/disable live activity feed'),
  ('activity_frequency_min', '3', 'Minimum seconds between activities'),
  ('activity_frequency_max', '10', 'Maximum seconds between activities'),
  ('activity_amount_digits_min', '2', 'Minimum digits for random amount (2 = 10-99)'),
  ('activity_amount_digits_max', '4', 'Maximum digits for random amount (4 = 1000-9999)'),
  ('activity_weight_vote', '20', 'Weight percentage for vote activities'),
  ('activity_weight_buy', '25', 'Weight percentage for buy activities'),
  ('activity_weight_sell', '10', 'Weight percentage for sell activities'),
  ('activity_weight_win', '5', 'Weight percentage for win activities'),
  ('activity_weight_zynk_buy', '15', 'Weight percentage for zynk buy activities'),
  ('activity_weight_transfer', '15', 'Weight percentage for transfer activities'),
  ('activity_weight_withdrawal', '10', 'Weight percentage for withdrawal activities')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
