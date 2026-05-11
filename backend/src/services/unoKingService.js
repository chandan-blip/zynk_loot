const db = require('../config/database');
const crypto = require('crypto');

// UNO King — 4 PARALLEL server-authoritative 54-card UNO lotteries, one per
// card_count_type (1, 2, 3, 4). Type N draws N cards from a 54-card UNO deck
// (52 colored + 2 wilds).
//
// Bet kinds (per type N):
//   cards  — pick 1..N specific ids (0-53); all picked must appear.
//   color  — 'red'|'yellow'|'green'|'blue'; any dealt card matches.
//   number — 0..9; any dealt card has that rank-number.
//   action — 'skip'|'reverse'|'draw_two'; any dealt card is that action.
//   wild   — any dealt card is a wild (no target).

const CARD_COUNT_TYPES = [1, 2, 3, 4];

const WIN_PAYOUT_RATIO = 0.9;

const UNO_MULTIPLIERS = {
  cards:  { 1: 2, 2: 9, 3: 100, 4: 500 },
  color:  2,
  number: 3,
  action: 3,
  wild:   6,
};

const ROUND_TOTAL_MS    = 60_000;
const BETTING_PHASE_MS  = 50_000;
const LOCK_PHASE_MS     = 10_000;
const MAX_BETS_PER_USER = 20;
const MIN_BET = 1;
const MAX_BET = 10_000;
const UNO_DECK_SIZE = 54;

const UNO_COLOR_INDEX = { red: 0, yellow: 1, green: 2, blue: 3 };
const UNO_ACTION_RANK = { skip: 10, reverse: 11, draw_two: 12 };

const isUnoWild  = (id) => id >= 52;
const unoColorOf = (id) => (isUnoWild(id) ? null : Math.floor(id / 13));
const unoRankOf  = (id) => (isUnoWild(id) ? null : id % 13);

function secureSample(range, count) {
  if (count > range) throw new Error('Sample size exceeds range');
  const picked = new Set();
  while (picked.size < count) {
    picked.add(crypto.randomInt(0, range));
  }
  return [...picked];
}

class UnoKingService {
  constructor(io) {
    this.io = io;
    this.predictionService = null;
    this.currentRounds = new Map();
    this.timers = new Map();
    this.running = false;
  }

  setPredictionService(predictionService) {
    this.predictionService = predictionService;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    try {
      const [stale] = await db.pool.query(
        `SELECT id FROM uno_king_rounds WHERE status IN ('betting', 'locked')`
      );
      for (const r of stale) {
        try { await this._forceFinalize(r.id); }
        catch (e) { console.error('[UNO] Failed to finalize stale round', r.id, e.message); }
      }
    } catch (e) {
      console.error('[UNO] Startup cleanup error:', e.message);
    }

    console.log('[UNO] Service started — opening first round per type...');
    for (const t of CARD_COUNT_TYPES) await this._openRound(t);
  }

  stop() {
    this.running = false;
    for (const handles of this.timers.values()) {
      clearTimeout(handles.lock);
      clearTimeout(handles.complete);
      clearTimeout(handles.next);
    }
    this.timers.clear();
  }

  _setTimer(type, key, ms, fn) {
    if (!this.timers.has(type)) this.timers.set(type, {});
    const handles = this.timers.get(type);
    clearTimeout(handles[key]);
    handles[key] = setTimeout(fn, ms);
  }

  async _generatePeriodId(type) {
    // Format: YYYYMMDD + 0N + 5-digit daily sequence (15 chars total),
    // where 0N = zero-padded card_count_type (01..04).
    const now = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const typePrefix = pad(type);

    const [rows] = await db.pool.query(
      `SELECT period_id FROM uno_king_rounds
        WHERE card_count_type = ? AND period_id LIKE ?
        ORDER BY id DESC LIMIT 1`,
      [type, `${day}${typePrefix}%`]
    );

    let seq = 1;
    if (rows.length > 0) {
      const last = parseInt(String(rows[0].period_id).slice(-5), 10);
      if (Number.isFinite(last)) seq = last + 1;
    }
    return `${day}${typePrefix}${String(seq).padStart(5, '0')}`;
  }

