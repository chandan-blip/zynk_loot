const db = require('../config/database');

class LotteryService {
  constructor(io) {
    this.io = io;
  }

  // Get current active draw (defers to cronService for actual draw management)
  async getCurrentActiveDraw() {
    const [draws] = await db.pool.query(
      `SELECT * FROM daily_draws
       WHERE status IN ('pending', 'revealing', 'active')
       ORDER BY created_at DESC LIMIT 1`
    );
    return draws.length > 0 ? draws[0] : null;
  }

  // Buy a number
  async buyNumber(userId, numberStr, price) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Check if number exists
      let [numbers] = await connection.execute(
        'SELECT * FROM numbers WHERE number = ? FOR UPDATE',
        [numberStr]
      );

      let numberId;

      if (numbers.length === 0) {
        // Create new number
        const [result] = await connection.execute(
          'INSERT INTO numbers (number, owner_id, price) VALUES (?, ?, ?)',
          [numberStr, userId, price]
        );
        numberId = result.insertId;
      } else {
        const number = numbers[0];

        if (number.owner_id) {
          throw new Error('Number already owned');
        }

        // Update ownership
        await connection.execute(
          'UPDATE numbers SET owner_id = ? WHERE id = ?',
          [userId, number.id]
        );
        numberId = number.id;
      }

      // Deduct balance
      const [users] = await connection.execute(
        'SELECT balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );

      if (parseFloat(users[0].balance) < price) {
        throw new Error('Insufficient balance');
      }

      await connection.execute(
        'UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE id = ?',
        [price, price, userId]
      );

      // Record transaction
      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'purchase', ?, ?, ?, 'number', ?, ?)`,
        [userId, price, users[0].balance, parseFloat(users[0].balance) - price, numberId, `Purchased number ${numberStr}`]
      );

      await connection.commit();
      return { success: true, numberId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Vote for a number (prediction only - no cost, no pool contribution)
  async voteForNumber(userId, numberStr) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get current draw
      const draw = await this.getCurrentActiveDraw();
      if (!draw) {
        throw new Error('No active draw available');
      }

      // Get or create number
      let [numbers] = await connection.execute(
        'SELECT * FROM numbers WHERE number = ? FOR UPDATE',
        [numberStr]
      );

      let numberId;

      if (numbers.length === 0) {
        const [result] = await connection.execute(
          'INSERT INTO numbers (number, total_votes) VALUES (?, 1)',
          [numberStr]
        );
        numberId = result.insertId;
      } else {
        numberId = numbers[0].id;
        await connection.execute(
          'UPDATE numbers SET total_votes = total_votes + 1 WHERE id = ?',
          [numberId]
        );
      }

      // Record vote (no cost - just for prediction display)
      await connection.execute(
        `INSERT INTO votes (user_id, number_id, draw_id, vote_count)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE vote_count = vote_count + 1`,
        [userId, numberId, draw.id]
      );

      await connection.commit();

      // Broadcast vote update
      if (this.io) {
        this.io.emit('number:vote', { number: numberStr, totalVotes: (numbers[0]?.total_votes || 0) + 1 });
      }

      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Create offer for owned number
  async createOffer(fromUserId, numberStr, offerAmount) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [numbers] = await connection.execute(
        'SELECT * FROM numbers WHERE number = ?',
        [numberStr]
      );

      if (numbers.length === 0 || !numbers[0].owner_id) {
        throw new Error('Number not owned');
      }

      if (numbers[0].owner_id === fromUserId) {
        throw new Error('Cannot offer on your own number');
      }

      // Check balance
      const [users] = await connection.execute(
        'SELECT balance FROM users WHERE id = ?',
        [fromUserId]
      );

      if (parseFloat(users[0].balance) < offerAmount) {
        throw new Error('Insufficient balance');
      }

      // Hold the amount
      await connection.execute(
        'UPDATE users SET balance = balance - ? WHERE id = ?',
        [offerAmount, fromUserId]
      );

      // Create offer (expires in 24 hours)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const [result] = await connection.execute(
        `INSERT INTO offers (number_id, from_user_id, to_user_id, offer_amount, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [numbers[0].id, fromUserId, numbers[0].owner_id, offerAmount, expiresAt]
      );

      await connection.commit();

      // Notify owner
      if (this.io) {
        this.io.to(`user:${numbers[0].owner_id}`).emit('offer:new', {
          offerId: result.insertId,
          number: numberStr,
          amount: offerAmount
        });
      }

      return { success: true, offerId: result.insertId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Accept/reject offer
  async respondToOffer(userId, offerId, accept) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [offers] = await connection.execute(
        `SELECT o.*, n.number FROM offers o
         JOIN numbers n ON o.number_id = n.id
         WHERE o.id = ? AND o.to_user_id = ? AND o.status = 'pending' FOR UPDATE`,
        [offerId, userId]
      );

      if (offers.length === 0) {
        throw new Error('Offer not found or expired');
      }

      const offer = offers[0];

      if (accept) {
        // Transfer ownership
        await connection.execute(
          'UPDATE numbers SET owner_id = ? WHERE id = ?',
          [offer.from_user_id, offer.number_id]
        );

        // Pay seller
        await connection.execute(
          'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
          [offer.offer_amount, offer.offer_amount, userId]
        );

        // Update offer status
        await connection.execute(
          `UPDATE offers SET status = 'accepted', responded_at = NOW() WHERE id = ?`,
          [offerId]
        );

        // Notify buyer
        if (this.io) {
          this.io.to(`user:${offer.from_user_id}`).emit('offer:accepted', {
            number: offer.number,
            amount: offer.offer_amount
          });
        }
      } else {
        // Refund buyer
        await connection.execute(
          'UPDATE users SET balance = balance + ? WHERE id = ?',
          [offer.offer_amount, offer.from_user_id]
        );

        // Update offer status
        await connection.execute(
          `UPDATE offers SET status = 'rejected', responded_at = NOW() WHERE id = ?`,
          [offerId]
        );

        // Notify buyer
        if (this.io) {
          this.io.to(`user:${offer.from_user_id}`).emit('offer:rejected', {
            number: offer.number
          });
        }
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get trending numbers
  async getTrendingNumbers(limit = 50) {
    // Ensure limit is a safe integer
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 1000);
    const [numbers] = await db.pool.query(
      `SELECT n.*, u.username as owner_name
       FROM numbers n
       LEFT JOIN users u ON n.owner_id = u.id
       ORDER BY n.vote_trend LIMIT ${safeLimit}`
    );
    return numbers;
  }

  // Get user's numbers
  async getUserNumbers(userId) {
    const [numbers] = await db.pool.query(
      `SELECT * FROM numbers WHERE owner_id = ? ORDER BY total_votes DESC`,
      [userId]
    );
    return numbers;
  }

  // Get number details
  async getNumberDetails(numberStr) {
    const [numbers] = await db.pool.query(
      `SELECT n.*, u.username as owner_name
       FROM numbers n
       LEFT JOIN users u ON n.owner_id = u.id
       WHERE n.number = ?`,
      [numberStr]
    );

    if (numbers.length === 0) {
      return null;
    }

    // Get vote history for last 30 days
    const [voteHistory] = await db.pool.query(
      `SELECT DATE(v.created_at) as date, SUM(v.vote_count) as votes
       FROM votes v
       JOIN numbers n ON v.number_id = n.id
       WHERE n.number = ? AND v.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(v.created_at)
       ORDER BY date ASC`,
      [numberStr]
    );

    return {
      ...numbers[0],
      voteHistory
    };
  }
}

module.exports = LotteryService;
