'use strict';

// Admin module: manage gateway merchants (the client domains we front) and
// monitor/resend bridge orders. Lives outside admin.js (like support.js /
// notifications.js) so it applies requireModule('gateway') explicitly.

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticateToken, requireAdmin, requireModule } = require('../middleware/auth');
const {
  okpay,
  genApiKey,
  genApiSecret,
  okpayConfigured,
  okpayCallbackUrl,
} = require('../lib/okpayClient');
const { forwardToMerchant } = require('../lib/gatewayForward');

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);
router.use(requireModule('gateway'));

// Subdomain label: 1–63 chars, a-z 0-9 and hyphens, not starting/ending hyphen.
const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SUBS = new Set(['www', 'api', 'admin']);

// Shape a merchant row for the admin UI (full secret included — admin-only).
const toMerchant = (m) => ({
  id: m.id,
  name: m.name,
  domain: m.domain,
  api_key: m.api_key,
  api_secret: m.api_secret,
  callback_url: m.callback_url,
  currency: m.currency || 'USDT',
  is_active: !!m.is_active,
  portal_subdomain: m.portal_subdomain,
  portal_username: m.portal_username,
  portal_enabled: !!m.portal_enabled,
  has_portal_password: !!m.portal_password_hash,
  created_at: m.created_at,
  updated_at: m.updated_at,
});

// Validate + normalise a portal_subdomain, ensuring it doesn't collide with a
// published website or another merchant. Returns { value } or { error }.
async function validatePortalSubdomain(raw, selfMerchantId = null) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const sub = String(raw).trim().toLowerCase();
  if (!SUBDOMAIN_REGEX.test(sub) || RESERVED_SUBS.has(sub)) {
    return { error: 'Invalid portal subdomain' };
  }
  const [sites] = await db.pool.query(
    'SELECT id FROM websites WHERE sub_domain = ? LIMIT 1',
    [sub]
  );
  if (sites.length) return { error: 'Subdomain already used by a website' };
  const [mer] = await db.pool.query(
    'SELECT id FROM gateway_merchants WHERE portal_subdomain = ? AND id <> ? LIMIT 1',
    [sub, selfMerchantId || 0]
  );
  if (mer.length) return { error: 'Subdomain already used by another merchant' };
  return { value: sub };
}

// GET /config — what to register at OkPay + whether creds are present.
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      okpay_configured: okpayConfigured(),
      callback_url: okpayCallbackUrl(req),
      app_domain: process.env.APP_DOMAIN || null,
    },
  });
});

// GET /balance — live balance of OUR main OkPay merchant wallet. Doubles as a
// credential connectivity check (a successful response proves id/token work).
router.get('/balance', async (req, res) => {
  if (!okpayConfigured()) {
    return res.status(503).json({ success: false, message: 'OkPay credentials not configured' });
  }
  try {
    const result = await okpay().balance();
    // OkPay nests balances under data: { usdt, trx, cny }.
    const data = result && result.data && typeof result.data === 'object' ? result.data : result;
    if (!data || typeof data !== 'object' || (data.usdt === undefined && data.trx === undefined && data.cny === undefined)) {
      const message = (result && (result.msg || result.message)) || 'OkPay did not return a balance';
      return res.status(502).json({ success: false, message });
    }
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 'OKPAY_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: error.message });
    }
    console.error('Gateway balance error:', error);
    res.status(502).json({ success: false, message: 'Failed to reach OkPay' });
  }
});

const SUPPORTED_COINS = new Set(['USDT', 'TRX']);
// Pull a value out of an OkPay response regardless of nesting depth.
const pickField = (obj, key) => {
  if (!obj || typeof obj !== 'object') return undefined;
  if (obj[key] !== undefined) return obj[key];
  if (obj.data && typeof obj.data === 'object' && obj.data[key] !== undefined) return obj.data[key];
  return undefined;
};

