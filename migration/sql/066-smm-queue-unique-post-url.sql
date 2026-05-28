-- Migration: Dedup guard for smm_queue — one SMM order per post URL
--
-- The Telegram webhook (channel_post detection) and the app's own post
-- producers can both try to enqueue the SAME post. A unique index on
-- post_url makes enqueue idempotent: whichever path inserts first wins,
-- the other becomes a silent no-op (enqueue uses INSERT IGNORE). This
-- prevents double views/reactions orders on the bot's own posts.
--
-- A 191-char prefix keeps the key within the utf8mb4 index limit; t.me
-- post URLs are far shorter than that.

-- 1. Remove any pre-existing duplicate post_urls, keeping the oldest row.
DELETE q1 FROM smm_queue q1
INNER JOIN smm_queue q2
  ON q1.post_url = q2.post_url AND q1.id > q2.id;

-- 2. Add the unique index (guarded so the migration is safe to re-run).
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE table_schema = DATABASE()
     AND table_name = 'smm_queue'
     AND index_name = 'uniq_post_url'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE smm_queue ADD UNIQUE KEY uniq_post_url (post_url(191))',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
