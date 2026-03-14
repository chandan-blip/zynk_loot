-- Add balloon_pop to game_type ENUM
ALTER TABLE game_bets
  MODIFY COLUMN game_type ENUM('coin_flip', 'dice_roll', 'lucky_spin', 'balloon_pop') NOT NULL;
