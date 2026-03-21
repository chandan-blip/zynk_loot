# LOOT Market - Admin Mobile App API Reference

Base URL: `https://yourserver.com/api`
WebSocket URL: `wss://yourserver.com`

---

## Authentication

### Admin Login

This endpoint only allows admin users. Non-admin users will get `401 Invalid credentials`.

```
POST /api/admin/login
Content-Type: application/json
```

**Request:**

```json
{
  "email": "admin@example.com",
  "password": "your_password"
}
```

Or login with phone:

```json
{
  "phone": "+919876543210",
  "password": "your_password"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin_user",
      "email": "admin@example.com",
      "phone": "+919876543210",
      "balance": 1000.50,
      "isAdmin": true,
      "preferredCurrency": "ZYNK"
    }
  }
}
```

### Token Usage

- **Format:** JWT (HS256)
- **Expiry:** 7 days
- **Header:** All authenticated requests must include:

```
Authorization: Bearer <token>
```

### Get Current User

```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin_user",
    "email": "admin@example.com",
    "phone": "+919876543210",
    "balance": 1000.50,
    "totalSpent": 500.00,
    "totalEarned": 1500.50,
    "isAdmin": true,
    "preferredCurrency": "ZYNK",
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

---

## Orders Management (Zynk Purchases)

### List Orders

```
GET /api/admin/orders?page=1&limit=20&status=awaiting_approval
Authorization: Bearer <token>
```

**Query Parameters:**

| Param    | Type   | Default | Description                                                      |
|----------|--------|---------|------------------------------------------------------------------|
| `page`   | int    | 1       | Page number                                                      |
| `limit`  | int    | 20      | Results per page                                                 |
| `status` | string | —       | Filter: `awaiting_approval`, `completed`, `rejected`, `failed`   |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": 1,
        "user_id": 42,
        "username": "john_user",
        "email": "john@example.com",
        "zynk_amount": 1000,
        "bonus_amount": 50,
        "package_id": 2,
        "package_name": "Premium 1000Z",
        "price": 399.00,
        "payment_method": "upi",
        "payment_currency": "INR",
        "payment_amount": 39900.00,
        "payment_reference": "UPI123456789",
        "payment_note": "Sent via Google Pay",
        "status": "awaiting_approval",
        "admin_id": null,
        "admin_note": null,
        "created_at": "2026-03-21T10:00:00Z",
        "processed_at": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 8,
      "pages": 1
    },
    "counts": {
      "awaiting_approval": 8,
      "completed": 342,
      "rejected": 12
    }
  }
}
```

### Get Single Order

```
GET /api/admin/orders/:id
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 42,
    "username": "john_user",
    "email": "john@example.com",
    "user_balance": 5000.00,
    "zynk_amount": 1000,
    "bonus_amount": 50,
    "package_id": 2,
    "package_name": "Premium 1000Z",
    "price": 399.00,
    "payment_method": "upi",
    "payment_currency": "INR",
    "payment_amount": 39900.00,
    "payment_reference": "UPI123456789",
    "payment_note": "Sent via Google Pay",
    "status": "awaiting_approval",
    "admin_id": null,
    "processed_by_name": null,
    "admin_note": null,
    "created_at": "2026-03-21T10:00:00Z",
    "processed_at": null
  }
}
```

### Approve Order

```
POST /api/admin/orders/:id/approve
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**

```json
{
  "note": "Payment verified"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Order approved. 1050 Zynk credited to user.",
  "data": {
    "orderId": 1,
    "zynkCredited": 1050,
    "newBalance": 6050.00
  }
}
```

**Side effects:**
- User balance updated (zynk_amount + bonus_amount)
- Transaction record created (type: `deposit`)
- Referral commission processed (if applicable)
- Notification sent to user
- Socket: `balance:update` emitted to user
- Socket: `order:updated` emitted to `order:admin` room

### Reject Order

```
POST /api/admin/orders/:id/reject
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**

```json
{
  "note": "Invalid payment proof"
}
```

`note` is **required**.

**Response (200):**

```json
{
  "success": true,
  "message": "Order rejected"
}
```

**Side effects:**
- Order status set to `rejected`
- Notification sent to user with rejection reason
- Socket: `order:updated` emitted to `order:admin` room