  async _openRound(type) {
    if (!this.running) return;

    try {
      const periodId = await this._generatePeriodId(type);
      const startedAt = new Date();
      const lockedAt = new Date(startedAt.getTime() + BETTING_PHASE_MS);
      const completeAt = new Date(startedAt.getTime() + ROUND_TOTAL_MS);

      const [result] = await db.pool.query(
        `INSERT INTO uno_king_rounds (period_id, card_count_type, status, started_at)
         VALUES (?, ?, 'betting', ?)`,
        [periodId, type, startedAt]
      );

      const round = {
        id: result.insertId,
        type,
        periodId,
        status: 'betting',
        startedAt,
        lockedAt,
        completeAt,
      };
      this.currentRounds.set(type, round);

      console.log(`[UNO/${type}] Round opened ${periodId} (id=${result.insertId})`);

      if (this.predictionService) {
        this.predictionService
          .preGenerateForRound({ game: 'uno_king', cardCountType: type, roundId: round.id, periodId })
          .catch(err => console.error(`[UNO/${type}] preGenerateForRound error:`, err.message));
      }

      if (this.io) this.io.emit('uno:round:open', this._publicRoundState(type));

      this._setTimer(type, 'lock', BETTING_PHASE_MS, () =>
        this._lockRound(type).catch(err => console.error(`[UNO/${type}] Lock error:`, err))
      );
      this._setTimer(type, 'complete', ROUND_TOTAL_MS, () =>
        this._completeRound(type).catch(err => console.error(`[UNO/${type}] Complete error:`, err))
      );
    } catch (err) {
      console.error(`[UNO/${type}] Failed to open round:`, err);
      this._setTimer(type, 'next', 5000, () => this._openRound(type).catch(() => {}));
    }
  }

  async _lockRound(type) {
    const round = this.currentRounds.get(type);
    if (!round) return;
    round.status = 'locked';

    await db.pool.query(
      `UPDATE uno_king_rounds SET status = 'locked', locked_at = NOW() WHERE id = ?`,
      [round.id]
    );

    console.log(`[UNO/${type}] Round locked ${round.periodId}`);

    if (this.io) {
      this.io.emit('uno:round:lock', {
        cardCountType: type,
        roundId: round.id,
        periodId: round.periodId,
        countdownSeconds: Math.floor(LOCK_PHASE_MS / 1000),
      });
    }
  }

