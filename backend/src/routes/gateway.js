'use strict';

// Public payment-gateway bridge API. Client websites call these endpoints; we
// proxy to our single OkPay account and relay callbacks back to them. There is
// NO admin/user auth here — each request is authenticated per-call by api_key +
// HMAC-SHA256 sign (the OkPay callback is verified by OkPay's own MD5 sign).

const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const {
  okpay,
  okpayConfigured,
  verifyBridge,
  okpayCallbackUrl,
} = require('../lib/okpayClient');
const { forwardToMerchant } = require('../lib/gatewayForward');

const router = express.Router();

const SUPPORTED_COINS = new Set(['USDT', 'TRX']);

// Look up an active merchant by api_key.
async function findMerchantByKey(apiKey) {
  if (!apiKey) return null;
  const [rows] = await db.pool.query(
    'SELECT * FROM gateway_merchants WHERE api_key = ? AND is_active = 1 LIMIT 1',
    [apiKey]
  );
  return rows[0] || null;
}

// Pull a value out of an OkPay response regardless of nesting depth
// ({ data: { x } } vs { x }). Returns undefined if absent.
function pick(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (obj[key] !== undefined) return obj[key];
  if (obj.data && typeof obj.data === 'object' && obj.data[key] !== undefined) return obj.data[key];
  return undefined;
}

// POST /api/gateway/payment — create a payment link for a client order.
// Body: api_key, amount, coin, unique_id (client's ref), return_url, name?, sign
router.post('/payment', async (req, res) => {
  try {
    if (!okpayConfigured()) {
      return res.status(503).json({ success: false, message: 'Gateway not configured' });
    }
    const { api_key, amount, coin, unique_id, return_url, name } = req.body || {};

    const merchant = await findMerchantByKey(api_key);
    if (!merchant) {
      return res.status(401).json({ success: false, message: 'Invalid api_key' });
    }
    if (!verifyBridge(req.body, merchant.api_secret)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }
    // Default to the merchant's configured currency when the client omits coin.
    const coinUpper = String(coin || merchant.currency || 'USDT').toUpperCase();
    if (!SUPPORTED_COINS.has(coinUpper)) {
      return res.status(400).json({ success: false, message: 'coin must be USDT or TRX' });
    }
    if (!return_url) {
      return res.status(400).json({ success: false, message: 'return_url is required' });
    }
    if (!unique_id) {
      return res.status(400).json({ success: false, message: 'unique_id is required' });
    }

    // Globally-unique ref we send OkPay; encodes the merchant so the callback
    // can be routed back even before we read the DB row.
    const bridgeUniqueId = `M${merchant.id}-${crypto.randomBytes(10).toString('hex')}`;

    // Insert the order first so a callback can never arrive before we've recorded it.
    const [ins] = await db.pool.query(
      `INSERT INTO gateway_orders
         (merchant_id, bridge_unique_id, client_unique_id, amount, coin, status, type,
          return_url, client_callback_url)
       VALUES (?, ?, ?, ?, ?, 0, 'deposit', ?, ?)`,
      [merchant.id, bridgeUniqueId, String(unique_id), amt, coinUpper,
       return_url, merchant.callback_url || null]
    );

    const okpayRes = await okpay().payLink({
      unique_id: bridgeUniqueId,
      amount: amt,
      coin: coinUpper,
      name: name || undefined,
      return_url,
      callback_url: okpayCallbackUrl(req),
    });

    const payUrl = pick(okpayRes, 'pay_url');
    const okpayOrderId = pick(okpayRes, 'order_id');

    if (!payUrl) {
      // OkPay rejected the request — surface its message if any, keep the row
      // for debugging (status stays 0).
      const message = (okpayRes && (okpayRes.msg || okpayRes.message)) || 'Gateway error creating payment';
      return res.status(502).json({ success: false, message });
    }

    await db.pool.query(
      'UPDATE gateway_orders SET okpay_order_id = ?, pay_url = ? WHERE id = ?',
      [okpayOrderId || null, payUrl, ins.insertId]
    );

    return res.json({
      success: true,
      data: {
        order_id: okpayOrderId || null,
        unique_id: String(unique_id),
        pay_url: payUrl,
      },
    });
  } catch (error) {
    console.error('Gateway payment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create payment' });
  }
});

