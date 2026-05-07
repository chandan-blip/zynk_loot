const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');
const otpStore = require('../utils/otpSessionStore');

const router = express.Router();

const TWOFACTOR_BASE = 'https://2factor.in/API/V1';

// Phone validation (server-side, mirrors frontend logic)
function validatePhone(number) {
  if (!number) return { valid: false };
  const digits = number.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return { valid: false };

  const countries = {
    '91':  [10], '1':   [10], '44':  [10, 11], '61':  [9],
    '49':  [10, 11], '33':  [9], '81':  [10, 11], '86':  [11],
    '55':  [10, 11], '971': [9], '65':  [8],
  };

  // Try to match country code (3-digit, 2-digit, 1-digit)
  for (const [code, lengths] of Object.entries(countries)) {
    if (digits.startsWith(code)) {
      const local = digits.slice(code.length);
      if (lengths.includes(local.length)) {
        return { valid: true, phone: `+${digits}` };
      }
    }
  }

  // Accept raw 10-digit (assume India)
  if (digits.length === 10) return { valid: true, phone: `+91${digits}` };

  // Accept if reasonable length with +
  if (number.startsWith('+') && digits.length >= 7) return { valid: true, phone: `+${digits}` };

  return { valid: false };
}

// Register
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, email, phone, password, referral_code } = req.body;

    // Phone registration must go through /phone-register (OTP-verified) to ensure phone ownership.
    if (phone) {
      return res.status(400).json({ success: false, message: 'Phone registration requires OTP verification. Use /phone-register.' });
    }

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const [existing] = await db.pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    }

    // Look up referrer
    let referrerId = null;
    if (referral_code) {
      const [referrers] = await db.pool.query(
        'SELECT id FROM users WHERE referral_code = ?',
        [referral_code]
      );
      if (referrers.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid referral code' });
      }
      referrerId = referrers[0].id;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.pool.query(
      'INSERT INTO users (username, email, password_hash, referred_by) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, referrerId]
    );

    if (referrerId === result.insertId) {
      await db.pool.query('UPDATE users SET referred_by = NULL WHERE id = ?', [result.insertId]);
    }

    const token = generateToken(result.insertId);

    // Welcome notification
    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: result.insertId,
        type: 'personal',
        title: 'Welcome to LOOT Market!',
        message: `Hi ${username}, your account is ready. Buy numbers, play games, and start winning!`,
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: result.insertId,
          username,
          email,
          phone: null,
          balance: 0,
          isAdmin: false
        }
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Send OTP to a phone number via 2Factor.in
// Validates the FULL registration payload upfront so we don't burn an SMS for
// a request that would fail at register time. Stores the validated data in the
// session, keyed by 2Factor's sessionId, so /phone-register only needs sessionId+otp.
router.post('/phone-send-otp', [
  body('username').trim().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/),
  body('password').isLength({ min: 6 }),
  body('phone').isString().notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Username (3+ chars, alphanumeric/underscore) and password (6+ chars) are required' });
    }

    const { username, phone, password, referral_code } = req.body;

    const phoneResult = validatePhone(phone);
    if (!phoneResult.valid) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
    const normalizedPhone = phoneResult.phone;

    // Username + phone uniqueness — fail fast before sending SMS.
    const [existing] = await db.pool.query(
      'SELECT username, phone FROM users WHERE username = ? OR phone = ?',
      [username, normalizedPhone]
    );
    if (existing.length > 0) {
      const conflict = existing.find((u) => u.username === username) ? 'Username' : 'Phone';
      return res.status(400).json({ success: false, message: `${conflict} already registered` });
    }

    // Resolve referral now so an invalid code doesn't burn an SMS.
    let referrerId = null;
    if (referral_code) {
      const [referrers] = await db.pool.query(
        'SELECT id FROM users WHERE referral_code = ?',
        [referral_code]
      );
      if (referrers.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid referral code' });
      }
      referrerId = referrers[0].id;
    }

    const apiKey = process.env.TWOFACTOR_API_KEY;
    if (!apiKey) {
      console.error('TWOFACTOR_API_KEY not set');
      return res.status(500).json({ success: false, message: 'OTP service not configured' });
    }

    // 2Factor expects digits-only with country code, no leading +
    const phoneForApi = normalizedPhone.replace(/^\+/, '');
    const url = `${TWOFACTOR_BASE}/${apiKey}/SMS/${phoneForApi}/AUTOGEN`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.Status !== 'Success') {
      console.error('2Factor SMS send error:', data);
      return res.status(502).json({ success: false, message: data.Details || 'Failed to send OTP' });
    }

    const sessionId = data.Details;
    // Stash the full validated payload — /phone-register will create the user from this.
    otpStore.set(sessionId, {
      phone: normalizedPhone,
      username,
      password,
      referrerId,
    });

    res.json({ success: true, data: { sessionId } });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Phone register — verifies the OTP via 2Factor, then creates the user from
