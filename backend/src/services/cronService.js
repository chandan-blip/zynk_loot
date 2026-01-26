const cron = require('node-cron');
const db = require('../config/database');

class CronService {
  constructor(io, ticketService = null) {
    this.io = io;
    this.ticketService = ticketService;
    this.configLoaded = false;
    this.scheduledJobs = [];
    this.jobRegistry = {}; // Maps job name to job_schedule id

    // Default configuration (will be overridden by database values)
    this.config = {
      TOTAL_DIGITS: 7,
      TIMEZONE: 'Asia/Kolkata',
      CRON_ENABLED: true,
      AUTO_REVEAL_ENABLED: true,
      EXACT_MATCH_MULTIPLIER: 0.4,
      NEAR_MATCH_MULTIPLIER: 0.1,
      VOTE_REWARD: 10,
      SESSION_CONFIG: {
        1: { generateHour: 8, revealStartHour: 9, revealEndHour: 15 },
        2: { generateHour: 15, revealStartHour: 17, revealEndHour: 23 },
        3: { generateHour: 23, revealStartHour: 0, revealEndHour: 6 }
      }
    };
  }

  // Load configuration from database
  async loadConfig() {
    try {
      const [settings] = await db.pool.query(
        `SELECT setting_key, setting_value FROM settings WHERE setting_key IN (
          'total_digits', 'timezone', 'cron_enabled', 'auto_reveal_enabled',
          'exact_match_multiplier', 'near_match_multiplier', 'vote_reward',
          'session_1_generate_hour', 'session_1_reveal_start_hour', 'session_1_reveal_end_hour',
          'session_2_generate_hour', 'session_2_reveal_start_hour', 'session_2_reveal_end_hour',
          'session_3_generate_hour', 'session_3_reveal_start_hour', 'session_3_reveal_end_hour'
        )`
      );

      const configMap = {};
      settings.forEach(s => {
        configMap[s.setting_key] = s.setting_value;
      });

      this.config.TOTAL_DIGITS = parseInt(configMap['total_digits']) || 7;
      this.config.TIMEZONE = configMap['timezone'] || 'Asia/Kolkata';
      this.config.CRON_ENABLED = configMap['cron_enabled'] !== 'false';
      this.config.AUTO_REVEAL_ENABLED = configMap['auto_reveal_enabled'] !== 'false';
      this.config.EXACT_MATCH_MULTIPLIER = parseFloat(configMap['exact_match_multiplier']) || 0.4;
      this.config.NEAR_MATCH_MULTIPLIER = parseFloat(configMap['near_match_multiplier']) || 0.1;
      this.config.VOTE_REWARD = parseFloat(configMap['vote_reward']) || 10;

      this.config.SESSION_CONFIG = {
        1: {
          generateHour: parseInt(configMap['session_1_generate_hour']) || 8,
          revealStartHour: parseInt(configMap['session_1_reveal_start_hour']) || 9,
          revealEndHour: parseInt(configMap['session_1_reveal_end_hour']) || 15
        },
        2: {
          generateHour: parseInt(configMap['session_2_generate_hour']) || 15,
          revealStartHour: parseInt(configMap['session_2_reveal_start_hour']) || 17,
          revealEndHour: parseInt(configMap['session_2_reveal_end_hour']) || 23
        },
        3: {
          generateHour: parseInt(configMap['session_3_generate_hour']) || 23,
          revealStartHour: parseInt(configMap['session_3_reveal_start_hour']) || 0,
          revealEndHour: parseInt(configMap['session_3_reveal_end_hour']) || 6
        }
      };

      this.configLoaded = true;
      console.log('[CRON] Configuration loaded from database');
      console.log(`[CRON] Timezone: ${this.config.TIMEZONE}, Total Digits: ${this.config.TOTAL_DIGITS}`);
      console.log(`[CRON] Prize multipliers - Exact: ${this.config.EXACT_MATCH_MULTIPLIER * 100}%, Near: ${this.config.NEAR_MATCH_MULTIPLIER * 100}%`);

      return this.config;
    } catch (error) {
      console.error('[CRON] Error loading config from database, using defaults:', error.message);
      this.configLoaded = true;
      return this.config;
    }
  }

