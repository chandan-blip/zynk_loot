'use strict';

// Bridge-side helpers around the vendored OkPay SDK.
//
//  - A single OkayPay client built from env (one OkPay merchant account fronts
//    every registered client domain).
//  - HMAC-SHA256 signing for the client <-> bridge boundary: clients sign the
//    requests they send us with their api_secret; we sign the callbacks we
//    forward back to them the same way. This is OUR scheme (not OkPay's MD5),
//    deliberately distinct so the two trust boundaries never share a signature.

const crypto = require('crypto');
const OkayPay = require('./OkayPay');

// Lazily build the OkPay client so missing env doesn't crash boot — the gateway
// routes surface a clear error instead, and the rest of the app keeps running.
let _client = null;
function okpay() {
  const id = process.env.OKPAY_MERCHANT_ID;
  const token = process.env.OKPAY_MERCHANT_TOKEN;
  if (!id || !token) {
    const err = new Error('OkPay credentials not configured (set OKPAY_MERCHANT_ID and OKPAY_MERCHANT_TOKEN)');
    err.code = 'OKPAY_NOT_CONFIGURED';
    throw err;
  }
  if (!_client) _client = new OkayPay(id, token);
  return _client;
}

function okpayConfigured() {
  return !!(process.env.OKPAY_MERCHANT_ID && process.env.OKPAY_MERCHANT_TOKEN);
}

function genApiKey() {
  // pk_ prefix makes keys recognisable in logs; 32 hex chars of entropy.
  return 'pk_' + crypto.randomBytes(16).toString('hex');
}

function genApiSecret() {
  return 'sk_' + crypto.randomBytes(32).toString('hex');
}

// Build the canonical string we sign: drop empty values and the `sign` field,
// sort keys ascending, join as key=value&key=value. Values are coerced to
// strings. Nested objects aren't used in the bridge payloads (all scalars).
function canonicalString(params) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign')
    .filter((k) => {
      const v = params[k];
      return v !== undefined && v !== null && v !== '';
    })
    .sort();
  return keys.map((k) => `${k}=${String(params[k])}`).join('&');
}

// HMAC-SHA256(secret, canonicalString) as lowercase hex.
function signBridge(params, secret) {
  return crypto
    .createHmac('sha256', String(secret))
    .update(canonicalString(params), 'utf8')
    .digest('hex');
}

// Timing-safe compare of the provided sign against a freshly computed one.
function verifyBridge(params, secret) {
  const provided = String(params.sign || '');
  const expected = signBridge(params, secret);
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

// Public base URL of THIS bridge, used to build the callback_url we hand OkPay.
// Prefer an explicit env; otherwise derive from the incoming request.
function bridgeBaseUrl(req) {
  if (process.env.GATEWAY_PUBLIC_URL) {
    return process.env.GATEWAY_PUBLIC_URL.replace(/\/+$/, '');
  }
  const proto = (req && (req.headers['x-forwarded-proto'] || req.protocol)) || 'http';
  const host = req && req.headers && req.headers.host;
  return host ? `${proto}://${host}` : '';
}

function okpayCallbackUrl(req) {
  return `${bridgeBaseUrl(req)}/api/gateway/okpay/callback`;
}

module.exports = {
  okpay,
  okpayConfigured,
  genApiKey,
  genApiSecret,
  canonicalString,
  signBridge,
  verifyBridge,
  bridgeBaseUrl,
  okpayCallbackUrl,
};
