const express = require('express');
const db = require('../config/database');

const router = express.Router();

// Public endpoint hit by the auto-injected tracking script on every published landing page.
// Body (sent via fetch JSON or sendBeacon Blob):
//   { websiteId: number, type: 'visit'|'click', target?: string, referrer?: string, sessionId?: string }
router.post('/track', express.json({ limit: '4kb' }), async (req, res) => {
  try {
    // sendBeacon delivers as text/plain; parse manually if Express didn't.
    let body = req.body;
    if (!body || typeof body !== 'object' || !Object.keys(body).length) {
      const raw = req.rawBody || (await new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => resolve(data));
      }));
      try { body = JSON.parse(raw); } catch { body = {}; }
    }

    const websiteId = parseInt(body.websiteId, 10);
    const type = body.type === 'click' ? 'click' : (body.type === 'visit' ? 'visit' : null);
    if (!websiteId || !type) {
      return res.status(204).end(); // silently drop bad payloads — tracking must never break the page
    }

    const sessionId = (body.sessionId || '').toString().slice(0, 64) || null;
    const target = (body.target || '').toString().slice(0, 500) || null;
    const referrer = (body.referrer || '').toString().slice(0, 500) || null;
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500) || null;
    const ip = (req.ip || '').slice(0, 45) || null;

    // Insert event + bump counter in parallel (fire-and-forget for the counter — it's denormalized).
    await db.pool.query(
      `INSERT INTO website_events (website_id, event_type, session_id, target, referrer, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [websiteId, type, sessionId, target, referrer, userAgent, ip]
    );

    if (type === 'visit') {
      db.pool.query(
        `UPDATE websites SET visits = visits + 1, last_visit_at = NOW() WHERE id = ?`,
        [websiteId]
      ).catch(() => {});
    } else {
      db.pool.query(
        `UPDATE websites SET clicks = clicks + 1 WHERE id = ?`,
        [websiteId]
      ).catch(() => {});
    }

    res.status(204).end();
  } catch (error) {
    console.error('Website track error:', error.message);
    res.status(204).end();
  }
});

module.exports = router;
