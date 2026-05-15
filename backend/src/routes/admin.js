const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../config/database');
const { authenticateToken, requireAdmin, generateToken } = require('../middleware/auth');

const router = express.Router();

// ===== Image upload (banners and other admin assets) =====
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const BANNER_DIR = path.join(UPLOAD_ROOT, 'banners');
fs.mkdirSync(BANNER_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
]);
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const bannerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BANNER_DIR),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, matches frontend cap
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// Admin-only login (no auth middleware - public endpoint)
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone is required' });
    }

    let query, param;
    if (email) {
      query = 'SELECT id, username, email, phone, password_hash, balance, is_admin, is_active FROM users WHERE email = ? AND is_admin = 1';
      param = email.trim().toLowerCase();
    } else {
      query = 'SELECT id, username, email, phone, password_hash, balance, is_admin, is_active FROM users WHERE phone = ? AND is_admin = 1';
      param = phone.trim();
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
          isAdmin: true
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Apply auth middleware to all routes below
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard stats
// Main-site traffic aggregate for the admin dashboard with a today/yesterday/
// lifetime window. Sources: user_sessions + user_events (the main app's
// tracking, not the landing-page `website_events` table).
router.get('/site-traffic/dashboard', async (req, res) => {
  try {
    const range = String(req.query.range || 'today').toLowerCase();
    let sessionFilter = '';
    let eventFilter = '';
    if (range === 'today') {
      sessionFilter = 'WHERE started_at >= CURDATE()';
      eventFilter = 'WHERE created_at >= CURDATE()';
    } else if (range === 'yesterday') {
      sessionFilter = 'WHERE started_at >= (CURDATE() - INTERVAL 1 DAY) AND started_at < CURDATE()';
      eventFilter = 'WHERE created_at >= (CURDATE() - INTERVAL 1 DAY) AND created_at < CURDATE()';
    } else if (range === 'lifetime') {
      sessionFilter = '';
      eventFilter = '';
    } else {
      return res.status(400).json({ success: false, message: 'range must be today, yesterday, or lifetime' });
    }

    const [[sessions]] = await db.pool.query(
      `SELECT
         COUNT(*) AS total_sessions,
         COUNT(DISTINCT user_id) AS unique_users,
         COALESCE(SUM(duration_seconds), 0) AS total_duration,
         COALESCE(AVG(NULLIF(duration_seconds, 0)), 0) AS avg_duration,
         COUNT(CASE WHEN device_type = 'mobile'  THEN 1 END) AS mobile_sessions,
         COUNT(CASE WHEN device_type = 'desktop' THEN 1 END) AS desktop_sessions,
         COUNT(CASE WHEN device_type = 'tablet'  THEN 1 END) AS tablet_sessions
       FROM user_sessions
       ${sessionFilter}`
    );

    const [[events]] = await db.pool.query(
      `SELECT
         COUNT(CASE WHEN event_type = 'page_view'  THEN 1 END) AS page_views,
         COUNT(CASE WHEN event_type = 'click'      THEN 1 END) AS clicks,
         COUNT(CASE WHEN event_type = 'login'      THEN 1 END) AS logins,
         COUNT(CASE WHEN event_type = 'game_play'  THEN 1 END) AS game_plays,
         COUNT(*) AS total_events
       FROM user_events
       ${eventFilter}`
    );

    // Live count comes from socket.io's in-memory connection state, NOT the
    // DB. `user_sessions.is_active` only flips after the client explicitly
    // closes / heartbeats out, so it lags real presence by minutes; socket
    // connections drop instantly when the tab/window closes.
    const io = req.app.get('io');
    let activeSockets = 0;
    let activeUsers = 0;
    if (io) {
      activeSockets = io.engine?.clientsCount || io.sockets.sockets.size || 0;
      const uniqueUserIds = new Set();
      for (const socket of io.sockets.sockets.values()) {
        if (socket.userId) uniqueUserIds.add(socket.userId);
      }
      activeUsers = uniqueUserIds.size;
    }
    const live = {
      active_sessions: activeSockets,
      active_users: activeUsers,
    };

    res.json({
      success: true,
      data: {
        range,
        sessions: Number(sessions.total_sessions) || 0,
        uniqueUsers: Number(sessions.unique_users) || 0,
        totalDuration: Number(sessions.total_duration) || 0,
        avgDuration: Math.round(Number(sessions.avg_duration) || 0),
        pageViews: Number(events.page_views) || 0,
        clicks: Number(events.clicks) || 0,
        logins: Number(events.logins) || 0,
        gamePlays: Number(events.game_plays) || 0,
        totalEvents: Number(events.total_events) || 0,
        devices: {
          mobile:  Number(sessions.mobile_sessions)  || 0,
          desktop: Number(sessions.desktop_sessions) || 0,
          tablet:  Number(sessions.tablet_sessions)  || 0,
        },
        live: {
          activeSessions: Number(live.active_sessions) || 0,
          activeUsers: Number(live.active_users) || 0,
        },
      },
    });
  } catch (error) {
    console.error('Site traffic dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load site traffic dashboard' });
  }
});

// Users aggregate for the admin dashboard with a today/yesterday/lifetime
// window. "Total Users" = users registered in window (regular users only).
// "User Balances" = sum of current balances for those same users.
router.get('/users/dashboard', async (req, res) => {
  try {
    const range = String(req.query.range || 'today').toLowerCase();
    let dateFilter = '';
    if (range === 'today') {
      dateFilter = 'AND created_at >= CURDATE()';
    } else if (range === 'yesterday') {
      dateFilter = 'AND created_at >= (CURDATE() - INTERVAL 1 DAY) AND created_at < CURDATE()';
    } else if (range === 'lifetime') {
      dateFilter = '';
    } else {
      return res.status(400).json({ success: false, message: 'range must be today, yesterday, or lifetime' });
    }

    const [[row]] = await db.pool.query(
      `SELECT
         COUNT(*) AS user_count,
         COALESCE(SUM(balance), 0) AS total_balance
       FROM users
       WHERE is_admin = 0 ${dateFilter}`
    );

    res.json({
      success: true,
      data: {
        range,
        userCount: Number(row.user_count) || 0,
        totalBalance: parseFloat(row.total_balance) || 0,
      },
    });
  } catch (error) {
    console.error('Users dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load users dashboard' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [userStats] = await db.pool.query(
      'SELECT COUNT(*) as total, SUM(balance) as totalBalance FROM users WHERE is_admin = 0'
    );

    const [drawStats] = await db.pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status IN ('pending', 'revealing', 'active') THEN 1 ELSE 0 END) as active,
         SUM(total_pool) as totalPool
       FROM daily_draws`
    );

    const [recentDraws] = await db.pool.query(
      `SELECT id, period_id, draw_date, winning_number, status, total_pool, created_at
       FROM daily_draws ORDER BY created_at DESC LIMIT 5`
    );

    const [numberStats] = await db.pool.query(
      `SELECT COUNT(*) as total, SUM(total_votes) as totalVotes FROM numbers`
    );

    // Get current draw info (admin version - includes full winning number)
    const cronService = req.app.get('cronService');
    const currentDraw = await cronService.getCurrentDrawAdmin();

    res.json({
      success: true,
      data: {
        users: {
          total: userStats[0].total,
          totalBalance: parseFloat(userStats[0].totalBalance) || 0
        },
        draws: {
          total: drawStats[0].total || 0,
          completed: drawStats[0].completed || 0,
          active: drawStats[0].active || 0,
          totalPool: parseFloat(drawStats[0].totalPool) || 0
        },
        numbers: {
          total: numberStats[0].total || 0,
          totalVotes: numberStats[0].totalVotes || 0
        },
        currentDraw,
        recentDraws
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to get dashboard' });
  }
});


// Get all users
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [users] = await db.pool.query(
      `SELECT id, username, email, balance, total_spent, total_earned, is_active, created_at
       FROM users WHERE is_admin = 0
       ORDER BY created_at DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );

    const [countResult] = await db.pool.query(
      'SELECT COUNT(*) as total FROM users WHERE is_admin = 0'
    );

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to get users' });
  }
});

// Add balance to user
router.post('/users/:id/balance', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
      [req.params.id]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const newBalance = parseFloat(user.balance) + parseFloat(amount);

    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, user.id]
    );

    await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description)
       VALUES (?, 'deposit', ?, ?, ?, 'Admin deposit')`,
      [user.id, amount, user.balance, newBalance]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Balance added successfully',
      data: { newBalance }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add balance error:', error);
    res.status(500).json({ success: false, message: 'Failed to add balance' });
  } finally {
    connection.release();
  }
});

// ============ LOTTERY DRAW MANAGEMENT ============

// Get all draws
router.get('/draws', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [draws] = await db.pool.query(
      `SELECT * FROM daily_draws ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );

    const [countResult] = await db.pool.query('SELECT COUNT(*) as total FROM daily_draws');

    res.json({
      success: true,
      data: {
        draws,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get draws error:', error);
    res.status(500).json({ success: false, message: 'Failed to get draws' });
  }
});

// Get current active draw (admin - includes full winning number)
router.get('/draws/current', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const draw = await cronService.getCurrentDrawAdmin();
    res.json({ success: true, data: draw });
  } catch (error) {
    console.error('Get current draw error:', error);
    res.status(500).json({ success: false, message: 'Failed to get current draw' });
  }
});

// Manually trigger new draw (for testing)
// Accepts optional session parameter (1, 2, or 3)
router.post('/draws/trigger-new', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const { session } = req.body;

    // Validate session if provided
    if (session !== undefined && ![1, 2, 3].includes(Number(session))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session number. Must be 1, 2, or 3.'
      });
    }

    const result = await cronService.triggerNewDraw(session ? Number(session) : null);
    res.json({
      success: true,
      message: `Session ${result.sessionNumber} draw created`,
      data: result
    });
  } catch (error) {
    console.error('Trigger new draw error:', error);
    res.status(500).json({ success: false, message: 'Failed to trigger new draw' });
  }
});

// Manually trigger complete (for testing)
router.post('/draws/trigger-complete', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const result = await cronService.triggerComplete();
    res.json({
      success: true,
      message: 'Draw completed and winners processed',
      data: result
    });
  } catch (error) {
    console.error('Trigger complete error:', error);
    res.status(500).json({ success: false, message: 'Failed to trigger complete' });
  }
});

