-- Add dragon_tower to game_type ENUM
ALTER TABLE game_bets
  MODIFY COLUMN game_type ENUM('coin_flip', 'dice_roll', 'lucky_spin', 'balloon_pop', 'dragon_tower') NOT NULL;
