const cron = require('node-cron');
const db = require('../config/database');

class CronService {
  constructor(io) {
    this.io = io;
    this.GENERATE_HOUR = 20; // 8 PM
    this.REVEAL_HOUR = 21;   // 9 PM
    this.TOTAL_DIGITS = 7;
  }

  // Generate unique period ID: YYYYMMDD + sequence number (001, 002, etc.)
  async generatePeriodId() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const [existing] = await db.pool.query(
      `SELECT period_id FROM daily_draws
       WHERE period_id LIKE ?
       ORDER BY period_id DESC LIMIT 1`,
      [`${today}%`]
    );

    let sequence = 1;
    if (existing.length > 0) {
      const lastSequence = parseInt(existing[0].period_id.slice(-3));
      sequence = lastSequence + 1;
    }

    return `${today}${String(sequence).padStart(3, '0')}`;
  }

  // Generate random 7-digit winning number
  generateWinningNumber() {
    return String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
  }

  // Calculate revealed digits based on current time (8 PM to 9 PM = 7 digits)
  calculateRevealedDigits() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Before 8 PM - no digits revealed for current draw
    if (currentHour < this.GENERATE_HOUR) {
      return 0;
    }

    // After 9 PM - all digits revealed
    if (currentHour >= this.REVEAL_HOUR) {
      return this.TOTAL_DIGITS;
    }

    // Between 8 PM and 9 PM - progressive reveal
    // First digit shows immediately at 8 PM, remaining 6 digits over 60 minutes
    // 60 minutes / 6 remaining digits = 10 minutes per digit
    const minutesSince8PM = (currentHour - this.GENERATE_HOUR) * 60 + currentMinutes;
    const secondsSince8PM = minutesSince8PM * 60 + currentSeconds;

    // Total seconds in reveal period (1 hour), 6 remaining digits after first
    const totalRevealSeconds = 60 * 60;
    const secondsPerDigit = totalRevealSeconds / (this.TOTAL_DIGITS - 1); // ~600 seconds = 10 min

    // Start with 1 digit, add more as time passes
    const additionalDigits = Math.floor(secondsSince8PM / secondsPerDigit);
    return Math.min(1 + additionalDigits, this.TOTAL_DIGITS);
  }

  // Get time until next digit reveal (in seconds)
  getNextRevealTime() {
    const now = new Date();
    const currentHour = now.getHours();

    // Before 8 PM - return time until 8 PM
    if (currentHour < this.GENERATE_HOUR) {
      const next8PM = new Date(now);
      next8PM.setHours(this.GENERATE_HOUR, 0, 0, 0);
      return Math.floor((next8PM - now) / 1000);
    }

    // After 9 PM - return time until next day's 8 PM
    if (currentHour >= this.REVEAL_HOUR) {
      const tomorrow8PM = new Date(now);
      tomorrow8PM.setDate(tomorrow8PM.getDate() + 1);
      tomorrow8PM.setHours(this.GENERATE_HOUR, 0, 0, 0);
      return Math.floor((tomorrow8PM - now) / 1000);
    }

    // During reveal period - calculate time to next digit
    const currentRevealedDigits = this.calculateRevealedDigits();
    if (currentRevealedDigits >= this.TOTAL_DIGITS) {
      return 0;
    }

    // Calculate when next digit reveals (first digit immediate, then every 10 min)
    const secondsPerDigit = 3600 / (this.TOTAL_DIGITS - 1); // ~600 seconds = 10 min
    const today8PM = new Date(now);
    today8PM.setHours(this.GENERATE_HOUR, 0, 0, 0);

    // Next digit time: (currentRevealedDigits - 1) * secondsPerDigit since first is immediate
    const nextDigitRevealTime = new Date(today8PM.getTime() + (currentRevealedDigits) * secondsPerDigit * 1000);
    return Math.max(0, Math.floor((nextDigitRevealTime - now) / 1000));
  }

  // Create a new draw at 8 PM (pending status)
  async createNewDraw() {
    try {
      const periodId = await this.generatePeriodId();
      const winningNumber = this.generateWinningNumber();
      const today = new Date().toISOString().split('T')[0];

      // First, complete any active/revealing draws
      await db.pool.query(
        `UPDATE daily_draws SET status = 'completed', revealed_digits = 7, completed_at = NOW()
         WHERE status IN ('active', 'revealing')`
      );

      // Create new draw with 'pending' status
      const [result] = await db.pool.query(
        `INSERT INTO daily_draws (period_id, draw_date, winning_number, status, revealed_digits, generate_time, result_time)
         VALUES (?, ?, ?, 'pending', 0, '20:00:00', '21:00:00')`,
        [periodId, today, winningNumber]
      );

      // Update current period in settings
      await db.pool.query(
        `UPDATE settings SET setting_value = ? WHERE setting_key = 'current_period_id'`,
        [periodId]
      );

      console.log(`[CRON] New draw created - Period: ${periodId}, Status: pending`);

      // Broadcast new draw event
      if (this.io) {
        this.io.emit('draw:new', {
          periodId,
          status: 'pending',
          message: 'New draw created! Revealing starts now.'
        });
      }

      // Immediately start revealing (change to 'revealing' status)
      await db.pool.query(
        `UPDATE daily_draws SET status = 'revealing' WHERE id = ?`,
        [result.insertId]
      );

      return { periodId, winningNumber, drawId: result.insertId };
    } catch (error) {
      console.error('[CRON] Error creating new draw:', error);
      throw error;
    }
  }

  // Complete draw at 9 PM and process winners
  async completeAndProcessWinners() {
    try {
      // Get current revealing draw
      const [draws] = await db.pool.query(
        `SELECT * FROM daily_draws WHERE status = 'revealing' ORDER BY created_at DESC LIMIT 1`
      );

      if (draws.length === 0) {
        console.log('[CRON] No revealing draw to complete');
        return null;
      }

      const draw = draws[0];

      // Update to completed with all digits revealed
      await db.pool.query(
        `UPDATE daily_draws SET status = 'completed', revealed_digits = 7, completed_at = NOW() WHERE id = ?`,
        [draw.id]
      );

      // Process winners
      await this.processWinners(draw);

      console.log(`[CRON] Draw completed - Period: ${draw.period_id}, Winning: ${draw.winning_number}`);

      // Broadcast completion
      if (this.io) {
        this.io.emit('draw:complete', {
          periodId: draw.period_id,
          winningNumber: draw.winning_number,
          status: 'completed'
        });
      }

      return draw;
    } catch (error) {
      console.error('[CRON] Error completing draw:', error);
      throw error;
    }
  }

  // Process winners for a draw
  // Distribution: Exact match gets 40%, 9 near matches (same prefix, different last digit) share 10%
  async processWinners(draw) {
    try {
      const winningNumber = draw.winning_number;
      const prefix = winningNumber.substring(0, 6); // First 6 digits
      const winningLastDigit = winningNumber.charAt(6); // Last digit
      const totalPool = parseFloat(draw.total_pool);

      // Prize distribution
      const exactMatchPrize = totalPool * 0.4; // 40% for exact match
      const nearMatchPool = totalPool * 0.1; // 10% shared among near matches

      // Find exact match winner (all 7 digits match)
      const [exactMatches] = await db.pool.query(
        `SELECT n.*, u.id as user_id
         FROM numbers n
         JOIN users u ON n.owner_id = u.id
         WHERE n.number = ?`,
        [winningNumber]
      );

      // Find near matches (same prefix, different last digit: 0-9 except winning digit)
      const [nearMatches] = await db.pool.query(
        `SELECT n.*, u.id as user_id
         FROM numbers n
         JOIN users u ON n.owner_id = u.id
         WHERE n.number LIKE ? AND n.number != ?`,
        [`${prefix}_`, winningNumber]
      );

      if (exactMatches.length === 0 && nearMatches.length === 0) {
        console.log(`[CRON] No winners for period ${draw.period_id}`);
        return;
      }

      // Process exact match winner (40% of pool)
      for (const winner of exactMatches) {
        await db.pool.query(
          `INSERT INTO winners (draw_id, user_id, number_id, period_id, matching_digits, prize_amount)
           VALUES (?, ?, ?, ?, 7, ?)`,
          [draw.id, winner.user_id, winner.id, draw.period_id, exactMatchPrize]
        );

        await db.pool.query(
          `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`,
          [exactMatchPrize, exactMatchPrize, winner.user_id]
        );

        await db.pool.query(
          `UPDATE numbers SET times_won = times_won + 1, last_won_date = ? WHERE id = ?`,
          [draw.draw_date, winner.id]
        );

        console.log(`[CRON] Exact match winner: User ${winner.user_id}, Prize: ${exactMatchPrize}`);

        if (this.io) {
          this.io.to(`user:${winner.user_id}`).emit('prize:won', {
            periodId: draw.period_id,
            number: winningNumber,
            prize: exactMatchPrize,
            matchType: 'exact'
          });
        }
      }

      // Process near match winners (share 10% of pool)
      if (nearMatches.length > 0) {
        const perNearMatchPrize = nearMatchPool / nearMatches.length;

        for (const winner of nearMatches) {
          await db.pool.query(
            `INSERT INTO winners (draw_id, user_id, number_id, period_id, matching_digits, prize_amount)
             VALUES (?, ?, ?, ?, 6, ?)`,
            [draw.id, winner.user_id, winner.id, draw.period_id, perNearMatchPrize]
          );

          await db.pool.query(
            `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`,
            [perNearMatchPrize, perNearMatchPrize, winner.user_id]
          );

          await db.pool.query(
            `UPDATE numbers SET times_won = times_won + 1, last_won_date = ? WHERE id = ?`,
            [draw.draw_date, winner.id]
          );

          console.log(`[CRON] Near match winner: User ${winner.user_id}, Number: ${winner.number}, Prize: ${perNearMatchPrize}`);

          if (this.io) {
            this.io.to(`user:${winner.user_id}`).emit('prize:won', {
              periodId: draw.period_id,
              number: winner.number,
              prize: perNearMatchPrize,
              matchType: 'near'
            });
          }
        }
      }

      console.log(`[CRON] Winners processed - Exact: ${exactMatches.length}, Near: ${nearMatches.length}`);
    } catch (error) {
      console.error('[CRON] Error processing winners:', error);
      throw error;
    }
  }

  // Get current draw with calculated revealed digits (PUBLIC - secure version)
  async getCurrentDraw() {
    // Get the most recent draw that's not completed
    let [draws] = await db.pool.query(
      `SELECT * FROM daily_draws WHERE status IN ('pending', 'revealing', 'active') ORDER BY created_at DESC LIMIT 1`
    );

    // If no active draw, get the most recent completed one
    if (draws.length === 0) {
      [draws] = await db.pool.query(
        `SELECT * FROM daily_draws ORDER BY created_at DESC LIMIT 1`
      );
    }

    if (draws.length === 0) {
      return null;
    }

    const draw = draws[0];
    const isComplete = draw.status === 'completed';

    // Calculate revealed digits: use the MAX of database value and time-based calculation
    // This ensures admin manual reveals are respected, while also allowing time-based auto-reveal
    const timeBasedDigits = this.calculateRevealedDigits();
    const dbDigits = draw.revealed_digits || 0;
    const actualRevealedDigits = isComplete ? this.TOTAL_DIGITS : Math.max(timeBasedDigits, dbDigits);

    // SECURITY: Only send revealed portion - NEVER send full number to client
    // Mask unrevealed digits with X on the SERVER side
    const revealedNumber = draw.winning_number.substring(0, actualRevealedDigits) +
                          'X'.repeat(this.TOTAL_DIGITS - actualRevealedDigits);

    // Calculate time until next reveal
    const nextRevealIn = this.getNextRevealTime();

    // Calculate time until full reveal (9 PM)
    const now = new Date();
    const today9PM = new Date(now);
    today9PM.setHours(this.REVEAL_HOUR, 0, 0, 0);
    const timeUntilComplete = now >= today9PM ? 0 : Math.floor((today9PM - now) / 1000);

    // Calculate remaining digits info
    const digitsRemaining = this.TOTAL_DIGITS - actualRevealedDigits;
    const secondsPerDigit = Math.floor(3600 / (this.TOTAL_DIGITS - 1));

    // Build reveal schedule (when each remaining digit will be revealed)
    const revealSchedule = [];
    if (!isComplete && actualRevealedDigits < this.TOTAL_DIGITS) {
      const now = new Date();
      const today8PM = new Date(now);
      today8PM.setHours(this.GENERATE_HOUR, 0, 0, 0);

      for (let i = actualRevealedDigits + 1; i <= this.TOTAL_DIGITS; i++) {
        // First digit is immediate at 8 PM, then each subsequent every ~10 min
        const revealTime = new Date(today8PM.getTime() + (i - 1) * secondsPerDigit * 1000);
        const secondsUntil = Math.max(0, Math.floor((revealTime - now) / 1000));
        revealSchedule.push({
          digitNumber: i,
          revealsIn: secondsUntil,
          revealTime: revealTime.toISOString()
        });
      }
    }

    return {
      id: draw.id,
      periodId: draw.period_id,
      drawDate: draw.draw_date,
      status: draw.status,
      // SECURE: Only send the masked number - unrevealed digits are hidden server-side
      revealedNumber,
      revealedDigits: actualRevealedDigits,
      totalDigits: this.TOTAL_DIGITS,
      digitsRemaining,
      totalPool: parseFloat(draw.total_pool || 0),
      generateTime: draw.generate_time,
      resultTime: draw.result_time,
      nextRevealIn,
      timeUntilComplete,
      isComplete,
      secondsPerDigit,
      revealSchedule
    };
  }

  // Get current draw for ADMIN (includes full winning number)
  async getCurrentDrawAdmin() {
    let [draws] = await db.pool.query(
      `SELECT * FROM daily_draws WHERE status IN ('pending', 'revealing', 'active') ORDER BY created_at DESC LIMIT 1`
    );

    if (draws.length === 0) {
      [draws] = await db.pool.query(
        `SELECT * FROM daily_draws ORDER BY created_at DESC LIMIT 1`
      );
    }

    if (draws.length === 0) {
      return null;
    }

    const draw = draws[0];
    const isComplete = draw.status === 'completed';

    // Use MAX of database value and time-based calculation
    const timeBasedDigits = this.calculateRevealedDigits();
    const dbDigits = draw.revealed_digits || 0;
    const actualRevealedDigits = isComplete ? this.TOTAL_DIGITS : Math.max(timeBasedDigits, dbDigits);

    return {
      id: draw.id,
      periodId: draw.period_id,
      drawDate: draw.draw_date,
      status: draw.status,
      // Admin can see full number for management
      winningNumber: draw.winning_number,
      revealedDigits: actualRevealedDigits,
      totalDigits: this.TOTAL_DIGITS,
      totalPool: parseFloat(draw.total_pool || 0),
      isComplete
    };
  }

  // Auto-reveal digits based on time and broadcast to users
  async autoRevealDigits() {
    try {
      // Get active/revealing draw
      const [draws] = await db.pool.query(
        `SELECT * FROM daily_draws WHERE status IN ('active', 'revealing') ORDER BY created_at DESC LIMIT 1`
      );

      if (draws.length === 0) {
        return null;
      }

      const draw = draws[0];
      const currentDbDigits = draw.revealed_digits || 0;
      const timeBasedDigits = this.calculateRevealedDigits();

      // Only update if time-based calculation is ahead of database
      if (timeBasedDigits > currentDbDigits && timeBasedDigits <= this.TOTAL_DIGITS) {
        // Update database
        await db.pool.query(
          `UPDATE daily_draws SET revealed_digits = ?, status = 'revealing' WHERE id = ?`,
          [timeBasedDigits, draw.id]
        );

        // Calculate revealed number portion
        const revealedNumber = draw.winning_number.substring(0, timeBasedDigits) +
                              'X'.repeat(this.TOTAL_DIGITS - timeBasedDigits);

        // Calculate next reveal time
        const nextRevealIn = this.getNextRevealTime();

        // Calculate digits remaining and time for each
        const digitsRemaining = this.TOTAL_DIGITS - timeBasedDigits;
        const secondsPerDigit = Math.floor(3600 / (this.TOTAL_DIGITS - 1));

        console.log(`[CRON] Auto-revealed digit ${timeBasedDigits} - ${revealedNumber}`);

        // Broadcast to all connected users (use same event as admin reveal)
        if (this.io) {
          this.io.emit('draw:digit-revealed', {
            revealedNumber,
            revealedDigits: timeBasedDigits,
            totalDigits: this.TOTAL_DIGITS,
            digitsRemaining,
            nextRevealIn,
            secondsPerDigit,
            isAutoReveal: true
          });
        }

        return {
          revealedDigits: timeBasedDigits,
          revealedNumber,
          digitsRemaining,
          nextRevealIn
        };
      }

      return null;
    } catch (error) {
      console.error('[CRON] Error in autoRevealDigits:', error);
      return null;
    }
  }

  // Start all cron jobs
  start() {
    // At 8 PM: Create new draw and start revealing
    cron.schedule('0 20 * * *', async () => {
      console.log('[CRON] 8 PM - Creating new draw and starting reveal...');
      await this.createNewDraw();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Every minute during reveal period (8 PM - 9 PM): Auto-reveal digits
    cron.schedule('* 20 * * *', async () => {
      await this.autoRevealDigits();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // At 9 PM: Complete current draw and process winners
    cron.schedule('0 21 * * *', async () => {
      console.log('[CRON] 9 PM - Completing draw and processing winners...');
      await this.completeAndProcessWinners();
    }, {
      timezone: 'Asia/Kolkata'
    });

    console.log('[CRON] Cron jobs scheduled:');
    console.log('  - 8:00 PM: Generate new number, start revealing');
    console.log('  - 8:00-9:00 PM: Auto-reveal digits every minute');
    console.log('  - 9:00 PM: Complete reveal, process winners');
  }

  // Manual triggers for testing
  async triggerNewDraw() {
    return await this.createNewDraw();
  }

  async triggerComplete() {
    return await this.completeAndProcessWinners();
  }

  // Manual trigger for auto-reveal (for testing)
  async triggerAutoReveal() {
    return await this.autoRevealDigits();
  }
}

module.exports = CronService;