// Manually reveal next digit (for testing)
router.post('/draws/reveal-next', async (req, res) => {
  try {
    // Get current revealing draw
    const [draws] = await db.pool.query(
      `SELECT * FROM daily_draws WHERE status IN ('pending', 'revealing', 'active') ORDER BY created_at DESC LIMIT 1`
    );

    if (draws.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active draw found'
      });
    }

    const draw = draws[0];
    const currentRevealed = draw.revealed_digits || 0;

    if (currentRevealed >= 7) {
      return res.status(400).json({
        success: false,
        message: 'All digits already revealed'
      });
    }

    const newRevealed = currentRevealed + 1;

    // Update revealed digits in database
    await db.pool.query(
      `UPDATE daily_draws SET revealed_digits = ?, status = 'revealing' WHERE id = ?`,
      [newRevealed, draw.id]
    );

    // Calculate additional reveal info
    const TOTAL_DIGITS = 7;
    const digitsRemaining = TOTAL_DIGITS - newRevealed;
    const secondsPerDigit = Math.floor(3600 / (TOTAL_DIGITS - 1)); // ~600 seconds
    const revealedNumber = draw.winning_number.substring(0, newRevealed) + 'X'.repeat(TOTAL_DIGITS - newRevealed);

    // Broadcast to all connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('draw:digit-revealed', {
        periodId: draw.period_id,
        revealedDigits: newRevealed,
        revealedNumber,
        totalDigits: TOTAL_DIGITS,
        digitsRemaining,
        secondsPerDigit,
        isAutoReveal: false
      });
    }

    res.json({
      success: true,
      message: `Digit ${newRevealed} revealed`,
      data: {
        revealedDigits: newRevealed,
        revealedNumber,
        digitsRemaining
      }
    });
  } catch (error) {
    console.error('Reveal next digit error:', error);
    res.status(500).json({ success: false, message: 'Failed to reveal digit' });
  }
});

// Set winning number for current draw (for testing)
router.post('/draws/set-number', async (req, res) => {
  try {
    const { winningNumber } = req.body;

    if (!winningNumber || !/^\d{7}$/.test(winningNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid winning number. Must be exactly 7 digits.'
      });
    }

    // Update the current revealing/active draw
    const [result] = await db.pool.query(
      `UPDATE daily_draws SET winning_number = ?
       WHERE status IN ('pending', 'revealing', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [winningNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active draw found to update'
      });
    }

    res.json({
      success: true,
      message: 'Winning number updated',
      data: { winningNumber }
    });
  } catch (error) {
    console.error('Set winning number error:', error);
    res.status(500).json({ success: false, message: 'Failed to set winning number' });
  }
});

// ============ CRON CONFIGURATION ============

// Get cron configuration settings
router.get('/cron-config', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const config = cronService.getConfig();

    // Also get raw settings from database
    const [settings] = await db.pool.query(
      `SELECT setting_key, setting_value, description FROM settings
       WHERE setting_key IN (
         'total_digits', 'timezone', 'cron_enabled', 'auto_reveal_enabled',
         'exact_match_multiplier', 'near_match_multiplier', 'vote_reward',
         'session_1_generate_hour', 'session_1_reveal_start_hour', 'session_1_reveal_end_hour',
         'session_2_generate_hour', 'session_2_reveal_start_hour', 'session_2_reveal_end_hour',
         'session_3_generate_hour', 'session_3_reveal_start_hour', 'session_3_reveal_end_hour'
       )
       ORDER BY setting_key`
    );

    res.json({
      success: true,
      data: {
        activeConfig: config,
        settings: settings
      }
    });
  } catch (error) {
    console.error('Get cron config error:', error);
    res.status(500).json({ success: false, message: 'Failed to get cron configuration' });
  }
});

// Update cron configuration setting
router.put('/cron-config/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const { key } = req.params;

    // Validate key is a cron config setting
    const validKeys = [
      'total_digits', 'timezone', 'cron_enabled', 'auto_reveal_enabled',
      'exact_match_multiplier', 'near_match_multiplier', 'vote_reward',
      'session_1_generate_hour', 'session_1_reveal_start_hour', 'session_1_reveal_end_hour',
      'session_2_generate_hour', 'session_2_reveal_start_hour', 'session_2_reveal_end_hour',
      'session_3_generate_hour', 'session_3_reveal_start_hour', 'session_3_reveal_end_hour'
    ];

    if (!validKeys.includes(key)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cron config key'
      });
    }

    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'Value is required' });
    }

    // Validate value based on key type
    if (key.includes('hour') || key === 'total_digits' || key === 'vote_reward') {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < 0) {
        return res.status(400).json({
          success: false,
          message: 'Value must be a non-negative number'
        });
      }
      if (key.includes('hour') && numValue > 23) {
        return res.status(400).json({
          success: false,
          message: 'Hour value must be between 0 and 23'
        });
      }
    }

    if (key.includes('multiplier')) {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 1) {
        return res.status(400).json({
          success: false,
          message: 'Multiplier must be between 0 and 1'
        });
      }
    }

    // Update or insert the setting
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [key, value, `Cron config: ${key}`, value]
    );

    res.json({
      success: true,
      message: `Setting ${key} updated. Use /cron-config/refresh to apply changes.`
    });
  } catch (error) {
    console.error('Update cron config error:', error);
    res.status(500).json({ success: false, message: 'Failed to update cron configuration' });
  }
});

// Bulk update cron configuration
router.put('/cron-config', async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }

    const validKeys = [
      'total_digits', 'timezone', 'cron_enabled', 'auto_reveal_enabled',
      'exact_match_multiplier', 'near_match_multiplier', 'vote_reward',
      'session_1_generate_hour', 'session_1_reveal_start_hour', 'session_1_reveal_end_hour',
      'session_2_generate_hour', 'session_2_reveal_start_hour', 'session_2_reveal_end_hour',
      'session_3_generate_hour', 'session_3_reveal_start_hour', 'session_3_reveal_end_hour'
    ];

    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
      if (validKeys.includes(key)) {
        await db.pool.query(
          `INSERT INTO settings (setting_key, setting_value, description)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [key, value, `Cron config: ${key}`, value]
        );
        updates.push(key);
      }
    }

    res.json({
      success: true,
      message: `Updated ${updates.length} settings. Use /cron-config/refresh to apply changes.`,
      data: { updatedKeys: updates }
    });
  } catch (error) {
    console.error('Bulk update cron config error:', error);
    res.status(500).json({ success: false, message: 'Failed to update cron configuration' });
  }
});

// Refresh/reload cron configuration from database
router.post('/cron-config/refresh', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const newConfig = await cronService.refreshConfig();

    res.json({
      success: true,
      message: 'Cron configuration refreshed and jobs rescheduled',
      data: newConfig
    });
  } catch (error) {
    console.error('Refresh cron config error:', error);
    res.status(500).json({ success: false, message: 'Failed to refresh cron configuration' });
  }
});

// Get cron job status
router.get('/cron-status', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const config = cronService.getConfig();

    res.json({
      success: true,
      data: {
        enabled: config.CRON_ENABLED,
        autoRevealEnabled: config.AUTO_REVEAL_ENABLED,
        timezone: config.TIMEZONE,
        currentSession: cronService.getCurrentSession(),
        currentHour: cronService.getCurrentHourIST(),
        scheduledJobsCount: cronService.scheduledJobs ? cronService.scheduledJobs.length : 0,
        sessions: {
          1: config.SESSION_CONFIG[1],
          2: config.SESSION_CONFIG[2],
          3: config.SESSION_CONFIG[3]
        }
      }
    });
  } catch (error) {
    console.error('Get cron status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get cron status' });
  }
});

// ============ JOB SCHEDULE MANAGEMENT ============

// Get all scheduled jobs
router.get('/jobs', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const jobs = await cronService.getScheduledJobs();

    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('Get scheduled jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to get scheduled jobs' });
  }
});

// Get job execution history
router.get('/jobs/history', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const limit = parseInt(req.query.limit) || 50;
    const jobId = req.query.jobId || null;

    const history = await cronService.getJobHistory(limit, jobId);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get job history error:', error);
    res.status(500).json({ success: false, message: 'Failed to get job history' });
  }
});

// Get specific job details
router.get('/jobs/:id', async (req, res) => {
  try {
    const [jobs] = await db.pool.query(
      'SELECT * FROM job_schedule WHERE id = ?',
      [req.params.id]
    );

    if (jobs.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Get recent history for this job
    const [history] = await db.pool.query(
      `SELECT * FROM job_schedule_history WHERE job_id = ? ORDER BY started_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        job: jobs[0],
        recentHistory: history
      }
    });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ success: false, message: 'Failed to get job details' });
  }
});

// Enable/disable a specific job
router.put('/jobs/:id/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;

    const [result] = await db.pool.query(
      `UPDATE job_schedule SET is_enabled = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [enabled, enabled ? 'scheduled' : 'disabled', req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.json({
      success: true,
      message: `Job ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Toggle job error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle job' });
  }
});

// Get job statistics summary
router.get('/jobs/stats/summary', async (req, res) => {
  try {
    const [stats] = await db.pool.query(`
      SELECT
        COUNT(*) as totalJobs,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduledJobs,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as runningJobs,
        SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) as disabledJobs,
        SUM(run_count) as totalRuns,
        SUM(success_count) as totalSuccesses,
        SUM(fail_count) as totalFailures
      FROM job_schedule
    `);

    const [recentFailures] = await db.pool.query(`
      SELECT h.*, j.job_name
      FROM job_schedule_history h
      JOIN job_schedule j ON h.job_id = j.id
      WHERE h.status = 'failed'
      ORDER BY h.started_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        summary: stats[0],
        recentFailures
      }
    });
  } catch (error) {
    console.error('Get job stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get job statistics' });
  }
});

// Get draw winners
router.get('/draws/:periodId/winners', async (req, res) => {
  try {
    const [winners] = await db.pool.query(
      `SELECT w.*, u.username, n.number, n.purchased_at_reveal
       FROM winners w
       JOIN users u ON w.user_id = u.id
       JOIN numbers n ON w.number_id = n.id
       WHERE w.period_id = ?
       ORDER BY w.matching_digits DESC`,
      [req.params.periodId]
    );

    res.json({ success: true, data: winners });
  } catch (error) {
    console.error('Get winners error:', error);
    res.status(500).json({ success: false, message: 'Failed to get winners' });
  }
});

