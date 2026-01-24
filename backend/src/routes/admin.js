const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard stats
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
       LIMIT ${limit} OFFSET ${offset}`
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
      `SELECT * FROM daily_draws ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
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

// Get draw winners
router.get('/draws/:periodId/winners', async (req, res) => {
  try {
    const [winners] = await db.pool.query(
      `SELECT w.*, u.username, n.number
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

// Get all winners (with pagination)
router.get('/winners', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [winners] = await db.pool.query(
      `SELECT w.id, w.period_id, w.matching_digits, w.prize_amount, w.created_at,
              u.username, u.email, n.number,
              d.winning_number, d.draw_date
       FROM winners w
       JOIN users u ON w.user_id = u.id
       JOIN numbers n ON w.number_id = n.id
       JOIN daily_draws d ON w.draw_id = d.id
       ORDER BY w.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );

    const [countResult] = await db.pool.query('SELECT COUNT(*) as total FROM winners');

    // Get summary stats
    const [stats] = await db.pool.query(
      `SELECT
         COUNT(*) as totalWinners,
         SUM(prize_amount) as totalPrizesPaid,
         COUNT(CASE WHEN matching_digits = 7 THEN 1 END) as jackpotWinners,
         MAX(prize_amount) as biggestPrize
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
          biggestPrize: parseFloat(stats[0].biggestPrize || 0)
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
       LIMIT ${limit} OFFSET ${offset}`
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

    query += ` ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

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

    query += ` ORDER BY zo.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

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
      'SELECT * FROM zynk_orders WHERE id = ? AND status = ? FOR UPDATE',
      [req.params.id, 'pending']
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
      [order.user_id, order.zynk_amount, currentBalance, newBalance, order.id, `Deposit approved - ${order.zynk_amount} Zynk added`]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Deposit approved and Zynk added to user balance',
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
    const [result] = await db.pool.query(
      `UPDATE zynk_orders SET status = 'failed' WHERE id = ? AND status = 'pending'`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found or already processed' });
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

    query += ` ORDER BY w.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

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
      return res.status(400).json({ success: false, message: 'Name, Zynk amount, and price are required' });
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

// ============ EXCHANGE RATES MANAGEMENT ============
// Now using live rates from free API (Frankfurter/ExchangeRate-API)

const exchangeRateService = require('../services/exchangeRateService');

// Get Zynk to USD rate from settings
router.get('/zynk-rate', async (req, res) => {
  try {
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'zynk_to_usd'"
    );
    const rate = parseFloat(settings[0]?.setting_value || 0.1);
    res.json({ success: true, data: { zynkToUsd: rate } });
  } catch (error) {
    console.error('Get zynk rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to get Zynk rate' });
  }
});

// Update Zynk to USD rate
router.put('/zynk-rate', async (req, res) => {
  try {
    const { rate } = req.body;
    if (!rate || rate <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid rate' });
    }

    // Check if setting exists, insert or update
    const [existing] = await db.pool.query(
      "SELECT id FROM settings WHERE setting_key = 'zynk_to_usd'"
    );

    if (existing.length > 0) {
      await db.pool.query(
        "UPDATE settings SET setting_value = ? WHERE setting_key = 'zynk_to_usd'",
        [rate.toString()]
      );
    } else {
      await db.pool.query(
        "INSERT INTO settings (setting_key, setting_value, description) VALUES ('zynk_to_usd', ?, 'Zynk to USD exchange rate')",
        [rate.toString()]
      );
    }

    res.json({ success: true, message: 'Zynk rate updated', data: { zynkToUsd: rate } });
  } catch (error) {
    console.error('Update zynk rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to update Zynk rate' });
  }
});

// Get all exchange rates (live from API)
router.get('/exchange-rates', async (req, res) => {
  try {
    // Get Zynk to USD rate from settings
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'zynk_to_usd'"
    );
    const zynkToUsd = parseFloat(settings[0]?.setting_value || 0.1);

    // Get live rates from free API
    const currencyData = await exchangeRateService.getCurrencyList(zynkToUsd);

    res.json({
      success: true,
      data: {
        zynkToUsd: currencyData.zynkToUsd,
        rates: currencyData.rates,
        source: currencyData.source,
        updated: currencyData.updated
      }
    });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to get exchange rates' });
  }
});

// Refresh exchange rates cache
router.post('/exchange-rates/refresh', async (req, res) => {
  try {
    exchangeRateService.clearCache();

    // Get Zynk to USD rate
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'zynk_to_usd'"
    );
    const zynkToUsd = parseFloat(settings[0]?.setting_value || 0.1);

    // Fetch fresh rates
    const currencyData = await exchangeRateService.getCurrencyList(zynkToUsd);

    res.json({
      success: true,
      message: 'Exchange rates refreshed',
      data: {
        zynkToUsd: currencyData.zynkToUsd,
        rates: currencyData.rates,
        source: currencyData.source,
        updated: currencyData.updated
      }
    });
  } catch (error) {
    console.error('Refresh rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to refresh rates' });
  }
});

// Convert Zynk to currency (utility endpoint)
router.get('/convert', async (req, res) => {
  try {
    const { amount, to } = req.query;

    if (!amount || !to) {
      return res.status(400).json({ success: false, message: 'Amount and currency code required' });
    }

    const zynkAmount = parseFloat(amount);
    if (isNaN(zynkAmount) || zynkAmount < 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // Get Zynk to USD rate
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'zynk_to_usd'"
    );
    const zynkToUsd = parseFloat(settings[0]?.setting_value || 0.1);

    // Get live rates
    const currencyData = await exchangeRateService.getCurrencyList(zynkToUsd);
    const targetCurrency = currencyData.rates.find(r => r.currency_code === to.toUpperCase());

    if (!targetCurrency) {
      return res.status(404).json({ success: false, message: 'Currency not found' });
    }

    // Convert using rate_from_zynk (how many units of target currency = 1 Zynk)
    const targetAmount = zynkAmount * targetCurrency.rate_from_zynk;
    const precision = targetCurrency.decimal_precision;
    const roundedAmount = Math.round(targetAmount * Math.pow(10, precision)) / Math.pow(10, precision);

    res.json({
      success: true,
      data: {
        input: { amount: zynkAmount, currency: 'Z' },
        output: { amount: roundedAmount, currency: targetCurrency.currency_code, symbol: targetCurrency.currency_symbol },
        rateFromZynk: targetCurrency.rate_from_zynk,
        zynkToUsd
      }
    });
  } catch (error) {
    console.error('Convert error:', error);
    res.status(500).json({ success: false, message: 'Conversion failed' });
  }
});

// ============ ZYNK ORDERS MANAGEMENT ============

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
    await connection.execute(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
       VALUES (?, 'deposit', ?, ?, ?, 'admin', ?, ?)`,
      [order.user_id, totalZynk, currentBalance, newBalance, order.id, `Purchased ${totalZynk} Zynk (Order #${order.id})`]
    );

    await connection.commit();

    // Notify user via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${order.user_id}`).emit('order_approved', {
        orderId: order.id,
        zynkAmount: totalZynk,
        newBalance
      });
    }

    res.json({
      success: true,
      message: `Order approved. ${totalZynk} Zynk credited to user.`,
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

    // Notify user via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${orders[0].user_id}`).emit('order_rejected', {
        orderId: orders[0].id,
        reason: note
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

module.exports = router;
