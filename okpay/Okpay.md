# OkPay API Documentation

| | |
|---|---|
| **Base URL** | `https://api.okaypay.me/shop/` |
| **Request method** | `POST` |
| **Data format** | JSON |

All requests are signed with an MD5 signature (see [Signature Algorithm](#signature-algorithm)).
Supported currencies: **USDT**, **TRX**.

---

## 1. payLink — Create a payment link

**Endpoint:** `/payLink`

### Request parameters

| Parameter | Required | Description |
|---|---|---|
| `unique_id` | optional | Unique order number (prevents duplicate orders) |
| `name` | optional | Display information |
| `amount` | required | Amount |
| `return_url` | required | Return link |
| `coin` | required | Currency type (`USDT`, `TRX`) |
| `callback_url` | optional | Per-order callback address |
| `status` | optional | Defaults to `0` |

### Response

```
data[]
    order_id   Order number
    pay_url    Payment link
```

### Signature example

Using `id=1` and `token=123456`:

```
Arrangement: amount=10&callback_url=http://127.0.0.1/callback&coin=USDT&id=1&name=test&return_url=http://127.0.0.1&unique_id=123456&token=123456
Signature:   7465C8F4ED1BA0C8C2DB88E792374A65
```

### Deposit callback

OkPay sends an asynchronous notification to your callback URL:

```
data[]
    order_id     Order number
    unique_id    The order number you passed in
    pay_user_id  Telegram ID of the paying user
    amount       Deposit amount
    coin         Currency type (USDT, TRX)
    status       Order status — 0 = unpaid, 1 = paid
    type         deposit / withdraw (deposit = top-up, withdraw = withdrawal)
```

**Signature example** (`id=1`, `token=123456`):

```
Arrangement: code=200&data[order_id]=ac7b86615fdb137576ae35879f7ed844&data[unique_id]=BWIN-20250922152023LDVNSyxLQko&data[pay_user_id]=7238234930&data[amount]=6.00000000&data[coin]=USDT&data[status]=1&data[type]=deposit&id=1&status=success&token=123456
Signature:   95BE540FB7D1996770E2B4CDBC6F184D
```

---

## 2. transfer — Transfer

**Endpoint:** `/transfer`

### Request parameters

| Parameter | Required | Description |
|---|---|---|
| `unique_id` | optional | Unique order number (prevents duplicate orders) |
| `name` | optional | Display information |
| `amount` | required | Amount |
| `to_user_id` | required | Telegram ID of the recipient user |
| `coin` | required | Currency type (`USDT`, `TRX`) |
| `callback_url` | — | Callback address |

### Response

```
data[]
    order_id   Order number
```

### Signature example

Using `id=1` and `token=123456`:

```
Arrangement: amount=10&callback_url=http://127.0.0.1/callback&coin=USDT&id=1&name=test&to_user_id=123456&unique_id=123456&token=123456
Signature:   09BC57D2B2AAFAA59DC56E82B8F79E03
```

### Withdrawal callback

```
data[]
    order_id     Order number
    unique_id    The order number you passed in
    pay_user_id  Telegram ID of the paying user
    amount       Amount
    coin         Currency type (USDT, TRX)
    status       Order status — 0 = pending, 1 = payout succeeded, 2 = failed
    type         deposit / withdraw (deposit = top-up, withdraw = withdrawal)
```

**Signature example** (`id=1`, `token=123456`):

```
Arrangement: code=200&data[order_id]=ac7b86615fdb137576ae35879f7ed844&data[unique_id]=BWIN-20250922152023LDVNSyxLQko&data[pay_user_id]=7238234930&data[amount]=6.00000000&data[coin]=USDT&data[status]=1&data[type]=withdraw&id=1&status=success&token=123456
Signature:   579B2F78F92A14C322A00D63B84B9053
```

---

## 3. censorUserByTG — Check whether a user exists

**Endpoint:** `/censorUserByTG`

### Request parameters

| Parameter | Description |
|---|---|
| `telegramID` | Telegram ID |

### Response

```
data[]
    telegramID   The ID you passed in
    exist        Boolean — exists (true) / does not exist (false)
```

---

## 4. checkTransfer — Check a transfer

**Endpoint:** `/checkTransfer`

### Request parameters

| Parameter | Required | Description |
|---|---|---|
| `unique_id` | required | The order number you passed in |

### Response

```
data[]
    order_id     Order number
    unique_id    Your order number
    status       0 = not succeeded, 1 = succeeded, 2 = failed
    amount       Amount
    coin         Currency
    to_user_id   Telegram ID of the receiving user
```

---

## 5. checkDeposit — Check a deposit

**Endpoint:** `/checkDeposit`

### Request parameters

| Parameter | Required | Description |
|---|---|---|
| `unique_id` | required | The order number you passed in |

### Response

```
data[]
    order_id     Order number
    unique_id    Your order number
    status       0 = unpaid, 1 = paid
    amount       Amount
```

---

## 6. balance — Check merchant balance

**Endpoint:** `/balance`

### Request parameters

_None._

### Response

```
data[]
    usdt   USDT balance
    trx    TRX balance
    cny    CNY balance
```

---

## Signature Algorithm

Both outgoing requests and incoming callbacks are validated with the same scheme:

1. Add your merchant `id` to the parameters.
2. Remove empty values.
3. Sort the parameters by key (ascending).
4. Build a query string in the form `key=value&key=value`. Nested objects are
   rendered as `key[subkey]=value` (the top level is sorted; nested keys keep
   their original order).
5. Append `&token=<your_token>` to the end of the string.
6. Take the **MD5** hash of the result and convert it to **uppercase** — that is the `sign`.

```
sign = strtoupper( md5( "<sorted_query>&token=<token>" ) )
```

For incoming callbacks, recompute the signature the same way (excluding the
received `sign` field) and compare it against the `sign` that was sent.

---

## Node.js SDK Usage

A Node.js client (`OkayPay.js`) implements all of the endpoints above. It has
**no third-party dependencies** (uses only the built-in `crypto` and `https`
modules) and requires Node.js >= 12. All network methods return Promises.

### Setup

```js
const OkayPay = require('./OkayPay');

const pay = new OkayPay(
  'YOUR_MERCHANT_ID',     // id
  'YOUR_MERCHANT_TOKEN',  // token
);
```

### Methods

| Method | Endpoint | Description |
|---|---|---|
| `payLink(data)` | `/payLink` | Create a payment link |
| `transfer(data)` | `/transfer` | Transfer / withdraw to a user |
| `shop_transaction_history(data)` | `/TransactionHistory` | Merchant transaction history |
| `checkTransfer(unique_id)` | `/checkTransfer` | Check a transfer's status |
| `checkDeposit(unique_id)` | `/checkDeposit` | Check a deposit's status |
| `censorUserByTG(telegramID)` | `/censorUserByTG` | Check whether a user exists |
| `balance()` | `/balance` | Get merchant balance |
| `notify(postData)` | — | Verify an incoming async callback |

The single-argument helpers (`checkTransfer`, `checkDeposit`, `censorUserByTG`)
accept either a scalar or an object — e.g. `checkDeposit('ORDER-1')` or
`checkDeposit({ unique_id: 'ORDER-1' })`.

### Examples

```js
// Create a payment link
const link = await pay.payLink({
  unique_id: 'ORDER-1',
  amount: 10,
  coin: 'USDT',
  return_url: 'https://t.me/your_bot',
});
// => { data: { order_id, pay_url } }

// Transfer / withdraw to a user
const wd = await pay.transfer({
  unique_id: 'WD-1',
  amount: 5,
  to_user_id: '7238234930',
  coin: 'USDT',
});
// => { data: { order_id } }

// Status checks
await pay.checkDeposit('ORDER-1');      // => { data: { status: 0|1, amount, ... } }
await pay.checkTransfer('WD-1');        // => { data: { status: 0|1|2, ... } }
await pay.censorUserByTG('7238234930'); // => { data: { exist: true|false } }
await pay.balance();                    // => { data: { usdt, trx, cny } }
```

### Verifying callbacks (Express)

`notify()` replaces the PHP version's `$_POST` read — pass it the parsed
request body. It returns `{ verified, message, ok, data }`.

```js
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));

app.post('/okpay/notify', (req, res) => {
  const result = pay.notify(req.body);
  if (result.verified) {
    // result.ok === true when status === 'success' && code === 10000
    // handle result.data (order_id, unique_id, amount, status, type, ...)
    return res.json({ status: 'success' });
  }
  res.status(400).json({ status: 'fail' });
});
```

> **Security note:** to mirror the original PHP curl options, the client sets
> `rejectUnauthorized: false` (TLS verification disabled) in `post()`. Set it
> to `true` for production use.
