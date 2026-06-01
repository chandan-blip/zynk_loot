'use strict';

/**
 * OkayPay — Node.js port of OkayPay.php
 * ------------------------------------------------------------------
 * Faithful 1:1 conversion of the PHP SDK class.
 *
 * The PHP methods were synchronous (curl_exec); in Node the network
 * calls are async, so payLink(), transfer() and shop_transaction_history()
 * return Promises. Everything else (the signing math) is byte-for-byte
 * identical to the PHP implementation.
 *
 * Usage (CommonJS):
 *     const OkayPay = require('./OkayPay');
 *     const pay = new OkayPay('1', '123456');
 *     const res = await pay.payLink({ amount: 10, coin: 'USDT', unique_id: '123456' });
 *
 * No third-party dependencies — uses only Node built-ins (crypto, https).
 * Requires Node.js >= 12.
 */

const crypto = require('crypto');
const https = require('https');
const { URL, URLSearchParams } = require('url');

class OkayPay {
  /**
   * @param {string|number} id    Merchant id   (PHP: $this->id)
   * @param {string}        token Merchant token (PHP: $this->token)
   */
  constructor(id, token) {
    this.id = id;
    this.token = token;

    const apiUrl = 'https://api.okaypay.me/shop/';
    this.api_url = apiUrl;
    this.api_url_payLink = apiUrl + 'payLink';
    this.api_url_transfer = apiUrl + 'transfer';
    this.api_url_TransactionHistory = apiUrl + 'TransactionHistory';
    this.api_url_censorUserByTG = apiUrl + 'censorUserByTG';
    this.api_url_checkTransfer = apiUrl + 'checkTransfer';
    this.api_url_checkDeposit = apiUrl + 'checkDeposit';
    this.api_url_balance = apiUrl + 'balance';

    // current target url (PHP set $this->url before each post())
    this.url = null;
  }

  /**
   * Create a payment link.
   * Params:
   *   unique_id : optional (unique order number, prevents duplicate orders)
   *   name      : display info, optional
   *   amount    : amount, required
   *   return_url: return link, optional
   *   coin      : [USDT,TRX], required
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  payLink(data) {
    this.url = this.api_url_payLink;
    return this.post(data);
  }

  /**
   * Transfer to a user.
   * Params:
   *   unique_id  : optional (unique order number, prevents duplicate orders)
   *   name       : display info, optional
   *   amount     : amount
   *   to_user_id : user's Telegram id; the user must have started the wallet, required
   *   coin       : [USDT,TRX], required
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  transfer(data) {
    this.url = this.api_url_transfer;
    return this.post(data);
  }

  /**
   * Merchant transaction history.
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  shop_transaction_history(data) {
    this.url = this.api_url_TransactionHistory;
    return this.post(data);
  }

  /**
   * Check whether a Telegram user exists.
   * Params:
   *   telegramID : Telegram ID, required
   * Response:
   *   data.telegramID : the ID you passed in
   *   data.exist      : boolean — exists (true) / does not exist (false)
   * @param {string|number|object} telegramID Telegram id, or an object { telegramID }
   * @returns {Promise<object|null>}
   */
  censorUserByTG(telegramID) {
    this.url = this.api_url_censorUserByTG;
    const data = (telegramID !== null && typeof telegramID === 'object')
      ? telegramID
      : { telegramID };
    return this.post(data);
  }

  /**
   * Check the status of a transfer (withdrawal).
   * Params:
   *   unique_id : the order number you passed in, required
   * Response:
   *   data.order_id   : order number
   *   data.unique_id  : your order number
   *   data.status     : 0 = not succeeded, 1 = succeeded, 2 = failed
   *   data.amount     : amount
   *   data.coin       : currency
   *   data.to_user_id : Telegram id of the receiving user
   * @param {string|object} unique_id order number, or an object { unique_id }
   * @returns {Promise<object|null>}
   */
  checkTransfer(unique_id) {
    this.url = this.api_url_checkTransfer;
    const data = (unique_id !== null && typeof unique_id === 'object')
      ? unique_id
      : { unique_id };
    return this.post(data);
  }

  /**
   * Check the status of a deposit.
   * Params:
   *   unique_id : the order number you passed in, required
   * Response:
   *   data.order_id  : order number
   *   data.unique_id : your order number
   *   data.status    : 0 = unpaid, 1 = paid
   *   data.amount    : amount
   * @param {string|object} unique_id order number, or an object { unique_id }
   * @returns {Promise<object|null>}
   */
  checkDeposit(unique_id) {
    this.url = this.api_url_checkDeposit;
    const data = (unique_id !== null && typeof unique_id === 'object')
      ? unique_id
      : { unique_id };
    return this.post(data);
  }

  /**
   * Check the merchant balance.
   * Params: none.
   * Response:
   *   data.usdt : USDT balance
   *   data.trx  : TRX balance
   *   data.cny  : CNY balance
   * @returns {Promise<object|null>}
   */
  balance() {
    this.url = this.api_url_balance;
    return this.post({});
  }

  /**
   * Receive an async notification — verify an incoming async callback
   * (the PHP version read $_POST).
   *
   * In Node there is no global $_POST, so pass the parsed request body
   * (e.g. req.body when using express + body-parser urlencoded).
   *
   * @param {object} postData parsed POST body of the callback request
   * @returns {{ verified: boolean, message: string, ok: boolean, data: object }}
   */
  notify(postData) {
    const data = postData || {};
    if (this.checkSign(data)) {
      // PHP echoed 'verification succeeded'
      // data is valid when status === 'success' && code === 10000
      const ok = data.status === 'success'
        && data.code !== undefined
        && Number(data.code) === 10000;
      return { verified: true, message: 'verification succeeded', ok, data };
    }
    // PHP echoed 'verification failed'
    return { verified: false, message: 'verification failed', ok: false, data };
  }