// Get all winners (with pagination + status filter)
router.get('/winners', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status; // optional: pending, approved, rejected

    let where = '';
    const params = [];
    if (status) {
      where = 'WHERE w.status = ?';
      params.push(status);
    }

    const [winners] = await db.pool.query(
      `SELECT w.id, w.period_id, w.matching_digits, w.prize_amount, w.status, w.reviewed_at, w.created_at,
              u.username, u.email, n.number, n.purchased_at_reveal,
              d.winning_number, d.draw_date
       FROM winners w
       JOIN users u ON w.user_id = u.id
       JOIN numbers n ON w.number_id = n.id
       JOIN daily_draws d ON w.draw_id = d.id
       ${where}
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const countWhere = status ? 'WHERE status = ?' : '';
    const countParams = status ? [status] : [];
    const [countResult] = await db.pool.query(`SELECT COUNT(*) as total FROM winners ${countWhere}`, countParams);

    // Get summary stats
    const [stats] = await db.pool.query(
      `SELECT
         COUNT(*) as totalWinners,
         SUM(CASE WHEN status = 'approved' THEN prize_amount ELSE 0 END) as totalPrizesPaid,
         COUNT(CASE WHEN matching_digits = 7 AND status = 'approved' THEN 1 END) as jackpotWinners,
         MAX(CASE WHEN status = 'approved' THEN prize_amount ELSE 0 END) as biggestPrize,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount
       FROM winners`
    );

    res.json({
      success: true,
      data: {
        winners,
        stats: {
          totalWinners: stats[0].totalWinners || 0,
          totalPrizesPaid: parseFloat(stats[0].totalPrizesPaid || 0),
          jackpotWinners: stats[0].jackpotWinners || 0,
          biggestPrize: parseFloat(stats[0].biggestPrize || 0),
          pendingCount: stats[0].pendingCount || 0
        },
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all winners error:', error);
    res.status(500).json({ success: false, message: 'Failed to get winners' });
  }
});

// Approve a pending winner — credits prize to user balance
router.post('/winners/:id/approve', async (req, res) => {
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM winners WHERE id = ? AND status = ?', [req.params.id, 'pending']);
    if (rows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Pending winner not found' });
    }

    const winner = rows[0];

    await conn.query(
      `UPDATE winners SET status = 'approved', reviewed_at = NOW() WHERE id = ?`,
      [winner.id]
    );

    const [[user]] = await conn.query('SELECT balance FROM users WHERE id = ?', [winner.user_id]);
    const balanceBefore = parseFloat(user.balance);
    const balanceAfter = balanceBefore + parseFloat(winner.prize_amount);

    await conn.query(
      `UPDATE users SET balance = ?, total_earned = total_earned + ? WHERE id = ?`,
      [balanceAfter, winner.prize_amount, winner.user_id]
    );

    await conn.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description) VALUES (?, 'prize', ?, ?, ?, ?)`,
      [winner.user_id, winner.prize_amount, balanceBefore, balanceAfter, `Draw ${winner.period_id} - ${winner.matching_digits} digit match prize`]
    );

    await conn.query(
      `UPDATE numbers SET times_won = times_won + 1, last_won_date = NOW() WHERE id = ?`,
      [winner.number_id]
    );

    await conn.commit();
    conn.release();

    // Notify user via socket + persistent notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${winner.user_id}`).emit('prize:won', {
        periodId: winner.period_id,
        prize: parseFloat(winner.prize_amount),
        matchType: winner.matching_digits === 7 ? 'exact' : 'near'
      });
    }

    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      const matchLabel = winner.matching_digits === 7 ? 'Jackpot! Exact match' : `${winner.matching_digits} digit match`;
      await notificationService.create({
        userId: winner.user_id,
        type: 'personal',
        title: '🏆 You Won a Prize!',
        message: `${matchLabel} on Draw #${winner.period_id}! You won ₹${parseFloat(winner.prize_amount).toLocaleString()}. The amount has been credited to your balance.`
      });
    }

    res.json({ success: true, message: `Winner approved. ₹${winner.prize_amount} credited.` });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Approve winner error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve winner' });
  }
});

// Reject a pending winner
router.post('/winners/:id/reject', async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM winners WHERE id = ? AND status = ?', [req.params.id, 'pending']);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending winner not found' });
    }

    await db.pool.query(
      `UPDATE winners SET status = 'rejected', reviewed_at = NOW() WHERE id = ?`,
      [req.params.id]
    );

    res.json({ success: true, message: 'Winner rejected.' });
  } catch (error) {
    console.error('Reject winner error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject winner' });
  }
});

// Bulk approve all pending winners for a draw
router.post('/draws/:periodId/approve-all', async (req, res) => {
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pending] = await conn.query(
      'SELECT * FROM winners WHERE period_id = ? AND status = ?',
      [req.params.periodId, 'pending']
    );

    if (pending.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'No pending winners for this draw' });
    }

    for (const winner of pending) {
      await conn.query(`UPDATE winners SET status = 'approved', reviewed_at = NOW() WHERE id = ?`, [winner.id]);

      const [[user]] = await conn.query('SELECT balance FROM users WHERE id = ?', [winner.user_id]);
      const balanceBefore = parseFloat(user.balance);
      const balanceAfter = balanceBefore + parseFloat(winner.prize_amount);

      await conn.query(
        `UPDATE users SET balance = ?, total_earned = total_earned + ? WHERE id = ?`,
        [balanceAfter, winner.prize_amount, winner.user_id]
      );

      await conn.query(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description) VALUES (?, 'prize', ?, ?, ?, ?)`,
        [winner.user_id, winner.prize_amount, balanceBefore, balanceAfter, `Draw ${winner.period_id} - ${winner.matching_digits} digit match prize`]
      );

      await conn.query(
        `UPDATE numbers SET times_won = times_won + 1, last_won_date = NOW() WHERE id = ?`,
        [winner.number_id]
      );
    }

    await conn.commit();
    conn.release();

    const io = req.app.get('io');
    const notificationService = req.app.get('notificationService');
    for (const winner of pending) {
      if (io) {
        io.to(`user:${winner.user_id}`).emit('prize:won', {
          periodId: winner.period_id,
          prize: parseFloat(winner.prize_amount),
          matchType: winner.matching_digits === 7 ? 'exact' : 'near'
        });
      }
      if (notificationService) {
        const matchLabel = winner.matching_digits === 7 ? 'Jackpot! Exact match' : `${winner.matching_digits} digit match`;
        await notificationService.create({
          userId: winner.user_id,
          type: 'personal',
          title: '🏆 You Won a Prize!',
          message: `${matchLabel} on Draw #${winner.period_id}! You won ₹${parseFloat(winner.prize_amount).toLocaleString()}. The amount has been credited to your balance.`
        });
      }
    }

    res.json({ success: true, message: `${pending.length} winners approved and credited.` });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Bulk approve error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve winners' });
  }
});

// ============ DAILY WINNERS MODULE ============

// Get caption template + available variables
router.get('/daily-winners/template', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });

    const template = await svc.getCaptionTemplate();
    res.json({
      success: true,
      data: {
        template,
        defaultTemplate: svc.getDefaultCaptionTemplate(),
        variables: svc.getCaptionVariables(),
      },
    });
  } catch (error) {
    console.error('Get caption template error:', error);
    res.status(500).json({ success: false, message: 'Failed to get template' });
  }
});

// Update caption template
router.put('/daily-winners/template', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });

    const { template } = req.body;
    if (typeof template !== 'string') {
      return res.status(400).json({ success: false, message: 'template (string) is required' });
    }
    if (template.length > 1024) {
      return res.status(400).json({ success: false, message: 'Template too long (max 1024 chars for Telegram caption)' });
    }

    await svc.setCaptionTemplate(template);
    res.json({ success: true, message: 'Template saved' });
  } catch (error) {
    console.error('Save caption template error:', error);
    res.status(500).json({ success: false, message: 'Failed to save template' });
  }
});

// ===== Payment screenshot templates (file-based editor) =====

