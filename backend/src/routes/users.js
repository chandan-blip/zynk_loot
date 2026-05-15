const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Search users by username or email (for transfers)
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || query.length < 2) {
      return res.json({ success: true, data: { users: [] } });
    }

    // Search for users matching the query, excluding the current user
    const [users] = await db.pool.query(
      `SELECT id, username, email
       FROM users
       WHERE (username LIKE ? OR email LIKE ?)
         AND id != ?
         AND role = 'user'
       ORDER BY username ASC
       LIMIT 10`,
      [`%${query}%`, `%${query}%`, req.user.id]
    );

    // Mask email for privacy (show first 3 chars + domain)
    const maskedUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email.replace(/^(.{3})(.*)(@.*)$/, '$1***$3')
    }));

    res.json({ success: true, data: { users: maskedUsers } });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: 'Failed to search users' });
  }
});

// Get current user's full profile with stats
router.get('/me/profile', async (req, res) => {
  try {
    // Get user basic info
    const [users] = await db.pool.query(
      `SELECT id, username, email, balance, total_spent, total_earned, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    // Get numbers owned count
    const [[numbersOwned]] = await db.pool.query(
      'SELECT COUNT(*) as count FROM numbers WHERE owner_id = ?',
      [req.user.id]
    );

    // Get total votes cast
    const [[votesCast]] = await db.pool.query(
      'SELECT COALESCE(SUM(vote_count), 0) as count FROM votes WHERE user_id = ?',
      [req.user.id]
    );

    // Get wins count and total winnings
    const [[winStats]] = await db.pool.query(
      `SELECT COUNT(*) as wins, COALESCE(SUM(prize_amount), 0) as total_winnings
       FROM winners WHERE user_id = ?`,
      [req.user.id]
    );

    // Get transaction stats
    const [[txStats]] = await db.pool.query(
      `SELECT
         COUNT(*) as total_transactions,
         COUNT(CASE WHEN type = 'deposit' THEN 1 END) as deposits,
         COUNT(CASE WHEN type = 'withdrawal' THEN 1 END) as withdrawals,
         COUNT(CASE WHEN type = 'transfer_out' THEN 1 END) as transfers_sent,
         COUNT(CASE WHEN type = 'transfer_in' THEN 1 END) as transfers_received
       FROM transactions WHERE user_id = ?`,
      [req.user.id]
    );

    // Get recent activity (last 5 transactions)
    const [recentActivity] = await db.pool.query(
      `SELECT type, amount, description, created_at
       FROM transactions WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 5`,
      [req.user.id]
    );

    // Get user's numbers
    const [myNumbers] = await db.pool.query(
      `SELECT number, total_votes, times_won, created_at
       FROM numbers WHERE owner_id = ?
       ORDER BY total_votes DESC LIMIT 10`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          balance: parseFloat(user.balance),
          totalSpent: parseFloat(user.total_spent),
          totalEarned: parseFloat(user.total_earned),
          joinedAt: user.created_at
        },
        stats: {
          numbersOwned: numbersOwned.count,
          votesCast: parseInt(votesCast.count),
          wins: winStats.wins,
          totalWinnings: parseFloat(winStats.total_winnings),
          totalTransactions: txStats.total_transactions,
          deposits: txStats.deposits,
          withdrawals: txStats.withdrawals,
          transfersSent: txStats.transfers_sent,
          transfersReceived: txStats.transfers_received
        },
        recentActivity,
        myNumbers
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Paginated transaction activity for the current user.
// Used by the Profile → Activity tab so the user can scroll back through
// every transaction, not just the latest 5 returned by /profile.
router.get('/activity', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // Optional type filter — used by Profile → History dropdown. Whitelisted
    // server-side so a hand-crafted query can't inject SQL via the type col.
    const ALLOWED_TYPES = new Set([
      'deposit', 'withdrawal', 'purchase', 'sale', 'vote', 'prize', 'refund',
      'transfer_in', 'transfer_out', 'cashout', 'referral_commission',
      'invest', 'invest_return', 'invest_withdraw',
      'game_bet', 'game_win', 'bonus',
    ]);
    const typeFilter = ALLOWED_TYPES.has(req.query.type) ? req.query.type : null;

    // History is a UNION of two sources:
    //   1. `transactions` — the canonical settled ledger.
    //   2. `zynk_orders` rows whose status is NOT completed/approved — those
    //      represent pending/awaiting/rejected/refunded/failed deposit attempts
    //      that don't yet have a `transactions` row (the row is only written
    //      when admin approves the order). Without UNIONing them, users see
    //      a blank history right after deposit, which looks broken.
    // Approved/completed orders are already mirrored into `transactions`
    // (admin.js inserts a 'deposit' row at approval time), so we exclude
    // those from the UNION to avoid duplicate rows.
    const ORDER_VISIBLE_STATUSES = ['pending', 'awaiting_approval', 'rejected', 'refunded', 'failed'];
    const orderStatusPlaceholders = ORDER_VISIBLE_STATUSES.map(() => '?').join(',');

    // Build the transactions SELECT (with optional type filter)
    const txWhere = typeFilter ? 'WHERE user_id = ? AND type = ?' : 'WHERE user_id = ?';
    const txWhereParams = typeFilter ? [req.user.id, typeFilter] : [req.user.id];

    // Only include zynk_orders when the filter is unset or explicitly 'deposit'
    const includeOrders = !typeFilter || typeFilter === 'deposit';
    const orderWhereParams = includeOrders
      ? [req.user.id, ...ORDER_VISIBLE_STATUSES]
      : [];

    const subqueries = [
      `SELECT id, type, amount, description, created_at, NULL AS status
         FROM transactions ${txWhere}`,
    ];
    if (includeOrders) {
      subqueries.push(
        `SELECT id, 'deposit' AS type, zynk_amount AS amount,
                CONCAT('Deposit ', status) AS description,
                created_at, status
           FROM zynk_orders
          WHERE user_id = ? AND status IN (${orderStatusPlaceholders})`
      );
    }

    const unionSql = subqueries.length > 1
      ? `(${subqueries.join(') UNION ALL (')})`
      : subqueries[0];

    const baseParams = [...txWhereParams, ...orderWhereParams];

    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM (${unionSql}) AS u`,
      baseParams
    );

    const [items] = await db.pool.query(
      `SELECT * FROM (${unionSql}) AS u
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    res.json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        type: typeFilter,
      },
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to load activity' });
  }
});

// Get user profile by ID (limited info for transfers)
router.get('/:id/profile', async (req, res) => {
  try {
    const [users] = await db.pool.query(
      `SELECT id, username, created_at
       FROM users
       WHERE id = ? AND role = 'user'`,
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: { user: users[0] } });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile' });
  }
});

module.exports = router;
