const db = require('../config/database');

// Recurring bonus types share the same cooldown logic — only the settings keys
// and the human-readable label differ.
const RECURRING_TYPES = {
  daily:   { amountKey: 'bonus_daily_amount',   cooldownKey: 'bonus_daily_cooldown_hours',   defaultCooldown: 24 },
  weekly:  { amountKey: 'bonus_weekly_amount',  cooldownKey: 'bonus_weekly_cooldown_hours',  defaultCooldown: 168 },
  monthly: { amountKey: 'bonus_monthly_amount', cooldownKey: 'bonus_monthly_cooldown_hours', defaultCooldown: 720 },
};

const FIRST_DEPOSIT = {
  multiplierKey: 'bonus_first_deposit_multiplier',
  capKey:        'bonus_first_deposit_cap',
};

class BonusService {
  constructor() {}

  // ── Settings helpers ────────────────────────────────────────────────────

  async _getSetting(key, fallback) {
    const [rows] = await db.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [key]
    );
    if (rows.length === 0) return fallback;
    const v = rows[0].setting_value;
    return v == null || v === '' ? fallback : v;
  }

  async _getNumberSetting(key, fallback) {
    const v = await this._getSetting(key, null);
    if (v == null) return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // ── Status / cooldown ───────────────────────────────────────────────────

  async _lastClaimAt(userId, type) {
    const [rows] = await db.pool.query(
      'SELECT MAX(claimed_at) AS last FROM bonus_claims WHERE user_id = ? AND type = ?',
      [userId, type]
    );
    return rows[0]?.last ? new Date(rows[0].last) : null;
  }

  async _statusForRecurring(userId, type) {
    const cfg = RECURRING_TYPES[type];
    const amount = await this._getNumberSetting(cfg.amountKey, 0);
    const cooldownHours = await this._getNumberSetting(cfg.cooldownKey, cfg.defaultCooldown);
    const last = await this._lastClaimAt(userId, type);

    if (!last) {
      return { type, amount, claimable: amount > 0, lastClaimedAt: null, nextClaimAt: null, cooldownHours };
    }

    const nextMs = last.getTime() + cooldownHours * 3600 * 1000;
    const claimable = Date.now() >= nextMs && amount > 0;
    return {
      type,
      amount,
      claimable,
      lastClaimedAt: last.toISOString(),
      nextClaimAt: claimable ? null : new Date(nextMs).toISOString(),
      cooldownHours,
    };
  }

  async _statusForFirstDeposit(userId) {
    const [rows] = await db.pool.query(
      'SELECT first_deposit_bonus_claimed FROM users WHERE id = ?',
      [userId]
    );
    const claimed = rows.length > 0 && Number(rows[0].first_deposit_bonus_claimed) === 1;
    const multiplier = await this._getNumberSetting(FIRST_DEPOSIT.multiplierKey, 2);
    const cap = await this._getNumberSetting(FIRST_DEPOSIT.capKey, 1000);
    return {
      type: 'first_deposit',
      claimed,
      multiplier,
      cap,
      // No user-claim action — it's auto-credited on first deposit completion.
      claimable: false,
    };
  }

  async getStatus(userId) {
    const [daily, weekly, monthly, firstDeposit] = await Promise.all([
      this._statusForRecurring(userId, 'daily'),
      this._statusForRecurring(userId, 'weekly'),
      this._statusForRecurring(userId, 'monthly'),
      this._statusForFirstDeposit(userId),
    ]);
    return { daily, weekly, monthly, firstDeposit };
  }

  // ── Claim flow ──────────────────────────────────────────────────────────

  async claim(userId, type) {
    if (!Object.prototype.hasOwnProperty.call(RECURRING_TYPES, type)) {
      throw new Error('Invalid bonus type');
    }
    const cfg = RECURRING_TYPES[type];
    const amount = await this._getNumberSetting(cfg.amountKey, 0);
    const cooldownHours = await this._getNumberSetting(cfg.cooldownKey, cfg.defaultCooldown);

    if (amount <= 0) {
      throw new Error('Bonus is currently disabled');
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Re-check cooldown inside the transaction so a double-tap from the
      // client can't credit twice.
      const [last] = await conn.execute(
        'SELECT MAX(claimed_at) AS last FROM bonus_claims WHERE user_id = ? AND type = ? FOR UPDATE',
        [userId, type]
      );
      const lastAt = last[0]?.last ? new Date(last[0].last) : null;
      if (lastAt && Date.now() < lastAt.getTime() + cooldownHours * 3600 * 1000) {
        throw new Error('Bonus not yet available');
      }

      const [users] = await conn.execute(
        'SELECT balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const balanceBefore = parseFloat(users[0].balance);
      const balanceAfter = Math.floor((balanceBefore + amount) * 100) / 100;

      await conn.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balanceAfter, userId]
      );

      const [claimResult] = await conn.execute(
        `INSERT INTO bonus_claims (user_id, type, amount) VALUES (?, ?, ?)`,
        [userId, type, amount]
      );

      await conn.execute(
        `INSERT INTO transactions
           (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'bonus', ?, ?, ?, 'bonus', ?, ?)`,
        [
          userId,
          amount,
          balanceBefore.toFixed(2),
          balanceAfter.toFixed(2),
          claimResult.insertId,
          `${type.charAt(0).toUpperCase() + type.slice(1)} bonus`,
        ]
      );

      await conn.commit();

      return {
        type,
        amount,
        balanceAfter,
        nextClaimAt: new Date(Date.now() + cooldownHours * 3600 * 1000).toISOString(),
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ── First-deposit bonus (auto-credited from the deposit flow) ──────────

  // Idempotent: if the user already claimed (or was credited), this is a
  // no-op and returns null. Caller passes the deposit amount; bonus =
  // min(deposit * multiplier - deposit, cap)  i.e. the *extra* on top of
  // what the user already got from their deposit.
  async creditFirstDepositBonus(userId, depositAmount) {
    if (!userId || !(depositAmount > 0)) return null;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [users] = await conn.execute(
        'SELECT balance, first_deposit_bonus_claimed FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) {
        await conn.rollback();
        return null;
      }
      if (Number(users[0].first_deposit_bonus_claimed) === 1) {
        await conn.rollback();
        return null;
      }

      const multiplier = await this._getNumberSetting(FIRST_DEPOSIT.multiplierKey, 2);
      const cap        = await this._getNumberSetting(FIRST_DEPOSIT.capKey, 1000);

      // "2x bonus" means total credited = 2 × deposit; the bonus *extra* on
      // top of the deposit the user already received is therefore
      // (multiplier - 1) × deposit, then capped.
      let bonusAmount = Math.max(0, (multiplier - 1) * Number(depositAmount));
      bonusAmount = Math.min(bonusAmount, cap);
      bonusAmount = Math.floor(bonusAmount * 100) / 100;

      // Mark the flag even if the bonus is zero (e.g. multiplier set to 1)
      // — we still consider the first-deposit slot consumed so we don't
      // re-evaluate on every future deposit.
      await conn.execute(
        'UPDATE users SET first_deposit_bonus_claimed = 1 WHERE id = ?',
        [userId]
      );

      if (bonusAmount <= 0) {
        await conn.commit();
        return { credited: 0, claimed: true };
      }

      const balanceBefore = parseFloat(users[0].balance);
      const balanceAfter = Math.floor((balanceBefore + bonusAmount) * 100) / 100;

      await conn.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balanceAfter, userId]
      );

      const [claimResult] = await conn.execute(
        `INSERT INTO bonus_claims (user_id, type, amount) VALUES (?, 'first_deposit', ?)`,
        [userId, bonusAmount]
      );

      await conn.execute(
        `INSERT INTO transactions
           (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'bonus', ?, ?, ?, 'bonus', ?, 'First deposit bonus')`,
        [userId, bonusAmount, balanceBefore.toFixed(2), balanceAfter.toFixed(2), claimResult.insertId]
      );

      await conn.commit();
      return { credited: bonusAmount, balanceAfter, claimed: true };
    } catch (e) {
      await conn.rollback();
      console.error('First-deposit bonus error:', e);
      return null;
    } finally {
      conn.release();
    }
  }
}

module.exports = BonusService;
