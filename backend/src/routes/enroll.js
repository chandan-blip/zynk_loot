const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Public POST endpoint to capture enrollment/lead submissions from the app
// domain and its subdomains. CORS / origin allowlist is enforced globally
// in index.js (apex + any subdomain of APP_DOMAIN). Stores the full body
// as JSON along with the originating site (Origin/Referer header) so leads
// can be attributed back to where they came from.
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const origin = req.headers['origin'] || req.headers['referer'] || null;
    const referer = req.headers['referer'] || null;
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.connection?.remoteAddress || null;

    const name = body.name || body.fullName || body.full_name || null;
    const email = body.email || null;
    const phone = body.phone || body.mobile || body.phoneNumber || null;
    const message = body.message || body.comment || body.notes || null;

    const [result] = await db.pool.query(
      `INSERT INTO website_leads
        (origin, referer, name, email, phone, message, payload, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        origin,
        referer,
        name,
        email,
        phone,
        message,
        JSON.stringify(body),
        ipAddress,
        userAgent
      ]
    );

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Enroll submit error:', error);
    res.status(500).json({ success: false, message: 'Failed to save enrollment' });
  }
});

module.exports = router;
