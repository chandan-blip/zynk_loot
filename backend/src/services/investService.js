const db = require('../config/database');

class InvestService {
  constructor(io = null) {
    this.io = io;
  }

  // Create a new investment
  async invest(userId, amount, tierId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Check if investing is enabled
      const [enabledSetting] = await connection.execute(
        "SELECT setting_value FROM settings WHERE setting_key = 'invest_enabled'"
      );
      if (enabledSetting.length > 0 && enabledSetting[0].setting_value === 'false') {
        throw new Error('Investments are currently disabled');
      }

      // Get tier info
      const [tiers] = await connection.execute(
        'SELECT * FROM investment_tiers WHERE id = ? AND is_active = TRUE',
        [tierId]
      );
      if (tiers.length === 0) {
        throw new Error('Invalid or inactive investment tier');
      }
      const tier = tiers[0];

      // Validate amount against tier limits
      if (amount < parseFloat(tier.min_amount)) {
        throw new Error(`Minimum investment for ${tier.name} tier is ${tier.min_amount} Z`);
      }
      if (amount > parseFloat(tier.max_amount)) {
        throw new Error(`Maximum investment for ${tier.name} tier is ${tier.max_amount} Z`);
      }

      // Get settings for per-user max
      const [maxSetting] = await connection.execute(
        "SELECT setting_value FROM settings WHERE setting_key = 'invest_max_per_user'"
      );
      const maxPerUser = parseFloat(maxSetting[0]?.setting_value || 500000);

      // Check user's total active investments
      const [activeTotal] = await connection.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM investments WHERE user_id = ? AND status IN ('active', 'matured')",
        [userId]
      );
      if (parseFloat(activeTotal[0].total) + amount > maxPerUser) {
        throw new Error(`Total investments cannot exceed ${maxPerUser} Z`);
      }

