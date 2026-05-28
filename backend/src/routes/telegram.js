const express = require('express');
const router = express.Router();

// Telegram webhook — detects posts made directly on the channel (not sent
// through this app) and enqueues an SMM views/reactions order for each.
//
// No JWT auth or rate limiter: these are server-to-server calls from
// Telegram. Authenticity is verified via the secret token Telegram echoes
// back in the X-Telegram-Bot-Api-Secret-Token header (set via setWebhook).
//
// Dedup: the app's own posts also arrive here as channel_post updates. The
// post_url is built identically to the producers, and smm_queue has a unique
// index on post_url with INSERT IGNORE — so a post that was already enqueued
// by a producer becomes a no-op here (no double order).

function buildPostUrl(chat, messageId) {
  if (!messageId || !chat) return null;
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  if (chat.id != null) {
    const internal = String(chat.id).replace(/^-100/, '');
    return `https://t.me/c/${internal}/${messageId}`;
  }
  return null;
}

function chatMatchesConfigured(chat) {
  const configured = (process.env.TELEGRAM_WINNERS_CHANNEL_ID || '').trim();
  if (!configured || !chat) return false;
  if (String(chat.id) === configured) return true;
  const want = configured.replace(/^@/, '').toLowerCase();
  return !!(chat.username && chat.username.toLowerCase() === want);
}

router.post('/webhook', async (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const got = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!secret || got !== secret) {
    return res.status(401).json({ ok: false });
  }

  // Always 200 to authenticated Telegram requests so it doesn't retry.
  const update = req.body || {};
  const post = update.channel_post; // ignore edits / DMs / group messages

  try {
    if (post && chatMatchesConfigured(post.chat)) {
      const postUrl = buildPostUrl(post.chat, post.message_id);
      if (postUrl) {
        const smmQueueService = req.app.get('smmQueueService');
        if (smmQueueService) {
          const id = await smmQueueService.enqueue({
            postUrl,
            contextLabel: 'webhook:channel_post',
          });
          if (id) console.log(`[TG-WEBHOOK] Enqueued SMM for ${postUrl} (queue#${id})`);
          else console.log(`[TG-WEBHOOK] ${postUrl} already queued — skipped (dedup)`);
        } else {
          console.warn('[TG-WEBHOOK] smmQueueService not wired — skipped');
        }
      }
    }
  } catch (err) {
    console.error('[TG-WEBHOOK] handler error:', err.message);
  }
  return res.json({ ok: true });
});

module.exports = router;
