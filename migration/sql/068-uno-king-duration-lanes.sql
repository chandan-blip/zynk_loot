-- UNO King redesign: 4 parallel DURATION lanes (30s / 1m / 5m / 10m), each
-- revealing exactly ONE card per round from a 54-card UNO deck. The
-- `card_count_type` column (1..4) is repurposed from "number of cards" to a
-- lane id — no structural change to the shared prediction_log table is needed.
--
-- Bet kinds collapse to cards (15x) / color (2x) / action (5x) / wild (50x);
-- the `number` bet is removed. Semantics changed, so existing rounds/bets are
-- cleared (same precedent as migration 064 for Mutka King).

TRUNCATE TABLE uno_king_bets;
TRUNCATE TABLE uno_king_rounds;

-- Drop the `number` bet kind from the enum.
ALTER TABLE uno_king_bets
  MODIFY COLUMN kind ENUM('cards', 'color', 'action', 'wild') NOT NULL;

-- Lane id is always supplied explicitly; default to lane 1 (30s) for safety.
ALTER TABLE uno_king_rounds
  MODIFY COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE uno_king_bets
  MODIFY COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 1;