// List all available platform templates
router.get('/daily-winners/payment-templates', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const platforms = svc.listPaymentTemplates();
    res.json({ success: true, data: { platforms } });
  } catch (error) {
    console.error('List payment templates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get/set dynamic payment details config (sender name, bank, UPI handle, etc.)
router.get('/daily-winners/payment-details', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const config = await svc.getPaymentDetailsConfig();
    res.json({
      success: true,
      data: {
        config,
        defaults: svc.getDefaultPaymentDetails(),
        schema: svc.getPaymentDetailsSchema(),
      },
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/daily-winners/payment-details', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const { config } = req.body || {};
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, message: 'config object required' });
    }
    const saved = await svc.savePaymentDetailsConfig(config);
    res.json({ success: true, data: { config: saved } });
  } catch (error) {
    console.error('Save payment details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/daily-winners/smm-panel', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const config = await svc.getSmmPanelConfig();
    res.json({
      success: true,
      data: {
        config,
        defaults: svc.getDefaultSmmPanelConfig(),
        schema: svc.getSmmPanelSchema(),
      },
    });
  } catch (error) {
    console.error('Get smm panel config error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/daily-winners/smm-panel', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const { config } = req.body || {};
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, message: 'config object required' });
    }
    const saved = await svc.saveSmmPanelConfig(config);
    res.json({ success: true, data: { config: saved } });
  } catch (error) {
    console.error('Save smm panel config error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/daily-winners/test-telegram', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const { text, placeSmmOrders } = req.body || {};
    const result = await svc.sendTestTelegramMessage(text, {
      placeSmmOrders: placeSmmOrders !== false,
    });
    res.json({ success: result.success, data: result });
  } catch (error) {
    console.error('Test telegram error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Preview: substitute variables and return rendered HTML (reads fresh from disk)
router.post('/daily-winners/payment-templates/:platform/preview', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const { sampleOverride } = req.body || {};
    const html = await svc.renderPaymentPreviewHtml(req.params.platform, sampleOverride || {});
    res.json({ success: true, data: { html } });
  } catch (error) {
    console.error('Preview payment template error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Preview: full puppeteer PNG render (base64) — what the Telegram channel will actually receive
router.post('/daily-winners/payment-templates/:platform/preview-png', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });
    const { sampleOverride } = req.body || {};
    const png = await svc.renderPaymentPreviewPng(req.params.platform, sampleOverride || {});
    res.json({
      success: true,
      data: { pngBase64: png.toString('base64') },
    });
  } catch (error) {
    console.error('Preview payment PNG error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Preview rendered caption using latest draw + synthetic sample winners (no DB write, no Telegram)
router.post('/daily-winners/template/preview', async (req, res) => {
  try {
    const svc = req.app.get('dailyWinnersService');
    if (!svc) return res.status(500).json({ success: false, message: 'Service unavailable' });

    const { template } = req.body;
    const tpl = typeof template === 'string' && template.length
      ? template
      : await svc.getCaptionTemplate();

    const [drawRows] = await db.pool.query(
      `SELECT * FROM daily_draws ORDER BY created_at DESC LIMIT 1`
    );
    const draw = drawRows[0] || { id: 0, period_id: 'SAMPLE', winning_number: '0000000' };

    const sampleWinners = [
      { name: 'Rahul S.', amount: 45000 },
      { name: 'Priya K.', amount: 22000 },
      { name: 'Amit V.', amount: 15500 },
      { name: 'Neha P.', amount: 9800 },
      { name: 'Vikram R.', amount: 5000 },
    ];

    const caption = svc.renderCaption(tpl, draw, sampleWinners);
    res.json({ success: true, data: { caption } });
  } catch (error) {
    console.error('Preview caption error:', error);
    res.status(500).json({ success: false, message: 'Failed to preview' });
  }
});

// List recent daily_winners runs grouped by draw
router.get('/daily-winners', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const [groups] = await db.pool.query(
      `SELECT dw.draw_id,
              d.period_id, d.winning_number, d.status as draw_status, d.created_at as draw_created_at,
              COUNT(*) as winners_count,
              SUM(dw.amount) as total_payout,
              MIN(dw.created_at) as generated_at
       FROM daily_winners dw
       LEFT JOIN daily_draws d ON dw.draw_id = d.id
       GROUP BY dw.draw_id
       ORDER BY generated_at DESC
       LIMIT ?`,
      [parseInt(limit)]
    );

    res.json({ success: true, data: groups });
  } catch (error) {
    console.error('List daily-winners error:', error);
    res.status(500).json({ success: false, message: 'Failed to list daily winners' });
  }
});

// Get all rows for a given draw
router.get('/daily-winners/:drawId', async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT dw.*, d.period_id, d.winning_number
       FROM daily_winners dw
       LEFT JOIN daily_draws d ON dw.draw_id = d.id
       WHERE dw.draw_id = ?
       ORDER BY dw.amount DESC`,
      [req.params.drawId]
    );

    const formatted = rows.map(r => ({
      ...r,
      json_data: typeof r.json_data === 'string' ? JSON.parse(r.json_data) : r.json_data,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Get daily-winners detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to get daily winners' });
  }
});

// Manually trigger a standalone synthetic-winners batch (no draw needed).
// Inserts 10–15 synthetic rows with draw_id = NULL, renders one payment
// screenshot per winner, pushes them to Telegram, follows with the prediction
// schedule's trailer message (after trailerDelaySeconds), and returns
// structured logs so the admin UI can display them.
router.post('/daily-winners/trigger', async (req, res) => {
  try {
    const dailyWinnersService = req.app.get('dailyWinnersService');
    if (!dailyWinnersService) {
      return res.status(500).json({ success: false, message: 'dailyWinnersService not available' });
    }

    const { minCount, maxCount } = req.body || {};
    const result = await dailyWinnersService.sendSyntheticWinnersBatch({
      ...(minCount != null ? { minCount: parseInt(minCount, 10) } : {}),
      ...(maxCount != null ? { maxCount: parseInt(maxCount, 10) } : {}),
      tag: 'manual',
    });

    // After the screenshots, send the trailer message (same config the
    // scheduled slots use) so the manual run ends like a scheduled run.
    const predictionService = req.app.get('predictionService');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_WINNERS_CHANNEL_ID;
    if (predictionService && token && chatId) {
      try {
        const cfg = await predictionService.getScheduleConfig();
        await predictionService._sendTrailer('[manual]', token, chatId, cfg);
      } catch (err) {
        console.error('Manual trailer send failed:', err.message);
        result.logs = result.logs || [];
        result.logs.push({ ts: new Date().toISOString(), level: 'error', msg: `Trailer send failed: ${err.message}` });
      }
    }

    res.json({
      success: result.success,
      message: result.success
        ? `Winners batch sent — ${result.screenshotsSent}/${result.winnersCount} screenshots, ${result.durationMs}ms`
        : `Failed: ${result.error}`,
      result,
    });
  } catch (error) {
    console.error('Daily winners trigger error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to trigger daily winners',
      result: { logs: [{ ts: new Date().toISOString(), level: 'error', msg: error.message || String(error) }] },
    });
  }
});

// ============ NUMBERS MANAGEMENT ============

// Get all numbers (with pagination)
router.get('/numbers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const [numbers] = await db.pool.query(
      `SELECT n.*, u.username as owner_name
       FROM numbers n
       LEFT JOIN users u ON n.owner_id = u.id
       ORDER BY n.total_votes DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );

    const [countResult] = await db.pool.query('SELECT COUNT(*) as total FROM numbers');

    res.json({
      success: true,
      data: {
        numbers,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get numbers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get numbers' });
  }
});

// ============ SETTINGS MANAGEMENT ============

// Get all settings
router.get('/settings', async (req, res) => {
  try {
    const [settings] = await db.pool.query('SELECT * FROM settings ORDER BY setting_key');
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get settings' });
  }
});

// ===== Social / floating links =====
router.get('/social-links', async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM social_links ORDER BY sort_order ASC, id ASC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get social links error:', error);
    res.status(500).json({ success: false, message: 'Failed to get social links' });
  }
});

router.post('/social-links', async (req, res) => {
  try {
    const { name, icon, url, color, sort_order, is_active } = req.body;
    if (!name || !icon || !url) {
      return res.status(400).json({ success: false, message: 'name, icon and url are required' });
    }
    const [result] = await db.pool.query(
      'INSERT INTO social_links (name, icon, url, color, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, icon, url, color || null, sort_order || 0, is_active !== false ? 1 : 0]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create social link error:', error);
    res.status(500).json({ success: false, message: 'Failed to create social link' });
  }
});

router.put('/social-links/:id', async (req, res) => {
  try {
    const { name, icon, url, color, sort_order, is_active } = req.body;
    await db.pool.query(
      `UPDATE social_links
       SET name = COALESCE(?, name),
           icon = COALESCE(?, icon),
           url = COALESCE(?, url),
           color = ?,
           sort_order = COALESCE(?, sort_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, icon, url, color || null, sort_order, is_active == null ? null : (is_active ? 1 : 0), req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update social link error:', error);
    res.status(500).json({ success: false, message: 'Failed to update social link' });
  }
});

router.delete('/social-links/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM social_links WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete social link error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete social link' });
  }
});

// ===== Website Leads (submissions to /api/enroll) =====
router.get('/website-leads', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const origin = req.query.origin?.trim();
    const search = req.query.search?.trim();

    const where = [];
    const params = [];
    if (origin) {
      where.push('origin LIKE ?');
      params.push(`%${origin}%`);
    }
    if (search) {
      where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM website_leads ${whereSql}`,
      params
    );

    const [rows] = await db.pool.query(
      `SELECT id, origin, referer, name, email, phone, message, payload,
              ip_address, user_agent, created_at
       FROM website_leads
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows, total, limit, offset });
  } catch (error) {
    console.error('List website leads error:', error);
    res.status(500).json({ success: false, message: 'Failed to load leads' });
  }
});

router.delete('/website-leads/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM website_leads WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete website lead error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete lead' });
  }
});

// Upload a banner/admin image; returns a public URL hosted by this API.
// The frontend stores the returned URL in banners.image_url (or anywhere else
// it needs a reusable image link).
router.post('/upload/banner', (req, res) => {
  bannerUpload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be under 5 MB'
        : (err.message || 'Upload failed');
      return res.status(400).json({ success: false, message: msg });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file received (expected field "image")' });
    }
    const relative = `/uploads/banners/${req.file.filename}`;
    const absolute = `${req.protocol}://${req.get('host')}${relative}`;
    res.json({ success: true, data: { url: absolute, path: relative, filename: req.file.filename } });
  });
});

// ===== Banners (home page carousel) =====
router.get('/banners', async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      'SELECT id, title, image_url, link_url, sort_order, is_active, created_at, updated_at FROM banners ORDER BY sort_order ASC, id ASC'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get banners error:', error);
    res.status(500).json({ success: false, message: 'Failed to get banners' });
  }
});

