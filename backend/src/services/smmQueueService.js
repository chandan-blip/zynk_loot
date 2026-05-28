const db = require('../config/database');
const crypto = require('crypto');

// SMM order queue + single-worker. Decouples Telegram posting from the SMM
// panel API:
//   - Producers (predictionService, dailyWinnersService) call enqueue(...)
//     after every Telegram post that should get views/reactions.
//   - This worker loops in the background, picks the oldest `pending` row,
//     calls dailyWinnersService.placeSmmOrdersForPost(...), records the
//     outcome, and sleeps a randomised 10–20 s before pulling the next row.
//
// Single worker (not multiple in parallel) on purpose: the SMM panel hates
// bursts. The pacing here replaces the per-call sleep that used to live
// inside placeSmmOrder().
//
// On boot, any rows left in `processing` from a crashed previous run are
// reset to `pending` so they get retried.

const POLL_IDLE_MS = 5_000;       // when queue is empty, re-check every 5s
const PROCESS_DELAY_MIN_MS = 10_000;
const PROCESS_DELAY_MAX_MS = 20_000;
const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_RETENTION_DAYS = 14;
const DONE_RETENTION_DAYS = 14;

// Master switch (admin-controlled) for placing SMM orders on posts detected
// via the Telegram webhook — i.e. posts made directly on the channel, not
// sent through this app. Defaults OFF: external posts only get ordered once
// an admin explicitly enables it.
const WEBHOOK_ENABLED_SETTING_KEY = 'smm_webhook_enabled';

