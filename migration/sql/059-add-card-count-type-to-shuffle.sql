-- Shuffle Card: turn into 4 parallel game instances, one per card_count_type.
-- Each card_count_type (1..4) has its own rounds, own period_id sequence, own
-- history. Wipes prior shuffle data since the old single-instance period_ids
-- aren't compatible with the new (card_count_type, period_id) scheme.

TRUNCATE TABLE shuffle_card_bets;
TRUNCATE TABLE shuffle_card_rounds;

ALTER TABLE shuffle_card_rounds
  DROP INDEX period_id;

ALTER TABLE shuffle_card_rounds
  ADD COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER period_id,
  ADD UNIQUE KEY uniq_type_period (card_count_type, period_id),
  ADD INDEX idx_type_status (card_count_type, status);

ALTER TABLE shuffle_card_bets
  ADD COLUMN card_count_type TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER round_id,
  ADD INDEX idx_type_round (card_count_type, round_id);