  async _completeRound(type) {
    const round = this.currentRounds.get(type);
    if (!round) return;

    try {
      // Use prediction-service pre-rolled cards if present (admin switch on).
      let cards = this.predictionService?.consumeCardsForRound(round.id) || null;
      if (!cards || cards.length !== type) cards = secureSample(UNO_DECK_SIZE, type);
      const cardSet = new Set(cards);
      const colors = cards.map(unoColorOf);
      const ranks = cards.map(unoRankOf);
      const hasAnyWild = cards.some(isUnoWild);
      const wildCount = cards.filter(isUnoWild).length;

      const resultSummary = { cards, colors, ranks, hasAnyWild, wildCount, cardCountType: type };

      const [bets] = await db.pool.query(
        `SELECT id, user_id, kind, amount, multiplier, details
         FROM uno_king_bets WHERE round_id = ? AND status = 'pending'`,
        [round.id]
      );

      let totalWager = 0;
      let totalWin = 0;
      const userIdSet = new Set();
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
        } else if (bet.kind === 'color' && typeof details.color === 'string') {
          const idx = UNO_COLOR_INDEX[details.color];
          isWin = idx != null && colors.includes(idx);
        } else if (bet.kind === 'number' && Number.isInteger(details.number)) {
          isWin = ranks.includes(details.number);
        } else if (bet.kind === 'action' && typeof details.action === 'string') {
          const r = UNO_ACTION_RANK[details.action];
          isWin = r != null && ranks.includes(r);
        } else if (bet.kind === 'wild') {
          isWin = hasAnyWild;
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

        await conn.execute(
          `UPDATE uno_king_rounds
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

        const userBalances = new Map();
        for (const userId of perUser.keys()) {
          const [rows] = await conn.execute(
            'SELECT balance FROM users WHERE id = ? FOR UPDATE',
            [userId]
          );
          if (rows.length > 0) userBalances.set(userId, parseFloat(rows[0].balance));
        }

        for (const s of settlements) {
          await conn.execute(
            `UPDATE uno_king_bets
                SET is_win = ?, win_amount = ?, status = 'settled', settled_at = NOW()
              WHERE id = ?`,
            [s.isWin ? 1 : 0, s.winAmount.toFixed(2), s.id]
          );

          const [gb] = await conn.execute(
            `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
             VALUES (?, 'uno_king', ?, ?, ?, ?, ?, ?)`,
            [
              s.userId,
              s.amount.toFixed(2),
              s.winAmount.toFixed(2),
              s.isWin ? Math.floor((s.winAmount / Math.max(s.amount, 0.01)) * 100) / 100 : 0,
              cards.join(','),
              s.isWin ? 1 : 0,
              JSON.stringify({
                periodId: round.periodId,
                cardCountType: type,
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
                `UNO King type-${type} win: ${round.periodId}`,
              ]
            );
          }
        }

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
        `[UNO/${type}] Round complete ${round.periodId} cards=[${cards.join(',')}] ` +
        `bets=${settlements.length} wager=${totalWager.toFixed(2)} win=${totalWin.toFixed(2)}`
      );

      const userOutcomes = new Map();
      for (const s of settlements) {
        const arr = userOutcomes.get(s.userId) || [];
        arr.push({ kind: s.kind, details: s.details, amount: s.amount, isWin: s.isWin, winAmount: s.winAmount });
        userOutcomes.set(s.userId, arr);
      }

      if (this.io) {
        this.io.emit('uno:round:result', {
          cardCountType: type,
          roundId: round.id,
          periodId: round.periodId,
          cards,
          resultSummary,
          totalWager,
          totalWin,
          betCount: settlements.length,
          playerCount: userIdSet.size,
        });

        for (const [userId, outcomes] of userOutcomes.entries()) {
          const totalUserWin = outcomes.reduce((s, o) => s + o.winAmount, 0);
          const totalUserBet = outcomes.reduce((s, o) => s + o.amount, 0);
          this.io.to(`user:${userId}`).emit('uno:round:settled', {
            cardCountType: type,
            roundId: round.id,
            periodId: round.periodId,
            cards,
            outcomes,
            totalBet: Math.round(totalUserBet * 100) / 100,
            totalWin: Math.round(totalUserWin * 100) / 100,
            isWin: totalUserWin > 0,
          });
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
      console.error(`[UNO/${type}] Round completion error:`, err);
      try {
        await db.pool.query(
          `UPDATE uno_king_rounds SET status = 'completed', completed_at = NOW() WHERE id = ?`,
          [round.id]
        );
      } catch {}
    }

    this.currentRounds.delete(type);
    this._setTimer(type, 'next', 3500, () => {
      this._openRound(type).catch(err => console.error(`[UNO/${type}] Open next round error:`, err));
    });
  }

  async _forceFinalize(roundId) {
    await db.pool.query(
      `UPDATE uno_king_bets SET status = 'settled', is_win = 0, win_amount = 0,
                                settled_at = NOW()
        WHERE round_id = ? AND status = 'pending'`,
      [roundId]
    );
    const [pendingBets] = await db.pool.query(
      `SELECT user_id, SUM(amount) as total FROM uno_king_bets
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
      `UPDATE uno_king_rounds SET status = 'completed', completed_at = NOW(),
              result_summary = JSON_OBJECT('canceled', true) WHERE id = ?`,
      [roundId]
    );
  }

  _publicRoundState(type) {
    const r = this.currentRounds.get(type);
    if (!r) return null;
    const now = Date.now();
    const lockMs = r.lockedAt.getTime();
    const completeMs = r.completeAt.getTime();
    const phase = now < lockMs ? 'betting' : 'locked';
    return {
      cardCountType: type,
      roundId: r.id,
      periodId: r.periodId,
      status: phase,
      startedAt: r.startedAt.toISOString(),
      lockedAt: r.lockedAt.toISOString(),
      completeAt: r.completeAt.toISOString(),
      bettingRemainingMs: Math.max(0, lockMs - now),
      totalRemainingMs: Math.max(0, completeMs - now),
      bettingPhaseMs: BETTING_PHASE_MS,
      lockPhaseMs: LOCK_PHASE_MS,
      roundTotalMs: ROUND_TOTAL_MS,
    };
  }

  getAllRoundStates() {
    const out = {};
    for (const t of CARD_COUNT_TYPES) out[t] = this._publicRoundState(t);
    return out;
  }

  getCurrentRoundState() {
    return this._publicRoundState(4) || this._publicRoundState(1);
  }

  getCardCountTypes() {
    return [...CARD_COUNT_TYPES];
  }

  getMultipliers() {
    return UNO_MULTIPLIERS;
  }

  async placeBet(userId, betInput) {
    const type = parseInt(betInput?.cardCountType ?? betInput?.card_count_type, 10);
    if (!CARD_COUNT_TYPES.includes(type)) throw new Error('cardCountType must be 1, 2, 3, or 4');
    const round = this.currentRounds.get(type);
    if (!round) {
      throw new Error(
        `Type-${type} UNO King round has not been opened yet — server may still be starting, or migration 061 has not been applied (check backend logs for "[UNO/${type}] Failed to open round").`
      );
    }
    if (round.status !== 'betting') throw new Error(`Betting is closed for type-${type} round (status=${round.status})`);
    if (Date.now() >= round.lockedAt.getTime()) throw new Error(`Betting is closed for type-${type} round (locked)`);

    const cleanBet = this._validateBet(betInput, type);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [users] = await conn.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');
      const balance = parseFloat(users[0].balance);
      if (balance < cleanBet.amount) throw new Error('Insufficient balance');

      const [counts] = await conn.execute(
        'SELECT COUNT(*) AS n FROM uno_king_bets WHERE round_id = ? AND user_id = ?',
        [round.id, userId]
      );
      if (Number(counts[0].n) >= MAX_BETS_PER_USER) {
        throw new Error(`Maximum ${MAX_BETS_PER_USER} bets per round`);
      }

      const newBalance = Math.floor((balance - cleanBet.amount) * 100) / 100;
      await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);

      const [bal] = await conn.execute(
        `INSERT INTO uno_king_bets
            (round_id, card_count_type, user_id, kind, amount, multiplier, details, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          round.id,
          type,
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
          `UNO King type-${type} bet ${round.periodId}: ${cleanBet.kind}`,
        ]
      );

      await conn.commit();

      if (this.io) this.io.to(`user:${userId}`).emit('balance:update', { balance: newBalance });

      return {
        betId: bal.insertId,
        cardCountType: type,
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

  _validateBet(bet, type) {
    if (!bet || typeof bet !== 'object') throw new Error('Malformed bet');
    const amount = Math.floor(parseFloat(bet.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is ${MIN_BET} Z`);
    if (amount > MAX_BET) throw new Error(`Maximum bet is ${MAX_BET} Z`);

    const kind = bet.kind || 'cards';

    if (kind === 'cards') {
      if (!Array.isArray(bet.cards) || bet.cards.length < 1 || bet.cards.length > type) {
        throw new Error(`Pick 1-${type} cards for this type`);
      }
      const cards = bet.cards.map((c) => {
        const n = parseInt(c, 10);
        if (!Number.isInteger(n) || n < 0 || n >= UNO_DECK_SIZE) throw new Error('Invalid card');
        return n;
      });
      if (new Set(cards).size !== cards.length) throw new Error('Duplicate cards');
      const multiplier = UNO_MULTIPLIERS.cards[cards.length];
      if (!multiplier) throw new Error('Unsupported pick count');
      return { kind, amount, multiplier, details: { cards } };
    }

    if (kind === 'color') {
      if (!Object.prototype.hasOwnProperty.call(UNO_COLOR_INDEX, bet.color)) {
        throw new Error('Color must be red, yellow, green, or blue');
      }
      return { kind, amount, multiplier: UNO_MULTIPLIERS.color, details: { color: bet.color } };
    }

    if (kind === 'number') {
      const number = parseInt(bet.number, 10);
      if (!Number.isInteger(number) || number < 0 || number > 9) {
        throw new Error('Number must be 0-9');
      }
      return { kind, amount, multiplier: UNO_MULTIPLIERS.number, details: { number } };
    }

    if (kind === 'action') {
      if (!Object.prototype.hasOwnProperty.call(UNO_ACTION_RANK, bet.action)) {
        throw new Error('Action must be skip, reverse, or draw_two');
      }
      return { kind, amount, multiplier: UNO_MULTIPLIERS.action, details: { action: bet.action } };
    }

    if (kind === 'wild') {
      return { kind, amount, multiplier: UNO_MULTIPLIERS.wild, details: {} };
    }

    throw new Error(`Unknown bet kind "${kind}"`);
  }