  // Register a job in the job_schedule table
  async registerJob(jobName, jobType, cronExpression, sessionNumber = null, metadata = null) {
    try {
      // Calculate next run time
      const nextRunAt = this._calculateNextRun(cronExpression);

      const [result] = await db.pool.query(
        `INSERT INTO job_schedule
         (job_name, job_type, session_number, cron_expression, timezone, status, is_enabled, next_run_at, metadata)
         VALUES (?, ?, ?, ?, ?, 'scheduled', TRUE, ?, ?)
         ON DUPLICATE KEY UPDATE
           cron_expression = VALUES(cron_expression),
           timezone = VALUES(timezone),
           status = 'scheduled',
           is_enabled = TRUE,
           next_run_at = VALUES(next_run_at),
           metadata = VALUES(metadata),
           updated_at = NOW()`,
        [jobName, jobType, sessionNumber, cronExpression, this.config.TIMEZONE, nextRunAt, JSON.stringify(metadata)]
      );

      // Get the job ID
      const [job] = await db.pool.query(
        'SELECT id FROM job_schedule WHERE job_name = ?',
        [jobName]
      );

      if (job.length > 0) {
        this.jobRegistry[jobName] = job[0].id;
      }

      return result;
    } catch (error) {
      console.error(`[CRON] Error registering job ${jobName}:`, error.message);
    }
  }