// POST /test-payment — admin tool: generate a real OkPay payment link to test.
// Optionally tie it to a registered merchant so the full callback -> forward
// pipeline runs (the order is recorded under that merchant); otherwise it's a
// raw link whose callback is acknowledged but not forwarded.
router.post('/test-payment', async (req, res) => {
  if (!okpayConfigured()) {
    return res.status(503).json({ success: false, message: 'OkPay credentials not configured' });
  }
  try {
    const { amount, coin, name, return_url, merchant_id } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }
    let merchant = null;
    if (merchant_id) {
      const [rows] = await db.pool.query('SELECT * FROM gateway_merchants WHERE id = ? LIMIT 1', [merchant_id]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'Merchant not found' });
      merchant = rows[0];
    }
    // Default to the selected merchant's currency, else USDT.
    const coinUpper = String(coin || (merchant && merchant.currency) || 'USDT').toUpperCase();
    if (!SUPPORTED_COINS.has(coinUpper)) {
      return res.status(400).json({ success: false, message: 'coin must be USDT or TRX' });
    }

    const returnUrl = (return_url && String(return_url).trim())
      || process.env.GATEWAY_PUBLIC_URL || `${okpayCallbackUrl(req).replace('/api/gateway/okpay/callback', '')}` || 'https://t.me';

    // Record an order when tied to a merchant so the callback can route/forward.
    let orderId = null;
    const bridgeUniqueId = merchant
      ? `M${merchant.id}-${crypto.randomBytes(8).toString('hex')}`
      : `TEST-${crypto.randomBytes(8).toString('hex')}`;
    if (merchant) {
      const [ins] = await db.pool.query(
        `INSERT INTO gateway_orders
           (merchant_id, bridge_unique_id, client_unique_id, amount, coin, status, type, return_url, client_callback_url)
         VALUES (?, ?, ?, ?, ?, 0, 'deposit', ?, ?)`,
        [merchant.id, bridgeUniqueId, `ADMIN-TEST-${crypto.randomBytes(4).toString('hex')}`, amt, coinUpper,
         returnUrl, merchant.callback_url || null]
      );
      orderId = ins.insertId;
    }

    const okpayRes = await okpay().payLink({
      unique_id: bridgeUniqueId,
      amount: amt,
      coin: coinUpper,
      name: name ? String(name) : 'Admin test',
      return_url: returnUrl,
      callback_url: okpayCallbackUrl(req),
    });
    // Log the raw OkPay reply so `pm2 logs` reveals exactly why a link failed.
    console.log('[gateway test-payment] OkPay response:', JSON.stringify(okpayRes));

    const payUrl = pickField(okpayRes, 'pay_url');
    const okpayOrderId = pickField(okpayRes, 'order_id');
    if (!payUrl) {
      // Surface OkPay's own error message + raw body so the admin UI can show it.
      const message = (okpayRes && (okpayRes.msg || okpayRes.message || okpayRes.error))
        || (okpayRes === null
            ? 'OkPay returned an unreadable response (not JSON). Check credentials / network.'
            : 'OkPay did not return a payment link — check that the merchant id/token are correct and the account is active.');
      return res.status(502).json({ success: false, message, okpay_response: okpayRes });
    }
    if (orderId) {
      await db.pool.query('UPDATE gateway_orders SET okpay_order_id = ?, pay_url = ? WHERE id = ?',
        [okpayOrderId || null, payUrl, orderId]);
    }

    res.json({
      success: true,
      data: {
        pay_url: payUrl,
        order_id: okpayOrderId || null,
        coin: coinUpper,
        amount: amt,
        merchant_id: merchant ? merchant.id : null,
        recorded: !!merchant,
      },
    });
  } catch (error) {
    if (error.code === 'OKPAY_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: error.message });
    }
    // Network/timeout errors reaching OkPay land here — surface the cause.
    console.error('Gateway test-payment error:', error);
    res.status(502).json({ success: false, message: `Failed to reach OkPay: ${error.message}` });
  }
});

// GET /merchants — list all merchants.
router.get('/merchants', async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      'SELECT * FROM gateway_merchants ORDER BY id DESC'
    );
    res.json({ success: true, data: rows.map(toMerchant) });
  } catch (error) {
    console.error('List merchants error:', error);
    res.status(500).json({ success: false, message: 'Failed to list merchants' });
  }
});