  async getRoundHistory({ page = 1, limit = 20, cardCountType } = {}) {
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pg - 1) * lim;

    const typeFilter = CARD_COUNT_TYPES.includes(parseInt(cardCountType, 10))
      ? parseInt(cardCountType, 10) : null;

    const [countRows] = await db.pool.query(
      typeFilter == null
        ? `SELECT COUNT(*) AS total FROM uno_king_rounds WHERE status = 'completed'`
        : `SELECT COUNT(*) AS total FROM uno_king_rounds WHERE status = 'completed' AND card_count_type = ?`,
      typeFilter == null ? [] : [typeFilter]
    );
    const total = Number(countRows[0]?.total || 0);

    const sql = typeFilter == null
      ? `SELECT id, period_id, card_count_type, status, cards, result_summary, total_wager, total_win,
                bet_count, player_count, started_at, completed_at
           FROM uno_king_rounds
          WHERE status = 'completed'
          ORDER BY id DESC
          LIMIT ? OFFSET ?`
      : `SELECT id, period_id, card_count_type, status, cards, result_summary, total_wager, total_win,
                bet_count, player_count, started_at, completed_at
           FROM uno_king_rounds
          WHERE status = 'completed' AND card_count_type = ?
          ORDER BY id DESC
          LIMIT ? OFFSET ?`;
    const params = typeFilter == null ? [lim, offset] : [typeFilter, lim, offset];