  // Calculate next run time from cron expression
  _calculateNextRun(cronExpression) {
    try {
      const interval = cron.schedule(cronExpression, () => {}, {
        timezone: this.config.TIMEZONE,
        scheduled: false
      });
      // node-cron doesn't provide next run, so we'll approximate
      const now = new Date();
      const parts = cronExpression.split(' ');
      if (parts.length >= 2) {
        const minute = parseInt(parts[0]) || 0;
        const hour = parseInt(parts[1]) || 0;
        const next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Log job execution start
  async logJobStart(jobName) {
    const jobId = this.jobRegistry[jobName];
    if (!jobId) return null;

    try {
      // Update job status to running
      await db.pool.query(
        `UPDATE job_schedule SET status = 'running', updated_at = NOW() WHERE id = ?`,
        [jobId]
      );

      // Insert history record
      const [result] = await db.pool.query(
        `INSERT INTO job_schedule_history (job_id, job_name, job_type, session_number, status, started_at)
         SELECT id, job_name, job_type, session_number, 'started', NOW()
         FROM job_schedule WHERE id = ?`,
        [jobId]
      );

      return result.insertId;
    } catch (error) {
      console.error(`[CRON] Error logging job start for ${jobName}:`, error.message);
      return null;
    }
  }

  // Log job execution completion
  async logJobComplete(jobName, historyId, success, resultSummary = null, errorMessage = null) {
    const jobId = this.jobRegistry[jobName];
    if (!jobId) return;

    try {
      const status = success ? 'completed' : 'failed';
      const runStatus = success ? 'success' : 'failed';

      // Update history record
      if (historyId) {
        await db.pool.query(
          `UPDATE job_schedule_history
           SET status = ?, completed_at = NOW(),
               duration_ms = TIMESTAMPDIFF(MICROSECOND, started_at, NOW()) / 1000,
               result_summary = ?, error_message = ?
           WHERE id = ?`,
          [status, resultSummary, errorMessage, historyId]
        );
      }

      // Calculate next run
      const [jobData] = await db.pool.query(
        'SELECT cron_expression FROM job_schedule WHERE id = ?',
        [jobId]
      );
      const nextRunAt = jobData.length > 0 ? this._calculateNextRun(jobData[0].cron_expression) : null;

      // Update job schedule
      await db.pool.query(
        `UPDATE job_schedule
         SET status = 'scheduled',
             last_run_at = NOW(),
             last_run_status = ?,
             last_error = ?,
             next_run_at = ?,
             run_count = run_count + 1,
             success_count = success_count + ?,
             fail_count = fail_count + ?,
             updated_at = NOW()
         WHERE id = ?`,
        [runStatus, errorMessage, nextRunAt, success ? 1 : 0, success ? 0 : 1, jobId]
      );
    } catch (error) {
      console.error(`[CRON] Error logging job completion for ${jobName}:`, error.message);
    }
  }

  // Wrapper to execute job with logging
  async executeWithLogging(jobName, jobFn) {
    const historyId = await this.logJobStart(jobName);
    const startTime = Date.now();

    try {
      const result = await jobFn();
      const duration = Date.now() - startTime;
      await this.logJobComplete(jobName, historyId, true, JSON.stringify(result));
      console.log(`[CRON] Job ${jobName} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logJobComplete(jobName, historyId, false, null, error.message);
      console.error(`[CRON] Job ${jobName} failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  // Disable all jobs in database
  async disableAllJobs() {
    try {
      await db.pool.query(
        `UPDATE job_schedule SET status = 'disabled', is_enabled = FALSE, updated_at = NOW()`
      );
    } catch (error) {
      console.error('[CRON] Error disabling jobs:', error.message);
    }
  }

  // Refresh config from database
  async refreshConfig() {
    console.log('[CRON] Refreshing configuration from database...');
    await this.loadConfig();

    if (this.scheduledJobs.length > 0) {
      console.log('[CRON] Rescheduling cron jobs with updated config...');
      this.stop();
      await this.start();
    }

    return this.config;
  }

  // Get current configuration
  getConfig() {
    return this.config;
  }

  // Get all scheduled jobs from database
  async getScheduledJobs() {
    try {
      const [jobs] = await db.pool.query(
        `SELECT * FROM job_schedule ORDER BY job_type, session_number`
      );
      return jobs;
    } catch (error) {
      console.error('[CRON] Error fetching scheduled jobs:', error.message);
      return [];
    }
  }

  // Get job execution history
  async getJobHistory(limit = 50, jobId = null) {
    try {
      let query = `SELECT h.*, j.job_name as current_job_name
                   FROM job_schedule_history h
                   LEFT JOIN job_schedule j ON h.job_id = j.id`;
      const params = [];

      if (jobId) {
        query += ' WHERE h.job_id = ?';
        params.push(jobId);
      }

      query += ' ORDER BY h.started_at DESC LIMIT ?';
      params.push(limit);

      const [history] = await db.pool.query(query, params);
      return history;
    } catch (error) {
      console.error('[CRON] Error fetching job history:', error.message);
      return [];
    }
  }

  // Get next upcoming session from job_schedule table
  async getNextUpcomingSession() {
    try {
      const now = this.getNowIST();

      // Get next draw_generate job that will run
      const [jobs] = await db.pool.query(
        `SELECT * FROM job_schedule
         WHERE job_type = 'draw_generate'
           AND is_enabled = TRUE
           AND next_run_at > NOW()
         ORDER BY next_run_at ASC
         LIMIT 1`
      );

      if (jobs.length > 0) {
        const job = jobs[0];
        const nextRunAt = new Date(job.next_run_at);
        const timeUntilNext = Math.max(0, Math.floor((nextRunAt - now) / 1000));

        return {
          sessionNumber: job.session_number,
          sessionName: this._getSessionName(job.session_number),
          nextRunAt: job.next_run_at,
          timeUntilStart: timeUntilNext,
          jobName: job.job_name,
          status: 'upcoming'
        };
      }

      // Fallback: Calculate from config if no job found
      const currentHour = now.getHours();
      let nextSession = 1;
      let nextHour = this.config.SESSION_CONFIG[1].generateHour;

      if (currentHour < this.config.SESSION_CONFIG[1].generateHour) {
        nextSession = 1;
        nextHour = this.config.SESSION_CONFIG[1].generateHour;
      } else if (currentHour < this.config.SESSION_CONFIG[2].generateHour) {
        nextSession = 2;
        nextHour = this.config.SESSION_CONFIG[2].generateHour;
      } else if (currentHour < this.config.SESSION_CONFIG[3].generateHour) {
        nextSession = 3;
        nextHour = this.config.SESSION_CONFIG[3].generateHour;
      } else {
        // Next day session 1
        nextSession = 1;
        nextHour = this.config.SESSION_CONFIG[1].generateHour;
      }

      const nextRunAt = new Date(now);
      if (currentHour >= this.config.SESSION_CONFIG[3].generateHour) {
        nextRunAt.setDate(nextRunAt.getDate() + 1);
      }
      nextRunAt.setHours(nextHour, 0, 0, 0);

      const timeUntilNext = Math.max(0, Math.floor((nextRunAt - now) / 1000));

      return {
        sessionNumber: nextSession,
        sessionName: this._getSessionName(nextSession),
        nextRunAt: nextRunAt,
        timeUntilStart: timeUntilNext,
        jobName: `session_${nextSession}_generate`,
        status: 'upcoming'
      };
    } catch (error) {
      console.error('[CRON] Error getting next upcoming session:', error.message);
      return null;
    }
  }

  // Get session name helper
  _getSessionName(sessionNumber) {
    const names = { 1: 'Morning', 2: 'Evening', 3: 'Night' };
    return names[sessionNumber] || 'Unknown';
  }

  // Get current time in configured timezone
  getNowIST() {
    const now = new Date();
    const istString = now.toLocaleString('en-US', { timeZone: this.config.TIMEZONE });
    return new Date(istString);
  }

  getCurrentHourIST() {
    return this.getNowIST().getHours();
  }

  getCurrentTimeIST() {
    const now = this.getNowIST();
    return {
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
      date: now
    };
  }

  getCurrentSession() {
    const hour = this.getCurrentHourIST();
    const session1 = this.config.SESSION_CONFIG[1];
    const session2 = this.config.SESSION_CONFIG[2];

    if (hour >= session1.generateHour && hour < session2.generateHour) {
      return 1;
    }
    if (hour >= session2.generateHour && hour < this.config.SESSION_CONFIG[3].generateHour) {
      return 2;
    }
    return 3;
  }

  getSessionConfig(sessionNumber) {
    return this.config.SESSION_CONFIG[sessionNumber];
  }

  async generatePeriodId() {
    const now = this.getNowIST();
    const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const [existing] = await db.pool.query(
      `SELECT period_id FROM daily_draws WHERE period_id LIKE ? ORDER BY period_id DESC LIMIT 1`,
      [`${today}%`]
    );

    let sequence = 1;
    if (existing.length > 0) {
      const lastSequence = parseInt(existing[0].period_id.slice(-3));
      sequence = lastSequence + 1;
    }

    return `${today}${String(sequence).padStart(3, '0')}`;
  }

  generateWinningNumber() {
    const max = Math.pow(10, this.config.TOTAL_DIGITS);
    return String(Math.floor(Math.random() * max)).padStart(this.config.TOTAL_DIGITS, '0');
  }

  calculateRevealedDigits(sessionNumber = null) {
    const currentHour = this.getCurrentHourIST();
    const session = sessionNumber || this.getCurrentSession();
    const config = this.getSessionConfig(session);

    if (session === 3) {
      return this._calculateRevealedDigitsOvernight(currentHour, config);
    }

    if (currentHour < config.generateHour) {
      return 0;
    }

    if (currentHour >= config.revealEndHour) {
      return this.config.TOTAL_DIGITS;
    }

    const hoursSinceGenerate = currentHour - config.generateHour;
    return Math.min(1 + hoursSinceGenerate, this.config.TOTAL_DIGITS);
  }

  _calculateRevealedDigitsOvernight(currentHour, config) {
    if (currentHour < config.revealEndHour) {
      const hoursSinceGenerate = (24 - config.generateHour) + currentHour;
      return Math.min(1 + hoursSinceGenerate, this.config.TOTAL_DIGITS);
    }

    if (currentHour >= config.revealEndHour && currentHour < config.generateHour) {
      return this.config.TOTAL_DIGITS;
    }

    if (currentHour >= config.generateHour) {
      const hoursSinceGenerate = currentHour - config.generateHour;
      return Math.min(1 + hoursSinceGenerate, this.config.TOTAL_DIGITS);
    }

    return 0;
  }

  getNextRevealTime(sessionNumber = null) {
    const time = this.getCurrentTimeIST();
    const session = sessionNumber || this.getCurrentSession();
    const currentRevealedDigits = this.calculateRevealedDigits(session);

    if (currentRevealedDigits >= this.config.TOTAL_DIGITS) {
      return this._getTimeUntilNextSession();
    }

    const secondsIntoCurrentHour = time.minutes * 60 + time.seconds;
    return 3600 - secondsIntoCurrentHour;
  }

  _getTimeUntilNextSession() {
    const now = this.getNowIST();
    const currentHour = now.getHours();

    const session1Hour = this.config.SESSION_CONFIG[1].generateHour;
    const session2Hour = this.config.SESSION_CONFIG[2].generateHour;
    const session3Hour = this.config.SESSION_CONFIG[3].generateHour;

    let nextGenerateHour;
    let addDay = false;

    if (currentHour < session1Hour) {
      nextGenerateHour = session1Hour;
    } else if (currentHour < session2Hour) {
      nextGenerateHour = session2Hour;
    } else if (currentHour < session3Hour) {
      nextGenerateHour = session3Hour;
    } else {
      nextGenerateHour = session1Hour;
      addDay = true;
    }

    const nextSession = new Date(now);
    if (addDay) {
      nextSession.setDate(nextSession.getDate() + 1);
    }
    nextSession.setHours(nextGenerateHour, 0, 0, 0);

    return Math.floor((nextSession - now) / 1000);
  }

  async createNewDraw(sessionNumber = null) {
    try {
      const session = sessionNumber || this.getCurrentSession();
      const config = this.getSessionConfig(session);

      const periodId = await this.generatePeriodId();
      const winningNumber = this.generateWinningNumber();
      const now = this.getNowIST();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const generateTime = `${String(config.generateHour).padStart(2, '0')}:00:00`;
      const resultHour = (config.generateHour + this.config.TOTAL_DIGITS - 1) % 24;
      const resultTime = `${String(resultHour).padStart(2, '0')}:00:00`;

      const initialRevealedDigits = this.calculateRevealedDigits(session);

      let initialStatus = 'revealing';
      if (initialRevealedDigits >= this.config.TOTAL_DIGITS) {
        initialStatus = 'completed';
      }

      await db.pool.query(
        `UPDATE daily_draws SET status = 'completed', revealed_digits = ?, completed_at = NOW()
         WHERE status IN ('active', 'revealing')`,
        [this.config.TOTAL_DIGITS]
      );

      const [result] = await db.pool.query(
        `INSERT INTO daily_draws (period_id, draw_date, session_number, winning_number, status, revealed_digits, generate_time, result_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [periodId, today, session, winningNumber, initialStatus, initialRevealedDigits, generateTime, resultTime]
      );

      await db.pool.query(
        `UPDATE settings SET setting_value = ? WHERE setting_key = 'current_period_id'`,
        [periodId]
      );

      const revealedNumber = winningNumber.substring(0, initialRevealedDigits) + 'X'.repeat(this.config.TOTAL_DIGITS - initialRevealedDigits);

      console.log(`[CRON] New draw created - Period: ${periodId}, Session: ${session}, Status: ${initialStatus}, Revealed: ${initialRevealedDigits} digits`);

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

      // Enroll pending tickets (bought for upcoming session) into this new draw
      try {
        // First get the total buy_amount of pending tickets to add to prize pool
        const [pendingTickets] = await db.pool.query(
          `SELECT SUM(buy_amount) as total_amount, COUNT(*) as count
           FROM numbers
           WHERE ticket_status = 'pending' AND draw_id IS NULL`
        );

        const pendingAmount = parseFloat(pendingTickets[0]?.total_amount) || 0;
        const pendingCount = parseInt(pendingTickets[0]?.count) || 0;

        if (pendingCount > 0) {
          // Enroll pending tickets
          await db.pool.query(
            `UPDATE numbers
             SET draw_id = ?, ticket_status = 'active', matched_digits = 0, current_return = 0, last_reveal_index = 0
             WHERE ticket_status = 'pending' AND draw_id IS NULL`,
            [result.insertId]
          );

          // Add their buy amounts to the prize pool
          if (pendingAmount > 0) {
            await db.pool.query(
              `UPDATE daily_draws SET total_pool = total_pool + ? WHERE id = ?`,
              [pendingAmount, result.insertId]
            );
          }

          console.log(`[CRON] Enrolled ${pendingCount} pending tickets (${pendingAmount}Z) into draw ${periodId}`);
        }
      } catch (enrollError) {
        console.error('[CRON] Error enrolling pending tickets:', enrollError);
      }

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

  async completeAndProcessWinners() {
    try {
      const [draws] = await db.pool.query(
        `SELECT * FROM daily_draws WHERE status = 'revealing' ORDER BY created_at DESC LIMIT 1`
      );

      if (draws.length === 0) {
        console.log('[CRON] No revealing draw to complete');
        return null;
      }

      const draw = draws[0];

      await db.pool.query(
        `UPDATE daily_draws SET status = 'completed', revealed_digits = ?, completed_at = NOW() WHERE id = ?`,
        [this.config.TOTAL_DIGITS, draw.id]
      );

      await this.processWinners(draw);

      console.log(`[CRON] Draw completed - Period: ${draw.period_id}, Session: ${draw.session_number}, Winning: ${draw.winning_number}`);

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

  async processWinners(draw) {
    try {
      const winningNumber = draw.winning_number;
      const prefix = winningNumber.substring(0, this.config.TOTAL_DIGITS - 1);
      const totalPool = parseFloat(draw.total_pool);

      const exactMatchPrize = totalPool * this.config.EXACT_MATCH_MULTIPLIER;
      const nearMatchPool = totalPool * this.config.NEAR_MATCH_MULTIPLIER;

      const [exactMatches] = await db.pool.query(
        `SELECT n.*, u.id as user_id FROM numbers n JOIN users u ON n.owner_id = u.id WHERE n.number = ?`,
        [winningNumber]
      );

      const [nearMatches] = await db.pool.query(
        `SELECT n.*, u.id as user_id FROM numbers n JOIN users u ON n.owner_id = u.id WHERE n.number LIKE ? AND n.number != ?`,
        [`${prefix}_`, winningNumber]
      );

      if (exactMatches.length === 0 && nearMatches.length === 0) {
        console.log(`[CRON] No winners for period ${draw.period_id}`);
        return;
      }

      for (const winner of exactMatches) {
        await db.pool.query(
          `INSERT INTO winners (draw_id, user_id, number_id, period_id, matching_digits, prize_amount) VALUES (?, ?, ?, ?, ?, ?)`,
          [draw.id, winner.user_id, winner.id, draw.period_id, this.config.TOTAL_DIGITS, exactMatchPrize]
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

      if (nearMatches.length > 0) {
        const perNearMatchPrize = nearMatchPool / nearMatches.length;

        for (const winner of nearMatches) {
          await db.pool.query(
            `INSERT INTO winners (draw_id, user_id, number_id, period_id, matching_digits, prize_amount) VALUES (?, ?, ?, ?, ?, ?)`,
            [draw.id, winner.user_id, winner.id, draw.period_id, this.config.TOTAL_DIGITS - 1, perNearMatchPrize]
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

      // Vote rewards
      const [winningNumberRecord] = await db.pool.query(
        `SELECT id FROM numbers WHERE number = ?`,
        [winningNumber]
      );

      if (winningNumberRecord.length > 0) {
        const [voters] = await db.pool.query(
          `SELECT DISTINCT v.user_id FROM votes v WHERE v.number_id = ? AND v.draw_id = ?`,
          [winningNumberRecord[0].id, draw.id]
        );

        for (const voter of voters) {
          await db.pool.query(
            `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`,
            [this.config.VOTE_REWARD, this.config.VOTE_REWARD, voter.user_id]
          );

          await db.pool.query(
            `INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'prize', ?, ?)`,
            [voter.user_id, this.config.VOTE_REWARD, `Vote reward for predicting winning number ${winningNumber}`]
          );

          console.log(`[CRON] Vote reward: User ${voter.user_id}, Reward: ${this.config.VOTE_REWARD} Z`);

          if (this.io) {
            this.io.to(`user:${voter.user_id}`).emit('vote:reward', {
              periodId: draw.period_id,
              number: winningNumber,
              reward: this.config.VOTE_REWARD
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

  async getCurrentDraw() {
    let [draws] = await db.pool.query(
      `SELECT * FROM daily_draws WHERE status IN ('pending', 'revealing', 'active') ORDER BY created_at DESC LIMIT 1`
    );

    if (draws.length === 0) {
      [draws] = await db.pool.query(
        `SELECT * FROM daily_draws ORDER BY created_at DESC LIMIT 1`
      );
    }

    if (draws.length === 0) {
      const currentSession = this.getCurrentSession();
      return {
        id: null,
        periodId: null,
        drawDate: null,
        sessionNumber: currentSession,
        status: 'none',
        revealedNumber: 'X'.repeat(this.config.TOTAL_DIGITS),
        revealedDigits: 0,
        totalDigits: this.config.TOTAL_DIGITS,
        digitsRemaining: this.config.TOTAL_DIGITS,
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

    let revealedNumber = 'X'.repeat(this.config.TOTAL_DIGITS);
    if (draw.winning_number && revealedDigits > 0) {
      revealedNumber = draw.winning_number.substring(0, revealedDigits) + 'X'.repeat(this.config.TOTAL_DIGITS - revealedDigits);
    }

    const now = this.getNowIST();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    const currentHour = now.getHours();

    const nextRevealIn = isComplete ? 0 : (3600 - (currentMinutes * 60 + currentSeconds));

    const config = this.getSessionConfig(sessionNumber);
    const resultHour = (config.generateHour + this.config.TOTAL_DIGITS - 1) % 24;
    let timeUntilComplete = 0;

    if (!isComplete) {
      let hoursRemaining;
      if (sessionNumber === 3 && currentHour >= config.generateHour) {
        hoursRemaining = (24 - currentHour) + resultHour;
      } else if (sessionNumber === 3 && currentHour < resultHour) {
        hoursRemaining = resultHour - currentHour;
      } else {
        hoursRemaining = resultHour - currentHour;
      }
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
      totalDigits: this.config.TOTAL_DIGITS,
      digitsRemaining: this.config.TOTAL_DIGITS - revealedDigits,
      totalPool: parseFloat(draw.total_pool) || 0,
      generateTime: draw.generate_time || null,
      resultTime: draw.result_time || null,
      nextRevealIn,
      timeUntilComplete,
      isComplete
    };
  }

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
      return {
        id: null,
        periodId: null,
        drawDate: null,
        sessionNumber: this.getCurrentSession(),
        status: 'none',
        winningNumber: null,
        revealedDigits: 0,
        totalDigits: this.config.TOTAL_DIGITS,
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
      totalDigits: this.config.TOTAL_DIGITS,
      totalPool: parseFloat(draw.total_pool) || 0,
      isComplete: draw.status === 'completed'
    };
  }

  async autoRevealDigits() {
    if (!this.config.AUTO_REVEAL_ENABLED) {
      return null;
    }

    try {
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

      if (timeBasedDigits > currentDbDigits && timeBasedDigits <= this.config.TOTAL_DIGITS) {
        await db.pool.query(
          `UPDATE daily_draws SET revealed_digits = ?, status = 'revealing' WHERE id = ?`,
          [timeBasedDigits, draw.id]
        );

        if (this.ticketService) {
          try {
            await this.ticketService.processReveal(draw, timeBasedDigits);
          } catch (ticketError) {
            console.error('[CRON] Error processing ticket reveals:', ticketError);
          }
        }

        const revealedNumber = draw.winning_number.substring(0, timeBasedDigits) +
                              'X'.repeat(this.config.TOTAL_DIGITS - timeBasedDigits);

        const nextRevealIn = this.getNextRevealTime(sessionNumber);
        const digitsRemaining = this.config.TOTAL_DIGITS - timeBasedDigits;

        console.log(`[CRON] Auto-revealed digit ${timeBasedDigits} for session ${sessionNumber} - ${revealedNumber}`);

        if (this.io) {
          this.io.emit('draw:digit-revealed', {
            revealedNumber,
            revealedDigits: timeBasedDigits,
            totalDigits: this.config.TOTAL_DIGITS,
            digitsRemaining,
            sessionNumber,
            nextRevealIn,
            secondsPerDigit: 3600,
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

  // Start all cron jobs based on database configuration
  async start() {
    if (!this.configLoaded) {
      await this.loadConfig();
    }

    if (!this.config.CRON_ENABLED) {
      console.log('[CRON] Cron jobs are disabled in settings');
      await this.disableAllJobs();
      return;
    }

    const session1 = this.config.SESSION_CONFIG[1];
    const session2 = this.config.SESSION_CONFIG[2];
    const session3 = this.config.SESSION_CONFIG[3];
    const timezone = this.config.TIMEZONE;

    // Register and schedule Session 1 Generate
    const s1GenCron = `0 ${session1.generateHour} * * *`;
    await this.registerJob('session_1_generate', 'draw_generate', s1GenCron, 1, { description: 'Generate Session 1 draw' });
    this.scheduledJobs.push(
      cron.schedule(s1GenCron, async () => {
        await this.executeWithLogging('session_1_generate', () => this.createNewDraw(1));
      }, { timezone })
    );

    // Register and schedule Session 2 Generate
    const s2GenCron = `0 ${session2.generateHour} * * *`;
    await this.registerJob('session_2_generate', 'draw_generate', s2GenCron, 2, { description: 'Generate Session 2 draw' });
    this.scheduledJobs.push(
      cron.schedule(s2GenCron, async () => {
        await this.executeWithLogging('session_2_generate', () => this.createNewDraw(2));
      }, { timezone })
    );

    // Register and schedule Session 3 Generate
    const s3GenCron = `0 ${session3.generateHour} * * *`;
    await this.registerJob('session_3_generate', 'draw_generate', s3GenCron, 3, { description: 'Generate Session 3 draw' });
    this.scheduledJobs.push(
      cron.schedule(s3GenCron, async () => {
        await this.executeWithLogging('session_3_generate', () => this.createNewDraw(3));
      }, { timezone })
    );

    // Register and schedule Session 1 Complete (at session 2 start)
    await this.registerJob('session_1_complete', 'draw_complete', s2GenCron, 1, { description: 'Complete Session 1 and process winners' });
    this.scheduledJobs.push(
      cron.schedule(s2GenCron, async () => {
        await this.executeWithLogging('session_1_complete', () => this.completeAndProcessWinners());
      }, { timezone })
    );

    // Register and schedule Session 2 Complete (at session 3 start)
    await this.registerJob('session_2_complete', 'draw_complete', s3GenCron, 2, { description: 'Complete Session 2 and process winners' });
    this.scheduledJobs.push(
      cron.schedule(s3GenCron, async () => {
        await this.executeWithLogging('session_2_complete', () => this.completeAndProcessWinners());
      }, { timezone })
    );

    // Register and schedule Session 3 Complete
    const s3CompleteCron = `0 ${session3.revealEndHour} * * *`;
    await this.registerJob('session_3_complete', 'draw_complete', s3CompleteCron, 3, { description: 'Complete Session 3 and process winners' });
    this.scheduledJobs.push(
      cron.schedule(s3CompleteCron, async () => {
        await this.executeWithLogging('session_3_complete', () => this.completeAndProcessWinners());
      }, { timezone })
    );

    // Register and schedule Hourly Auto-Reveal
    const hourlyRevealCron = '0 * * * *';
    await this.registerJob('hourly_auto_reveal', 'digit_reveal', hourlyRevealCron, null, { description: 'Hourly automatic digit reveal' });
    this.scheduledJobs.push(
      cron.schedule(hourlyRevealCron, async () => {
        const session = this.getCurrentSession();
        const config = this.getSessionConfig(session);
        const hour = this.getCurrentHourIST();

        let inRevealWindow = false;
        if (session === 3) {
          inRevealWindow = hour >= config.generateHour || hour < config.revealEndHour;
        } else {
          inRevealWindow = hour >= config.generateHour && hour < config.revealEndHour;
        }

        if (inRevealWindow) {
          await this.executeWithLogging('hourly_auto_reveal', () => this.autoRevealDigits());
        }
      }, { timezone })
    );

    console.log('[CRON] Cron jobs scheduled and registered in database:');
    console.log(`  Timezone: ${timezone}`);
    console.log(`  Session 1: Generate ${session1.generateHour}:00, Complete ${session2.generateHour}:00`);
    console.log(`  Session 2: Generate ${session2.generateHour}:00, Complete ${session3.generateHour}:00`);
    console.log(`  Session 3: Generate ${session3.generateHour}:00, Complete ${session3.revealEndHour}:00`);
    console.log(`  Prize: Exact ${this.config.EXACT_MATCH_MULTIPLIER * 100}%, Near ${this.config.NEAR_MATCH_MULTIPLIER * 100}%`);
    console.log(`  Vote Reward: ${this.config.VOTE_REWARD} Z`);
  }

  stop() {
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];
    console.log('[CRON] All cron jobs stopped');
  }

  async triggerNewDraw(sessionNumber = null) {
    return await this.createNewDraw(sessionNumber);
  }

  async triggerComplete() {
    return await this.completeAndProcessWinners();
  }

  async triggerAutoReveal() {
    return await this.autoRevealDigits();
  }
}

module.exports = CronService;
