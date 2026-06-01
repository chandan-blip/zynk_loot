'use strict';

// Forward a (verified) payment notification from our bridge to the merchant's
// own callback_url, re-signed with that merchant's api_secret. Shared by the
// OkPay callback handler (routes/gateway.js) and admin "resend"
// (routes/gatewayAdmin.js).

const https = require('https');
const http = require('http');
const { URL } = require('url');
const db = require('../config/database');
const { signBridge } = require('./okpayClient');

// POST application/x-www-form-urlencoded to an arbitrary URL. Resolves with the
// HTTP status code (or 0 on transport error / timeout). Never rejects.
function postForm(targetUrl, body) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(targetUrl);
    } catch (_) {
      return resolve(0);
    }
    const isHttps = target.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      method: 'POST',
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'LootGatewayBridge/1.0',
      },
    };
    const req = lib.request(options, (res) => {
      // Drain the response so the socket can be reused/freed.
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode || 0));
    });
    req.on('error', () => resolve(0));
    req.setTimeout(10000, () => req.destroy());
    req.write(body);
    req.end();
  });
}

// Build the payload we hand the merchant, sign it, and POST it. Updates the
// gateway_orders delivery columns. `order` and `merchant` are DB rows.
// Returns the HTTP status code from the merchant (2xx == delivered).
async function forwardToMerchant(order, merchant) {
  const payload = {
    unique_id: order.client_unique_id || '',
    order_id: order.okpay_order_id || '',
    amount: order.amount != null ? String(order.amount) : '',
    coin: order.coin || '',
    status: String(order.status),
    type: order.type || 'deposit',
  };
  payload.sign = signBridge(payload, merchant.api_secret);

  const target = order.client_callback_url || merchant.callback_url;
  let code = 0;
  if (target) {
    const body = new URLSearchParams(payload).toString();
    code = await postForm(target, body);
  }
  const delivered = code >= 200 && code < 300 ? 1 : 0;

  await db.pool.query(
    `UPDATE gateway_orders
        SET forwarded = ?,
            forward_attempts = forward_attempts + 1,
            last_forward_code = ?
      WHERE id = ?`,
    [delivered, code || null, order.id]
  );
  return code;
}

module.exports = { forwardToMerchant, postForm };
