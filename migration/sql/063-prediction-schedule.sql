-- Replace the per-round prediction model with a daily schedule that the admin
-- configures from the Prediction page. All Telegram traffic from the Prediction
-- module is now driven by `settings.prediction_schedule_config`.
--
-- - Adds a single JSON settings row with the schedule defaults (7 slots:
--   08, 10, 12, 14, 16, 18, 20 IST, each with 3 picks + per-pick message).
-- - Makes daily_winners.draw_id nullable so the scheduled winner-screenshot
--   batches (which are not tied to a lottery draw) can persist their rows.

ALTER TABLE daily_winners MODIFY COLUMN draw_id INT NULL;

INSERT IGNORE INTO settings (setting_key, setting_value, description) VALUES (
  'prediction_schedule_config',
  '{"enabled":true,"timezone":"Asia/Kolkata","getReadyMessage":"\\ud83d\\udd14 <b>Get ready!</b>\\nNext prediction batch drops in a moment.","getReadyLeadSeconds":60,"predictionSpacingSeconds":8,"trailerMessage":"\\ud83d\\udcb0 <b>Bet now</b> before the round locks!","winnersDelaySeconds":1800,"winnersMinCount":10,"winnersMaxCount":15,"slots":[{"hour":8,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":1,"message":"Sure shot \\ud83d\\udd25"},{"game":"mutka_king","cardCountType":2,"message":"Lock it in"},{"game":"uno_king","cardCountType":3,"message":"Big payout call"}]},{"hour":10,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":2,"message":""},{"game":"mutka_king","cardCountType":3,"message":""},{"game":"uno_king","cardCountType":1,"message":""}]},{"hour":12,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":3,"message":""},{"game":"mutka_king","cardCountType":1,"message":""},{"game":"uno_king","cardCountType":2,"message":""}]},{"hour":14,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":1,"message":""},{"game":"mutka_king","cardCountType":4,"message":""},{"game":"uno_king","cardCountType":3,"message":""}]},{"hour":16,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":4,"message":""},{"game":"mutka_king","cardCountType":2,"message":""},{"game":"uno_king","cardCountType":1,"message":""}]},{"hour":18,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":2,"message":""},{"game":"mutka_king","cardCountType":1,"message":""},{"game":"uno_king","cardCountType":4,"message":""}]},{"hour":20,"enabled":true,"picks":[{"game":"shuffle_card","cardCountType":3,"message":""},{"game":"mutka_king","cardCountType":2,"message":""},{"game":"uno_king","cardCountType":1,"message":""}]}]}',
  'Prediction Module daily Telegram broadcast schedule (7 slots: get-ready + 3 predictions + trailer; +30 min winners batch)'
);
