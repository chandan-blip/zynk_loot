const db = require('../config/database');

class TicketService {
  constructor(io) {
    this.io = io;
    this.TOTAL_DIGITS = 7;

    // Multiplier mapping per arc.md spec
    // matches → multiplier (n² for n matches)
    this.MULTIPLIER_MAP = {
      0: 0,
      1: 2,
      2: 4,
      3: 9,
      4: 16,
      5: 25,
      6: 36,
      7: 49
    };

    // Lock timeout in seconds (for stale lock cleanup)
    this.LOCK_TIMEOUT_SECONDS = 30;
  }

  // Get multiplier for given matched digits
  getMultiplier(matchedDigits) {
    return this.MULTIPLIER_MAP[matchedDigits] || 0;
  }

  // Calculate current return for a ticket
  calculateCurrentReturn(buyAmount, matchedDigits) {
    const multiplier = this.getMultiplier(matchedDigits);
    return parseFloat(buyAmount) * multiplier;
  }

  // Lock a ticket for atomic operation
  async lockTicket(connection, numberId) {
    // Clean up stale locks first
    await connection.execute(
      `UPDATE numbers SET locked_at = NULL
       WHERE id = ? AND locked_at IS NOT NULL
       AND locked_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [numberId, this.LOCK_TIMEOUT_SECONDS]
    );

    // Try to acquire lock
    const [result] = await connection.execute(
      `UPDATE numbers SET locked_at = NOW()
       WHERE id = ? AND locked_at IS NULL`,
      [numberId]
    );

    return result.affectedRows > 0;
  }

  // Unlock a ticket
  async unlockTicket(connection, numberId) {
    await connection.execute(
      'UPDATE numbers SET locked_at = NULL WHERE id = ?',
      [numberId]
    );
  }

  // Check if we're in a reveal execution window (±5 seconds of hour mark)
  isInRevealWindow() {
    const now = new Date();
    const seconds = now.getSeconds();
    const minutes = now.getMinutes();

    // At the top of the hour (minute 0), within ±5 seconds
    if (minutes === 0 && seconds <= 5) return true;
    if (minutes === 59 && seconds >= 55) return true;

    return false;
  }

  // Process reveal for all active tickets (called by cronService)
  async processReveal(draw, revealedDigits) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get all active tickets for this draw that haven't been processed for this reveal
      const [tickets] = await connection.execute(
        `SELECT n.*, u.id as user_id
         FROM numbers n
         LEFT JOIN users u ON n.owner_id = u.id
         WHERE n.draw_id = ?
         AND n.ticket_status IN ('active', 'matching')
         AND n.last_reveal_index < ?
         FOR UPDATE`,
        [draw.id, revealedDigits]
      );

      const winningNumber = draw.winning_number;
      const results = { processed: 0, matched: 0, lost: 0 };

      for (const ticket of tickets) {
        // Skip if no owner (shouldn't happen but safety check)
        if (!ticket.owner_id) continue;

        // Lock ticket
        const locked = await this.lockTicket(connection, ticket.id);
        if (!locked) {
          console.log(`[TICKET] Could not lock ticket ${ticket.id}, skipping`);
          continue;
        }

        try {
          // Process sequential matching from current position
          let currentMatched = ticket.matched_digits || 0;
          let stillMatching = ticket.ticket_status !== 'lost';

          // Check each newly revealed digit
          for (let i = currentMatched; i < revealedDigits && stillMatching; i++) {
            if (ticket.number.charAt(i) === winningNumber.charAt(i)) {
              currentMatched++;
            } else {
              // First mismatch - ticket is lost
              stillMatching = false;
            }
          }

          // Calculate new status
          let newStatus = ticket.ticket_status;
          if (!stillMatching) {
            newStatus = 'lost';
            results.lost++;
          } else if (currentMatched === this.TOTAL_DIGITS) {
            newStatus = 'won';
            results.matched++;
          } else if (currentMatched > 0) {
            newStatus = 'matching';
            results.matched++;
          }

          // Calculate current return
          const buyAmount = ticket.buy_amount || ticket.price || 10;
          const currentReturn = this.calculateCurrentReturn(buyAmount, currentMatched);
          const multiplier = this.getMultiplier(currentMatched);

          // Update ticket
          await connection.execute(
            `UPDATE numbers SET
             matched_digits = ?,
             current_return = ?,
             ticket_status = ?,
             last_reveal_index = ?
             WHERE id = ?`,
            [currentMatched, currentReturn, newStatus, revealedDigits, ticket.id]
          );

          results.processed++;

          // Broadcast update to ticket owner
          if (this.io && ticket.owner_id) {
            this.io.to(`user:${ticket.owner_id}`).emit('ticket:update', {
              numberId: ticket.id,
              number: ticket.number,
              matchedDigits: currentMatched,
              multiplier,
              currentReturn,
              status: newStatus,
              revealedDigits
            });
          }

          console.log(`[TICKET] Processed ${ticket.number}: ${currentMatched} matches, status=${newStatus}`);

        } finally {
          // Always unlock
          await this.unlockTicket(connection, ticket.id);
        }
      }

      await connection.commit();
      console.log(`[TICKET] Reveal processed: ${results.processed} tickets, ${results.matched} matching, ${results.lost} lost`);

      return results;

    } catch (error) {
      await connection.rollback();
      console.error('[TICKET] Error processing reveal:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Cash out a ticket (partial or full)
  async cashOut(userId, numberId) {
    // Block during reveal window
    if (this.isInRevealWindow()) {
      throw new Error('Cannot cash out during reveal execution. Please wait a few seconds.');
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get ticket with lock
      const [tickets] = await connection.execute(
        `SELECT n.*, u.balance as user_balance
         FROM numbers n
         JOIN users u ON n.owner_id = u.id
         WHERE n.id = ? AND n.owner_id = ?
         FOR UPDATE`,
        [numberId, userId]
      );

      if (tickets.length === 0) {
        throw new Error('Ticket not found or not owned by you');
      }

      const ticket = tickets[0];

      // Validate ticket status
      if (ticket.ticket_status === 'cashed_out') {
        throw new Error('Ticket already cashed out');
      }
      if (ticket.ticket_status === 'sold') {
        throw new Error('Ticket has been sold');
      }
      if (ticket.ticket_status === 'lost') {
        throw new Error('Ticket has lost - no payout available');
      }
      if (ticket.matched_digits === 0) {
        throw new Error('No matched digits - cash out requires at least 1 match');
      }

      // Lock ticket
      const locked = await this.lockTicket(connection, ticket.id);
      if (!locked) {
        throw new Error('Ticket is currently locked. Please try again.');
      }

      try {
        const matchedDigits = ticket.matched_digits;
        const buyAmount = ticket.buy_amount || ticket.price || 10;
        const multiplier = this.getMultiplier(matchedDigits);
        const payout = this.calculateCurrentReturn(buyAmount, matchedDigits);

        // Update ticket to cashed_out
        await connection.execute(
          `UPDATE numbers SET
           ticket_status = 'cashed_out',
           cashed_out_at = NOW(),
           cashout_matched_digits = ?,
           cashout_multiplier = ?,
           cashout_payout = ?
           WHERE id = ?`,
          [matchedDigits, multiplier, payout, ticket.id]
        );

        // Credit user balance
        await connection.execute(
          `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`,
          [payout, payout, userId]
        );

        // Record transaction
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'cashout', ?, ?, ?, 'number', ?, ?)`,
          [
            userId,
            payout,
            ticket.user_balance,
            parseFloat(ticket.user_balance) + payout,
            ticket.id,
            `Cash out ${ticket.number} with ${matchedDigits} matches (${multiplier}x)`
          ]
        );

        await connection.commit();

        console.log(`[TICKET] Cash out: ${ticket.number}, ${matchedDigits} matches, payout=${payout}`);

        // Broadcast update
        if (this.io) {
          this.io.to(`user:${userId}`).emit('ticket:cashed_out', {
            numberId: ticket.id,
            number: ticket.number,
            matchedDigits,
            multiplier,
            payout
          });
        }

        return {
          success: true,
          number: ticket.number,
          matchedDigits,
          multiplier,
          payout
        };

      } finally {
        await this.unlockTicket(connection, ticket.id);
      }

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get ticket details with matching info
  async getTicketDetails(numberId, userId = null) {
    const [tickets] = await db.pool.query(
      `SELECT n.*, u.username as owner_name,
              d.winning_number, d.revealed_digits as draw_revealed_digits, d.status as draw_status
       FROM numbers n
       LEFT JOIN users u ON n.owner_id = u.id
       LEFT JOIN daily_draws d ON n.draw_id = d.id
       WHERE n.id = ?`,
      [numberId]
    );

    if (tickets.length === 0) {
      return null;
    }

    const ticket = tickets[0];
    const buyAmount = ticket.buy_amount || ticket.price || 10;
    const multiplier = this.getMultiplier(ticket.matched_digits || 0);

    return {
      id: ticket.id,
      number: ticket.number,
      ownerId: ticket.owner_id,
      ownerName: ticket.owner_name,
      matchedDigits: ticket.matched_digits || 0,
      multiplier,
      currentReturn: parseFloat(ticket.current_return) || 0,
      status: ticket.ticket_status || 'active',
      buyAmount: parseFloat(buyAmount),
      price: parseFloat(ticket.price),
      drawId: ticket.draw_id,
      // Only include sensitive info if owner
      ...(userId === ticket.owner_id && {
        cashedOutAt: ticket.cashed_out_at,
        cashoutMatchedDigits: ticket.cashout_matched_digits,
        cashoutMultiplier: ticket.cashout_multiplier,
        cashoutPayout: ticket.cashout_payout
      })
    };
  }

