const db = require('../config/database');
const crypto = require('crypto');

// Shuffle Card — server-authoritative round-based 52-card lottery.
//
// Each round runs on a fixed cadence:
//   BETTING (50 s)  → users may place bets. Cards are face-down, shuffling.
//   LOCKED (10 s)   → bets disabled, countdown overlay 10..0.
//   REVEAL          → 3 cards drawn cryptographically; winners settled, payouts emitted.
//
// Bet kinds (mirror Mutka King):
//   cards  — pick 1-3 specific cards (id 0-51); all picked must appear.
//   rank   — pick rank index 0-12; any dealt card matches.
//   suit   — pick suit 0-3; any dealt card matches.
//   color  — 'red' | 'black'; any dealt card has that color.

const WIN_PAYOUT_RATIO = 0.9;

const SHUFFLE_MULTIPLIERS = {
  cards: { 1: 3, 2: 50, 3: 500 },
  rank:  4,
  suit:  2,
  color: 2,
};

const ROUND_TOTAL_MS    = 60_000;  // 1 minute total
const BETTING_PHASE_MS  = 50_000;  // first 50s
const LOCK_PHASE_MS     = 10_000;  // last 10s
const MAX_BETS_PER_USER = 20;
const MIN_BET = 1;
const MAX_BET = 10_000;
const REVEALED_CARD_COUNT = 3;

const cardSuit = (id) => Math.floor(id / 13);
const cardRank = (id) => id % 13;
const isRedCard = (id) => {
  const s = cardSuit(id);
  return s === 1 || s === 2; // diamonds, hearts
};

function secureSample(range, count) {
  if (count > range) throw new Error('Sample size exceeds range');
  const picked = new Set();
  while (picked.size < count) {
    picked.add(crypto.randomInt(0, range));
  }
  return [...picked];
}

class ShuffleCardService {
  constructor(io) {
    this.io = io;
    this.currentRound = null;   // in-memory state for the live round
    this.lockTimer = null;
    this.completeTimer = null;
    this.startTimer = null;
    this.running = false;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    // On startup: any half-finished rounds should be force-completed so we
    // don't leave bets pending.
    try {
      const [stale] = await db.pool.query(
        `SELECT id FROM shuffle_card_rounds WHERE status IN ('betting', 'locked')`
      );
      for (const r of stale) {
        try {
          await this._forceFinalize(r.id);
        } catch (e) {
          console.error('[SHUFFLE] Failed to finalize stale round', r.id, e.message);
        }
      }
    } catch (e) {
      console.error('[SHUFFLE] Startup cleanup error:', e.message);
    }

    console.log('[SHUFFLE] Service started, opening first round...');
    await this._openRound();
  }

  stop() {
    this.running = false;
    clearTimeout(this.lockTimer);
    clearTimeout(this.completeTimer);
    clearTimeout(this.startTimer);
    this.lockTimer = this.completeTimer = this.startTimer = null;
  }

  async _generatePeriodId() {
    // Format: YYYYMMDD + 5-digit daily sequence  (e.g. 2026050500001).
    const now = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

    const [rows] = await db.pool.query(
      `SELECT period_id FROM shuffle_card_rounds
        WHERE period_id LIKE ?
        ORDER BY id DESC LIMIT 1`,
      [`${day}%`]
    );

    let seq = 1;
    if (rows.length > 0) {
      const last = parseInt(String(rows[0].period_id).slice(-5), 10);
      if (Number.isFinite(last)) seq = last + 1;
    }
    return `${day}${String(seq).padStart(5, '0')}`;
  }

  async _openRound() {
    if (!this.running) return;

    try {
      const periodId = await this._generatePeriodId();
      const startedAt = new Date();
      const lockedAt = new Date(startedAt.getTime() + BETTING_PHASE_MS);
      const completeAt = new Date(startedAt.getTime() + ROUND_TOTAL_MS);

      const [result] = await db.pool.query(
        `INSERT INTO shuffle_card_rounds (period_id, status, started_at)
         VALUES (?, 'betting', ?)`,
        [periodId, startedAt]
      );

      this.currentRound = {
        id: result.insertId,
        periodId,
        status: 'betting',
        startedAt,
        lockedAt,
        completeAt,
      };

      console.log(`[SHUFFLE] Round opened ${periodId} (id=${result.insertId})`);

      if (this.io) {
        this.io.emit('shuffle:round:open', this._publicRoundState());
      }

      this.lockTimer = setTimeout(() => this._lockRound().catch(err => {
        console.error('[SHUFFLE] Lock error:', err);
      }), BETTING_PHASE_MS);

      this.completeTimer = setTimeout(() => this._completeRound().catch(err => {
        console.error('[SHUFFLE] Complete error:', err);
      }), ROUND_TOTAL_MS);
    } catch (err) {
      console.error('[SHUFFLE] Failed to open round:', err);
      // Retry shortly so the loop doesn't die
      this.startTimer = setTimeout(() => this._openRound().catch(() => {}), 5000);
    }
  }