router.post('/banners', async (req, res) => {
  try {
    const { title, image_url, link_url, sort_order, is_active } = req.body;
    if (!image_url) {
      return res.status(400).json({ success: false, message: 'image_url is required' });
    }
    const [result] = await db.pool.query(
      'INSERT INTO banners (title, image_url, link_url, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
      [title || null, image_url, link_url || null, sort_order || 0, is_active !== false ? 1 : 0]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Create banner error:', error);
    res.status(500).json({ success: false, message: 'Failed to create banner' });
  }
});

router.put('/banners/:id', async (req, res) => {
  try {
    const { title, image_url, link_url, sort_order, is_active } = req.body;
    await db.pool.query(
      `UPDATE banners
       SET title = ?,
           image_url = COALESCE(?, image_url),
           link_url = ?,
           sort_order = COALESCE(?, sort_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        title || null,
        image_url || null,
        link_url || null,
        sort_order,
        is_active == null ? null : (is_active ? 1 : 0),
        req.params.id,
      ]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update banner error:', error);
    res.status(500).json({ success: false, message: 'Failed to update banner' });
  }
});

router.delete('/banners/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete banner error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete banner' });
  }
});

// ===== Websites (landing pages) =====
const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const buildContent = (html = '', css = '', js = '', title = '', headCode = '') => {
  const safeTitle = String(title || 'Landing Page').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
<style>${css || ''}</style>
${headCode || ''}
</head>
<body>
${html || ''}
<script>${js || ''}<\/script>
</body>
</html>`;
};

router.get('/websites', async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT id, title, sub_domain, domain, status, is_active, published_at, created_at, updated_at,
              visits, clicks, last_visit_at
         FROM websites
        ORDER BY id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List websites error:', error);
    res.status(500).json({ success: false, message: 'Failed to list websites' });
  }
});

// Cross-website dashboard: per-site visit/click counts for a given window.
// Used by the admin Dashboard page (filter: today | yesterday | lifetime).
router.get('/websites/dashboard', async (req, res) => {
  try {
    const range = String(req.query.range || 'today').toLowerCase();
    let dateFilter = '';
    if (range === 'today') {
      dateFilter = 'AND we.created_at >= CURDATE()';
    } else if (range === 'yesterday') {
      dateFilter = 'AND we.created_at >= (CURDATE() - INTERVAL 1 DAY) AND we.created_at < CURDATE()';
    } else if (range === 'lifetime') {
      dateFilter = '';
    } else {
      return res.status(400).json({ success: false, message: 'range must be today, yesterday, or lifetime' });
    }

    const [rows] = await db.pool.query(
      `SELECT
         w.id, w.title, w.sub_domain, w.domain, w.status, w.is_active,
         COALESCE(SUM(we.event_type='visit'), 0) AS visits,
         COALESCE(SUM(we.event_type='click'), 0) AS clicks,
         COUNT(DISTINCT we.session_id) AS unique_sessions,
         MAX(we.created_at) AS last_event_at
       FROM websites w
       LEFT JOIN website_events we
         ON we.website_id = w.id ${dateFilter}
       GROUP BY w.id
       ORDER BY visits DESC, clicks DESC, w.id DESC`
    );

    const totals = rows.reduce((acc, r) => {
      acc.visits += Number(r.visits) || 0;
      acc.clicks += Number(r.clicks) || 0;
      acc.sessions += Number(r.unique_sessions) || 0;
      return acc;
    }, { visits: 0, clicks: 0, sessions: 0, sites: rows.length });

    res.json({
      success: true,
      data: {
        range,
        totals,
        sites: rows.map(r => ({
          id: r.id,
          title: r.title,
          sub_domain: r.sub_domain,
          domain: r.domain,
          status: r.status,
          is_active: !!r.is_active,
          visits: Number(r.visits) || 0,
          clicks: Number(r.clicks) || 0,
          unique_sessions: Number(r.unique_sessions) || 0,
          last_event_at: r.last_event_at,
        })),
      },
    });
  } catch (error) {
    console.error('Websites dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load websites dashboard' });
  }
});

// Per-website tracking stats: totals + 30-day daily series + top click targets + top referrers.
router.get('/websites/:id/stats', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

    const [[totals]] = await db.pool.query(
      `SELECT
         COALESCE(SUM(event_type='visit'),0) AS visits,
         COALESCE(SUM(event_type='click'),0) AS clicks,
         COUNT(DISTINCT session_id) AS unique_sessions,
         MAX(created_at) AS last_event_at
       FROM website_events WHERE website_id = ?`,
      [id]
    );

    const [daily] = await db.pool.query(
      `SELECT DATE(created_at) AS day,
              SUM(event_type='visit') AS visits,
              SUM(event_type='click') AS clicks
         FROM website_events
        WHERE website_id = ? AND created_at >= (NOW() - INTERVAL 30 DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
      [id]
    );

    const [topTargets] = await db.pool.query(
      `SELECT target, COUNT(*) AS clicks
         FROM website_events
        WHERE website_id = ? AND event_type = 'click' AND target IS NOT NULL AND target <> ''
        GROUP BY target
        ORDER BY clicks DESC
        LIMIT 10`,
      [id]
    );

    const [topReferrers] = await db.pool.query(
      `SELECT referrer, COUNT(*) AS visits
         FROM website_events
        WHERE website_id = ? AND event_type = 'visit' AND referrer IS NOT NULL AND referrer <> ''
        GROUP BY referrer
        ORDER BY visits DESC
        LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      data: {
        totals: {
          visits: Number(totals.visits) || 0,
          clicks: Number(totals.clicks) || 0,
          uniqueSessions: Number(totals.unique_sessions) || 0,
          lastEventAt: totals.last_event_at,
        },
        daily,
        topTargets,
        topReferrers,
      },
    });
  } catch (error) {
    console.error('Website stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
});

router.get('/websites/:id', async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get website error:', error);
    res.status(500).json({ success: false, message: 'Failed to get website' });
  }
});

router.post('/websites', async (req, res) => {
  try {
    const { title, sub_domain, domain, html, css, js, head_code, status, is_active } = req.body;
    if (!title || !sub_domain) {
      return res.status(400).json({ success: false, message: 'title and sub_domain are required' });
    }
    const sub = String(sub_domain).trim().toLowerCase();
    if (!SUBDOMAIN_REGEX.test(sub)) {
      return res.status(400).json({ success: false, message: 'Invalid sub_domain (lowercase letters, numbers, hyphens)' });
    }
    const appDomain = domain || process.env.APP_DOMAIN || req.hostname;
    const finalStatus = status === 'published' ? 'published' : 'draft';
    const content = buildContent(html, css, js, title, head_code);
    const publishedAt = finalStatus === 'published' ? new Date() : null;

    const [result] = await db.pool.query(
      `INSERT INTO websites (title, sub_domain, domain, html, css, js, head_code, content, status, is_active, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, sub, appDomain, html || '', css || '', js || '', head_code || '', content, finalStatus, is_active === false ? 0 : 1, publishedAt]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Sub-domain already in use' });
    }
    console.error('Create website error:', error);
    res.status(500).json({ success: false, message: 'Failed to create website' });
  }
});

router.put('/websites/:id', async (req, res) => {
  try {
    const { title, sub_domain, domain, html, css, js, head_code, status, is_active } = req.body;
    const [rows] = await db.pool.query('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const current = rows[0];

    let sub = current.sub_domain;
    if (sub_domain !== undefined && sub_domain !== null) {
      sub = String(sub_domain).trim().toLowerCase();
      if (!SUBDOMAIN_REGEX.test(sub)) {
        return res.status(400).json({ success: false, message: 'Invalid sub_domain' });
      }
    }

    const finalTitle = title ?? current.title;
    const finalDomain = domain ?? current.domain;
    const finalHtml = html ?? current.html;
    const finalCss = css ?? current.css;
    const finalJs = js ?? current.js;
    const finalHeadCode = head_code ?? current.head_code ?? '';
    const finalStatus = status ? (status === 'published' ? 'published' : 'draft') : current.status;
    const finalActive = is_active == null ? current.is_active : (is_active ? 1 : 0);
    const content = buildContent(finalHtml, finalCss, finalJs, finalTitle, finalHeadCode);
    const publishedAt = finalStatus === 'published'
      ? (current.published_at || new Date())
      : null;

    await db.pool.query(
      `UPDATE websites
       SET title = ?, sub_domain = ?, domain = ?, html = ?, css = ?, js = ?, head_code = ?, content = ?, status = ?, is_active = ?, published_at = ?
       WHERE id = ?`,
      [finalTitle, sub, finalDomain, finalHtml, finalCss, finalJs, finalHeadCode, content, finalStatus, finalActive, publishedAt, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Sub-domain already in use' });
    }
    console.error('Update website error:', error);
    res.status(500).json({ success: false, message: 'Failed to update website' });
  }
});

router.post('/websites/:id/publish', async (req, res) => {
  try {
    const [result] = await db.pool.query(
      `UPDATE websites SET status = 'published', is_active = 1, published_at = COALESCE(published_at, NOW()) WHERE id = ?`,
      [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Not found' });
    const [rows] = await db.pool.query('SELECT sub_domain, domain FROM websites WHERE id = ?', [req.params.id]);
    const site = rows[0];
    const url = site ? `${req.protocol}://${site.sub_domain}.${site.domain || process.env.APP_DOMAIN || req.hostname}` : null;
    res.json({ success: true, data: { url } });
  } catch (error) {
    console.error('Publish website error:', error);
    res.status(500).json({ success: false, message: 'Failed to publish website' });
  }
});

router.post('/websites/:id/unpublish', async (req, res) => {
  try {
    await db.pool.query(`UPDATE websites SET status = 'draft' WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Unpublish website error:', error);
    res.status(500).json({ success: false, message: 'Failed to unpublish website' });
  }
});

router.delete('/websites/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM websites WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete website error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete website' });
  }
});

// Update setting
router.put('/settings/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const { key } = req.params;

    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'Value is required' });
    }

    const [result] = await db.pool.query(
      'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
      [value, key]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }

    // Auto-reload activity config when any activity setting changes
    if (key.startsWith('activity_')) {
      const activityService = req.app.get('activityService');
      if (activityService) await activityService.reloadConfig();
    }

    res.json({ success: true, message: 'Setting updated' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ success: false, message: 'Failed to update setting' });
  }
});

// ============ TRANSACTIONS ============

// Get all transactions (admin view)
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const type = req.query.type;

    let query = `SELECT t.*, u.username
                 FROM transactions t
                 JOIN users u ON t.user_id = u.id`;
    const params = [];

    if (type) {
      query += ' WHERE t.type = ?';
      params.push(type);
    }

    query += ` ORDER BY t.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const [transactions] = await db.pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM transactions';
    if (type) {
      countQuery += ' WHERE type = ?';
    }
    const [countResult] = await db.pool.query(countQuery, type ? [type] : []);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get transactions' });
  }
});

// ============ DEPOSITS MANAGEMENT (Zynk Orders) ============

// Aggregate deposits stats for the admin dashboard.
// range = today | yesterday | lifetime — uses created_at for windowing.
// Returns: total count (all statuses), completed count+amount, pending count.
router.get('/deposits/dashboard', async (req, res) => {
  try {
    const range = String(req.query.range || 'today').toLowerCase();
    let dateFilter = '';
    if (range === 'today') {
      dateFilter = 'WHERE created_at >= CURDATE()';
    } else if (range === 'yesterday') {
      dateFilter = 'WHERE created_at >= (CURDATE() - INTERVAL 1 DAY) AND created_at < CURDATE()';
    } else if (range === 'lifetime') {
      dateFilter = '';
    } else {
      return res.status(400).json({ success: false, message: 'range must be today, yesterday, or lifetime' });
    }

    const [[row]] = await db.pool.query(
      `SELECT
         COUNT(*) AS total_count,
         COUNT(CASE WHEN status IN ('approved','completed') THEN 1 END) AS completed_count,
         COUNT(CASE WHEN status IN ('pending','awaiting_approval') THEN 1 END) AS pending_count,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected_count,
         COALESCE(SUM(CASE WHEN status IN ('approved','completed') THEN price END), 0) AS completed_amount,
         COALESCE(SUM(CASE WHEN status IN ('approved','completed') THEN zynk_amount + COALESCE(bonus_amount, 0) END), 0) AS zynk_delivered
       FROM zynk_orders
       ${dateFilter}`
    );

    res.json({
      success: true,
      data: {
        range,
        totalCount: Number(row.total_count) || 0,
        completedCount: Number(row.completed_count) || 0,
        pendingCount: Number(row.pending_count) || 0,
        rejectedCount: Number(row.rejected_count) || 0,
        completedAmount: parseFloat(row.completed_amount) || 0,
        zynkDelivered: Number(row.zynk_delivered) || 0,
      },
    });
  } catch (error) {
    console.error('Deposits dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load deposits dashboard' });
  }
});

// Get all deposits (with filters)
router.get('/deposits', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `SELECT zo.*, u.username, u.email, zp.name as package_name
                 FROM zynk_orders zo
                 JOIN users u ON zo.user_id = u.id
                 LEFT JOIN zynk_packages zp ON zo.package_id = zp.id`;
    const params = [];

    if (status) {
      query += ' WHERE zo.status = ?';
      params.push(status);
    }

    query += ` ORDER BY zo.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const [deposits] = await db.pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM zynk_orders';
    if (status) {
      countQuery += ' WHERE status = ?';
    }
    const [countResult] = await db.pool.query(countQuery, status ? [status] : []);

    // Get status counts
    const [statusCounts] = await db.pool.query(
      `SELECT status, COUNT(*) as count FROM zynk_orders GROUP BY status`
    );

    res.json({
      success: true,
      data: {
        deposits,
        statusCounts: statusCounts.reduce((acc, s) => ({ ...acc, [s.status]: s.count }), {}),
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ success: false, message: 'Failed to get deposits' });
  }
});

// Approve deposit (add Zynk to user balance)
router.post('/deposits/:id/approve', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [orders] = await connection.execute(
      "SELECT * FROM zynk_orders WHERE id = ? AND status IN ('pending', 'awaiting_approval') FOR UPDATE",
      [req.params.id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Deposit not found or already processed' });
    }

    const order = orders[0];

    // Get user current balance
    const [users] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [order.user_id]
    );

    const currentBalance = parseFloat(users[0].balance);
    const newBalance = currentBalance + order.zynk_amount;

    // Add Zynk to user balance
    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, order.user_id]
    );

    // Update order status
    await connection.execute(
      `UPDATE zynk_orders SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [order.id]
    );

    // Create transaction record
    await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'deposit', ?, ?, ?, 'admin', ?, ?)`,
      [order.user_id, order.zynk_amount, currentBalance, newBalance, order.id, `Deposit approved - ₹${order.zynk_amount} added`]
    );

    await connection.commit();

    // Notify user
    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: order.user_id, type: 'personal',
        title: 'Deposit Approved',
        message: `Your deposit of ₹${order.zynk_amount} has been approved and added to your balance.${req.body.admin_note ? ' Note: ' + req.body.admin_note : ''}`,
      }).catch(() => {});
    }

    // Credit first-deposit bonus (idempotent — only fires the first time).
    const bonusService = req.app.get('bonusService');
    if (bonusService) {
      bonusService.creditFirstDepositBonus(order.user_id, order.zynk_amount).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Deposit approved and amount added to user balance',
      data: { orderId: order.id, zynkAdded: order.zynk_amount }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Approve deposit error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve deposit' });
  } finally {
    connection.release();
  }
});

// Reject deposit
router.post('/deposits/:id/reject', async (req, res) => {
  try {
    const [orders] = await db.pool.query(`SELECT id, user_id, zynk_amount FROM zynk_orders WHERE id = ? AND status IN ('pending', 'awaiting_approval')`, [req.params.id]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Deposit not found or already processed' });

    const order = orders[0];
    await db.pool.query(`UPDATE zynk_orders SET status = 'failed' WHERE id = ?`, [order.id]);

    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: order.user_id, type: 'personal',
        title: 'Deposit Rejected',
        message: `Your deposit of ₹${order.zynk_amount} was rejected.${req.body.admin_note ? ' Reason: ' + req.body.admin_note : ''}`,
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Deposit rejected' });
  } catch (error) {
    console.error('Reject deposit error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject deposit' });
  }
});

// ============ WITHDRAWALS MANAGEMENT ============

// Get all withdrawals (with filters)
router.get('/withdrawals', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `SELECT w.*, u.username, u.email,
                        pm.type as payment_type, pm.label as payment_label,
                        pm.upi_id, pm.wallet_address, pm.wallet_type,
                        pm.bank_name, pm.account_number, pm.ifsc_code, pm.account_holder,
                        admin.username as processed_by_name
                 FROM withdrawals w
                 JOIN users u ON w.user_id = u.id
                 JOIN payment_methods pm ON w.payment_method_id = pm.id
                 LEFT JOIN users admin ON w.processed_by = admin.id`;
    const params = [];

    if (status) {
      query += ' WHERE w.status = ?';
      params.push(status);
    }

    query += ` ORDER BY w.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const [withdrawals] = await db.pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM withdrawals';
    if (status) {
      countQuery += ' WHERE status = ?';
    }
    const [countResult] = await db.pool.query(countQuery, status ? [status] : []);

    // Get status counts
    const [statusCounts] = await db.pool.query(
      `SELECT status, COUNT(*) as count FROM withdrawals GROUP BY status`
    );

    res.json({
      success: true,
      data: {
        withdrawals,
        statusCounts: statusCounts.reduce((acc, s) => ({ ...acc, [s.status]: s.count }), {}),
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to get withdrawals' });
  }
});