  // Get user's tickets with matching info
  async getUserTickets(userId) {
    const [tickets] = await db.pool.query(
      `SELECT n.*, d.status as draw_status, d.revealed_digits as draw_revealed_digits
       FROM numbers n
       LEFT JOIN daily_draws d ON n.draw_id = d.id
       WHERE n.owner_id = ?
       ORDER BY n.matched_digits DESC, n.created_at DESC`,
      [userId]
    );

    return tickets.map(ticket => {
      const buyAmount = ticket.buy_amount || ticket.price || 10;
      const multiplier = this.getMultiplier(ticket.matched_digits || 0);

      return {
        id: ticket.id,
        number: ticket.number,
        matchedDigits: ticket.matched_digits || 0,
        multiplier,
        currentReturn: parseFloat(ticket.current_return) || 0,
        status: ticket.ticket_status || 'active',
        buyAmount: parseFloat(buyAmount),
        canCashOut: (ticket.matched_digits || 0) > 0 &&
                    !['cashed_out', 'sold', 'lost'].includes(ticket.ticket_status)
      };
    });
  }

  // Enroll ticket in current draw (called when buying)
  async enrollInDraw(connection, numberId, drawId, buyAmount) {
    await connection.execute(
      `UPDATE numbers SET
       draw_id = ?,
       buy_amount = ?,
       matched_digits = 0,
       current_return = 0,
       ticket_status = 'active',
       last_reveal_index = 0,
       cashed_out_at = NULL,
       cashout_matched_digits = NULL,
       cashout_multiplier = NULL,
       cashout_payout = NULL
       WHERE id = ?`,
      [drawId, buyAmount, numberId]
    );
  }

  // Reset all tickets for new draw
  async resetTicketsForNewDraw(drawId) {
    // Only reset tickets that are owned and not in terminal states from previous draws
    await db.pool.query(
      `UPDATE numbers SET
       draw_id = ?,
       matched_digits = 0,
       current_return = 0,
       ticket_status = 'active',
       last_reveal_index = 0
       WHERE owner_id IS NOT NULL
       AND ticket_status NOT IN ('cashed_out', 'sold')`,
      [drawId]
    );
  }
}

module.exports = TicketService;