---

## Withdrawals Management

### List Withdrawals

```
GET /api/admin/withdrawals?page=1&limit=20&status=pending
Authorization: Bearer <token>
```

**Query Parameters:**

| Param    | Type   | Default | Description                                          |
|----------|--------|---------|------------------------------------------------------|
| `page`   | int    | 1       | Page number                                          |
| `limit`  | int    | 20      | Results per page                                     |
| `status` | string | —       | Filter: `pending`, `approved`, `rejected`, `completed` |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "withdrawals": [
      {
        "id": 1,
        "user_id": 42,
        "username": "john_user",
        "email": "john@example.com",
        "amount": 500.00,
        "status": "pending",
        "payment_type": "upi",
        "payment_label": "Primary UPI",
        "upi_id": "john@paytm",
        "wallet_address": null,
        "bank_name": null,
        "account_number": null,
        "ifsc_code": null,
        "account_holder": null,
        "processed_by": null,
        "processed_by_name": null,
        "created_at": "2026-03-21T10:00:00Z"
      }
    ],
    "statusCounts": {
      "pending": 12,
      "approved": 45,
      "rejected": 3,
      "completed": 280
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 340,
      "pages": 17
    }
  }
}
```

### Approve Withdrawal

```
POST /api/admin/withdrawals/:id/approve
Authorization: Bearer <token>
Content-Type: application/json

{ "admin_note": "Processing payment" }
```

### Reject Withdrawal (refunds user)

```
POST /api/admin/withdrawals/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{ "admin_note": "Insufficient balance in payment account" }
```

### Complete Withdrawal (after payment sent)

```
POST /api/admin/withdrawals/:id/complete
Authorization: Bearer <token>
Content-Type: application/json

{ "admin_note": "Payment sent via UPI" }
```

---

## Dashboard

```
GET /api/admin/dashboard
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "users": {
      "total": 1250,
      "totalBalance": 45678.90
    },
    "draws": {
      "total": 42,
      "completed": 38,
      "active": 2,
      "totalPool": 125000.00
    },
    "numbers": {
      "total": 9000,
      "totalVotes": 450000
    },
    "currentDraw": {
      "id": 1,
      "periodId": "2026-03-21-1",
      "status": "active",
      "winningNumber": "1234567",
      "revealedDigits": 3,
      "revealedNumber": "123XXXX"
    },
    "recentDraws": []
  }
}
```

---

## Users Management

### List Users

```
GET /api/admin/users?page=1&limit=20
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 1,
        "username": "john_user",
        "email": "john@example.com",
        "balance": 5000.00,
        "total_spent": 2000.00,
        "total_earned": 7000.00,
        "is_active": 1,
        "created_at": "2026-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1250,
      "pages": 63
    }
  }
}
```

### Add Balance to User

```
POST /api/admin/users/:userId/balance
Authorization: Bearer <token>
Content-Type: application/json

{ "amount": 500.00 }
```

**Response (200):**

```json
{
  "success": true,
  "message": "Balance added successfully",
  "data": { "newBalance": 5500.00 }
}
```

---

## Payment Accounts

### List Payment Accounts

```
GET /api/admin/payment-accounts
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": 1,
        "type": "upi",
        "label": "Primary UPI",
        "upi_id": "admin@paytm",
        "upi_name": "Admin User",
        "is_active": 1,
        "priority": 1,
        "daily_limit": 50000.00,
        "daily_used": 15000.00,
        "usage_count": 42
      }
    ],
    "grouped": {
      "upi": [],
      "bank": [],
      "crypto_btc": [],
      "crypto_eth": [],
      "crypto_usdt": []
    },
    "totalActive": 8,
    "total": 10
  }
}
```

### Create Payment Account

```
POST /api/admin/payment-accounts
Authorization: Bearer <token>
Content-Type: application/json
```

**Types and required fields:**

| Type          | Required Fields                                  |
|---------------|--------------------------------------------------|
| `upi`         | `upi_id`                                         |
| `bank`        | `bank_account`, `bank_ifsc`, `bank_holder`       |
| `crypto_btc`  | `wallet_address`                                 |
| `crypto_eth`  | `wallet_address`                                 |
| `crypto_usdt` | `wallet_address`                                 |

**Example (UPI):**

```json
{
  "type": "upi",
  "label": "Backup UPI",
  "upi_id": "backup@paytm",
  "upi_name": "Backup Account",
  "is_active": true,
  "priority": 2,
  "daily_limit": 30000.00
}
```

### Update Payment Account

```
PUT /api/admin/payment-accounts/:id
Authorization: Bearer <token>
Content-Type: application/json