// Approve withdrawal
router.post('/withdrawals/:id/approve', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [withdrawals] = await connection.execute(
      'SELECT * FROM withdrawals WHERE id = ? AND status = ? FOR UPDATE',
      [req.params.id, 'pending']
    );

    if (withdrawals.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Withdrawal not found or already processed' });
    }

    const withdrawal = withdrawals[0];

    // Update withdrawal status
    await connection.execute(
      `UPDATE withdrawals SET status = 'approved', processed_by = ?, processed_at = NOW(), admin_note = ? WHERE id = ?`,
      [req.user.id, req.body.admin_note || null, withdrawal.id]
    );

    await connection.commit();

    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: withdrawal.user_id, type: 'personal',
        title: 'Withdrawal Approved',
        message: `Your withdrawal of ₹${withdrawal.amount} has been approved.${req.body.admin_note ? ' Note: ' + req.body.admin_note : ''}`,
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Withdrawal approved',
      data: { withdrawalId: withdrawal.id }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve withdrawal' });
  } finally {
    connection.release();
  }
});

// Reject withdrawal (refund to user)
router.post('/withdrawals/:id/reject', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [withdrawals] = await connection.execute(
      'SELECT * FROM withdrawals WHERE id = ? AND status = ? FOR UPDATE',
      [req.params.id, 'pending']
    );

    if (withdrawals.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Withdrawal not found or already processed' });
    }

    const withdrawal = withdrawals[0];

    // Get user current balance
    const [users] = await connection.execute(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [withdrawal.user_id]
    );

    const currentBalance = parseFloat(users[0].balance);
    const newBalance = currentBalance + parseFloat(withdrawal.amount);

    // Refund to user
    await connection.execute(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, withdrawal.user_id]
    );

    // Update withdrawal status
    await connection.execute(
      `UPDATE withdrawals SET status = 'rejected', processed_by = ?, processed_at = NOW(), admin_note = ? WHERE id = ?`,
      [req.user.id, req.body.admin_note || 'Rejected by admin', withdrawal.id]
    );

    // Create refund transaction
    await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'refund', ?, ?, ?, 'admin', ?, ?)`,
      [withdrawal.user_id, withdrawal.amount, currentBalance, newBalance, withdrawal.id, 'Withdrawal rejected - amount refunded']
    );

    await connection.commit();

    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: withdrawal.user_id, type: 'personal',
        title: 'Withdrawal Rejected',
        message: `Your withdrawal of ₹${withdrawal.amount} was rejected and refunded to your balance.${req.body.admin_note ? ' Reason: ' + req.body.admin_note : ''}`,
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Withdrawal rejected and amount refunded',
      data: { withdrawalId: withdrawal.id }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Reject withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject withdrawal' });
  } finally {
    connection.release();
  }
});

// Mark withdrawal as completed (after actual payment is made)
router.post('/withdrawals/:id/complete', async (req, res) => {
  try {
    const [result] = await db.pool.query(
      `UPDATE withdrawals SET status = 'completed', processed_by = ?, processed_at = NOW(), admin_note = ? WHERE id = ? AND status = 'approved'`,
      [req.user.id, req.body.admin_note || 'Payment completed', req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found or not in approved status' });
    }

    res.json({ success: true, message: 'Withdrawal marked as completed' });
  } catch (error) {
    console.error('Complete withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete withdrawal' });
  }
});

// ============ ZYNK PACKAGES MANAGEMENT ============

// Get all packages
router.get('/packages', async (req, res) => {
  try {
    const [packages] = await db.pool.query(
      'SELECT * FROM zynk_packages ORDER BY zynk_amount ASC'
    );

    // Get purchase counts for each package
    const [purchaseCounts] = await db.pool.query(
      `SELECT package_id, COUNT(*) as count, SUM(zynk_amount) as total_zynk
       FROM zynk_orders WHERE status = 'completed' AND package_id IS NOT NULL
       GROUP BY package_id`
    );

    const countsMap = purchaseCounts.reduce((acc, p) => {
      acc[p.package_id] = { count: p.count, totalZynk: p.total_zynk };
      return acc;
    }, {});

    const packagesWithStats = packages.map(pkg => ({
      ...pkg,
      purchaseCount: countsMap[pkg.id]?.count || 0,
      totalZynkSold: countsMap[pkg.id]?.totalZynk || 0
    }));

    res.json({ success: true, data: packagesWithStats });
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get packages' });
  }
});

// Create new package
router.post('/packages', async (req, res) => {
  try {
    const { name, zynk_amount, price, bonus_percent, is_active } = req.body;

    if (!name || !zynk_amount || !price) {
      return res.status(400).json({ success: false, message: 'Name, amount, and price are required' });
    }

    const [result] = await db.pool.query(
      `INSERT INTO zynk_packages (name, zynk_amount, price, bonus_percent, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [name, zynk_amount, price, bonus_percent || 0, is_active !== false]
    );

    res.json({
      success: true,
      message: 'Package created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create package error:', error);
    res.status(500).json({ success: false, message: 'Failed to create package' });
  }
});

