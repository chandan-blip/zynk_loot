-- Add game_bet to reference_type enum
ALTER TABLE transactions
  MODIFY COLUMN reference_type ENUM('number','offer','draw','admin','transfer','referral','investment','game_bet') NULL;