  async _lockRound() {
    if (!this.currentRound) return;
    const round = this.currentRound;
    round.status = 'locked';

    await db.pool.query(
      `UPDATE shuffle_card_rounds SET status = 'locked', locked_at = NOW() WHERE id = ?`,
      [round.id]
    );

    console.log(`[SHUFFLE] Round locked ${round.periodId}`);

    if (this.io) {
      this.io.emit('shuffle:round:lock', {
        roundId: round.id,
        periodId: round.periodId,
        countdownSeconds: Math.floor(LOCK_PHASE_MS / 1000),
      });
    }
  }

  async _completeRound() {
    if (!this.currentRound) return;
    const round = this.currentRound;

    try {
      const cards = secureSample(52, REVEALED_CARD_COUNT);
      const cardSet = new Set(cards);
      const ranks = cards.map(cardRank);
      const suits = cards.map(cardSuit);
      const redCount = cards.filter(isRedCard).length;
      const dominantColor = redCount > REVEALED_CARD_COUNT - redCount ? 'red' : 'black';

      const resultSummary = {
        cards,
        ranks,
        suits,
        redCount,
        dominantColor,
      };

      // Settle every bet for this round.
      const [bets] = await db.pool.query(
        `SELECT id, user_id, kind, amount, multiplier, details
         FROM shuffle_card_bets WHERE round_id = ? AND status = 'pending'`,
        [round.id]
      );

      let totalWager = 0;
      let totalWin = 0;
      const userIdSet = new Set();
      // Aggregate net per-user payout so we update balances once per user.
      const perUser = new Map();
      const settlements = [];

      for (const bet of bets) {
        userIdSet.add(bet.user_id);
        const details = bet.details ? (typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details) : {};
        const amount = Number(bet.amount);
        totalWager += amount;

        let isWin = false;
        if (bet.kind === 'cards' && Array.isArray(details.cards)) {
          isWin = details.cards.every((c) => cardSet.has(c));
        } else if (bet.kind === 'rank' && Number.isInteger(details.rank)) {
          isWin = ranks.includes(details.rank);
        } else if (bet.kind === 'suit' && Number.isInteger(details.suit)) {
          isWin = suits.includes(details.suit);
        } else if (bet.kind === 'color') {
          // Win if at least one dealt card matches chosen color.
          isWin = details.color === 'red' ? redCount >= 1 : redCount < REVEALED_CARD_COUNT;
        }

        const winAmount = isWin
          ? Math.floor(amount * Number(bet.multiplier) * WIN_PAYOUT_RATIO * 100) / 100
          : 0;

        totalWin += winAmount;
        if (winAmount > 0) {
          perUser.set(bet.user_id, (perUser.get(bet.user_id) || 0) + winAmount);
        }
        settlements.push({ id: bet.id, isWin, winAmount, userId: bet.user_id, kind: bet.kind, amount, details });
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // Update round row
        await conn.execute(
          `UPDATE shuffle_card_rounds
             SET status = 'completed', cards = ?, result_summary = ?,
                 total_wager = ?, total_win = ?, bet_count = ?, player_count = ?,
                 completed_at = NOW()
           WHERE id = ?`,
          [
            JSON.stringify(cards),
            JSON.stringify(resultSummary),
            totalWager.toFixed(2),
            totalWin.toFixed(2),
            settlements.length,
            userIdSet.size,
            round.id,
          ]
        );

        // Lock and snapshot each winner's balance up front so we can record
        // accurate balance_before/balance_after on every win transaction.
        const userBalances = new Map();
        for (const userId of perUser.keys()) {
          const [rows] = await conn.execute(
            'SELECT balance FROM users WHERE id = ? FOR UPDATE',
            [userId]
          );
          if (rows.length > 0) {
            userBalances.set(userId, parseFloat(rows[0].balance));
          }
        }

        // Settle every bet row
        for (const s of settlements) {
          await conn.execute(
            `UPDATE shuffle_card_bets
                SET is_win = ?, win_amount = ?, status = 'settled', settled_at = NOW()
              WHERE id = ?`,
            [s.isWin ? 1 : 0, s.winAmount.toFixed(2), s.id]
          );

          // game_bets ledger row (so it shows up in the cross-game history view)
          const [gb] = await conn.execute(
            `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
             VALUES (?, 'shuffle_card', ?, ?, ?, ?, ?, ?)`,
            [
              s.userId,
              s.amount.toFixed(2),
              s.winAmount.toFixed(2),
              s.isWin
                ? Math.floor((s.winAmount / Math.max(s.amount, 0.01)) * 100) / 100
                : 0,
              cards.join(','),
              s.isWin ? 1 : 0,
              JSON.stringify({
                periodId: round.periodId,
                kind: s.kind,
                bet: s.details,
                revealedCards: cards,
              }),
            ]
          );

          if (s.winAmount > 0) {
            const balanceBefore = userBalances.get(s.userId) ?? 0;
            const balanceAfter = Math.floor((balanceBefore + s.winAmount) * 100) / 100;
            userBalances.set(s.userId, balanceAfter);
            await conn.execute(
              `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
               VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
              [
                s.userId,
                s.winAmount.toFixed(2),
                balanceBefore.toFixed(2),
                balanceAfter.toFixed(2),
                gb.insertId,
                `Shuffle Card win: ${round.periodId}`,
              ]
            );
          }
        }

        // Credit winners (single update per user) using the running balances
        // we tracked above so the final users.balance matches the last
        // balance_after we wrote on transactions.
        for (const [userId, finalBalance] of userBalances.entries()) {
          await conn.execute(
            `UPDATE users SET balance = ? WHERE id = ?`,
            [finalBalance.toFixed(2), userId]
          );
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      console.log(
        `[SHUFFLE] Round complete ${round.periodId} cards=[${cards.join(',')}] ` +
        `bets=${settlements.length} wager=${totalWager.toFixed(2)} win=${totalWin.toFixed(2)}`
      );

      // Build per-user payload so each socket gets their own outcome list
      const userOutcomes = new Map();
      for (const s of settlements) {
        const arr = userOutcomes.get(s.userId) || [];
        arr.push({
          kind: s.kind,
          details: s.details,
          amount: s.amount,
          isWin: s.isWin,
          winAmount: s.winAmount,
        });
        userOutcomes.set(s.userId, arr);
      }

      if (this.io) {
        // Public reveal — every viewer sees the cards
        this.io.emit('shuffle:round:result', {
          roundId: round.id,
          periodId: round.periodId,
          cards,
          resultSummary,
          totalWager,
          totalWin,
          betCount: settlements.length,
          playerCount: userIdSet.size,
        });

        // Per-user outcome with payouts (for win/loss modal & balance refresh)
        for (const [userId, outcomes] of userOutcomes.entries()) {
          const totalUserWin = outcomes.reduce((s, o) => s + o.winAmount, 0);
          const totalUserBet = outcomes.reduce((s, o) => s + o.amount, 0);
          this.io.to(`user:${userId}`).emit('shuffle:round:settled', {
            roundId: round.id,
            periodId: round.periodId,
            cards,
            outcomes,
            totalBet: Math.round(totalUserBet * 100) / 100,
            totalWin: Math.round(totalUserWin * 100) / 100,
            isWin: totalUserWin > 0,
          });
          // Push fresh balance so UI can update without polling
          db.pool
            .query('SELECT balance FROM users WHERE id = ?', [userId])
            .then(([rows]) => {
              if (rows.length && this.io) {
                this.io.to(`user:${userId}`).emit('balance:update', {
                  balance: parseFloat(rows[0].balance),
                });
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error('[SHUFFLE] Round completion error:', err);
      try {
        await db.pool.query(
          `UPDATE shuffle_card_rounds SET status = 'completed', completed_at = NOW() WHERE id = ?`,
          [round.id]
        );
      } catch {}
    }

    this.currentRound = null;

    // Hold the revealed cards on stage for a few seconds before opening the
    // next round so players can read the result before everything resets.
    this.startTimer = setTimeout(() => {
      this._openRound().catch(err => console.error('[SHUFFLE] Open next round error:', err));
    }, 3500);
  }

  // Used at boot to clean up orphaned rounds without paying anyone (no fair
  // server-authoritative draw can be guaranteed for a round that was already
  // open before the process restarted, so just mark it completed).
  async _forceFinalize(roundId) {
    await db.pool.query(
      `UPDATE shuffle_card_bets SET status = 'settled', is_win = 0, win_amount = 0,
                                    settled_at = NOW()
        WHERE round_id = ? AND status = 'pending'`,
      [roundId]
    );
    // Refund any pending bets so the user isn't stuck.
    const [pendingBets] = await db.pool.query(
      `SELECT user_id, SUM(amount) as total FROM shuffle_card_bets
        WHERE round_id = ? GROUP BY user_id`,
      [roundId]
    );
    for (const row of pendingBets) {
      await db.pool.query(
        `UPDATE users SET balance = balance + ? WHERE id = ?`,
        [Number(row.total).toFixed(2), row.user_id]
      );
    }
    await db.pool.query(
      `UPDATE shuffle_card_rounds SET status = 'completed', completed_at = NOW(),
              result_summary = JSON_OBJECT('canceled', true) WHERE id = ?`,
      [roundId]
    );
  }

  _publicRoundState() {
    if (!this.currentRound) return null;
    const r = this.currentRound;
    const now = Date.now();
    const startMs = r.startedAt.getTime();
    const lockMs = r.lockedAt.getTime();
    const completeMs = r.completeAt.getTime();
    const phase = now < lockMs ? 'betting' : 'locked';
    const totalRemaining = Math.max(0, completeMs - now);
    const lockIn = Math.max(0, lockMs - now);
    return {
      roundId: r.id,
      periodId: r.periodId,
      status: phase,
      startedAt: r.startedAt.toISOString(),
      lockedAt: r.lockedAt.toISOString(),
      completeAt: r.completeAt.toISOString(),
      bettingRemainingMs: lockIn,
      totalRemainingMs: totalRemaining,
      bettingPhaseMs: BETTING_PHASE_MS,
      lockPhaseMs: LOCK_PHASE_MS,
      roundTotalMs: ROUND_TOTAL_MS,
    };
  }

  getCurrentRoundState() {
    return this._publicRoundState();
  }

  getMultipliers() {
    return SHUFFLE_MULTIPLIERS;
  }

  // Place a bet on the live round. Throws if betting is closed or input invalid.
  async placeBet(userId, betInput) {
    if (!this.currentRound || this.currentRound.status !== 'betting') {
      throw new Error('Betting is closed for this round');
    }
    const round = this.currentRound;
    if (Date.now() >= round.lockedAt.getTime()) {
      throw new Error('Betting is closed for this round');
    }

    const cleanBet = this._validateBet(betInput);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Lock user row
      const [users] = await conn.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');
      const balance = parseFloat(users[0].balance);
      if (balance < cleanBet.amount) throw new Error('Insufficient balance');

      // Cap bets per user per round
      const [counts] = await conn.execute(
        'SELECT COUNT(*) AS n FROM shuffle_card_bets WHERE round_id = ? AND user_id = ?',
        [round.id, userId]
      );
      if (Number(counts[0].n) >= MAX_BETS_PER_USER) {
        throw new Error(`Maximum ${MAX_BETS_PER_USER} bets per round`);
      }

      const newBalance = Math.floor((balance - cleanBet.amount) * 100) / 100;
      await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);

      const [bal] = await conn.execute(
        `INSERT INTO shuffle_card_bets (round_id, user_id, kind, amount, multiplier, details, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [
          round.id,
          userId,
          cleanBet.kind,
          cleanBet.amount.toFixed(2),
          cleanBet.multiplier,
          JSON.stringify(cleanBet.details),
        ]
      );

      await conn.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [
          userId,
          cleanBet.amount.toFixed(2),
          balance,
          newBalance,
          bal.insertId,
          `Shuffle Card bet ${round.periodId}: ${cleanBet.kind}`,
        ]
      );

      await conn.commit();

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
      }

      return {
        betId: bal.insertId,
        roundId: round.id,
        periodId: round.periodId,
        kind: cleanBet.kind,
        amount: cleanBet.amount,
        multiplier: cleanBet.multiplier,
        details: cleanBet.details,
        newBalance,
      };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  _validateBet(bet) {
    if (!bet || typeof bet !== 'object') throw new Error('Malformed bet');
    const amount = Math.floor(parseFloat(bet.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is ${MIN_BET} Z`);
    if (amount > MAX_BET) throw new Error(`Maximum bet is ${MAX_BET} Z`);

    const kind = bet.kind || 'cards';

    if (kind === 'cards') {
      if (!Array.isArray(bet.cards) || bet.cards.length < 1 || bet.cards.length > REVEALED_CARD_COUNT) {
        throw new Error(`Pick 1-${REVEALED_CARD_COUNT} cards`);
      }
      const cards = bet.cards.map((c) => {
        const n = parseInt(c, 10);
        if (!Number.isInteger(n) || n < 0 || n > 51) throw new Error('Invalid card');
        return n;
      });
      if (new Set(cards).size !== cards.length) throw new Error('Duplicate cards');
      const multiplier = SHUFFLE_MULTIPLIERS.cards[cards.length];
      if (!multiplier) throw new Error('Unsupported pick count');
      return { kind, amount, multiplier, details: { cards } };
    }

    if (kind === 'rank') {
      const rank = parseInt(bet.rank, 10);
      if (!Number.isInteger(rank) || rank < 0 || rank > 12) throw new Error('Invalid rank');
      return { kind, amount, multiplier: SHUFFLE_MULTIPLIERS.rank, details: { rank } };
    }

    if (kind === 'suit') {
      const suit = parseInt(bet.suit, 10);
      if (!Number.isInteger(suit) || suit < 0 || suit > 3) throw new Error('Invalid suit');
      return { kind, amount, multiplier: SHUFFLE_MULTIPLIERS.suit, details: { suit } };
    }

    if (kind === 'color') {
      if (bet.color !== 'red' && bet.color !== 'black') throw new Error('Color must be red or black');
      return { kind, amount, multiplier: SHUFFLE_MULTIPLIERS.color, details: { color: bet.color } };
    }

    throw new Error(`Unknown bet kind "${kind}"`);
  }

  async getRoundHistory({ page = 1, limit = 20 } = {}) {
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pg - 1) * lim;

    const [countRows] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM shuffle_card_rounds WHERE status = 'completed'`
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await db.pool.query(
      `SELECT id, period_id, status, cards, result_summary, total_wager, total_win,
              bet_count, player_count, started_at, completed_at
         FROM shuffle_card_rounds
        WHERE status = 'completed'
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
      [lim, offset]
    );
    return {
      items: rows.map((r) => ({
        roundId: r.id,
        periodId: r.period_id,
        cards: r.cards ? (typeof r.cards === 'string' ? JSON.parse(r.cards) : r.cards) : [],
        resultSummary: r.result_summary
          ? (typeof r.result_summary === 'string' ? JSON.parse(r.result_summary) : r.result_summary)
          : null,
        totalWager: parseFloat(r.total_wager),
        totalWin: parseFloat(r.total_win),
        betCount: r.bet_count,
        playerCount: r.player_count,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })),
      page: pg,
      limit: lim,
      total,
      totalPages: Math.max(1, Math.ceil(total / lim)),
    };
  }

  async getMyBets(userId, limit = 20) {
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [rows] = await db.pool.query(
      `SELECT b.id, b.round_id, b.kind, b.amount, b.multiplier, b.details,
              b.is_win, b.win_amount, b.status, b.created_at,
              r.period_id, r.cards, r.status AS round_status
         FROM shuffle_card_bets b
         JOIN shuffle_card_rounds r ON r.id = b.round_id
        WHERE b.user_id = ?
        ORDER BY b.id DESC
        LIMIT ?`,
      [userId, lim]
    );
    return rows.map((row) => ({
      betId: row.id,
      roundId: row.round_id,
      periodId: row.period_id,
      roundStatus: row.round_status,
      kind: row.kind,
      amount: parseFloat(row.amount),
      multiplier: parseFloat(row.multiplier),
      details: row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : {},
      isWin: row.is_win == null ? null : !!row.is_win,
      winAmount: row.win_amount == null ? null : parseFloat(row.win_amount),
      status: row.status,
      createdAt: row.created_at,
      cards: row.cards ? (typeof row.cards === 'string' ? JSON.parse(row.cards) : row.cards) : null,
    }));
  }
}

module.exports = ShuffleCardService;
module.exports.SHUFFLE_MULTIPLIERS = SHUFFLE_MULTIPLIERS;
