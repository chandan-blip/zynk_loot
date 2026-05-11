-- Mutka King: turn into 4 parallel game instances, one per card_count_type.
-- Each card_count_type (1..4) has its own rounds, period_id sequence, history.

TRUNCATE TABLE mutka_king_bets;
TRUNCATE TABLE mutka_king_rounds;

ALTER TABLE mutka_king_rounds
  DROP INDEX period_id;

ALTER TABLE mutka_king_rounds
  ADD COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER period_id,
  ADD UNIQUE KEY uniq_type_period (card_count_type, period_id),
  ADD INDEX idx_type_status (card_count_type, status);

ALTER TABLE mutka_king_bets
  ADD COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER round_id,
  ADD INDEX idx_type_round (card_count_type, round_id);