{ "daily_limit": 40000.00, "priority": 1 }
```

### Toggle Active Status

```
POST /api/admin/payment-accounts/:id/toggle
Authorization: Bearer <token>
```

### Delete Payment Account

```
DELETE /api/admin/payment-accounts/:id
Authorization: Bearer <token>
```

### Reset Daily Usage

```
POST /api/admin/payment-accounts/reset-daily
Authorization: Bearer <token>
```

---

## Zynk Packages

### List Packages

```
GET /api/admin/packages
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Starter 100Z",
      "zynk_amount": 100,
      "price": 49.00,
      "bonus_percent": 0,
      "is_active": 1,
      "purchaseCount": 1250,
      "totalZynkSold": 125000
    }
  ]
}
```

### Create Package

```
POST /api/admin/packages
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Elite 5000Z",
  "zynk_amount": 5000,
  "price": 1999.00,
  "bonus_percent": 25,
  "is_active": true
}
```

### Update Package

```
PUT /api/admin/packages/:id
Authorization: Bearer <token>
Content-Type: application/json

{ "price": 1899.00, "bonus_percent": 30 }
```

### Delete Package

```
DELETE /api/admin/packages/:id
Authorization: Bearer <token>
```

---

## Draw Management

### Get Current Draw

```
GET /api/admin/draws/current
Authorization: Bearer <token>
```

### List All Draws

```
GET /api/admin/draws?page=1&limit=20
Authorization: Bearer <token>
```

### Trigger New Draw

```
POST /api/admin/draws/trigger-new
Authorization: Bearer <token>
Content-Type: application/json

{ "session": 1 }
```

### Trigger Complete Draw

```
POST /api/admin/draws/trigger-complete
Authorization: Bearer <token>
```

### Reveal Next Digit

```
POST /api/admin/draws/reveal-next
Authorization: Bearer <token>
```

### Set Winning Number

```
POST /api/admin/draws/set-number
Authorization: Bearer <token>
Content-Type: application/json

{ "winningNumber": "5432109" }
```

---

## Winners Management

### List Winners

```
GET /api/admin/winners?page=1&limit=20&status=pending
Authorization: Bearer <token>
```

### Approve Winner

```
POST /api/admin/winners/:id/approve
Authorization: Bearer <token>
```

### Reject Winner

```
POST /api/admin/winners/:id/reject
Authorization: Bearer <token>
```

### Bulk Approve All Winners for Draw

```
POST /api/admin/draws/:periodId/approve-all
Authorization: Bearer <token>
```

### Get Winners for Specific Draw

```
GET /api/admin/draws/:periodId/winners
Authorization: Bearer <token>
```

---

## Transactions

```
GET /api/admin/transactions?page=1&limit=50&type=deposit
Authorization: Bearer <token>
```

**Type values:** `deposit`, `withdrawal`, `purchase`, `sale`, `vote`, `prize`, `refund`, `transfer_out`, `transfer_in`, `cashout`, `referral_commission`, `invest`, `invest_return`, `invest_withdraw`

---

## Settings

### Get All Settings

```
GET /api/admin/settings
Authorization: Bearer <token>
```

### Update a Setting

```
PUT /api/admin/settings/:key
Authorization: Bearer <token>
Content-Type: application/json

{ "value": "0.12" }
```

---

## Cron Configuration

### Get Config

```
GET /api/admin/cron-config
Authorization: Bearer <token>
```

### Update Single Setting

```
PUT /api/admin/cron-config/:key
Authorization: Bearer <token>
Content-Type: application/json

{ "value": "8" }
```

### Bulk Update

```
PUT /api/admin/cron-config
Authorization: Bearer <token>
Content-Type: application/json