// GET /api/gateway/payment/status?api_key=&unique_id=&sign= — signed status check.
router.get('/payment/status', async (req, res) => {
  try {
    const { api_key, unique_id } = req.query || {};
    const merchant = await findMerchantByKey(api_key);
    if (!merchant) {
      return res.status(401).json({ success: false, message: 'Invalid api_key' });
    }
    if (!verifyBridge(req.query, merchant.api_secret)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    if (!unique_id) {
      return res.status(400).json({ success: false, message: 'unique_id is required' });
    }

    const [rows] = await db.pool.query(
      `SELECT * FROM gateway_orders
        WHERE merchant_id = ? AND client_unique_id = ?
        ORDER BY id DESC LIMIT 1`,
      [merchant.id, String(unique_id)]
    );
    const order = rows[0];
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Best-effort refresh from OkPay if still unpaid (don't fail the request on error).
    if (order.status === 0 && okpayConfigured()) {
      try {
        const chk = await okpay().checkDeposit(order.bridge_unique_id);
        const st = pick(chk, 'status');
        if (st !== undefined && Number(st) === 1 && order.status !== 1) {
          await db.pool.query('UPDATE gateway_orders SET status = 1 WHERE id = ?', [order.id]);
          order.status = 1;
        }
      } catch (_) { /* ignore refresh failures */ }
    }

    return res.json({
      success: true,
      data: {
        unique_id: order.client_unique_id,
        order_id: order.okpay_order_id,
        amount: order.amount,
        coin: order.coin,
        status: order.status, // 0 unpaid, 1 paid
      },
    });
  } catch (error) {
    console.error('Gateway status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check status' });
  }
});

// POST /api/gateway/okpay/callback — the ONE callback URL registered at OkPay.
// OkPay notifies us here for every order across every merchant.
router.post('/okpay/callback', async (req, res) => {
  try {
    if (!okpayConfigured()) {
      return res.status(503).json({ status: 'fail' });
    }
    const result = okpay().notify(req.body || {});
    if (!result.verified) {
      return res.status(400).json({ status: 'fail' });
    }

    // Callback fields arrive nested under data[...] — see Okpay.md.
    const data = (result.data && result.data.data) || {};
    const bridgeUniqueId = data.unique_id;
    if (!bridgeUniqueId) {
      // Nothing to route — acknowledge so OkPay stops retrying.
      return res.json({ status: 'success' });
    }

    const [rows] = await db.pool.query(
      'SELECT * FROM gateway_orders WHERE bridge_unique_id = ? LIMIT 1',
      [bridgeUniqueId]
    );
    const order = rows[0];
    if (!order) {
      console.warn('Gateway callback for unknown order:', bridgeUniqueId);
      return res.json({ status: 'success' });
    }

    const newStatus = data.status !== undefined ? Number(data.status) : order.status;
    await db.pool.query(
      `UPDATE gateway_orders
          SET status = ?,
              okpay_order_id = COALESCE(?, okpay_order_id),
              type = COALESCE(?, type),
              raw_callback = ?
        WHERE id = ?`,
      [newStatus, data.order_id || null, data.type || null,
       JSON.stringify(req.body), order.id]
    );
    order.status = newStatus;
    order.okpay_order_id = data.order_id || order.okpay_order_id;
    order.type = data.type || order.type;

    // Forward to the merchant (re-signed with their secret). Delivery result is
    // recorded; failures are retryable from the admin panel.
    const [mrows] = await db.pool.query(
      'SELECT * FROM gateway_merchants WHERE id = ? LIMIT 1',
      [order.merchant_id]
    );
    if (mrows[0]) {
      await forwardToMerchant(order, mrows[0]).catch((e) =>
        console.error('Forward to merchant failed:', e));
    }

    // Always acknowledge OkPay once verified + stored.
    return res.json({ status: 'success' });
  } catch (error) {
    console.error('Gateway callback error:', error);
    return res.status(500).json({ status: 'fail' });
  }
});

module.exports = router;
