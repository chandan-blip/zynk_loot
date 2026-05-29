const db = require('../config/database');
const crypto = require('crypto');

// Shuffle Card — 4 PARALLEL server-authoritative single-card lotteries, one per
// DURATION LANE (30s, 1m, 5m, 10m). Each round reveals exactly ONE card from a
// shuffled 52-card deck.
//
// The lane is carried in the `card_count_type` column (values 1..4) — the
// column is kept for schema/prediction-rig compatibility but now means a lane
// id, NOT a card count. Shuffle's card count is always 1. See LANES below.
//
// Bet kinds (the one revealed card decides all):
//   cards  — pick exactly 1 specific card; wins if it is the drawn card. 15x
//   suit   — pick suit 0-3; wins if the drawn card has that suit.          5x
//   color  — 'red' | 'black'; wins if the drawn card is that color.        2x

// Lane id → duration config. Each lane is its own parallel round loop with its
// own period_id sequence, timing, and history.
const LANES = [
  { id: 1, key: '30s', label: '30s', totalMs: 30_000,  bettingMs: 25_000,  lockMs: 5_000 },
  { id: 2, key: '1m',  label: '1m',  totalMs: 60_000,  bettingMs: 50_000,  lockMs: 10_000 },
  { id: 3, key: '5m',  label: '5m',  totalMs: 300_000, bettingMs: 285_000, lockMs: 15_000 },
  { id: 4, key: '10m', label: '10m', totalMs: 600_000, bettingMs: 580_000, lockMs: 20_000 },
];
const LANE_IDS = LANES.map((l) => l.id);
const LANE_BY_ID = new Map(LANES.map((l) => [l.id, l]));
// Backwards-compatible alias — several callers/iterators still reference the
// old name; it is now simply the list of lane ids.
const CARD_COUNT_TYPES = LANE_IDS;

const WIN_PAYOUT_RATIO = 0.9;

const SHUFFLE_MULTIPLIERS = {
  cards: 15,
  suit:  5,
  color: 2,
};

const MAX_BETS_PER_USER = 20;
const MIN_BET = 1;
const MAX_BET = 10_000;