// Update package
router.put('/packages/:id', async (req, res) => {
  try {
    const { name, zynk_amount, price, bonus_percent, is_active } = req.body;

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (zynk_amount !== undefined) { updates.push('zynk_amount = ?'); values.push(zynk_amount); }
    if (price !== undefined) { updates.push('price = ?'); values.push(price); }
    if (bonus_percent !== undefined) { updates.push('bonus_percent = ?'); values.push(bonus_percent); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(req.params.id);

    const [result] = await db.pool.query(
      `UPDATE zynk_packages SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    res.json({ success: true, message: 'Package updated successfully' });
  } catch (error) {
    console.error('Update package error:', error);
    res.status(500).json({ success: false, message: 'Failed to update package' });
  }
});

// Delete package
router.delete('/packages/:id', async (req, res) => {
  try {
    // Check if package has orders
    const [orders] = await db.pool.query(
      'SELECT COUNT(*) as count FROM zynk_orders WHERE package_id = ?',
      [req.params.id]
    );

    if (orders[0].count > 0) {
      // Instead of deleting, just deactivate
      await db.pool.query(
        'UPDATE zynk_packages SET is_active = 0 WHERE id = ?',
        [req.params.id]
      );
      return res.json({
        success: true,
        message: 'Package has orders and was deactivated instead of deleted'
      });
    }

    const [result] = await db.pool.query(
      'DELETE FROM zynk_packages WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    res.json({ success: true, message: 'Package deleted successfully' });
  } catch (error) {
    console.error('Delete package error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete package' });
  }
});

// ============ ORDERS MANAGEMENT ============

// Get all orders (with filters)
router.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || '';

    let whereClause = '1=1';
    const params = [];

    if (status) {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }

    const [orders] = await db.pool.query(
      `SELECT o.*, u.username, u.email, p.name as package_name
       FROM zynk_orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN zynk_packages p ON o.package_id = p.id
       WHERE ${whereClause}
       ORDER BY
         CASE WHEN o.status = 'awaiting_approval' THEN 0 ELSE 1 END,
         o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) as total FROM zynk_orders o WHERE ${whereClause}`,
      params
    );

    // Get counts by status
    const [statusCounts] = await db.pool.query(
      `SELECT status, COUNT(*) as count FROM zynk_orders GROUP BY status`
    );

    const counts = {};
    statusCounts.forEach(s => { counts[s.status] = s.count; });

    res.json({
      success: true,
      data: {
        orders,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        counts
      }
    });
  } catch (error) {
    console.error('Get admin orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
});

// Get single order details
router.get('/orders/:id', async (req, res) => {
  try {
    const [orders] = await db.pool.query(
      `SELECT o.*, u.username, u.email, u.balance as user_balance, p.name as package_name,
              admin.username as processed_by_name
       FROM zynk_orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN zynk_packages p ON o.package_id = p.id
       LEFT JOIN users admin ON o.admin_id = admin.id
       WHERE o.id = ?`,
      [req.params.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    console.error('Get order detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to get order' });
  }
});

// Approve order (credits Zynk to user)
router.post('/orders/:id/approve', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get and lock order
    const [orders] = await connection.execute(
      `SELECT o.*, u.balance as user_balance
       FROM zynk_orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ? AND o.status = 'awaiting_approval'
       FOR UPDATE`,
      [req.params.id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Order not found or not awaiting approval' });
    }

    const order = orders[0];
    const totalZynk = order.zynk_amount + (order.bonus_amount || 0);
    const currentBalance = parseFloat(order.user_balance);
    const newBalance = currentBalance + totalZynk;
    const adminNote = req.body.note || 'Approved';

    // Update user balance
    await connection.execute(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [totalZynk, order.user_id]
    );

    // Update order status
    await connection.execute(
      `UPDATE zynk_orders
       SET status = 'completed', admin_id = ?, admin_note = ?, processed_at = NOW(), completed_at = NOW()
       WHERE id = ?`,
      [req.user.id, adminNote, order.id]
    );

    // Create transaction record
    const [txnResult] = await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'deposit', ?, ?, ?, 'admin', ?, ?)`,
      [order.user_id, totalZynk, currentBalance, newBalance, order.id, `Purchased ₹${totalZynk} (Order #${order.id})`]
    );

    await connection.commit();

    // Process referral commission
    const referralService = req.app.get('referralService');
    if (referralService) {
      referralService.processReferralCommission(order.user_id, txnResult.insertId, 'deposit', totalZynk);
    }

    // Notify user
    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: order.user_id, type: 'personal',
        title: 'Order Approved',
        message: `Your purchase of ₹${totalZynk} has been approved and added to your balance.${adminNote !== 'Approved' ? ' Note: ' + adminNote : ''}`,
      }).catch(() => {});
    }

    // Emit balance update via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${order.user_id}`).emit('balance:update', { balance: newBalance });
      io.to('order:admin').emit('order:updated', {
        id: order.id,
        status: 'completed',
        adminNote: adminNote,
        processedAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Order approved. ₹${totalZynk} credited to user.`,
      data: { orderId: order.id, zynkCredited: totalZynk, newBalance }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Approve order error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve order' });
  } finally {
    connection.release();
  }
});

// Reject order
router.post('/orders/:id/reject', async (req, res) => {
  try {
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const [orders] = await db.pool.query(
      `SELECT * FROM zynk_orders WHERE id = ? AND status = 'awaiting_approval'`,
      [req.params.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or not awaiting approval' });
    }

    await db.pool.query(
      `UPDATE zynk_orders
       SET status = 'rejected', admin_id = ?, admin_note = ?, processed_at = NOW()
       WHERE id = ?`,
      [req.user.id, note, req.params.id]
    );

    // Notify user
    const notificationService = req.app.get('notificationService');
    if (notificationService) {
      notificationService.create({
        userId: orders[0].user_id, type: 'personal',
        title: 'Order Rejected',
        message: `Your purchase order was rejected. Reason: ${note}`,
      }).catch(() => {});
    }

    // Notify admin clients via socket
    const io = req.app.get('io');
    if (io) {
      io.to('order:admin').emit('order:updated', {
        id: parseInt(req.params.id),
        status: 'rejected',
        adminNote: note,
        processedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: 'Order rejected' });
  } catch (error) {
    console.error('Reject order error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject order' });
  }
});

// Update payment settings
router.put('/payment-settings', async (req, res) => {
  try {
    const settings = req.body;

    const settingKeys = {
      'upi_id': 'payment_upi_id',
      'upi_name': 'payment_upi_name',
      'bank_name': 'payment_bank_name',
      'bank_account': 'payment_bank_account',
      'bank_ifsc': 'payment_bank_ifsc',
      'bank_holder': 'payment_bank_holder',
      'crypto_btc': 'payment_crypto_btc',
      'crypto_eth': 'payment_crypto_eth',
      'crypto_usdt': 'payment_crypto_usdt'
    };

    for (const [key, dbKey] of Object.entries(settingKeys)) {
      if (settings[key] !== undefined) {
        await db.pool.query(
          `INSERT INTO settings (setting_key, setting_value, description)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [dbKey, settings[key], `Payment setting: ${key}`, settings[key]]
        );
      }
    }

    res.json({ success: true, message: 'Payment settings updated' });
  } catch (error) {
    console.error('Update payment settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment settings' });
  }
});

// Get payment settings (admin view)
router.get('/payment-settings', async (req, res) => {
  try {
    const [settings] = await db.pool.query(
      `SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'payment_%'`
    );

    const result = {};
    settings.forEach(s => {
      const key = s.setting_key.replace('payment_', '');
      result[key] = s.setting_value;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get payment settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment settings' });
  }
});

// ============ PAYMENT ACCOUNTS MANAGEMENT ============

// Get all payment accounts
router.get('/payment-accounts', async (req, res) => {
  try {
    const [accounts] = await db.pool.query(
      `SELECT * FROM payment_accounts ORDER BY type, priority DESC, created_at DESC`
    );

    // Group by type
    const grouped = {
      upi: [],
      bank: [],
      crypto_btc: [],
      crypto_eth: [],
      crypto_usdt: []
    };

    accounts.forEach(acc => {
      if (grouped[acc.type]) {
        grouped[acc.type].push(acc);
      }
    });

    res.json({
      success: true,
      data: {
        accounts,
        grouped,
        totalActive: accounts.filter(a => a.is_active).length,
        total: accounts.length
      }
    });
  } catch (error) {
    console.error('Get payment accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment accounts' });
  }
});

// Get single payment account
router.get('/payment-accounts/:id', async (req, res) => {
  try {
    const [accounts] = await db.pool.query(
      'SELECT * FROM payment_accounts WHERE id = ?',
      [req.params.id]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment account not found' });
    }

    res.json({ success: true, data: accounts[0] });
  } catch (error) {
    console.error('Get payment account error:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment account' });
  }
});

// Create payment account
router.post('/payment-accounts', async (req, res) => {
  try {
    const {
      type, label,
      upi_id, upi_name,
      bank_name, bank_account, bank_ifsc, bank_holder,
      wallet_address, wallet_network,
      is_active, priority, daily_limit, notes
    } = req.body;

    // Validate required fields
    if (!type || !label) {
      return res.status(400).json({ success: false, message: 'Type and label are required' });
    }

    // Validate type-specific required fields
    if (type === 'upi' && !upi_id) {
      return res.status(400).json({ success: false, message: 'UPI ID is required for UPI accounts' });
    }
    if (type === 'bank' && (!bank_account || !bank_ifsc || !bank_holder)) {
      return res.status(400).json({ success: false, message: 'Bank account, IFSC, and holder name are required for bank accounts' });
    }
    if (['crypto_btc', 'crypto_eth', 'crypto_usdt'].includes(type) && !wallet_address) {
      return res.status(400).json({ success: false, message: 'Wallet address is required for crypto accounts' });
    }

    const [result] = await db.pool.query(
      `INSERT INTO payment_accounts
       (type, label, upi_id, upi_name, bank_name, bank_account, bank_ifsc, bank_holder,
        wallet_address, wallet_network, is_active, priority, daily_limit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, label, upi_id || null, upi_name || null,
       bank_name || null, bank_account || null, bank_ifsc || null, bank_holder || null,
       wallet_address || null, wallet_network || null,
       is_active !== false, priority || 0, daily_limit || null, notes || null]
    );

    res.json({
      success: true,
      message: 'Payment account created',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create payment account error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment account' });
  }
});

// Update payment account
router.put('/payment-accounts/:id', async (req, res) => {
  try {
    const {
      label, upi_id, upi_name,
      bank_name, bank_account, bank_ifsc, bank_holder,
      wallet_address, wallet_network,
      is_active, priority, daily_limit, notes
    } = req.body;

    const updates = [];
    const values = [];

    if (label !== undefined) { updates.push('label = ?'); values.push(label); }
    if (upi_id !== undefined) { updates.push('upi_id = ?'); values.push(upi_id || null); }
    if (upi_name !== undefined) { updates.push('upi_name = ?'); values.push(upi_name || null); }
    if (bank_name !== undefined) { updates.push('bank_name = ?'); values.push(bank_name || null); }
    if (bank_account !== undefined) { updates.push('bank_account = ?'); values.push(bank_account || null); }
    if (bank_ifsc !== undefined) { updates.push('bank_ifsc = ?'); values.push(bank_ifsc || null); }
    if (bank_holder !== undefined) { updates.push('bank_holder = ?'); values.push(bank_holder || null); }
    if (wallet_address !== undefined) { updates.push('wallet_address = ?'); values.push(wallet_address || null); }
    if (wallet_network !== undefined) { updates.push('wallet_network = ?'); values.push(wallet_network || null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
    if (daily_limit !== undefined) { updates.push('daily_limit = ?'); values.push(daily_limit || null); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(req.params.id);

    const [result] = await db.pool.query(
      `UPDATE payment_accounts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Payment account not found' });
    }

    res.json({ success: true, message: 'Payment account updated' });
  } catch (error) {
    console.error('Update payment account error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment account' });
  }
});

