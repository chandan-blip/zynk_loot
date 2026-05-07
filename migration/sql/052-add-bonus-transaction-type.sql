-- Bonus claims write to the `transactions` ledger with type='bonus' and
-- reference_type='bonus'. Extend both ENUMs so those inserts succeed.

ALTER TABLE transactions
  MODIFY COLUMN type ENUM(
    'deposit','withdrawal','purchase','sale','vote','prize','refund',
    'transfer_out','transfer_in','cashout','referral_commission',
    'invest','invest_return','invest_withdraw',
    'game_bet','game_win',
    'bonus'
  ) NOT NULL,
  MODIFY COLUMN reference_type ENUM(
    'number','offer','draw','admin','transfer','referral','investment',
    'game_bet','bonus'
  ) NULL;