  /**
   * Sign an outgoing request.
   * PHP: $data['id']=$this->id; array_filter; ksort;
   *      sign = strtoupper(md5(urldecode(http_build_query($data).'&token='.$token)))
   * @param {object} input
   * @returns {object} filtered + sorted copy of input with `sign` added
   */
  sign(input) {
    let data = Object.assign({}, input);
    data.id = this.id;

    data = arrayFilter(data);      // remove PHP-"empty" values
    data = ksort(data);            // sort by key (top level only)

    const signStr = buildSignString(data) + '&token=' + this.token;
    data.sign = md5(signStr).toUpperCase();
    return data;
  }

  /**
   * Verify an incoming signature.
   * @param {object} input
   * @returns {boolean}
   */
  checkSign(input) {
    const data = Object.assign({}, input);
    const inSign = data.sign;
    delete data.sign;

    const filtered = ksort(arrayFilter(data));
    const signStr = buildSignString(filtered) + '&token=' + this.token;
    const sign = md5(signStr).toUpperCase();

    // PHP used loose (==) comparison
    return String(inSign) === String(sign);
  }

  /**
   * Send data — sign then POST as application/x-www-form-urlencoded.
   * Faithful to the PHP curl options:
   *   - timeout 10s
   *   - User-Agent: HTTP CLIENT
   *   - SSL_VERIFYPEER / SSL_VERIFYHOST = false  (see SECURITY note below)
   * @param {object} data
   * @returns {Promise<object|null>} json_decode($data, true) — null on parse failure
   */
  post(data) {
    const signed = this.sign(data);
    const body = new URLSearchParams(toStringMap(signed)).toString();
    const target = new URL(this.url);

    const options = {
      method: 'POST',
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'HTTP CLIENT',
      },
      // SECURITY: the PHP code disabled TLS verification
      // (CURLOPT_SSL_VERIFYPEER / CURLOPT_SSL_VERIFYHOST = FALSE).
      // This is reproduced for parity. Set to `true` to verify certs.
      rejectUnauthorized: false,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            // PHP json_decode returns null when the body is not valid JSON
            resolve(null);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {           // CURLOPT_TIMEOUT, 10
        req.destroy(new Error('OkayPay request timed out (10s)'));
      });

      req.write(body);
      req.end();
    });
  }
}

/* ----------------------------------------------------------------------
 * PHP helper equivalents
 * -------------------------------------------------------------------- */

/** md5 hex digest (PHP md5()) */
function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/**
 * PHP array_filter($arr) with no callback: removes "empty" values.
 * PHP-empty == '', '0', 0, 0.0, null, false, [] (empty array).
 * Only operates on the top level — exactly like PHP.
 */
function arrayFilter(obj) {
  const out = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (isPhpEmpty(v)) continue;
    out[key] = v;
  }
  return out;
}

function isPhpEmpty(v) {
  if (v === null || v === undefined || v === false || v === '') return true;
  if (v === 0) return true;
  if (v === '0') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
  return false;
}

/**
 * PHP ksort($arr): sort an associative array by key (SORT_REGULAR-ish).
 * For the alphanumeric keys used here, JS default string order matches PHP.
 * Returns a new object with keys in sorted order (top level only).
 */
function ksort(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = obj[key];
  }
  return out;
}

/**
 * Reproduces urldecode(http_build_query($data)) used for signing.
 *
 * http_build_query() URL-encodes keys/values and renders nested objects as
 * key[subkey]; the surrounding urldecode() then reverses that encoding,
 * leaving the *raw* values and literal [ ] brackets. Building the string
 * directly from raw values is therefore exactly equivalent and avoids any
 * double-decoding pitfalls.
 *
 * Top level is assumed already ksort()'d. Nested objects keep insertion
 * order (PHP only sorts the top level), matching the callback signature
 * examples in the API docs (data[order_id]=...&data[unique_id]=...).
 */
function buildSignString(data) {
  const parts = [];

  const walk = (obj, prefix) => {
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}[${key}]` : `${key}`;
      const val = obj[key];

      if (Array.isArray(val)) {
        val.forEach((item, i) => {
          if (item !== null && typeof item === 'object') {
            walk(item, `${fullKey}[${i}]`);
          } else {
            parts.push(`${fullKey}[${i}]=${stringify(item)}`);
          }
        });
      } else if (val !== null && typeof val === 'object') {
        walk(val, fullKey);
      } else {
        parts.push(`${fullKey}=${stringify(val)}`);
      }
    }
  };

  walk(data, '');
  return parts.join('&');
}

/** PHP string coercion for scalars in a query string. */
function stringify(v) {
  if (v === true) return '1';     // PHP true -> "1"
  if (v === false) return '';     // PHP false -> "" (already filtered out, but safe)
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Flatten a (flat) signed object into string values for URLSearchParams. */
function toStringMap(obj) {
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = stringify(obj[key]);
  }
  return out;
}

module.exports = OkayPay;
module.exports.OkayPay = OkayPay;
// exported for testing / parity checks
module.exports._internals = { md5, arrayFilter, ksort, buildSignString };