// Per-webhook views/reactions config. API credentials + service IDs are
// reused from the global SMM panel config; only the enable flags and
// quantities here are webhook-specific.
const WEBHOOK_CONFIG_SETTING_KEY = 'smm_webhook_config';
const DEFAULT_WEBHOOK_SMM_CONFIG = {
  viewsEnabled: true,
  viewsQuantity: 1000,
  reactionsEnabled: true,
  reactionsQuantity: 100,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

function randomProcessDelayMs() {
  return PROCESS_DELAY_MIN_MS
    + crypto.randomInt(0, PROCESS_DELAY_MAX_MS - PROCESS_DELAY_MIN_MS + 1);
}

class SmmQueueService {
  constructor() {
    this.dailyWinnersService = null;
    this.running = false;
    this.stopFlag = false;
    this.cleanupTimer = null;
  }

  setDailyWinnersService(svc) {
    this.dailyWinnersService = svc;
  }

  // Master switch for webhook-detected posts. Default OFF when unset.
  async isWebhookEnabled() {
    try {
      const [rows] = await db.pool.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [WEBHOOK_ENABLED_SETTING_KEY]
      );
      if (!rows.length || rows[0].setting_value == null) return false;
      const v = String(rows[0].setting_value).toLowerCase();
      return v === '1' || v === 'true' || v === 'on' || v === 'yes';
    } catch (_) {
      return false;
    }
  }

  async setWebhookEnabled(enabled) {
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Master switch: place SMM orders on posts detected via the Telegram webhook')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [WEBHOOK_ENABLED_SETTING_KEY, enabled ? '1' : '0']
    );
    return !!enabled;
  }

  async getWebhookSmmConfig() {
    try {
      const [rows] = await db.pool.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [WEBHOOK_CONFIG_SETTING_KEY]
      );
      if (rows.length && rows[0].setting_value) {
        return { ...DEFAULT_WEBHOOK_SMM_CONFIG, ...JSON.parse(rows[0].setting_value) };
      }
    } catch (_) { /* fall through to defaults */ }
    return { ...DEFAULT_WEBHOOK_SMM_CONFIG };
  }

  async setWebhookSmmConfig(config) {
    const merged = { ...DEFAULT_WEBHOOK_SMM_CONFIG, ...(config || {}) };
    merged.viewsEnabled = Boolean(merged.viewsEnabled);
    merged.reactionsEnabled = Boolean(merged.reactionsEnabled);
    merged.viewsQuantity = Math.max(0, parseInt(merged.viewsQuantity, 10) || 0);
    merged.reactionsQuantity = Math.max(0, parseInt(merged.reactionsQuantity, 10) || 0);
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Webhook-only SMM views/reactions config (enable flags + quantities)')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [WEBHOOK_CONFIG_SETTING_KEY, JSON.stringify(merged)]
    );
    return merged;
  }

  // Producer API — called from predictionService / dailyWinnersService
  // right after a successful Telegram post, and from the Telegram webhook
  // for posts made directly on the channel. Best-effort: returns the new
  // queue row id, or null on insert failure (we never want a queue write
  // failure to break the calling flow).
  //
  // INSERT IGNORE + the unique index on post_url makes this idempotent:
  // if the same post was already enqueued (e.g. a producer enqueued the
  // bot's own post and the webhook then sees it too), the second call is a
  // silent no-op and returns null — so a post never gets a double order.
  async enqueue({ postUrl, contextLabel = 'generic' }) {
    if (!postUrl) return null;
    try {
      const [res] = await db.pool.query(
        `INSERT IGNORE INTO smm_queue (post_url, context_label, status)
         VALUES (?, ?, 'pending')`,
        [String(postUrl).slice(0, 500), String(contextLabel).slice(0, 64)]
      );
      return res.insertId || null;
    } catch (err) {
      console.error('[SMM-Q] enqueue failed:', err.message);
      return null;
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.stopFlag = false;

    // Recover any rows the previous process was mid-flight on.
    try {
      const [r] = await db.pool.query(
        `UPDATE smm_queue
            SET status = 'pending', started_at = NULL
          WHERE status = 'processing'`
      );
      if (r.affectedRows > 0) {
        console.log(`[SMM-Q] Recovered ${r.affectedRows} stuck 'processing' rows on boot`);
      }
    } catch (err) {
      console.error('[SMM-Q] Boot recovery failed:', err.message);
    }

    console.log('[SMM-Q] Worker started');
    this._loop().catch((err) => {
      console.error('[SMM-Q] Worker crashed:', err.message);
      this.running = false;
    });

    // Light daily cleanup — keep the table small. Done/failed rows older
    // than DONE_RETENTION_DAYS get deleted.
    this.cleanupTimer = setInterval(() => {
      this._cleanup().catch(() => {});
    }, 24 * 60 * 60 * 1000);
  }

  async stop() {
    this.stopFlag = true;
    this.running = false;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async _loop() {
    while (!this.stopFlag) {
      const row = await this._claimNextPending();
      if (!row) {
        await sleep(POLL_IDLE_MS);
        continue;
      }
      try {
        await this._processRow(row);
      } catch (err) {
        console.error(`[SMM-Q] Row ${row.id} unexpected error:`, err.message);
      }
      // Pace between rows even on success → mirrors the human-rate the
      // panel likes. Skip the wait if we're shutting down.
      if (!this.stopFlag) await sleep(randomProcessDelayMs());
    }
    console.log('[SMM-Q] Worker stopped');
  }

  // Pull the oldest pending row and flip it to processing in a single
  // UPDATE so two workers (if anyone ever spawns one) can't race.
  async _claimNextPending() {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT id FROM smm_queue
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE`
      );
      if (rows.length === 0) {
        await conn.commit();
        return null;
      }
      const id = rows[0].id;
      await conn.query(
        `UPDATE smm_queue
            SET status = 'processing', started_at = NOW(), attempts = attempts + 1
          WHERE id = ?`,
        [id]
      );
      const [full] = await conn.query(
        `SELECT id, post_url, context_label, attempts FROM smm_queue WHERE id = ?`,
        [id]
      );
      await conn.commit();
      return full[0] || null;
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      console.error('[SMM-Q] claim failed:', err.message);
      return null;
    } finally {
      conn.release();
    }
  }

  async _processRow(row) {
    const label = `${row.context_label}#${row.id}`;
    if (!this.dailyWinnersService) {
      await this._markFailed(row.id, 'dailyWinnersService not wired');
      return;
    }

    const log = {
      info:  (m) => console.log(`[SMM-Q/${label}]`, m),
      warn:  (m) => console.warn(`[SMM-Q/${label}]`, m),
      error: (m) => console.error(`[SMM-Q/${label}]`, m),
    };

    try {
      // Webhook-detected posts use their own views/reactions enable flags +
      // quantities (API creds + service IDs still come from the global panel
      // config). All other producers use the global config unchanged.
      const opts = {};
      if (row.context_label === 'webhook:channel_post') {
        opts.configOverride = await this.getWebhookSmmConfig();
      }
      const result = await this.dailyWinnersService.placeSmmOrdersForPost(row.post_url, log, opts);
      if (result?.skipped) {
        // Skipped is a definitive "won't try again" outcome (master off,
        // missing api key, no postUrl). Mark done with placed=0.
        await this._markDone(row.id, {
          placed: 0,
          viewsOrderId: null,
          reactionsOrderId: null,
        });
        return;
      }
      const placed = result?.placed || 0;
      const viewsId = result?.views?.orderId || null;
      const reactionsId = result?.reactions?.orderId || null;
      const errs = [result?.views?.error, result?.reactions?.error].filter(Boolean);

      if (placed > 0) {
        await this._markDone(row.id, {
          placed,
          viewsOrderId: viewsId,
          reactionsOrderId: reactionsId,
          lastError: errs.length ? errs.join(' | ') : null,
        });
      } else {
        // 0 placed = both views and reactions failed (or were disabled).
        // Treat as failure so we can retry if attempts remain.
        await this._maybeRetryOrFail(row, errs.join(' | ') || 'No orders placed');
      }
    } catch (err) {
      await this._maybeRetryOrFail(row, err.message);
    }
  }

  async _maybeRetryOrFail(row, errorMsg) {
    if (row.attempts >= MAX_ATTEMPTS) {
      await this._markFailed(row.id, errorMsg);
    } else {
      // Re-queue: flip back to pending so the next loop iteration picks
      // it up after the inter-row delay.
      try {
        await db.pool.query(
          `UPDATE smm_queue
              SET status = 'pending', last_error = ?
            WHERE id = ?`,
          [String(errorMsg || '').slice(0, 2000), row.id]
        );
      } catch (e) {
        console.error('[SMM-Q] requeue write failed:', e.message);
      }
    }
  }

  async _markDone(id, { placed, viewsOrderId, reactionsOrderId, lastError = null }) {
    try {
      await db.pool.query(
        `UPDATE smm_queue
            SET status = 'done',
                placed = ?,
                views_order_id = ?,
                reactions_order_id = ?,
                last_error = ?,
                processed_at = NOW()
          WHERE id = ?`,
        [placed, viewsOrderId, reactionsOrderId, lastError ? String(lastError).slice(0, 2000) : null, id]
      );
    } catch (err) {
      console.error('[SMM-Q] markDone write failed:', err.message);
    }
  }

  async _markFailed(id, errorMsg) {
    try {
      await db.pool.query(
        `UPDATE smm_queue
            SET status = 'failed',
                last_error = ?,
                processed_at = NOW()
          WHERE id = ?`,
        [String(errorMsg || '').slice(0, 2000), id]
      );
    } catch (err) {
      console.error('[SMM-Q] markFailed write failed:', err.message);
    }
  }

  async _cleanup() {
    try {
      const [d] = await db.pool.query(
        `DELETE FROM smm_queue
          WHERE status IN ('done', 'failed')
            AND processed_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [DONE_RETENTION_DAYS]
      );
      if (d.affectedRows > 0) {
        console.log(`[SMM-Q] Cleanup: deleted ${d.affectedRows} old rows`);
      }
      // Safety net: rows stuck in 'processing' longer than 14 days are
      // clearly orphaned — push them to failed so they stop blocking.
      const [s] = await db.pool.query(
        `UPDATE smm_queue
            SET status = 'failed', last_error = COALESCE(last_error, 'Stuck in processing — forced fail by cleanup')
          WHERE status = 'processing'
            AND started_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [STALE_PROCESSING_RETENTION_DAYS]
      );
      if (s.affectedRows > 0) {
        console.log(`[SMM-Q] Cleanup: forced-failed ${s.affectedRows} stuck rows`);
      }
    } catch (err) {
      console.error('[SMM-Q] cleanup failed:', err.message);
    }
  }
}

module.exports = SmmQueueService;