// Delete payment account
router.delete('/payment-accounts/:id', async (req, res) => {
  try {
    // Check if account was used in any orders
    const [usage] = await db.pool.query(
      'SELECT usage_count FROM payment_accounts WHERE id = ?',
      [req.params.id]
    );

    if (usage.length > 0 && usage[0].usage_count > 0) {
      // Deactivate instead of delete
      await db.pool.query(
        'UPDATE payment_accounts SET is_active = FALSE WHERE id = ?',
        [req.params.id]
      );
      return res.json({
        success: true,
        message: 'Payment account has been used and was deactivated instead of deleted'
      });
    }

    const [result] = await db.pool.query(
      'DELETE FROM payment_accounts WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Payment account not found' });
    }

    res.json({ success: true, message: 'Payment account deleted' });
  } catch (error) {
    console.error('Delete payment account error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete payment account' });
  }
});

// ============ INVESTMENTS MANAGEMENT ============

// Get admin investment stats
router.get('/investment-stats', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const stats = await investService.getAdminInvestmentStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get investment stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get investment stats' });
  }
});

// Get admin investments list (paginated)
router.get('/investments', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.tier_id) filters.tier_id = req.query.tier_id;
    if (req.query.username) filters.username = req.query.username;

    const result = await investService.getAdminInvestments(page, limit, filters);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get admin investments error:', error);
    res.status(500).json({ success: false, message: 'Failed to get investments' });
  }
});

// Get full platform metrics history (admin)
router.get('/platform-metrics', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const days = parseInt(req.query.days) || 90;
    const history = await investService.getAdminMetricsHistory(days);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get platform metrics error:', error);
    res.status(500).json({ success: false, message: 'Failed to get platform metrics' });
  }
});

// Update invest_* settings
router.put('/investment-settings', async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Settings object is required' });
    }

    const validKeys = [
      'invest_enabled', 'invest_min_amount', 'invest_max_amount',
      'invest_max_per_user', 'invest_base_rate_min', 'invest_base_rate_max',
      'invest_early_withdraw_penalty', 'invest_growth_score_weights'
    ];

    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
      if (validKeys.includes(key)) {
        await db.pool.query(
          `UPDATE settings SET setting_value = ? WHERE setting_key = ?`,
          [value.toString(), key]
        );
        updates.push(key);
      }
    }

    res.json({ success: true, message: `Updated ${updates.length} settings`, data: { updatedKeys: updates } });
  } catch (error) {
    console.error('Update investment settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update investment settings' });
  }
});

// Update investment tier
router.put('/investment-tiers/:id', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const updated = await investService.updateTier(parseInt(req.params.id), req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Tier not found' });
    }
    res.json({ success: true, message: 'Tier updated' });
  } catch (error) {
    console.error('Update tier error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update tier' });
  }
});

// Create investment tier
router.post('/investment-tiers', async (req, res) => {
  try {
    const { name, slug, lock_days, multiplier } = req.body;
    if (!name || !slug || !lock_days || !multiplier) {
      return res.status(400).json({ success: false, message: 'name, slug, lock_days, and multiplier are required' });
    }
    const investService = req.app.get('investService');
    const result = await investService.createTier(req.body);
    res.json({ success: true, message: 'Tier created', data: result });
  } catch (error) {
    console.error('Create tier error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create tier' });
  }
});

// Get all tiers (admin - includes inactive)
router.get('/investment-tiers', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const tiers = await investService.getAllTiers();
    res.json({ success: true, data: tiers });
  } catch (error) {
    console.error('Get tiers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get tiers' });
  }
});

// Toggle account active status
router.post('/payment-accounts/:id/toggle', async (req, res) => {
  try {
    const [result] = await db.pool.query(
      'UPDATE payment_accounts SET is_active = NOT is_active WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Payment account not found' });
    }

    // Get updated status
    const [accounts] = await db.pool.query(
      'SELECT is_active FROM payment_accounts WHERE id = ?',
      [req.params.id]
    );

    res.json({
      success: true,
      message: `Payment account ${accounts[0].is_active ? 'activated' : 'deactivated'}`,
      data: { is_active: accounts[0].is_active }
    });
  } catch (error) {
    console.error('Toggle payment account error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle payment account' });
  }
});

// Reset daily usage (can be called manually or by cron)
router.post('/payment-accounts/reset-daily', async (req, res) => {
  try {
    await db.pool.query('UPDATE payment_accounts SET daily_used = 0');
    res.json({ success: true, message: 'Daily usage reset for all accounts' });
  } catch (error) {
    console.error('Reset daily usage error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset daily usage' });
  }
});

// ── Analytics / Tracking ──

// Dashboard overview
router.get('/tracking/dashboard', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const days = parseInt(req.query.days) || 30;
    const data = await trackingService.getDashboardStats(days);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Tracking dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to get tracking dashboard' });
  }
});

// Event log
router.get('/tracking/events', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const filters = {
      userId: req.query.userId || null,
      eventType: req.query.eventType || null,
      sessionId: req.query.sessionId || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    };
    const data = await trackingService.getEvents(page, limit, filters);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Tracking events error:', error);
    res.status(500).json({ success: false, message: 'Failed to get tracking events' });
  }
});

// Session list
router.get('/tracking/sessions', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const data = await trackingService.getSessions(page, limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Tracking sessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get tracking sessions' });
  }
});

// User activity
router.get('/tracking/user/:id', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const page = parseInt(req.query.page) || 1;
    const data = await trackingService.getUserActivity(req.params.id, page);
    res.json({ success: true, data });
  } catch (error) {
    console.error('User tracking error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user activity' });
  }
});

// Top pages
router.get('/tracking/pages', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const days = parseInt(req.query.days) || 30;
    const data = await trackingService.getTopPages(days);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Tracking pages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get page analytics' });
  }
});

// Event type breakdown
router.get('/tracking/event-breakdown', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const days = parseInt(req.query.days) || 30;
    const data = await trackingService.getEventBreakdown(days);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Event breakdown error:', error);
    res.status(500).json({ success: false, message: 'Failed to get event breakdown' });
  }
});

// Top clicked elements
router.get('/tracking/top-clicks', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const days = parseInt(req.query.days) || 30;
    const data = await trackingService.getTopClicks(days);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Top clicks error:', error);
    res.status(500).json({ success: false, message: 'Failed to get top clicks' });
  }
});

// Scroll & time-on-page stats
router.get('/tracking/scroll-stats', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const days = parseInt(req.query.days) || 30;
    const data = await trackingService.getScrollStats(days);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Scroll stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get scroll stats' });
  }
});

// User activity summary (for user detail modal)
router.get('/tracking/user/:id/summary', async (req, res) => {
  try {
    const trackingService = req.app.get('trackingService');
    const data = await trackingService.getUserSummary(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error('User summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user summary' });
  }
});

// Realtime stats
router.get('/tracking/realtime', async (req, res) => {
  try {
    const [stats] = await db.pool.query(
      `SELECT COUNT(*) as active_sessions, COUNT(DISTINCT user_id) as active_users
       FROM user_sessions WHERE is_active = TRUE AND started_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    const [recentEvents] = await db.pool.query(
      `SELECT event_type, COUNT(*) as count
       FROM user_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
       GROUP BY event_type`
    );
    res.json({ success: true, data: { ...stats[0], recentEvents } });
  } catch (error) {
    console.error('Realtime stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get realtime stats' });
  }
});

// ── Prediction (admin schedule + Telegram broadcast module) ──

router.get('/predictions/schedule', async (req, res) => {
  try {
    const svc = req.app.get('predictionService');
    if (!svc) return res.status(500).json({ success: false, message: 'predictionService unavailable' });
    const [config, defaults] = await Promise.all([
      svc.getScheduleConfig(),
      Promise.resolve(svc.getDefaultScheduleConfig()),
    ]);
    res.json({ success: true, data: { config, defaults } });
  } catch (error) {
    console.error('Get prediction schedule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/predictions/schedule', async (req, res) => {
  try {
    const svc = req.app.get('predictionService');
    if (!svc) return res.status(500).json({ success: false, message: 'predictionService unavailable' });
    const saved = await svc.setScheduleConfig(req.body?.config || req.body || {});
    res.json({ success: true, data: { config: saved } });
  } catch (error) {
    console.error('Save prediction schedule error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/predictions/schedule/test/:slotIndex', async (req, res) => {
  try {
    const svc = req.app.get('predictionService');
    if (!svc) return res.status(500).json({ success: false, message: 'predictionService unavailable' });
    const idx = parseInt(req.params.slotIndex, 10);
    // Fire and forget — the slot run includes async waits up to ~minute. We
    // ack immediately so the UI doesn't hang; logs trace progress.
    svc.triggerSlotNow(idx).catch((err) => {
      console.error(`[PRED] Manual trigger of slot ${idx} failed:`, err.message);
    });
    res.json({ success: true, data: { slotIndex: idx, queued: true } });
  } catch (error) {
    console.error('Trigger prediction slot error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/predictions/smm-master', async (req, res) => {
  try {
    const svc = req.app.get('predictionService');
    if (!svc) return res.status(500).json({ success: false, message: 'predictionService unavailable' });
    const enabled = await svc.getSmmEnabled();
    res.json({ success: true, data: { enabled } });
  } catch (error) {
    console.error('Get prediction SMM master error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/predictions/smm-master', async (req, res) => {
  try {
    const svc = req.app.get('predictionService');
    if (!svc) return res.status(500).json({ success: false, message: 'predictionService unavailable' });
    const { enabled } = req.body || {};
    const saved = await svc.setSmmEnabled(!!enabled);
    res.json({ success: true, data: { enabled: saved } });
  } catch (error) {
    console.error('Set prediction SMM master error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/predictions/log', async (req, res) => {
  try {
    const svc = req.app.get('predictionService');
    if (!svc) return res.status(500).json({ success: false, message: 'predictionService unavailable' });
    const game = req.query.game || null;
    const cardCountType = req.query.type ? parseInt(req.query.type, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const data = await svc.getRecentLog({ game, cardCountType, limit });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get prediction log error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