      // Lock user row and check balance
      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) {
        throw new Error('User not found');
      }
      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const newBalance = currentBalance - amount;
      const lockedUntil = new Date();
      lockedUntil.setDate(lockedUntil.getDate() + tier.lock_days);

      // Deduct balance
      await connection.execute(
        'UPDATE users SET balance = ?, total_invested = total_invested + ? WHERE id = ?',
        [newBalance, amount, userId]
      );

      // Create investment
      const [investResult] = await connection.execute(
        `INSERT INTO investments (user_id, tier_id, amount, status, current_value, locked_until)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        [userId, tierId, amount, amount, lockedUntil]
      );

      // Record transaction
      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'invest', ?, ?, ?, 'investment', ?, ?)`,
        [userId, amount, currentBalance, newBalance, investResult.insertId,
         `Invested ${amount} Z in ${tier.name} tier (${tier.lock_days} days)`]
      );

      await connection.commit();

      if (this.io) {
        this.io.to(`user:${userId}`).emit('investment:created', {
          investmentId: investResult.insertId,
          amount,
          tier: tier.name,
          lockedUntil
        });
      }

      return {
        investmentId: investResult.insertId,
        amount,
        tier: tier.name,
        lockedUntil,
        newBalance
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Withdraw an investment
  async withdrawInvestment(userId, investmentId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Lock investment row
      const [investments] = await connection.execute(
        `SELECT i.*, t.name as tier_name, t.lock_days
         FROM investments i
         JOIN investment_tiers t ON i.tier_id = t.id
         WHERE i.id = ? AND i.user_id = ? AND i.status IN ('active', 'matured')
         FOR UPDATE`,
        [investmentId, userId]
      );

      if (investments.length === 0) {
        throw new Error('Investment not found or already withdrawn');
      }

      const investment = investments[0];
      const now = new Date();
      const lockedUntil = new Date(investment.locked_until);
      const isEarly = now < lockedUntil;

      let withdrawAmount = parseFloat(investment.current_value);

      // Apply early withdrawal penalty
      if (isEarly) {
        const [penaltySetting] = await connection.execute(
          "SELECT setting_value FROM settings WHERE setting_key = 'invest_early_withdraw_penalty'"
        );
        const penaltyRate = parseFloat(penaltySetting[0]?.setting_value || 0.10);
        const penalty = withdrawAmount * penaltyRate;
        withdrawAmount = parseFloat((withdrawAmount - penalty).toFixed(2));
      }

      // Lock user row
      const [users] = await connection.execute(
        'SELECT balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      const currentBalance = parseFloat(users[0].balance);
      const newBalance = currentBalance + withdrawAmount;
      const totalReturns = parseFloat(investment.total_returns);

      // Credit user balance
      await connection.execute(
        'UPDATE users SET balance = ?, total_invest_returns = total_invest_returns + ? WHERE id = ?',
        [newBalance, totalReturns, userId]
      );

      // Update investment status
      await connection.execute(
        `UPDATE investments SET status = 'withdrawn', withdrawn_at = NOW() WHERE id = ?`,
        [investmentId]
      );

      // Record transaction
      const description = isEarly
        ? `Withdrew investment #${investmentId} early (penalty applied): ${withdrawAmount} Z`
        : `Withdrew investment #${investmentId}: ${withdrawAmount} Z (includes ${totalReturns} Z returns)`;

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'invest_withdraw', ?, ?, ?, 'investment', ?, ?)`,
        [userId, withdrawAmount, currentBalance, newBalance, investmentId, description]
      );

      await connection.commit();

      if (this.io) {
        this.io.to(`user:${userId}`).emit('investment:withdrawn', {
          investmentId,
          amount: withdrawAmount,
          earlyWithdrawal: isEarly
        });
      }

      return {
        investmentId,
        withdrawAmount,
        earlyWithdrawal: isEarly,
        newBalance
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get user's portfolio
  async getPortfolio(userId) {
    const [investments] = await db.pool.query(
      `SELECT i.*, t.name as tier_name, t.slug as tier_slug, t.lock_days, t.multiplier
       FROM investments i
       JOIN investment_tiers t ON i.tier_id = t.id
       WHERE i.user_id = ?
       ORDER BY i.invested_at DESC`,
      [userId]
    );

    const now = new Date();
    return investments.map(inv => {
      const lockedUntil = new Date(inv.locked_until);
      const investedAt = new Date(inv.invested_at);
      const totalDays = inv.lock_days;
      const elapsedMs = now - investedAt;
      const elapsedDays = Math.floor(elapsedMs / 86400000);
      const daysRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 86400000));
      const progress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

      return {
        id: inv.id,
        amount: parseFloat(inv.amount),
        currentValue: parseFloat(inv.current_value),
        totalReturns: parseFloat(inv.total_returns),
        status: inv.status,
        tierName: inv.tier_name,
        tierSlug: inv.tier_slug,
        multiplier: parseFloat(inv.multiplier),
        lockDays: totalDays,
        daysRemaining,
        progress,
        investedAt: inv.invested_at,
        lockedUntil: inv.locked_until,
        maturedAt: inv.matured_at,
        withdrawnAt: inv.withdrawn_at
      };
    });
  }

  // Get user investment stats
  async getInvestmentStats(userId) {
    const [stats] = await db.pool.query(
      `SELECT
         COUNT(CASE WHEN status = 'active' THEN 1 END) as activeCount,
         COALESCE(SUM(CASE WHEN status IN ('active','matured') THEN amount ELSE 0 END), 0) as totalInvested,
         COALESCE(SUM(CASE WHEN status IN ('active','matured') THEN current_value ELSE 0 END), 0) as totalCurrentValue,
         COALESCE(SUM(total_returns), 0) as totalReturns
       FROM investments
       WHERE user_id = ?`,
      [userId]
    );

    return {
      activeCount: stats[0].activeCount || 0,
      totalInvested: parseFloat(stats[0].totalInvested),
      totalCurrentValue: parseFloat(stats[0].totalCurrentValue),
      totalReturns: parseFloat(stats[0].totalReturns)
    };
  }

  // Get active tiers
  async getTiers() {
    const [tiers] = await db.pool.query(
      'SELECT * FROM investment_tiers WHERE is_active = TRUE ORDER BY sort_order ASC'
    );
    return tiers;
  }

  // Get latest platform metrics (public-safe subset)
  async getPlatformMetrics() {
    const [metrics] = await db.pool.query(
      `SELECT metric_date, growth_score, base_daily_rate, total_users, active_users_today, new_users_today
       FROM platform_metrics
       ORDER BY metric_date DESC LIMIT 1`
    );
    return metrics.length > 0 ? metrics[0] : null;
  }

  // Get platform growth history for charts
  async getPlatformGrowthHistory(days = 30) {
    const [history] = await db.pool.query(
      `SELECT metric_date, growth_score, base_daily_rate
       FROM platform_metrics
       ORDER BY metric_date DESC LIMIT ?`,
      [days]
    );
    return history.reverse();
  }

  // Cron: Snapshot daily platform metrics and compute growth score
  async snapshotDailyMetrics() {
    const today = new Date().toISOString().slice(0, 10);

    // Gather platform stats
    const [[userStats]] = await db.pool.query(
      'SELECT COUNT(*) as total_users FROM users WHERE is_admin = 0'
    );
    const [[newUsers]] = await db.pool.query(
      'SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURDATE() AND is_admin = 0'
    );
    const [[activeTx]] = await db.pool.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM transactions WHERE DATE(created_at) = CURDATE()`
    );
    const [[txStats]] = await db.pool.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as volume FROM transactions WHERE DATE(created_at) = CURDATE()`
    );
    const [[drawStats]] = await db.pool.query(
      'SELECT COUNT(*) as total FROM daily_draws WHERE DATE(created_at) = CURDATE()'
    );
    const [[poolStats]] = await db.pool.query(
      'SELECT COALESCE(SUM(total_pool), 0) as total FROM daily_draws WHERE DATE(created_at) = CURDATE()'
    );
    const [[investStats]] = await db.pool.query(
      `SELECT COALESCE(SUM(current_value), 0) as total_invested, COUNT(*) as active_count
       FROM investments WHERE status = 'active'`
    );

    // Get yesterday's metrics for growth comparison
    const [yesterdayMetrics] = await db.pool.query(
      'SELECT * FROM platform_metrics WHERE metric_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)'
    );
    const yesterday = yesterdayMetrics.length > 0 ? yesterdayMetrics[0] : null;

    // Load weights from settings
    const [weightsSetting] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'invest_growth_score_weights'"
    );
    let weights = { user_growth: 0.30, tx_volume: 0.30, active_users: 0.25, pool: 0.15 };
    try {
      if (weightsSetting.length > 0) {
        weights = JSON.parse(weightsSetting[0].setting_value);
      }
    } catch (e) { /* use defaults */ }

    // Compute growth score components (0-100 each)
    const totalUsers = userStats.total_users || 1;
    const newUsersCount = newUsers.count || 0;
    const activeUsersCount = activeTx.count || 0;
    const txVolume = parseFloat(txStats.volume) || 0;
    const poolToday = parseFloat(poolStats.total) || 0;

    // User growth: ratio of new users to total (capped)
    const userGrowthRaw = Math.min((newUsersCount / Math.max(totalUsers, 1)) * 1000, 100);

    // Tx volume: compare to yesterday (growth rate)
    let txVolumeScore = 50; // neutral if no yesterday
    if (yesterday && parseFloat(yesterday.transaction_volume) > 0) {
      const growth = txVolume / parseFloat(yesterday.transaction_volume);
      txVolumeScore = Math.min(growth * 50, 100);
    } else if (txVolume > 0) {
      txVolumeScore = 60;
    }

    // Active users: ratio of active to total
    const activeRatio = Math.min((activeUsersCount / Math.max(totalUsers, 1)) * 200, 100);

    // Pool: compare to yesterday
    let poolScore = 50;
    if (yesterday && parseFloat(yesterday.total_pool_today) > 0) {
      const growth = poolToday / parseFloat(yesterday.total_pool_today);
      poolScore = Math.min(growth * 50, 100);
    } else if (poolToday > 0) {
      poolScore = 60;
    }

    const growthScore = parseFloat((
      userGrowthRaw * weights.user_growth +
      txVolumeScore * weights.tx_volume +
      activeRatio * weights.active_users +
      poolScore * weights.pool
    ).toFixed(2));

    // Map growth score to daily rate
    const [minRateSetting] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'invest_base_rate_min'"
    );
    const [maxRateSetting] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'invest_base_rate_max'"
    );
    const minRate = parseFloat(minRateSetting[0]?.setting_value || 0.001);
    const maxRate = parseFloat(maxRateSetting[0]?.setting_value || 0.01);
    const baseDailyRate = parseFloat((minRate + (growthScore / 100) * (maxRate - minRate)).toFixed(6));

    // Upsert metrics
    await db.pool.query(
      `INSERT INTO platform_metrics
       (metric_date, total_users, new_users_today, active_users_today, total_transactions, transaction_volume, total_draws, total_pool_today, total_invested, active_investments, growth_score, base_daily_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_users = VALUES(total_users),
         new_users_today = VALUES(new_users_today),
         active_users_today = VALUES(active_users_today),
         total_transactions = VALUES(total_transactions),
         transaction_volume = VALUES(transaction_volume),
         total_draws = VALUES(total_draws),
         total_pool_today = VALUES(total_pool_today),
         total_invested = VALUES(total_invested),
         active_investments = VALUES(active_investments),
         growth_score = VALUES(growth_score),
         base_daily_rate = VALUES(base_daily_rate)`,
      [today, totalUsers, newUsersCount, activeUsersCount,
       txStats.total, txVolume, drawStats.total, poolToday,
       investStats.total_invested, investStats.active_count,
       growthScore, baseDailyRate]
    );

    console.log(`[INVEST] Daily metrics snapshot: score=${growthScore}, rate=${baseDailyRate}`);
    return { growthScore, baseDailyRate, date: today };
  }

  // Cron: Calculate and distribute daily returns for all active investments
  async calculateDailyReturns() {
    const today = new Date().toISOString().slice(0, 10);

    // Get all active investments with tier info (including per-tier daily_rate)
    const [investments] = await db.pool.query(
      `SELECT i.*, t.multiplier, t.lock_days, t.daily_rate
       FROM investments i
       JOIN investment_tiers t ON i.tier_id = t.id
       WHERE i.status = 'active'`
    );

    // Fallback: use growth-score base rate only if a tier has no fixed daily_rate
    let baseRate = null;
    const needsFallback = investments.some(inv => inv.daily_rate == null);
    if (needsFallback) {
      const [[metrics]] = await db.pool.query(
        'SELECT base_daily_rate FROM platform_metrics WHERE metric_date = ?',
        [today]
      );
      baseRate = metrics ? parseFloat(metrics.base_daily_rate) : 0;
    }

    let processed = 0;
    let totalDistributed = 0;

    for (const inv of investments) {
      try {
        // Use admin-set daily_rate if available, otherwise fall back to growth-based rate
        const tierMultiplier = parseFloat(inv.multiplier);
        const effectiveRate = inv.daily_rate != null
          ? parseFloat(inv.daily_rate)
          : parseFloat((baseRate * tierMultiplier).toFixed(6));
        const currentValue = parseFloat(inv.current_value);
        const returnAmount = parseFloat((currentValue * effectiveRate).toFixed(2));

        if (returnAmount <= 0) continue;

        const newValue = parseFloat((currentValue + returnAmount).toFixed(2));

        // Insert return record (idempotent via UNIQUE KEY)
        await db.pool.query(
          `INSERT IGNORE INTO investment_returns
           (investment_id, user_id, metric_date, base_rate, tier_multiplier, effective_rate, return_amount, value_before, value_after)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [inv.id, inv.user_id, today, inv.daily_rate != null ? effectiveRate : baseRate, tierMultiplier, effectiveRate, returnAmount, currentValue, newValue]
        );

        // Check if row was actually inserted (not duplicate)
        const [insertCheck] = await db.pool.query(
          'SELECT ROW_COUNT() as affected'
        );

        // Update investment value
        await db.pool.query(
          `UPDATE investments SET current_value = ?, total_returns = total_returns + ? WHERE id = ? AND current_value = ?`,
          [newValue, returnAmount, inv.id, currentValue]
        );

        processed++;
        totalDistributed += returnAmount;

        // Check if investment has matured
        const lockedUntil = new Date(inv.locked_until);
        if (new Date() >= lockedUntil && inv.status === 'active') {
          await db.pool.query(
            `UPDATE investments SET status = 'matured', matured_at = NOW() WHERE id = ? AND status = 'active'`,
            [inv.id]
          );
        }
      } catch (error) {
        // Skip duplicates silently (idempotent), log other errors
        if (!error.message.includes('Duplicate')) {
          console.error(`[INVEST] Error processing investment #${inv.id}:`, error.message);
        }
      }
    }

    console.log(`[INVEST] Daily returns: processed=${processed}, distributed=${totalDistributed.toFixed(2)} Z`);
    return { processed, totalDistributed, date: today };
  }

  // Get user's return history
  async getReturnHistory(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [returns] = await db.pool.query(
      `SELECT ir.*, i.amount as invest_amount, t.name as tier_name
       FROM investment_returns ir
       JOIN investments i ON ir.investment_id = i.id
       JOIN investment_tiers t ON i.tier_id = t.id
       WHERE ir.user_id = ?
       ORDER BY ir.metric_date DESC, ir.id DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const [[countResult]] = await db.pool.query(
      'SELECT COUNT(*) as total FROM investment_returns WHERE user_id = ?',
      [userId]
    );

    return {
      returns,
      pagination: {
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit)
      }
    };
  }

  // Admin: aggregate investment pool stats
  async getAdminInvestmentStats() {
    const [[stats]] = await db.pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('active','matured') THEN current_value ELSE 0 END), 0) as activeValue,
         COALESCE(SUM(CASE WHEN status IN ('active','matured') THEN amount ELSE 0 END), 0) as totalPool,
         COUNT(DISTINCT CASE WHEN status IN ('active','matured') THEN user_id END) as uniqueInvestors,
         COALESCE(SUM(total_returns), 0) as totalReturnsDistributed,
         COUNT(CASE WHEN status = 'active' THEN 1 END) as activeCount,
         COUNT(CASE WHEN status = 'matured' THEN 1 END) as maturedCount,
         COUNT(CASE WHEN status = 'withdrawn' THEN 1 END) as withdrawnCount
       FROM investments`
    );

    return {
      totalPool: parseFloat(stats.totalPool),
      activeValue: parseFloat(stats.activeValue),
      uniqueInvestors: stats.uniqueInvestors || 0,
      totalReturnsDistributed: parseFloat(stats.totalReturnsDistributed),
      activeCount: stats.activeCount || 0,
      maturedCount: stats.maturedCount || 0,
      withdrawnCount: stats.withdrawnCount || 0
    };
  }

  // Admin: paginated investments list
  async getAdminInvestments(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];

    if (filters.status) {
      where += ' AND i.status = ?';
      params.push(filters.status);
    }
    if (filters.tier_id) {
      where += ' AND i.tier_id = ?';
      params.push(filters.tier_id);
    }
    if (filters.username) {
      where += ' AND u.username LIKE ?';
      params.push(`%${filters.username}%`);
    }

    const [investments] = await db.pool.query(
      `SELECT i.*, u.username, t.name as tier_name, t.lock_days, t.multiplier
       FROM investments i
       JOIN users u ON i.user_id = u.id
       JOIN investment_tiers t ON i.tier_id = t.id
       WHERE ${where}
       ORDER BY i.invested_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[countResult]] = await db.pool.query(
      `SELECT COUNT(*) as total
       FROM investments i
       JOIN users u ON i.user_id = u.id
       WHERE ${where}`,
      params
    );

    return {
      investments,
      pagination: {
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit)
      }
    };
  }

  // Admin: full metrics history
  async getAdminMetricsHistory(days = 90) {
    const [history] = await db.pool.query(
      `SELECT * FROM platform_metrics ORDER BY metric_date DESC LIMIT ?`,
      [days]
    );
    return history.reverse();
  }

  // Admin: get all tiers (including inactive)
  async getAllTiers() {
    const [tiers] = await db.pool.query(
      'SELECT * FROM investment_tiers ORDER BY sort_order ASC'
    );
    return tiers;
  }

  // Admin: update tier
  async updateTier(tierId, data) {
    const updates = [];
    const values = [];

    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.multiplier !== undefined) { updates.push('multiplier = ?'); values.push(data.multiplier); }
    if (data.daily_rate !== undefined) { updates.push('daily_rate = ?'); values.push(data.daily_rate === '' || data.daily_rate === null ? null : data.daily_rate); }
    if (data.min_amount !== undefined) { updates.push('min_amount = ?'); values.push(data.min_amount); }
    if (data.max_amount !== undefined) { updates.push('max_amount = ?'); values.push(data.max_amount); }
    if (data.lock_days !== undefined) { updates.push('lock_days = ?'); values.push(data.lock_days); }
    if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
    if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(tierId);
    const [result] = await db.pool.query(
      `UPDATE investment_tiers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  // Admin: create tier
  async createTier(data) {
    const [result] = await db.pool.query(
      `INSERT INTO investment_tiers (name, slug, lock_days, multiplier, daily_rate, min_amount, max_amount, is_active, sort_order, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.slug, data.lock_days, data.multiplier,
       data.daily_rate || null,
       data.min_amount || 100, data.max_amount || 100000,
       data.is_active !== false, data.sort_order || 0, data.description || '']
    );
    return { id: result.insertId };
  }
}

module.exports = InvestService;
