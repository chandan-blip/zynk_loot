-- Add uno_king to game_type ENUM
ALTER TABLE game_bets
  MODIFY COLUMN game_type ENUM('coin_flip', 'dice_roll', 'lucky_spin', 'balloon_pop', 'dragon_tower', 'ice_field', 'arrow_roulette', 'egg_hatch', 'fuse', 'mutka_king', 'uno_king') NOT NULL;
