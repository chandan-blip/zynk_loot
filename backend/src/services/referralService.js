const crypto = require('crypto');
const db = require('../config/database');

class ReferralService {
  constructor() {}

  generateCode() {
    return crypto.randomBytes(4).toString('hex'); // 8-char hex string
  }

  async generateReferralCode(userId) {
    // Return existing code if user already has one
    const [users] = await db.pool.query(
      'SELECT referral_code FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      throw new Error('User not found');
    }

    if (users[0].referral_code) {
      return users[0].referral_code;
    }

    // Generate unique code
    let code;
    let attempts = 0;
    while (attempts < 10) {
      code = this.generateCode();
      const [existing] = await db.pool.query(
        'SELECT id FROM users WHERE referral_code = ?',
        [code]
      );
      if (existing.length === 0) break;
      attempts++;
    }

    await db.pool.query(
      'UPDATE users SET referral_code = ? WHERE id = ?',
      [code, userId]
    );

    return code;
  }

  async getReferralCode(userId) {
    const [users] = await db.pool.query(
      'SELECT referral_code FROM users WHERE id = ?',
      [userId]
    );
    return users.length > 0 ? users[0].referral_code : null;
  }

  async processReferralCommission(userId, transactionId, transactionType, transactionAmount) {
    try {
      // Look up if user was referred
      const [users] = await db.pool.query(
        'SELECT referred_by FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0 || !users[0].referred_by) {
        return; // User wasn't referred
      }

      const referrerId = users[0].referred_by;

      // Prevent self-referral commission
      if (referrerId === userId) {
        return;
      }

      // Get commission rate from settings
      const [settings] = await db.pool.query(
        "SELECT setting_value FROM settings WHERE setting_key = 'referral_commission_rate'"
      );

      if (settings.length === 0) return;

      const rate = parseFloat(settings[0].setting_value);
      if (isNaN(rate) || rate <= 0) return;

      const commissionAmount = parseFloat((transactionAmount * rate / 100).toFixed(2));
      if (commissionAmount <= 0) return;

      // Get referrer's current balance
      const [referrers] = await db.pool.query(
        'SELECT balance FROM users WHERE id = ?',
        [referrerId]
      );

      if (referrers.length === 0) return;

      const balanceBefore = parseFloat(referrers[0].balance);
      const balanceAfter = balanceBefore + commissionAmount;

      // Credit referrer's balance
      await db.pool.query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [commissionAmount, referrerId]
      );

      // Log in referral_commissions
      await db.pool.query(
        `INSERT INTO referral_commissions (referrer_id, referred_id, transaction_id, transaction_type, transaction_amount, commission_rate, commission_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [referrerId, userId, transactionId, transactionType, transactionAmount, rate / 100, commissionAmount]
      );

      // Record transaction for referrer
      await db.pool.query(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'referral_commission', ?, ?, ?, 'referral', ?, ?)`,
        [referrerId, commissionAmount, balanceBefore, balanceAfter, transactionId,
         `Commission from referred user (${transactionType})`]
      );
    } catch (error) {
      // Log but don't throw - commission failures shouldn't break the main transaction
      console.error('Referral commission error:', error);
    }
  }

  async getReferralStats(userId) {
    const referralCode = await this.getReferralCode(userId);

    const [countResult] = await db.pool.query(
      'SELECT COUNT(*) as totalReferrals FROM users WHERE referred_by = ?',
      [userId]
    );

    const [commissionResult] = await db.pool.query(
      'SELECT COALESCE(SUM(commission_amount), 0) as totalCommission FROM referral_commissions WHERE referrer_id = ?',
      [userId]
    );

    return {
      referralCode,
      totalReferrals: countResult[0].totalReferrals,
      totalCommission: parseFloat(commissionResult[0].totalCommission)
    };
  }

  async getReferrals(userId) {
    const [referrals] = await db.pool.query(
      'SELECT username, created_at as joinedAt FROM users WHERE referred_by = ? ORDER BY created_at DESC',
      [userId]
    );
    return referrals;
  }
}

module.exports = ReferralService;
