# LOOT Market - Admin Order Management API

Base URL: `https://yourserver.com/api`
WebSocket URL: `wss://yourserver.com`

---

## Authentication

### Admin Login

Only allows admin users. Non-admin users get `401 Invalid credentials`.

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

Or with phone:

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
- **Header:** All requests below must include:

```
Authorization: Bearer <token>
```

---

## Orders

### List Orders

```
GET /api/admin/orders?page=1&limit=20&status=awaiting_approval
Authorization: Bearer <token>
```

**Query Parameters:**

| Param    | Type   | Default | Description                                                    |
|----------|--------|---------|----------------------------------------------------------------|
| `page`   | int    | 1       | Page number                                                    |
| `limit`  | int    | 20      | Results per page                                               |
| `status` | string | —       | Filter: `awaiting_approval`, `completed`, `rejected`, `failed` |

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

`note` is optional.

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

---

## Socket.io — Real-time Notifications

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('https://yourserver.com', {
  auth: { token: '<jwt_token>' }
});
```

### Join Admin Order Room

```javascript
socket.emit('order:joinAdmin');
```

### Leave Admin Order Room

```javascript
socket.emit('order:leaveAdmin');
```

### Events

#### `order:new` — New order submitted by user

```json
{
  "id": 1,
  "userId": 42,
  "username": "john_user",
  "package": "Premium 1000Z",
  "zynkAmount": 1000,
  "bonusAmount": 50,
  "totalZynk": 1050,
  "price": 399.00,
  "paymentMethod": "upi",
  "paymentCurrency": "INR",
  "paymentAmount": 39900.00,
  "paymentReference": "UPI123456789",
  "status": "awaiting_approval",
  "createdAt": "2026-03-21T10:00:00Z"
}
```

#### `order:updated` — Order approved/rejected by another admin

```json
{
  "id": 1,
  "status": "completed",
  "adminNote": "Payment verified",
  "processedAt": "2026-03-21T10:15:00Z"
}
```

---

## Mobile App Flow

1. Admin logs in via `POST /api/admin/login` → store JWT token securely
2. Connect socket with token in auth
3. Emit `order:joinAdmin` to subscribe to order notifications
4. On `order:new` → show push notification with order details
5. Admin taps notification → call `GET /api/admin/orders/:id` for full details
6. Admin approves → `POST /api/admin/orders/:id/approve`
7. Admin rejects → `POST /api/admin/orders/:id/reject`
8. Other admin devices receive `order:updated` in real-time

---

## Order Status Flow

```
pending → awaiting_approval → completed  (admin approved)
                            → rejected   (admin rejected)
                            → failed     (user cancelled)
```

---

## Error Responses

```json
{
  "success": false,
  "message": "Error description"
}
```

| Status | Meaning                          |
|--------|----------------------------------|
| 200    | Success                          |
| 400    | Bad request / validation error   |
| 401    | Unauthorized (missing/bad token) |
| 403    | Forbidden (not admin)            |
| 404    | Not found                        |
| 500    | Internal server error            |

---

## Notes

- JWT expires in 7 days
- Store token in secure device storage (Keychain / Keystore)
- `note` is **required** when rejecting, **optional** when approving
- Payment methods: `upi`, `bank`, `crypto_btc`, `crypto_eth`, `crypto_usdt`