// POST /merchants — create a merchant (auto-generate api_key/api_secret).
router.post('/merchants', async (req, res) => {
  try {
    const { name, domain, callback_url, currency, is_active,
            portal_subdomain, portal_username, portal_enabled } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }
    const cur = String(currency || 'USDT').toUpperCase();
    if (!SUPPORTED_COINS.has(cur)) {
      return res.status(400).json({ success: false, message: 'currency must be USDT or TRX' });
    }

    const sub = await validatePortalSubdomain(portal_subdomain);
    if (sub.error) return res.status(400).json({ success: false, message: sub.error });

    const username = portal_username ? String(portal_username).trim().toLowerCase() : null;
    if (username) {
      const [dup] = await db.pool.query(
        'SELECT id FROM gateway_merchants WHERE portal_username = ? LIMIT 1',
        [username]
      );
      if (dup.length) return res.status(400).json({ success: false, message: 'Portal username already taken' });
    }

    const apiKey = genApiKey();
    const apiSecret = genApiSecret();

    const [result] = await db.pool.query(
      `INSERT INTO gateway_merchants
         (name, domain, api_key, api_secret, callback_url, currency, is_active,
          portal_subdomain, portal_username, portal_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        domain ? String(domain).trim() : null,
        apiKey,
        apiSecret,
        callback_url ? String(callback_url).trim() : null,
        cur,
        is_active === false ? 0 : 1,
        sub.value,
        username,
        portal_enabled ? 1 : 0,
      ]
    );

    const [rows] = await db.pool.query('SELECT * FROM gateway_merchants WHERE id = ?', [result.insertId]);
    res.json({ success: true, data: toMerchant(rows[0]) });
  } catch (error) {
    console.error('Create merchant error:', error);
    res.status(500).json({ success: false, message: 'Failed to create merchant' });
  }
});

// PUT /merchants/:id — update name/domain/callback_url/is_active/portal fields.
router.put('/merchants/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [existing] = await db.pool.query('SELECT * FROM gateway_merchants WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Merchant not found' });

    const { name, domain, callback_url, currency, is_active,
            portal_subdomain, portal_username, portal_enabled } = req.body || {};

    let curValue = existing[0].currency || 'USDT';
    if (currency !== undefined) {
      curValue = String(currency || 'USDT').toUpperCase();
      if (!SUPPORTED_COINS.has(curValue)) {
        return res.status(400).json({ success: false, message: 'currency must be USDT or TRX' });
      }
    }

    let subValue = existing[0].portal_subdomain;
    if (portal_subdomain !== undefined) {
      const sub = await validatePortalSubdomain(portal_subdomain, Number(id));
      if (sub.error) return res.status(400).json({ success: false, message: sub.error });
      subValue = sub.value;
    }

    let usernameValue = existing[0].portal_username;
    if (portal_username !== undefined) {
      usernameValue = portal_username ? String(portal_username).trim().toLowerCase() : null;
      if (usernameValue) {
        const [dup] = await db.pool.query(
          'SELECT id FROM gateway_merchants WHERE portal_username = ? AND id <> ? LIMIT 1',
          [usernameValue, id]
        );
        if (dup.length) return res.status(400).json({ success: false, message: 'Portal username already taken' });
      }
    }

    await db.pool.query(
      `UPDATE gateway_merchants
          SET name = COALESCE(?, name),
              domain = ?,
              callback_url = ?,
              currency = ?,
              is_active = COALESCE(?, is_active),
              portal_subdomain = ?,
              portal_username = ?,
              portal_enabled = COALESCE(?, portal_enabled)
        WHERE id = ?`,
      [
        name != null ? String(name).trim() : null,
        domain !== undefined ? (domain ? String(domain).trim() : null) : existing[0].domain,
        callback_url !== undefined ? (callback_url ? String(callback_url).trim() : null) : existing[0].callback_url,
        curValue,
        is_active == null ? null : (is_active ? 1 : 0),
        subValue,
        usernameValue,
        portal_enabled == null ? null : (portal_enabled ? 1 : 0),
        id,
      ]
    );

    const [rows] = await db.pool.query('SELECT * FROM gateway_merchants WHERE id = ?', [id]);
    res.json({ success: true, data: toMerchant(rows[0]) });
  } catch (error) {
    console.error('Update merchant error:', error);
    res.status(500).json({ success: false, message: 'Failed to update merchant' });
  }
});

// POST /merchants/:id/rotate-secret — issue a fresh api_secret.
router.post('/merchants/:id/rotate-secret', async (req, res) => {
  try {
    const secret = genApiSecret();
    const [result] = await db.pool.query(
      'UPDATE gateway_merchants SET api_secret = ? WHERE id = ?',
      [secret, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Merchant not found' });
    res.json({ success: true, data: { api_secret: secret } });
  } catch (error) {
    console.error('Rotate secret error:', error);
    res.status(500).json({ success: false, message: 'Failed to rotate secret' });
  }
});

// POST /merchants/:id/portal-password — set/reset the portal login password.
router.post('/merchants/:id/portal-password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await db.pool.query(
      'UPDATE gateway_merchants SET portal_password_hash = ? WHERE id = ?',
      [hash, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Merchant not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Set portal password error:', error);
    res.status(500).json({ success: false, message: 'Failed to set password' });
  }
});

// DELETE /merchants/:id — remove a merchant (orders cascade).
router.delete('/merchants/:id', async (req, res) => {
  try {
    const [result] = await db.pool.query('DELETE FROM gateway_merchants WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Merchant not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete merchant error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete merchant' });
  }
});

// GET /orders?merchant_id=&status=&page= — monitor bridge orders.
router.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    if (req.query.merchant_id) { where.push('o.merchant_id = ?'); params.push(req.query.merchant_id); }
    if (req.query.status !== undefined && req.query.status !== '') {
      where.push('o.status = ?'); params.push(Number(req.query.status));
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.pool.query(
      `SELECT o.id, o.merchant_id, m.name AS merchant_name, o.bridge_unique_id,
              o.client_unique_id, o.okpay_order_id, o.amount, o.coin, o.status, o.type,
              o.forwarded, o.forward_attempts, o.last_forward_code,
              o.created_at, o.updated_at
         FROM gateway_orders o
         LEFT JOIN gateway_merchants m ON m.id = o.merchant_id
         ${whereSql}
        ORDER BY o.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM gateway_orders o ${whereSql}`,
      params
    );

    res.json({
      success: true,
      data: { orders: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    console.error('List gateway orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to list orders' });
  }
});

// POST /orders/:id/resend — re-forward the stored callback to the merchant.
router.post('/orders/:id/resend', async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM gateway_orders WHERE id = ? LIMIT 1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const [mrows] = await db.pool.query('SELECT * FROM gateway_merchants WHERE id = ? LIMIT 1', [order.merchant_id]);
    if (!mrows[0]) return res.status(404).json({ success: false, message: 'Merchant not found' });

    const code = await forwardToMerchant(order, mrows[0]);
    res.json({ success: true, data: { http_status: code, delivered: code >= 200 && code < 300 } });
  } catch (error) {
    console.error('Resend gateway order error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend' });
  }
});

module.exports = router;
