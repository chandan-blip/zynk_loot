-- Add missing job_type enum values for cron job registration
ALTER TABLE job_schedule
  MODIFY COLUMN job_type ENUM('draw_generate', 'draw_complete', 'digit_reveal', 'winner_process', 'custom', 'invest_returns', 'maintenance') NOT NULL;
