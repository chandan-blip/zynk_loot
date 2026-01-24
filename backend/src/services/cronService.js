const cron = require('node-cron');
const db = require('../config/database');

class CronService {
  constructor(io, ticketService = null) {
    this.io = io;
    this.ticketService = ticketService;
    this.TOTAL_DIGITS = 7;
    this.TIMEZONE = 'Asia/Kolkata';

    // Session configuration: 3 sessions per day with hourly digit reveals
    // Each session has 6 hours of reveal time (7 digits, 1st immediate + 6 hourly)
    this.SESSION_CONFIG = {
      1: {
        generateHour: 8,   // 8 AM: Generate number
        revealStartHour: 9,  // 9 AM: Start reveals (1st digit immediate at 8 AM)
        revealEndHour: 15    // 3 PM: All 7 digits revealed
      },
      2: {
        generateHour: 15,  // 3 PM: Generate number
        revealStartHour: 17, // 5 PM: Start reveals (1st digit immediate at 3 PM)
        revealEndHour: 23    // 11 PM: All 7 digits revealed
      },
      3: {
        generateHour: 23,  // 11 PM: Generate number
        revealStartHour: 0,  // 12 AM: Start reveals (crosses midnight)
        revealEndHour: 6     // 6 AM: All 7 digits revealed
      }
    };
  }

  // Get current time in IST timezone
  getNowIST() {
    const now = new Date();
    // Convert to IST string and parse back to get IST components
    const istString = now.toLocaleString('en-US', { timeZone: this.TIMEZONE });
    return new Date(istString);
  }

  // Get current hour in IST
  getCurrentHourIST() {
    return this.getNowIST().getHours();
  }

  // Get current time components in IST
  getCurrentTimeIST() {
    const now = this.getNowIST();
    return {
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
      date: now
    };
  }

  // Get current session based on time of day (IST)
  getCurrentSession() {
    const hour = this.getCurrentHourIST();

    // Session 1: 8 AM - 3 PM (hours 8-14)
    if (hour >= 8 && hour < 15) {
      return 1;
    }
    // Session 2: 3 PM - 11 PM (hours 15-22)
    if (hour >= 15 && hour < 23) {
      return 2;
    }
    // Session 3: 11 PM - 6 AM (hours 23, 0-5)
    // This handles both before and after midnight
    return 3;
  }

  // Get session config, handling the overnight session specially
  getSessionConfig(sessionNumber) {
    return this.SESSION_CONFIG[sessionNumber];
  }