{
  "settings": {
    "total_digits": "7",
    "timezone": "Asia/Kolkata"
  }
}
```

### Refresh (Apply Changes)

```
POST /api/admin/cron-config/refresh
Authorization: Bearer <token>
```

### Get Cron Status

```
GET /api/admin/cron-status
Authorization: Bearer <token>
```

---

## Scheduled Jobs

```
GET  /api/admin/jobs                    — List all jobs
GET  /api/admin/jobs/:id                — Job details
GET  /api/admin/jobs/history?limit=50   — Execution history
GET  /api/admin/jobs/stats/summary      — Statistics summary
PUT  /api/admin/jobs/:id/toggle         — Enable/disable job
     Body: { "enabled": false }
```

---

## Investments

```
GET  /api/admin/investment-stats                  — Statistics
GET  /api/admin/investments?page=1&status=active  — List investments
GET  /api/admin/investment-tiers                   — List tiers
POST /api/admin/investment-tiers                   — Create tier
PUT  /api/admin/investment-tiers/:id               — Update tier
PUT  /api/admin/investment-settings                — Update settings
GET  /api/admin/platform-metrics?days=90           — Metrics history
```

---

## Tracking & Analytics

```
GET /api/admin/tracking/dashboard?days=30      — Dashboard overview
GET /api/admin/tracking/events?page=1          — Event log
GET /api/admin/tracking/sessions?page=1        — Sessions list
GET /api/admin/tracking/user/:userId           — User activity
GET /api/admin/tracking/user/:userId/summary   — User summary
GET /api/admin/tracking/pages?days=30          — Top pages
GET /api/admin/tracking/event-breakdown?days=30 — Event breakdown
GET /api/admin/tracking/top-clicks?days=30     — Top clicks
GET /api/admin/tracking/scroll-stats?days=30   — Scroll stats
GET /api/admin/tracking/realtime               — Realtime stats
```

---

## Socket.io — Real-time Events

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('https://yourserver.com', {
  auth: { token: '<jwt_token>' }
});
```

### Admin Order Room

```javascript
// Join — start receiving order notifications
socket.emit('order:joinAdmin');

// Leave
socket.emit('order:leaveAdmin');
```

### Events to Listen

| Event             | Room           | Payload                                                                                                                     |
|-------------------|----------------|-----------------------------------------------------------------------------------------------------------------------------|
| `order:new`       | `order:admin`  | `{ id, userId, username, package, zynkAmount, bonusAmount, totalZynk, price, paymentMethod, paymentCurrency, paymentAmount, paymentReference, status, createdAt }` |
| `order:updated`   | `order:admin`  | `{ id, status, adminNote, processedAt }`                                                                                    |
| `balance:update`  | `user:{userId}`| `{ balance }`                                                                                                               |
| `draw:status`     | broadcast      | `{ periodId, status, revealedDigits, revealedNumber }`                                                                      |
| `draw:digit-revealed` | broadcast  | `{ periodId, revealedDigits, revealedNumber, totalDigits, digitsRemaining }`                                                |

### Mobile App Flow

1. Admin logs in → store JWT token securely
2. Connect socket with token in auth
3. Emit `order:joinAdmin` to subscribe
4. On `order:new` → show push notification with order details
5. Admin taps notification → call `GET /api/admin/orders/:id` for full details
6. Admin approves → `POST /api/admin/orders/:id/approve`
7. Admin rejects → `POST /api/admin/orders/:id/reject`
8. Other admin devices receive `order:updated` in real-time

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description"
}
```

| Status | Meaning                          |
|--------|----------------------------------|
| 200    | Success                          |
| 201    | Created                          |
| 400    | Bad request / validation error   |
| 401    | Unauthorized (missing/bad token) |
| 403    | Forbidden (not admin)            |
| 404    | Not found                        |
| 500    | Internal server error            |

---

## Order Status Flow

```
pending → awaiting_approval → completed  (admin approved)
                            → rejected   (admin rejected)
                            → failed     (user cancelled)
```

## Notes

- Auth rate limit: 20 requests / 15 min (production)
- JWT expires in 7 days — implement token refresh
- Store token in secure device storage (Keychain / Keystore)
- `note` field is **required** when rejecting an order
- `note` field is **optional** when approving an order
