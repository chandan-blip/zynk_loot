'use strict';

// Merchant self-serve portal API. A merchant logs in with the username/password
// the admin set, gets a portal-scoped JWT, and can view their own transactions
// and (read-only) API credentials. No access to anything outside their merchant.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');
const { okpayCallbackUrl } = require('../lib/okpayClient');

const router = express.Router();

// Mask a secret for display: keep the prefix + last 4 chars.
const mask = (s) => {
  if (!s) return null;
  const str = String(s);
  if (str.length <= 10) return str.slice(0, 3) + '***';
  return `${str.slice(0, 6)}…${str.slice(-4)}`;
};

// POST /api/portal/login — { username, password } -> { token, merchant }.
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    const [rows] = await db.pool.query(
      `SELECT * FROM gateway_merchants
        WHERE portal_username = ? AND is_active = 1 AND portal_enabled = 1 LIMIT 1`,
      [String(username).trim().toLowerCase()]
    );
    const merchant = rows[0];
    if (!merchant || !merchant.portal_password_hash) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(String(password), merchant.portal_password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { merchantId: merchant.id, scope: 'portal' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      data: {
        token,
        merchant: { id: merchant.id, name: merchant.name, domain: merchant.domain },
      },
    });
  } catch (error) {
    console.error('Portal login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Portal-scoped auth: requires a token with scope:'portal' and loads the merchant.
async function requirePortal(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Access token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.scope !== 'portal' || !decoded.merchantId) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    const [rows] = await db.pool.query(
      'SELECT * FROM gateway_merchants WHERE id = ? AND is_active = 1 AND portal_enabled = 1 LIMIT 1',
      [decoded.merchantId]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: 'Merchant unavailable' });
    req.merchant = rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
}

// GET /api/portal/me
router.get('/me', requirePortal, (req, res) => {
  const m = req.merchant;
  res.json({
    success: true,
    data: { id: m.id, name: m.name, domain: m.domain, api_key: m.api_key, currency: m.currency || 'USDT' },
  });
});

// GET /api/portal/summary — totals for the merchant's own orders.
router.get('/summary', requirePortal, async (req, res) => {
  try {
    const [[totals]] = await db.pool.query(
      `SELECT COUNT(*) AS total_orders,
              SUM(status = 1) AS paid_orders,
              COALESCE(SUM(CASE WHEN status = 1 THEN amount ELSE 0 END), 0) AS paid_amount
         FROM gateway_orders WHERE merchant_id = ?`,
      [req.merchant.id]
    );
    const [byCoin] = await db.pool.query(
      `SELECT coin, COALESCE(SUM(CASE WHEN status = 1 THEN amount ELSE 0 END), 0) AS paid_amount,
              COUNT(*) AS orders
         FROM gateway_orders WHERE merchant_id = ? GROUP BY coin`,
      [req.merchant.id]
    );
    res.json({
      success: true,
      data: {
        total_orders: Number(totals.total_orders) || 0,
        paid_orders: Number(totals.paid_orders) || 0,
        paid_amount: Number(totals.paid_amount) || 0,
        by_coin: byCoin,
      },
    });
  } catch (error) {
    console.error('Portal summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to load summary' });
  }
});

// GET /api/portal/transactions?page=&status=&coin=
router.get('/transactions', requirePortal, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const where = ['merchant_id = ?'];
    const params = [req.merchant.id];
    if (req.query.status !== undefined && req.query.status !== '') {
      where.push('status = ?'); params.push(Number(req.query.status));
    }
    if (req.query.coin) { where.push('coin = ?'); params.push(String(req.query.coin).toUpperCase()); }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [rows] = await db.pool.query(
      `SELECT client_unique_id, okpay_order_id, amount, coin, status, type, created_at, updated_at
         FROM gateway_orders ${whereSql}
        ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM gateway_orders ${whereSql}`,
      params
    );
    res.json({
      success: true,
      data: { transactions: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    console.error('Portal transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load transactions' });
  }
});

// GET /api/portal/credentials — read-only api_key/secret + integration info.
router.get('/credentials', requirePortal, async (req, res) => {
  const m = req.merchant;
  res.json({
    success: true,
    data: {
      api_key: m.api_key,
      api_secret: m.api_secret,
      currency: m.currency || 'USDT',
      callback_url: m.callback_url,
      payment_endpoint: `${require('../lib/okpayClient').bridgeBaseUrl(req)}/api/gateway/payment`,
      sign_algorithm:
        'HMAC-SHA256(secret, canonical) where canonical = params (excluding empty values and `sign`) ' +
        'sorted by key ascending, joined as key=value&key=value. Send the hex digest as `sign`.',
    },
  });
});

module.exports = router;
module.exports.requirePortal = requirePortal;
module.exports.mask = mask;