// the data stashed during /phone-send-otp.
router.post('/phone-register', [
  body('sessionId').isString().notEmpty(),
  body('otp').isString().isLength({ min: 4, max: 8 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { sessionId, otp } = req.body;

    const session = otpStore.get(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, message: 'OTP session expired. Please request a new OTP.' });
    }

    const apiKey = process.env.TWOFACTOR_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'OTP service not configured' });
    }

    const verifyUrl = `${TWOFACTOR_BASE}/${apiKey}/SMS/VERIFY/${encodeURIComponent(sessionId)}/${encodeURIComponent(otp)}`;
    let verifyData;
    try {
      const r = await fetch(verifyUrl);
      verifyData = await r.json();
    } catch (err) {
      console.error('2Factor verify request failed:', err.message);
      return res.status(502).json({ success: false, message: 'OTP verification service unavailable' });
    }

    if (verifyData.Status !== 'Success' || verifyData.Details !== 'OTP Matched') {
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }

    // OTP good — consume the session and use the data we stashed at send time.
    otpStore.consume(sessionId);
    const { phone: normalizedPhone, username, password, referrerId } = session;

    // Re-check uniqueness in case someone grabbed the username/phone in the window
    // between send and verify.
    const [existing] = await db.pool.query(
      'SELECT id FROM users WHERE username = ? OR phone = ?',
      [username, normalizedPhone]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Username or phone already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.pool.query(
      'INSERT INTO users (username, phone, phone_verified, password_hash, referred_by) VALUES (?, ?, 1, ?, ?)',
      [username, normalizedPhone, passwordHash, referrerId]
    );

    const token = generateToken(result.insertId);

    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: result.insertId,
        type: 'personal',
        title: 'Welcome to LOOT Market!',
        message: `Hi ${username}, your account is ready. Buy numbers, play games, and start winning!`,
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: result.insertId,
          username,
          email: null,
          phone: normalizedPhone,
          phoneVerified: true,
          balance: 0,
          isAdmin: false,
        },
      },
    });
  } catch (error) {
    console.error('Phone register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login (supports both email and phone)
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required' });
    }

    let query, param;
    if (email) {
      query = 'SELECT id, username, email, phone, password_hash, balance, is_admin, is_active, preferred_currency FROM users WHERE email = ?';
      param = email.trim().toLowerCase();
    } else {
      // Normalize phone for lookup
      const phoneResult = validatePhone(phone);
      if (!phoneResult.valid) {
        return res.status(400).json({ success: false, message: 'Invalid phone number' });
      }
      query = 'SELECT id, username, email, phone, password_hash, balance, is_admin, is_active, preferred_currency FROM users WHERE phone = ?';
      param = phoneResult.phone;
    }

    const [users] = await db.pool.query(query, [param]);

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    // Fire-and-forget login tracking (skip admins)
    if (!user.is_admin) {
      req.app.get('trackingService')?.recordServerEvent(user.id, null, 'login', {
        method: user.phone ? 'phone' : 'email',
        ip: req.ip,
      }).catch(() => {});
    }

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          balance: parseFloat(user.balance),
          isAdmin: user.is_admin,
          preferredCurrency: user.preferred_currency || 'ZYNK'
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await db.pool.query(
      `SELECT id, username, email, phone, balance, total_spent, total_earned, is_admin, preferred_currency, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        balance: parseFloat(user.balance),
        totalSpent: parseFloat(user.total_spent),
        totalEarned: parseFloat(user.total_earned),
        isAdmin: user.is_admin === 1,
        preferredCurrency: user.preferred_currency || 'ZYNK',
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user data' });
  }
});

module.exports = router;