const cardSuit = (id) => Math.floor(id / 13);
const cardRank = (id) => id % 13;
const isRedCard = (id) => {
  const s = cardSuit(id);
  return s === 1 || s === 2;
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
    this.predictionService = null;
    this.currentRounds = new Map();
    this.timers = new Map();
    this.running = false;
  }

  setPredictionService(svc) {
    this.predictionService = svc;
  }

  getCurrentRound(type) {
    return this.currentRounds.get(type) || null;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    try {
      const [stale] = await db.pool.query(
        `SELECT id FROM shuffle_card_rounds WHERE status IN ('betting', 'locked')`
      );
      for (const r of stale) {
        try { await this._forceFinalize(r.id); }
        catch (e) { console.error('[SHUFFLE] Failed to finalize stale round', r.id, e.message); }
      }
    } catch (e) {
      console.error('[SHUFFLE] Startup cleanup error:', e.message);
    }

    console.log('[SHUFFLE] Service started — opening first round per lane...');
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
      `SELECT period_id FROM shuffle_card_rounds
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
      const lane = LANE_BY_ID.get(type);
      if (!lane) throw new Error(`Unknown lane id ${type}`);
      const periodId = await this._generatePeriodId(type);
      const startedAt = new Date();
      const lockedAt = new Date(startedAt.getTime() + lane.bettingMs);
      const completeAt = new Date(startedAt.getTime() + lane.totalMs);

      const [result] = await db.pool.query(
        `INSERT INTO shuffle_card_rounds (period_id, card_count_type, status, started_at)
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

      console.log(`[SHUFFLE/${type}] Round opened ${periodId} (id=${result.insertId})`);

      if (this.io) this.io.emit('shuffle:round:open', this._publicRoundState(type));

      this._setTimer(type, 'lock', lane.bettingMs, () =>
        this._lockRound(type).catch(err => console.error(`[SHUFFLE/${type}] Lock error:`, err))
      );
      this._setTimer(type, 'complete', lane.totalMs, () =>
        this._completeRound(type).catch(err => console.error(`[SHUFFLE/${type}] Complete error:`, err))
      );
    } catch (err) {
      console.error(`[SHUFFLE/${type}] Failed to open round:`, err);
      this._setTimer(type, 'next', 5000, () => this._openRound(type).catch(() => {}));
    }
  }

  async _lockRound(type) {
    const round = this.currentRounds.get(type);
    if (!round) return;
    round.status = 'locked';

    await db.pool.query(
      `UPDATE shuffle_card_rounds SET status = 'locked', locked_at = NOW() WHERE id = ?`,
      [round.id]
    );

    console.log(`[SHUFFLE/${type}] Round locked ${round.periodId}`);

    if (this.io) {
      const lane = LANE_BY_ID.get(type);
      this.io.emit('shuffle:round:lock', {
        cardCountType: type,
        roundId: round.id,
        periodId: round.periodId,
        countdownSeconds: Math.floor((lane?.lockMs ?? 10_000) / 1000),
      });
    }
  }

  async _completeRound(type) {
    const round = this.currentRounds.get(type);
    if (!round) return;

    try {
      // Durable lookup — falls through to prediction_log table if the
      // in-memory Map was wiped by a PM2 restart between broadcast and now.
      let cards = null;
      if (this.predictionService) {
        const { cards: resolved, source } = await this.predictionService
          .resolveCardsForRound(round.id, 'shuffle_card', 1);
        if (resolved) {
          cards = resolved;
          console.log(`[SHUFFLE/${type}] Used predicted cards (${source}) for round ${round.id}: ${JSON.stringify(cards)}`);
        }
      }
      if (!cards) {
        console.log(`[SHUFFLE/${type}] No predicted card for round ${round.id} — using random sample`);
        cards = secureSample(52, 1);
      }
      // Exactly one card is revealed per round — `card` is the single outcome.
      const card = cards[0];
      const cardRankVal = cardRank(card);
      const cardSuitVal = cardSuit(card);
      const cardColor = isRedCard(card) ? 'red' : 'black';

      const resultSummary = {
        cards,
        card,
        rank: cardRankVal,
        suit: cardSuitVal,
        color: cardColor,
        laneId: type,
      };

      const [bets] = await db.pool.query(
        `SELECT id, user_id, kind, amount, multiplier, details
         FROM shuffle_card_bets WHERE round_id = ? AND status = 'pending'`,
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
          isWin = details.cards[0] === card;
        } else if (bet.kind === 'suit' && Number.isInteger(details.suit)) {
          isWin = cardSuitVal === details.suit;
        } else if (bet.kind === 'color') {
          isWin = details.color === cardColor;
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
            `UPDATE shuffle_card_bets
                SET is_win = ?, win_amount = ?, status = 'settled', settled_at = NOW()
              WHERE id = ?`,
            [s.isWin ? 1 : 0, s.winAmount.toFixed(2), s.id]
          );

          const [gb] = await conn.execute(
            `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
             VALUES (?, 'shuffle_card', ?, ?, ?, ?, ?, ?)`,
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
                `Shuffle Card ${LANE_BY_ID.get(type)?.label || `lane ${type}`} win: ${round.periodId}`,
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
        `[SHUFFLE/${type}] Round complete ${round.periodId} cards=[${cards.join(',')}] ` +
        `bets=${settlements.length} wager=${totalWager.toFixed(2)} win=${totalWin.toFixed(2)}`
      );

      const userOutcomes = new Map();
      for (const s of settlements) {
        const arr = userOutcomes.get(s.userId) || [];
        arr.push({ kind: s.kind, details: s.details, amount: s.amount, isWin: s.isWin, winAmount: s.winAmount });
        userOutcomes.set(s.userId, arr);
      }

      if (this.io) {
        this.io.emit('shuffle:round:result', {
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
          this.io.to(`user:${userId}`).emit('shuffle:round:settled', {
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
      console.error(`[SHUFFLE/${type}] Round completion error:`, err);
      try {
        await db.pool.query(
          `UPDATE shuffle_card_rounds SET status = 'completed', completed_at = NOW() WHERE id = ?`,
          [round.id]
        );
      } catch {}
    }

    this.currentRounds.delete(type);
    this._setTimer(type, 'next', 3500, () => {
      this._openRound(type).catch(err => console.error(`[SHUFFLE/${type}] Open next round error:`, err));
    });
  }

  async _forceFinalize(roundId) {
    await db.pool.query(
      `UPDATE shuffle_card_bets SET status = 'settled', is_win = 0, win_amount = 0,
                                  settled_at = NOW()
        WHERE round_id = ? AND status = 'pending'`,
      [roundId]
    );
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

  _publicRoundState(type) {
    const r = this.currentRounds.get(type);
    if (!r) return null;
    const now = Date.now();
    const lockMs = r.lockedAt.getTime();
    const completeMs = r.completeAt.getTime();
    const phase = now < lockMs ? 'betting' : 'locked';
    const lane = LANE_BY_ID.get(type);
    return {
      cardCountType: type,
      laneId: type,
      laneKey: lane?.key || null,
      laneLabel: lane?.label || null,
      roundId: r.id,
      periodId: r.periodId,
      status: phase,
      startedAt: r.startedAt.toISOString(),
      lockedAt: r.lockedAt.toISOString(),
      completeAt: r.completeAt.toISOString(),
      bettingRemainingMs: Math.max(0, lockMs - now),
      totalRemainingMs: Math.max(0, completeMs - now),
      bettingPhaseMs: lane?.bettingMs ?? 0,
      lockPhaseMs: lane?.lockMs ?? 0,
      roundTotalMs: lane?.totalMs ?? 0,
    };
  }

  getAllRoundStates() {
    const out = {};
    for (const t of LANE_IDS) out[t] = this._publicRoundState(t);
    return out;
  }

  getCurrentRoundState() {
    return this._publicRoundState(1) || this._publicRoundState(2);
  }

  getCardCountTypes() {
    return [...LANE_IDS];
  }

  getLanes() {
    return LANES.map((l) => ({ ...l }));
  }

  getMultipliers() {
    return SHUFFLE_MULTIPLIERS;
  }

  async placeBet(userId, betInput) {
    const type = parseInt(betInput?.cardCountType ?? betInput?.card_count_type ?? betInput?.laneId, 10);
    if (!LANE_IDS.includes(type)) throw new Error('Invalid lane — must be one of 30s, 1m, 5m, 10m');
    const laneLabel = LANE_BY_ID.get(type)?.label || `lane ${type}`;
    const round = this.currentRounds.get(type);
    if (!round) {
      throw new Error(
        `The ${laneLabel} Shuffle Card round has not been opened yet — server may still be starting, or migration 065 has not been applied (check backend logs for "[SHUFFLE/${type}] Failed to open round").`
      );
    }
    if (round.status !== 'betting') throw new Error(`Betting is closed for the ${laneLabel} round (status=${round.status})`);
    if (Date.now() >= round.lockedAt.getTime()) throw new Error(`Betting is closed for the ${laneLabel} round (locked)`);

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
        'SELECT COUNT(*) AS n FROM shuffle_card_bets WHERE round_id = ? AND user_id = ?',
        [round.id, userId]
      );
      if (Number(counts[0].n) >= MAX_BETS_PER_USER) {
        throw new Error(`Maximum ${MAX_BETS_PER_USER} bets per round`);
      }

      const newBalance = Math.floor((balance - cleanBet.amount) * 100) / 100;
      await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);

      const [bal] = await conn.execute(
        `INSERT INTO shuffle_card_bets
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
          `Shuffle Card ${laneLabel} bet ${round.periodId}: ${cleanBet.kind}`,
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
      // Exactly one card is revealed per round, so a Cards bet is a single
      // exact-card guess paying 15x.
      if (!Array.isArray(bet.cards) || bet.cards.length !== 1) {
        throw new Error('Pick exactly 1 card');
      }
      const n = parseInt(bet.cards[0], 10);
      if (!Number.isInteger(n) || n < 0 || n > 51) throw new Error('Invalid card');
      return { kind, amount, multiplier: SHUFFLE_MULTIPLIERS.cards, details: { cards: [n] } };
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

  async getRoundHistory({ page = 1, limit = 20, cardCountType } = {}) {
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pg - 1) * lim;

    const typeFilter = CARD_COUNT_TYPES.includes(parseInt(cardCountType, 10))
      ? parseInt(cardCountType, 10) : null;

    const [countRows] = await db.pool.query(
      typeFilter == null
        ? `SELECT COUNT(*) AS total FROM shuffle_card_rounds WHERE status = 'completed'`
        : `SELECT COUNT(*) AS total FROM shuffle_card_rounds WHERE status = 'completed' AND card_count_type = ?`,
      typeFilter == null ? [] : [typeFilter]
    );
    const total = Number(countRows[0]?.total || 0);

    const sql = typeFilter == null
      ? `SELECT id, period_id, card_count_type, status, cards, result_summary, total_wager, total_win,
                bet_count, player_count, started_at, completed_at
           FROM shuffle_card_rounds
          WHERE status = 'completed'
          ORDER BY id DESC
          LIMIT ? OFFSET ?`
      : `SELECT id, period_id, card_count_type, status, cards, result_summary, total_wager, total_win,
                bet_count, player_count, started_at, completed_at
           FROM shuffle_card_rounds
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
           FROM shuffle_card_bets b
           JOIN shuffle_card_rounds r ON r.id = b.round_id
          WHERE b.user_id = ?
          ORDER BY b.id DESC
          LIMIT ?`
      : `SELECT b.id, b.round_id, b.card_count_type, b.kind, b.amount, b.multiplier, b.details,
                b.is_win, b.win_amount, b.status, b.created_at,
                r.period_id, r.cards, r.status AS round_status
           FROM shuffle_card_bets b
           JOIN shuffle_card_rounds r ON r.id = b.round_id
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

module.exports = ShuffleCardService;
module.exports.SHUFFLE_MULTIPLIERS = SHUFFLE_MULTIPLIERS;
module.exports.CARD_COUNT_TYPES = CARD_COUNT_TYPES;
module.exports.LANES = LANES;