  // Generate unique period ID: YYYYMMDD + sequence number (001, 002, etc.)
  async generatePeriodId() {
    // Use IST date for period ID
    const now = this.getNowIST();
    const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

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

  // Calculate revealed digits based on current time (hourly reveals, IST)
  // First digit reveals at generate time, then 1 per hour for 6 hours
  calculateRevealedDigits(sessionNumber = null) {
    const currentHour = this.getCurrentHourIST();

    // Use provided session or determine from current time
    const session = sessionNumber || this.getCurrentSession();
    const config = this.getSessionConfig(session);

    // Handle overnight session (Session 3: 11 PM - 6 AM)
    if (session === 3) {
      return this._calculateRevealedDigitsOvernight(currentHour, config);
    }

    // Standard session (doesn't cross midnight)
    // Before generate time - no digits revealed
    if (currentHour < config.generateHour) {
      return 0;
    }

    // After reveal end time - all digits revealed
    if (currentHour >= config.revealEndHour) {
      return this.TOTAL_DIGITS;
    }

    // During reveal period: 1 digit at generate time, then 1 per hour
    const hoursSinceGenerate = currentHour - config.generateHour;
    return Math.min(1 + hoursSinceGenerate, this.TOTAL_DIGITS);
  }

  // Handle overnight session digit calculation (crosses midnight)
  _calculateRevealedDigitsOvernight(currentHour, config) {
    // Before 11 PM on current day - no digits (unless we're in early morning of session)
    // After 6 AM - all revealed (session complete)

    // Early morning hours (0-6) - we're in the reveal phase
    if (currentHour < config.revealEndHour) {
      // Hours since 11 PM: hours until midnight + hours after midnight
      // At 12 AM: 1 hour since 11 PM → 2 digits
      // At 1 AM: 2 hours since 11 PM → 3 digits
      // etc.
      const hoursSinceGenerate = (24 - config.generateHour) + currentHour;
      return Math.min(1 + hoursSinceGenerate, this.TOTAL_DIGITS);
    }

    // Between 6 AM and 11 PM - either completed or not yet started
    if (currentHour >= config.revealEndHour && currentHour < config.generateHour) {
      return this.TOTAL_DIGITS; // Previous session completed
    }

    // At or after 11 PM - session just started
    if (currentHour >= config.generateHour) {
      const hoursSinceGenerate = currentHour - config.generateHour;
      return Math.min(1 + hoursSinceGenerate, this.TOTAL_DIGITS);
    }

    return 0;
  }

  // Get time until next digit reveal (in seconds, IST)
  getNextRevealTime(sessionNumber = null) {
    const time = this.getCurrentTimeIST();
    const currentMinutes = time.minutes;
    const currentSeconds = time.seconds;

    const session = sessionNumber || this.getCurrentSession();
    const currentRevealedDigits = this.calculateRevealedDigits(session);

    // All digits revealed
    if (currentRevealedDigits >= this.TOTAL_DIGITS) {
      return this._getTimeUntilNextSession();
    }

    // Calculate time until next hour (when next digit reveals)
    const secondsIntoCurrentHour = currentMinutes * 60 + currentSeconds;
    const secondsUntilNextHour = 3600 - secondsIntoCurrentHour;

    return secondsUntilNextHour;
  }

  // Get time until next session starts (IST)
  _getTimeUntilNextSession() {
    const now = this.getNowIST();
    const currentHour = now.getHours();

    let nextGenerateHour;
    let addDay = false;

    if (currentHour < 8) {
      nextGenerateHour = 8; // Next is session 1
    } else if (currentHour < 15) {
      nextGenerateHour = 15; // Next is session 2
    } else if (currentHour < 23) {
      nextGenerateHour = 23; // Next is session 3
    } else {
      nextGenerateHour = 8; // Next is session 1 tomorrow
      addDay = true;
    }

    const nextSession = new Date(now);
    if (addDay) {
      nextSession.setDate(nextSession.getDate() + 1);
    }
    nextSession.setHours(nextGenerateHour, 0, 0, 0);

    return Math.floor((nextSession - now) / 1000);
  }

  // Create a new draw (accepts session number parameter)
  async createNewDraw(sessionNumber = null) {
    try {
      // Use provided session or determine from current time
      const session = sessionNumber || this.getCurrentSession();
      const config = this.getSessionConfig(session);

      const periodId = await this.generatePeriodId();
      const winningNumber = this.generateWinningNumber();
      // Use IST date
      const now = this.getNowIST();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Calculate generate_time and result_time based on session
      // Result time is when last digit is revealed: generateHour + 6 hours (7 digits: 1 immediate + 6 hourly)
      const generateTime = `${String(config.generateHour).padStart(2, '0')}:00:00`;
      const resultHour = (config.generateHour + 6) % 24;
      const resultTime = `${String(resultHour).padStart(2, '0')}:00:00`;

      // Calculate initial revealed digits based on current time
      const initialRevealedDigits = this.calculateRevealedDigits(session);

      // Determine initial status based on revealed digits
      let initialStatus = 'revealing';
      if (initialRevealedDigits >= this.TOTAL_DIGITS) {
        initialStatus = 'completed';
      }

      // First, complete any active/revealing draws
      await db.pool.query(
        `UPDATE daily_draws SET status = 'completed', revealed_digits = 7, completed_at = NOW()
         WHERE status IN ('active', 'revealing')`
      );

      // Create new draw with session_number and correct initial revealed_digits
      const [result] = await db.pool.query(
        `INSERT INTO daily_draws (period_id, draw_date, session_number, winning_number, status, revealed_digits, generate_time, result_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [periodId, today, session, winningNumber, initialStatus, initialRevealedDigits, generateTime, resultTime]
      );

      // Update current period in settings
      await db.pool.query(
        `UPDATE settings SET setting_value = ? WHERE setting_key = 'current_period_id'`,
        [periodId]
      );

      // Calculate revealed number for broadcast
      const revealedNumber = winningNumber.substring(0, initialRevealedDigits) + 'X'.repeat(this.TOTAL_DIGITS - initialRevealedDigits);

      console.log(`[CRON] New draw created - Period: ${periodId}, Session: ${session}, Status: ${initialStatus}, Revealed: ${initialRevealedDigits} digits`);

      // Broadcast new draw event with correct revealed info
      if (this.io) {
        this.io.emit('draw:new', {
          periodId,
          sessionNumber: session,
          status: initialStatus,
          revealedDigits: initialRevealedDigits,
          revealedNumber,
          message: `Session ${session} draw created! ${initialRevealedDigits} digit(s) revealed.`
        });
      }

      // Reset all tickets for new draw
      if (this.ticketService) {
        try {
          await this.ticketService.resetTicketsForNewDraw(result.insertId);
          console.log(`[CRON] Tickets reset for new draw ${periodId}`);
        } catch (ticketError) {
          console.error('[CRON] Error resetting tickets:', ticketError);
        }
      }

      return { periodId, winningNumber, drawId: result.insertId, sessionNumber: session, revealedDigits: initialRevealedDigits, status: initialStatus };
    } catch (error) {
      console.error('[CRON] Error creating new draw:', error);
      throw error;
    }
  }

  // Complete draw and process winners
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

      console.log(`[CRON] Draw completed - Period: ${draw.period_id}, Session: ${draw.session_number}, Winning: ${draw.winning_number}`);

      // Broadcast completion
      if (this.io) {
        this.io.emit('draw:complete', {
          periodId: draw.period_id,
          sessionNumber: draw.session_number,
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

      // Reward voters who voted for the winning number (10 Z each)
      const VOTE_REWARD = 10;
      const [winningNumberRecord] = await db.pool.query(
        `SELECT id FROM numbers WHERE number = ?`,
        [winningNumber]
      );

      if (winningNumberRecord.length > 0) {
        const [voters] = await db.pool.query(
          `SELECT DISTINCT v.user_id FROM votes v
           WHERE v.number_id = ? AND v.draw_id = ?`,
          [winningNumberRecord[0].id, draw.id]
        );

        for (const voter of voters) {
          // Credit the reward
          await db.pool.query(
            `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`,
            [VOTE_REWARD, VOTE_REWARD, voter.user_id]
          );

          // Record transaction
          await db.pool.query(
            `INSERT INTO transactions (user_id, type, amount, description)
             VALUES (?, 'prize', ?, ?)`,
            [voter.user_id, VOTE_REWARD, `Vote reward for predicting winning number ${winningNumber}`]
          );

          console.log(`[CRON] Vote reward: User ${voter.user_id}, Reward: ${VOTE_REWARD} Z`);

          if (this.io) {
            this.io.to(`user:${voter.user_id}`).emit('vote:reward', {
              periodId: draw.period_id,
              number: winningNumber,
              reward: VOTE_REWARD
            });
          }
        }

        console.log(`[CRON] Vote rewards processed - ${voters.length} voters rewarded`);
      }
    } catch (error) {
      console.error('[CRON] Error processing winners:', error);
      throw error;
    }
  }

  // Get current draw - returns DB data directly (DB is source of truth)
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

    // No draws exist - return clear fallback data
    if (draws.length === 0) {
      const currentSession = this.getCurrentSession();
      return {
        id: null,
        periodId: null,
        drawDate: null,
        sessionNumber: currentSession,
        status: 'none',
        revealedNumber: 'XXXXXXX',
        revealedDigits: 0,
        totalDigits: this.TOTAL_DIGITS,
        digitsRemaining: this.TOTAL_DIGITS,
        totalPool: 0,
        generateTime: null,
        resultTime: null,
        nextRevealIn: this._getTimeUntilNextSession(),
        timeUntilComplete: 0,
        isComplete: false,
        message: 'No active draw. Waiting for next session to start.'
      };
    }

    const draw = draws[0];
    const isComplete = draw.status === 'completed';
    const sessionNumber = draw.session_number || this.getCurrentSession();
    const revealedDigits = parseInt(draw.revealed_digits) || 0;

    // SECURITY: Only send revealed portion - NEVER send full number to client
    // If no winning number exists yet or 0 digits revealed, show all X's
    let revealedNumber = 'XXXXXXX';
    if (draw.winning_number && revealedDigits > 0) {
      revealedNumber = draw.winning_number.substring(0, revealedDigits) + 'X'.repeat(this.TOTAL_DIGITS - revealedDigits);
    }

    // Simple time calculations
    const now = this.getNowIST();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    const currentHour = now.getHours();

    // Time until next hour (when next digit reveals)
    const nextRevealIn = isComplete ? 0 : (3600 - (currentMinutes * 60 + currentSeconds));

    // Calculate time until complete (when all 7 digits revealed)
    // Result hour = generateHour + 6
    const config = this.getSessionConfig(sessionNumber);
    const resultHour = (config.generateHour + 6) % 24;
    let timeUntilComplete = 0;

    if (!isComplete) {
      // Calculate hours remaining until result time
      let hoursRemaining;
      if (sessionNumber === 3 && currentHour >= config.generateHour) {
        // Overnight session, before midnight: hours until midnight + hours after midnight until result
        hoursRemaining = (24 - currentHour) + resultHour;
      } else if (sessionNumber === 3 && currentHour < resultHour) {
        // Overnight session, after midnight: hours until result
        hoursRemaining = resultHour - currentHour;
      } else {
        // Normal session
        hoursRemaining = resultHour - currentHour;
      }
      // Convert to seconds and subtract elapsed time in current hour
      timeUntilComplete = Math.max(0, (hoursRemaining * 3600) - (currentMinutes * 60 + currentSeconds));
    }

    return {
      id: draw.id || null,
      periodId: draw.period_id || null,
      drawDate: draw.draw_date || null,
      sessionNumber,
      status: draw.status || 'unknown',
      revealedNumber,
      revealedDigits,
      totalDigits: this.TOTAL_DIGITS,
      digitsRemaining: this.TOTAL_DIGITS - revealedDigits,
      totalPool: parseFloat(draw.total_pool) || 0,
      generateTime: draw.generate_time || null,
      resultTime: draw.result_time || null,
      nextRevealIn,
      timeUntilComplete,
      isComplete
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

    // No draws exist - return clear fallback data
    if (draws.length === 0) {
      return {
        id: null,
        periodId: null,
        drawDate: null,
        sessionNumber: this.getCurrentSession(),
        status: 'none',
        winningNumber: null,
        revealedDigits: 0,
        totalDigits: this.TOTAL_DIGITS,
        totalPool: 0,
        isComplete: false,
        message: 'No draws exist. Create a new draw to start.'
      };
    }

    const draw = draws[0];

    return {
      id: draw.id || null,
      periodId: draw.period_id || null,
      drawDate: draw.draw_date || null,
      sessionNumber: draw.session_number || this.getCurrentSession(),
      status: draw.status || 'unknown',
      winningNumber: draw.winning_number || null,
      revealedDigits: parseInt(draw.revealed_digits) || 0,
      totalDigits: this.TOTAL_DIGITS,
      totalPool: parseFloat(draw.total_pool) || 0,
      isComplete: draw.status === 'completed'
    };
  }

  // Auto-reveal digits based on time and broadcast to users (hourly)
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
      const sessionNumber = draw.session_number || 1;
      const currentDbDigits = draw.revealed_digits || 0;
      const timeBasedDigits = this.calculateRevealedDigits(sessionNumber);

      // Only update if time-based calculation is ahead of database
      if (timeBasedDigits > currentDbDigits && timeBasedDigits <= this.TOTAL_DIGITS) {
        // Update database
        await db.pool.query(
          `UPDATE daily_draws SET revealed_digits = ?, status = 'revealing' WHERE id = ?`,
          [timeBasedDigits, draw.id]
        );

        // Process ticket matching for all active tickets
        if (this.ticketService) {
          try {
            await this.ticketService.processReveal(draw, timeBasedDigits);
          } catch (ticketError) {
            console.error('[CRON] Error processing ticket reveals:', ticketError);
          }
        }

        // Calculate revealed number portion
        const revealedNumber = draw.winning_number.substring(0, timeBasedDigits) +
                              'X'.repeat(this.TOTAL_DIGITS - timeBasedDigits);

        // Calculate next reveal time
        const nextRevealIn = this.getNextRevealTime(sessionNumber);

        // Calculate digits remaining
        const digitsRemaining = this.TOTAL_DIGITS - timeBasedDigits;
        const secondsPerDigit = 3600; // 1 hour per digit

        console.log(`[CRON] Auto-revealed digit ${timeBasedDigits} for session ${sessionNumber} - ${revealedNumber}`);

        // Broadcast to all connected users
        if (this.io) {
          this.io.emit('draw:digit-revealed', {
            revealedNumber,
            revealedDigits: timeBasedDigits,
            totalDigits: this.TOTAL_DIGITS,
            digitsRemaining,
            sessionNumber,
            nextRevealIn,
            secondsPerDigit,
            isAutoReveal: true
          });
        }

        return {
          revealedDigits: timeBasedDigits,
          revealedNumber,
          digitsRemaining,
          sessionNumber,
          nextRevealIn
        };
      }

      return null;
    } catch (error) {
      console.error('[CRON] Error in autoRevealDigits:', error);
      return null;
    }
  }

  // Start all cron jobs for 3 sessions per day
  start() {
    // Session 1: Generate at 8 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('[CRON] 8 AM - Creating Session 1 draw...');
      await this.createNewDraw(1);
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Session 2: Generate at 3 PM
    cron.schedule('0 15 * * *', async () => {
      console.log('[CRON] 3 PM - Creating Session 2 draw...');
      await this.createNewDraw(2);
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Session 3: Generate at 11 PM
    cron.schedule('0 23 * * *', async () => {
      console.log('[CRON] 11 PM - Creating Session 3 draw...');
      await this.createNewDraw(3);
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Session 1: Complete at 3 PM (before session 2 starts)
    cron.schedule('0 15 * * *', async () => {
      console.log('[CRON] 3 PM - Completing Session 1...');
      await this.completeAndProcessWinners();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Session 2: Complete at 11 PM (before session 3 starts)
    cron.schedule('0 23 * * *', async () => {
      console.log('[CRON] 11 PM - Completing Session 2...');
      await this.completeAndProcessWinners();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Session 3: Complete at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[CRON] 6 AM - Completing Session 3...');
      await this.completeAndProcessWinners();
    }, {
      timezone: 'Asia/Kolkata'
    });

    // Hourly auto-reveal during all active windows
    // Run at the top of each hour to reveal digits
    cron.schedule('0 * * * *', async () => {
      const session = this.getCurrentSession();
      const config = this.getSessionConfig(session);
      const hour = this.getCurrentHourIST();

      // Check if we're in a reveal window
      let inRevealWindow = false;

      if (session === 3) {
        // Overnight session: 11 PM - 6 AM
        inRevealWindow = hour >= config.generateHour || hour < config.revealEndHour;
      } else {
        // Normal sessions
        inRevealWindow = hour >= config.generateHour && hour < config.revealEndHour;
      }

      if (inRevealWindow) {
        console.log(`[CRON] Hourly reveal check for session ${session} at IST hour ${hour}...`);
        await this.autoRevealDigits();
      }
    }, {
      timezone: 'Asia/Kolkata'
    });

    console.log('[CRON] Cron jobs scheduled for 3 sessions/day:');
    console.log('  Session 1: Generate 8 AM, Reveal 9 AM-3 PM, Complete 3 PM');
    console.log('  Session 2: Generate 3 PM, Reveal 5 PM-11 PM, Complete 11 PM');
    console.log('  Session 3: Generate 11 PM, Reveal 12 AM-6 AM, Complete 6 AM');
    console.log('  - Hourly auto-reveal during active windows');
  }

  // Manual triggers for testing
  async triggerNewDraw(sessionNumber = null) {
    return await this.createNewDraw(sessionNumber);
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
