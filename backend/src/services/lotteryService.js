const db = require('../config/database');

class LotteryService {
  constructor(io, ticketService = null, cronService = null) {
    this.io = io;
    this.ticketService = ticketService;
    this.cronService = cronService;
    this.referralService = null;
  }

  setReferralService(referralService) {
    this.referralService = referralService;
  }

  // Set ticket service (for late binding)
  setTicketService(ticketService) {
    this.ticketService = ticketService;
  }

  // Set cron service (for late binding)
  setCronService(cronService) {
    this.cronService = cronService;
  }

  // Check if we're in reveal execution window (block operations)
  isInRevealWindow() {
    const now = new Date();
    const seconds = now.getSeconds();
    const minutes = now.getMinutes();
    if (minutes === 0 && seconds <= 5) return true;
    if (minutes === 59 && seconds >= 55) return true;
    return false;
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

      // Get current active draw with full details
      const draw = await this.getCurrentActiveDraw();

      // If no active draw, get upcoming session info
      let upcomingSession = null;
      let isForUpcomingSession = false;

      if (!draw && this.cronService) {
        upcomingSession = await this.cronService.getNextUpcomingSession();
        isForUpcomingSession = true;
      }

      // Calculate initial matched digits based on already revealed portion
      let initialMatchedDigits = 0;
      let revealedDigits = 0;
      let revealedNumber = 'XXXXXXX';

      if (draw && draw.winning_number && draw.revealed_digits > 0) {
        revealedDigits = parseInt(draw.revealed_digits) || 0;
        const revealedPortion = draw.winning_number.substring(0, revealedDigits);
        const ticketPortion = numberStr.substring(0, revealedDigits);

        // Count matching digits from left
        for (let i = 0; i < revealedDigits; i++) {
          if (revealedPortion[i] === ticketPortion[i]) {
            initialMatchedDigits++;
          } else {
            break; // Stop at first mismatch
          }
        }

        revealedNumber = revealedPortion + 'X'.repeat(7 - revealedDigits);
      }

      // Calculate initial return based on hidden matched digits
      // At buy time, revealed digits that match are "known" — only hidden matches count
      const MULTIPLIER_MAP = { 0: 0, 1: 2, 2: 4, 3: 9, 4: 16, 5: 25, 6: 36, 7: 49 };
      const hiddenMatched = initialMatchedDigits - revealedDigits;
      const multiplier = MULTIPLIER_MAP[hiddenMatched] || 0;
      const initialReturn = price * multiplier;

      // Determine ticket status
      let ticketStatus = 'active';
      if (isForUpcomingSession) {
        ticketStatus = 'pending'; // Waiting for session to start
      } else if (revealedDigits > 0 && initialMatchedDigits < revealedDigits) {
        ticketStatus = 'lost';
      }

      // Check if number exists
      let [numbers] = await connection.execute(
        'SELECT * FROM numbers WHERE number = ? FOR UPDATE',
        [numberStr]
      );

      let numberId;

      if (numbers.length === 0) {
        // Create new number with draw enrollment and current matching state
        const [result] = await connection.execute(
          `INSERT INTO numbers (number, owner_id, price, buy_amount, draw_id, ticket_status, matched_digits, current_return, last_reveal_index, purchased_at_reveal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [numberStr, userId, price, price, draw?.id || null, ticketStatus, initialMatchedDigits, initialReturn, revealedDigits, revealedDigits]
        );
        numberId = result.insertId;
      } else {
        const number = numbers[0];

        if (number.owner_id) {
          throw new Error('Number already owned');
        }

        // Update ownership and enroll in draw with current matching state
        await connection.execute(
          `UPDATE numbers SET
           owner_id = ?,
           buy_amount = ?,
           draw_id = ?,
           ticket_status = ?,
           matched_digits = ?,
           current_return = ?,
           last_reveal_index = ?,
           purchased_at_reveal = ?,
           cashed_out_at = NULL,
           cashout_matched_digits = NULL,
           cashout_multiplier = NULL,
           cashout_payout = NULL
           WHERE id = ?`,
          [userId, price, draw?.id || null, ticketStatus, initialMatchedDigits, initialReturn, revealedDigits, revealedDigits, number.id]
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

      // Add buy amount to prize pool
      if (draw?.id) {
        await connection.execute(
          'UPDATE daily_draws SET total_pool = total_pool + ? WHERE id = ?',
          [price, draw.id]
        );
      }

      // Record transaction
      const [txnResult] = await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'purchase', ?, ?, ?, 'number', ?, ?)`,
        [userId, price, users[0].balance, parseFloat(users[0].balance) - price, numberId, `Purchased number ${numberStr}`]
      );

      await connection.commit();

      // Process referral commission (non-blocking, after commit)
      if (this.referralService) {
        this.referralService.processReferralCommission(userId, txnResult.insertId, 'purchase', price);
      }

      // Get updated prize pool for broadcast
      let newTotalPool = 0;
      if (draw?.id) {
        const [poolResult] = await db.pool.query(
          'SELECT total_pool FROM daily_draws WHERE id = ?',
          [draw.id]
        );
        newTotalPool = parseFloat(poolResult[0]?.total_pool || 0);
      }

      // Broadcast prize pool update to all clients
      if (this.io) {
        this.io.emit('prizePool:updated', {
          drawId: draw?.id,
          totalPool: newTotalPool,
          addedAmount: price
        });

        // Notify user to refresh their numbers
        this.io.to(`user:${userId}`).emit('user:numbersUpdated', {
          action: 'bought',
          number: numberStr,
          numberId
        });
      }

      // Return full session info
      return {
        success: true,
        numberId,
        drawId: draw?.id || null,
        sessionNumber: draw?.session_number || upcomingSession?.sessionNumber || null,
        sessionName: upcomingSession?.sessionName || null,
        ticketStatus,
        matchedDigits: initialMatchedDigits,
        currentReturn: initialReturn,
        multiplier,
        revealedDigits,
        revealedNumber,
        totalDigits: 7,
        digitsRemaining: 7 - revealedDigits,
        newTotalPool,
        // Upcoming session info when no active draw
        isForUpcomingSession,
        upcomingSession: isForUpcomingSession ? {
          sessionNumber: upcomingSession?.sessionNumber,
          sessionName: upcomingSession?.sessionName,
          startsAt: upcomingSession?.nextRunAt,
          timeUntilStart: upcomingSession?.timeUntilStart
        } : null
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Vote/Unvote for a number (prediction only - no cost, no pool contribution)
  async voteForNumber(userId, numberStr, action = 'vote') {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get current draw
      const draw = await this.getCurrentActiveDraw();
      if (!draw) {
        throw new Error('No active draw available');
      }

      // Calculate dynamic price based on revealed digits
      // Price increases as more digits are revealed: 10 + 5 * revealedDigits
      // 0 digits = 10Z, 1 digit = 15Z, 2 digits = 20Z, etc.
      const revealedDigits = parseInt(draw.revealed_digits) || 0;
      const basePrice = 10;
      const dynamicPrice = basePrice + 5 * revealedDigits;

      // Get or create number
      let [numbers] = await connection.execute(
        'SELECT * FROM numbers WHERE number = ? FOR UPDATE',
        [numberStr]
      );

      let numberId;
      let totalVotes = 0;

      if (action === 'unvote') {
        // Handle unvote
        if (numbers.length === 0) {
          throw new Error('Number not found');
        }

        numberId = numbers[0].id;

        // Check if user has voted
        const [existingVotes] = await connection.execute(
          'SELECT id FROM votes WHERE user_id = ? AND number_id = ?',
          [userId, numberId]
        );

        if (existingVotes.length === 0) {
          throw new Error('You have not voted for this number');
        }

        // Remove vote
        await connection.execute(
          'DELETE FROM votes WHERE user_id = ? AND number_id = ?',
          [userId, numberId]
        );

        // Decrement total votes
        await connection.execute(
          'UPDATE numbers SET total_votes = GREATEST(0, total_votes - 1) WHERE id = ?',
          [numberId]
        );

        totalVotes = Math.max(0, (numbers[0].total_votes || 0) - 1);

      } else {
        // Handle vote
        if (numbers.length === 0) {
          // Create new number with dynamic price
          const [result] = await connection.execute(
            'INSERT INTO numbers (number, total_votes, price) VALUES (?, 1, ?)',
            [numberStr, dynamicPrice]
          );
          numberId = result.insertId;
          totalVotes = 1;
        } else {
          numberId = numbers[0].id;

          // Check if user already voted for this number
          const [existingVotes] = await connection.execute(
            'SELECT id FROM votes WHERE user_id = ? AND number_id = ?',
            [userId, numberId]
          );

          if (existingVotes.length > 0) {
            throw new Error('You have already voted for this number');
          }

          await connection.execute(
            'UPDATE numbers SET total_votes = total_votes + 1 WHERE id = ?',
            [numberId]
          );

          totalVotes = (numbers[0].total_votes || 0) + 1;
        }

        // Record vote (one vote per user per number)
        await connection.execute(
          `INSERT INTO votes (user_id, number_id, draw_id, vote_count)
           VALUES (?, ?, ?, 1)`,
          [userId, numberId, draw.id]
        );
      }

      await connection.commit();

      // Broadcast vote update
      if (this.io) {
        this.io.emit('number:vote', { number: numberStr, totalVotes, action });
      }

      return { success: true, totalVotes, action };
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
        'SELECT * FROM numbers WHERE number = ? FOR UPDATE',
        [numberStr]
      );

      if (numbers.length === 0 || !numbers[0].owner_id) {
        throw new Error('Number not owned');
      }

      const ticket = numbers[0];

      if (ticket.owner_id === fromUserId) {
        throw new Error('Cannot offer on your own number');
      }

      // Check ticket status - reject if locked, cashed out, or lost
      if (ticket.locked_at) {
        throw new Error('Ticket is currently locked');
      }
      if (ticket.ticket_status === 'cashed_out') {
        throw new Error('Ticket has been cashed out');
      }
      if (ticket.ticket_status === 'lost') {
        throw new Error('Ticket has lost');
      }
      if (ticket.ticket_status === 'sold') {
        throw new Error('Ticket has been sold');
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

      // Create offer - expires at next reveal hour or 24 hours, whichever is sooner
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const max24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const expiresAt = nextHour < max24Hours ? nextHour : max24Hours;

      const [result] = await connection.execute(
        `INSERT INTO offers (number_id, from_user_id, to_user_id, offer_amount, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [ticket.id, fromUserId, ticket.owner_id, offerAmount, expiresAt]
      );

      await connection.commit();

      // Notify owner
      if (this.io) {
        this.io.to(`user:${ticket.owner_id}`).emit('offer:new', {
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
    // Block during reveal execution window
    if (accept && this.isInRevealWindow()) {
      throw new Error('Cannot accept offers during reveal execution. Please wait a few seconds.');
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [offers] = await connection.execute(
        `SELECT o.*, n.number, n.matched_digits, n.current_return, n.ticket_status, n.locked_at
         FROM offers o
         JOIN numbers n ON o.number_id = n.id
         WHERE o.id = ? AND o.to_user_id = ? AND o.status = 'pending' FOR UPDATE`,
        [offerId, userId]
      );

      if (offers.length === 0) {
        throw new Error('Offer not found or expired');
      }

      const offer = offers[0];

      // Check if ticket is locked
      if (offer.locked_at) {
        throw new Error('Ticket is currently locked. Please try again.');
      }

      // Check ticket status
      if (['cashed_out', 'lost', 'sold'].includes(offer.ticket_status)) {
        // Refund and reject
        await connection.execute(
          'UPDATE users SET balance = balance + ? WHERE id = ?',
          [offer.offer_amount, offer.from_user_id]
        );
        await connection.execute(
          `UPDATE offers SET status = 'rejected', responded_at = NOW() WHERE id = ?`,
          [offerId]
        );
        await connection.commit();
        throw new Error(`Ticket is ${offer.ticket_status} - offer automatically rejected`);
      }

      if (accept) {
        // Lock the ticket during transfer
        await connection.execute(
          'UPDATE numbers SET locked_at = NOW() WHERE id = ?',
          [offer.number_id]
        );

        try {
          // Transfer ownership - PRESERVE matching state (critical per arc.md #8)
          await connection.execute(
            `UPDATE numbers SET
             owner_id = ?,
             ticket_status = 'sold',
             locked_at = NULL
             WHERE id = ?`,
            [offer.from_user_id, offer.number_id]
          );
          // Note: matched_digits, current_return, last_reveal_index are preserved

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

          // Cancel all other pending offers for this number (arc.md #9)
          const [otherOffers] = await connection.execute(
            `SELECT id, from_user_id, offer_amount FROM offers
             WHERE number_id = ? AND id != ? AND status = 'pending'`,
            [offer.number_id, offerId]
          );

          for (const otherOffer of otherOffers) {
            // Refund
            await connection.execute(
              'UPDATE users SET balance = balance + ? WHERE id = ?',
              [otherOffer.offer_amount, otherOffer.from_user_id]
            );
            // Mark as rejected
            await connection.execute(
              `UPDATE offers SET status = 'rejected', responded_at = NOW() WHERE id = ?`,
              [otherOffer.id]
            );
            // Notify
            if (this.io) {
              this.io.to(`user:${otherOffer.from_user_id}`).emit('offer:rejected', {
                number: offer.number,
                reason: 'Another offer was accepted'
              });
            }
          }

          // Log ownership transfer
          console.log(`[OFFER] Ownership transferred: ${offer.number} from user ${userId} to ${offer.from_user_id}, preserved ${offer.matched_digits} matches`);

          // Notify buyer
          if (this.io) {
            this.io.to(`user:${offer.from_user_id}`).emit('offer:accepted', {
              number: offer.number,
              amount: offer.offer_amount,
              matchedDigits: offer.matched_digits,
              currentReturn: offer.current_return
            });
          }

        } catch (error) {
          // Unlock on error
          await connection.execute(
            'UPDATE numbers SET locked_at = NULL WHERE id = ?',
            [offer.number_id]
          );
          throw error;
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

  // Get user's numbers with matching info
  async getUserNumbers(userId) {
    const [numbers] = await db.pool.query(
      `SELECT n.*, d.revealed_digits as draw_revealed_digits, d.status as draw_status,
              d.session_number, d.period_id
       FROM numbers n
       LEFT JOIN daily_draws d ON n.draw_id = d.id
       WHERE n.owner_id = ?
       ORDER BY n.created_at DESC, n.matched_digits DESC`,
      [userId]
    );

    // Add computed multiplier field (using hidden matched digits)
    const MULTIPLIER_MAP = { 0: 0, 1: 2, 2: 4, 3: 9, 4: 16, 5: 25, 6: 36, 7: 49 };

    return numbers.map(n => {
      const hiddenMatched = (n.matched_digits || 0) - (n.purchased_at_reveal || 0);
      return {
      ...n,
      multiplier: MULTIPLIER_MAP[hiddenMatched] || 0,
      canCashOut: (n.matched_digits || 0) > 0 &&
                  !['cashed_out', 'sold', 'lost'].includes(n.ticket_status)
    };
    });
  }

  // Get number details with full analytics
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

    const number = numbers[0];

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

    // Get price history (from transactions)
    const [priceHistory] = await db.pool.query(
      `SELECT DATE(t.created_at) as date,
              MAX(t.amount) as price
       FROM transactions t
       WHERE t.description LIKE ? AND t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(t.created_at)
       ORDER BY date ASC`,
      [`%${numberStr}%`]
    );

    // Add votes to price history
    for (const ph of priceHistory) {
      const found = voteHistory.find(v => v.date && ph.date &&
        new Date(v.date).toDateString() === new Date(ph.date).toDateString());
      ph.votes = found ? found.votes : 0;
    }

    // Get votes by hour (today)
    const [votesByHour] = await db.pool.query(
      `SELECT HOUR(v.created_at) as hour, SUM(v.vote_count) as votes
       FROM votes v
       JOIN numbers n ON v.number_id = n.id
       WHERE n.number = ? AND DATE(v.created_at) = CURDATE()
       GROUP BY HOUR(v.created_at)
       ORDER BY hour ASC`,
      [numberStr]
    );

    // Fill in missing hours with 0
    const votesByHourFull = Array.from({ length: 24 }, (_, i) => {
      const found = votesByHour.find(v => v.hour === i);
      return { hour: `${i}:00`, votes: found ? found.votes : 0 };
    });

    // Get recent activities (votes, purchases, offers)
    const [activities] = await db.pool.query(
      `(SELECT 'vote' as type, u.username as user, v.vote_count as amount, v.created_at
        FROM votes v
        JOIN users u ON v.user_id = u.id
        JOIN numbers n ON v.number_id = n.id
        WHERE n.number = ?
        ORDER BY v.created_at DESC LIMIT 5)
       UNION ALL
       (SELECT 'buy' as type, u.username as user, t.amount, t.created_at
        FROM transactions t
        JOIN users u ON t.user_id = u.id
        WHERE t.type = 'purchase' AND t.description LIKE ?
        ORDER BY t.created_at DESC LIMIT 3)
       UNION ALL
       (SELECT 'offer' as type, u.username as user, o.offer_amount as amount, o.created_at
        FROM offers o
        JOIN users u ON o.from_user_id = u.id
        JOIN numbers n ON o.number_id = n.id
        WHERE n.number = ?
        ORDER BY o.created_at DESC LIMIT 3)
       ORDER BY created_at DESC LIMIT 10`,
      [numberStr, `%${numberStr}%`, numberStr]
    );

    // Get ownership history
    const [ownershipHistory] = await db.pool.query(
      `SELECT u.username as owner, t.created_at as acquired_at, t.amount as price
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.type IN ('purchase', 'sale') AND t.description LIKE ?
       ORDER BY t.created_at DESC LIMIT 5`,
      [`%${numberStr}%`]
    );

    // Get similar numbers (same first digit or reversed)
    const firstDigit = numberStr.charAt(0);
    const [similarNumbers] = await db.pool.query(
      `SELECT n.number, n.total_votes as votes, n.price, n.vote_trend as trend
       FROM numbers n
       WHERE n.number != ? AND (n.number LIKE ? OR n.number LIKE ?)
       ORDER BY n.total_votes DESC LIMIT 4`,
      [numberStr, `${firstDigit}%`, `%${firstDigit}`]
    );

    // Get stats
    const [stats] = await db.pool.query(
      `SELECT
        (SELECT COUNT(DISTINCT user_id) FROM votes v JOIN numbers n ON v.number_id = n.id WHERE n.number = ?) as unique_voters,
        (SELECT COUNT(*) FROM transactions t WHERE t.description LIKE ?) as total_transactions,
        (SELECT COALESCE(AVG(daily_votes), 0) FROM (
          SELECT SUM(vote_count) as daily_votes FROM votes v
          JOIN numbers n ON v.number_id = n.id
          WHERE n.number = ?
          GROUP BY DATE(v.created_at)
        ) as dv) as avg_daily_votes,
        (SELECT COALESCE(MAX(daily_votes), 0) FROM (
          SELECT SUM(vote_count) as daily_votes FROM votes v
          JOIN numbers n ON v.number_id = n.id
          WHERE n.number = ?
          GROUP BY DATE(v.created_at)
        ) as dv) as peak_votes`,
      [numberStr, `%${numberStr}%`, numberStr, numberStr]
    );

    // Get rank (escape 'rank' as it's a reserved keyword in MySQL 8+)
    const [rankResult] = await db.pool.query(
      `SELECT COUNT(*) + 1 as \`rank\` FROM numbers WHERE total_votes > (SELECT COALESCE(total_votes, 0) FROM numbers WHERE number = ?)`,
      [numberStr]
    );

    // Get total pool votes
    const [poolResult] = await db.pool.query(
      `SELECT SUM(total_votes) as total_pool FROM numbers`
    );

    return {
      ...number,
      voteHistory,
      priceHistory: priceHistory.length > 0 ? priceHistory : voteHistory.map(v => ({ date: v.date, price: number.price, votes: v.votes })),
      votesByHour: votesByHourFull,
      activities: activities.map(a => ({
        type: a.type,
        user: a.user,
        amount: a.type === 'vote' ? `+${a.amount} votes` : `${a.amount} Z`,
        time: this.formatTimeAgo(a.created_at)
      })),
      ownershipHistory: ownershipHistory.length > 0 ? ownershipHistory.map((h, i) => ({
        owner: h.owner,
        from: new Date(h.acquired_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        to: i === 0 ? 'Present' : new Date(ownershipHistory[i-1].acquired_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        price: parseFloat(h.price)
      })) : [{ owner: number.owner_name || 'Unclaimed', from: 'Launch', to: 'Present', price: parseFloat(number.price) }],
      similarNumbers: similarNumbers.map(s => ({
        number: s.number,
        votes: s.votes || 0,
        price: parseFloat(s.price),
        trend: parseFloat(s.trend) || 0
      })),
      uniqueVoters: stats[0]?.unique_voters || 0,
      totalTransactions: stats[0]?.total_transactions || 0,
      avgDailyVotes: Math.round(stats[0]?.avg_daily_votes) || 0,
      peakVotes: stats[0]?.peak_votes || 0,
      rank: rankResult[0]?.rank || 1,
      totalPoolVotes: poolResult[0]?.total_pool || 150000,
      createdAt: number.created_at ? new Date(number.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'
    };
  }

  // Helper to format time ago
  formatTimeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} mins ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

module.exports = LotteryService;
