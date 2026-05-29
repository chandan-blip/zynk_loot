-- Shuffle Card redesign: 4 parallel DURATION lanes (30s / 1m / 5m / 10m), each
-- revealing exactly ONE card per round. The `card_count_type` column (1..4) is
-- repurposed from "number of cards" to a lane id — no structural change to the
-- shared prediction_log table is needed.
--
-- Bet kinds collapse to cards (15x) / suit (5x) / color (2x); the `rank` bet is
-- removed. Semantics changed, so existing rounds/bets are cleared (same
-- precedent as migration 064 for Mutka King).

TRUNCATE TABLE shuffle_card_bets;
TRUNCATE TABLE shuffle_card_rounds;

-- Drop the `rank` bet kind from the enum.
ALTER TABLE shuffle_card_bets
  MODIFY COLUMN kind ENUM('cards', 'suit', 'color') NOT NULL;

-- Lane id is always supplied explicitly; default to lane 1 (30s) for safety.
ALTER TABLE shuffle_card_rounds
  MODIFY COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE shuffle_card_bets
  MODIFY COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 1;