    const [rows] = await db.pool.query(sql, params);
    return {
      items: rows.map((r) => ({
        roundId: r.id,
        periodId: r.period_id,
        cardCountType: r.card_count_type,
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

  async getMyBets(userId, limit = 20, cardCountType = null) {
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const typeFilter = CARD_COUNT_TYPES.includes(parseInt(cardCountType, 10))
      ? parseInt(cardCountType, 10) : null;

    const sql = typeFilter == null
      ? `SELECT b.id, b.round_id, b.card_count_type, b.kind, b.amount, b.multiplier, b.details,
                b.is_win, b.win_amount, b.status, b.created_at,
                r.period_id, r.cards, r.status AS round_status
           FROM uno_king_bets b
           JOIN uno_king_rounds r ON r.id = b.round_id
          WHERE b.user_id = ?
          ORDER BY b.id DESC
          LIMIT ?`
      : `SELECT b.id, b.round_id, b.card_count_type, b.kind, b.amount, b.multiplier, b.details,
                b.is_win, b.win_amount, b.status, b.created_at,
                r.period_id, r.cards, r.status AS round_status
           FROM uno_king_bets b
           JOIN uno_king_rounds r ON r.id = b.round_id
          WHERE b.user_id = ? AND b.card_count_type = ?
          ORDER BY b.id DESC
          LIMIT ?`;
    const params = typeFilter == null ? [userId, lim] : [userId, typeFilter, lim];

    const [rows] = await db.pool.query(sql, params);
    return rows.map((row) => ({
      betId: row.id,
      roundId: row.round_id,
      cardCountType: row.card_count_type,
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

module.exports = UnoKingService;
module.exports.UNO_MULTIPLIERS = UNO_MULTIPLIERS;
module.exports.CARD_COUNT_TYPES = CARD_COUNT_TYPES;
