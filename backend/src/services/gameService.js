const db = require('../config/database');

// House takes 10% from winnings — players receive 90% of gross win amount
const WIN_PAYOUT_RATIO = 0.9;

// Mutka King and UNO King moved to their own round-based services — see
// services/mutkaKingService.js and services/unoKingService.js.

class GameService {
  constructor(io) {
    this.io = io;
  }

  async playCoinFlip(userId, betAmount, prediction) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Lock user row and check balance
      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');

      // Flip the coin
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const isWin = result === prediction;
      const multiplier = isWin ? 1.95 : 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      // Calculate new balance
      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = isWin ? balanceAfterBet + winAmount : balanceAfterBet;

      // Update user balance
      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      // Insert game bet record
      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'coin_flip', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, result, isWin, JSON.stringify({ prediction })]
      );

      // Record bet transaction
      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Coin Flip bet: ${betAmount} Z on ${prediction}`]
      );

      // Record win transaction if won
      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Coin Flip win: ${winAmount} Z (${multiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result,
        prediction,
        isWin,
        betAmount,
        winAmount,
        multiplier,
        newBalance: finalBalance
      };

      // Emit socket event
      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async playDiceRoll(userId, betAmount, prediction) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');

      // Roll the dice (1-6)
      const result = Math.floor(Math.random() * 6) + 1;
      const isWin = result === prediction;
      const multiplier = isWin ? 5.7 : 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = isWin ? balanceAfterBet + winAmount : balanceAfterBet;

      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'dice_roll', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, String(result), isWin, JSON.stringify({ prediction })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Dice Roll bet: ${betAmount} Z on ${prediction}`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Dice Roll win: ${winAmount} Z (${multiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: String(result),
        prediction: String(prediction),
        isWin,
        betAmount,
        winAmount,
        multiplier,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Lucky Spin segments: { label, multiplier, weight }
  // Weighted random — higher weight = more likely
  static SPIN_SEGMENTS = [
    { label: '0x',   multiplier: 0,    weight: 30 },
    { label: '0.5x', multiplier: 0.5,  weight: 25 },
    { label: '1x',   multiplier: 1,    weight: 18 },
    { label: '1.5x', multiplier: 1.5,  weight: 12 },
    { label: '2x',   multiplier: 2,    weight: 7 },
    { label: '3x',   multiplier: 3,    weight: 4 },
    { label: '5x',   multiplier: 5,    weight: 2.5 },
    { label: '10x',  multiplier: 10,   weight: 1.5 },
  ];

  async playLuckySpin(userId, betAmount) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 5) throw new Error('Minimum bet is 5 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');

      // Weighted random selection
      const segments = GameService.SPIN_SEGMENTS;
      const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
      let rand = Math.random() * totalWeight;
      let selectedIndex = 0;
      for (let i = 0; i < segments.length; i++) {
        rand -= segments[i].weight;
        if (rand <= 0) { selectedIndex = i; break; }
      }

      const segment = segments[selectedIndex];
      const multiplier = segment.multiplier;
      const isWin = multiplier > 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = balanceAfterBet + winAmount;

      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'lucky_spin', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, segment.label, isWin,
         JSON.stringify({ segmentIndex: selectedIndex, label: segment.label })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Lucky Spin bet: ${betAmount} Z`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Lucky Spin win: ${winAmount} Z (${multiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: segment.label,
        segmentIndex: selectedIndex,
        isWin,
        betAmount,
        winAmount,
        multiplier,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Balloon Pop: player picks a cashout target, server generates a random pop point
  // If target <= popPoint, player wins (bet × target). Otherwise balloon pops (loss).
  static BALLOON_HOUSE_EDGE = 0.97; // 3% house edge

  async playBalloonPop(userId, betAmount, cashoutMultiplier) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');
      if (cashoutMultiplier < 1.1 || cashoutMultiplier > 50) throw new Error('Cashout must be between 1.1x and 50x');

      // Generate random pop point using inverse CDF with house edge
      // P(survive to m) = houseEdge / m → popPoint = houseEdge / (1 - rand)
      const rawPop = GameService.BALLOON_HOUSE_EDGE / (1 - Math.random());
      const popPoint = Math.round(Math.max(1.0, Math.min(rawPop, 100)) * 100) / 100;

      const isWin = cashoutMultiplier <= popPoint;
      const multiplier = isWin ? cashoutMultiplier : 0;
      const winAmount = isWin ? Math.floor(betAmount * cashoutMultiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = isWin ? balanceAfterBet + winAmount : balanceAfterBet;

      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      const resultLabel = isWin ? `${cashoutMultiplier}x` : 'POP!';

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'balloon_pop', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, resultLabel, isWin,
         JSON.stringify({ popPoint, cashoutMultiplier })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Balloon Pop bet: ${betAmount} Z (target ${cashoutMultiplier}x)`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Balloon Pop win: ${winAmount} Z (${cashoutMultiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: resultLabel,
        isWin,
        betAmount,
        winAmount,
        multiplier: cashoutMultiplier,
        popPoint,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Dragon Tower: player picks target floors (1-8), each floor is 50/50 survival
  // Multiplier per floor: 1.94x (3% house edge per floor)
  static TOWER_MULTIPLIER_BASE = 1.94;
  static TOWER_MAX_FLOORS = 8;

  async playDragonTower(userId, betAmount, targetFloors) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');
      if (targetFloors < 1 || targetFloors > GameService.TOWER_MAX_FLOORS) {
        throw new Error(`Target floors must be 1-${GameService.TOWER_MAX_FLOORS}`);
      }

      // Simulate climbing: each floor is 50% survival
      let survivedFloors = 0;
      for (let i = 0; i < targetFloors; i++) {
        if (Math.random() < 0.5) {
          survivedFloors++;
        } else {
          break;
        }
      }

      const isWin = survivedFloors >= targetFloors;
      const multiplier = isWin
        ? Math.round(Math.pow(GameService.TOWER_MULTIPLIER_BASE, targetFloors) * 100) / 100
        : 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;
      const failedFloor = isWin ? null : survivedFloors + 1;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = isWin ? balanceAfterBet + winAmount : balanceAfterBet;

      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      const resultLabel = isWin ? `${multiplier}x` : 'TRAP!';

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'dragon_tower', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, resultLabel, isWin,
         JSON.stringify({ targetFloors, survivedFloors, failedFloor })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Dragon Tower bet: ${betAmount} Z (${targetFloors} floors)`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Dragon Tower win: ${winAmount} Z (${multiplier}x, ${targetFloors}F)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: resultLabel,
        isWin,
        betAmount,
        winAmount,
        multiplier,
        targetFloors,
        survivedFloors,
        failedFloor,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Ice Field: player picks tiles on a 5-column grid, avoiding traps
  // Difficulty 1-3 = number of traps per row (out of 5 tiles)
  static ICE_COLS = 5;
  static ICE_MAX_ROWS = 5;
  static ICE_HOUSE_EDGE = 0.97;

  async playIceField(userId, betAmount, difficulty, targetRows) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');
      if (difficulty < 1 || difficulty > 3) throw new Error('Difficulty must be 1-3');
      if (targetRows < 1 || targetRows > GameService.ICE_MAX_ROWS) throw new Error('Rows must be 1-5');

      const safePerRow = GameService.ICE_COLS - difficulty;
      const survivalChance = safePerRow / GameService.ICE_COLS;

      let survivedRows = 0;
      for (let i = 0; i < targetRows; i++) {
        if (Math.random() < survivalChance) {
          survivedRows++;
        } else {
          break;
        }
      }

      const isWin = survivedRows >= targetRows;
      const multiplierPerRow = (GameService.ICE_COLS / safePerRow) * GameService.ICE_HOUSE_EDGE;
      const multiplier = isWin
        ? Math.round(Math.pow(multiplierPerRow, targetRows) * 100) / 100
        : 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;
      const failedRow = isWin ? null : survivedRows + 1;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = isWin ? balanceAfterBet + winAmount : balanceAfterBet;

      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      const resultLabel = isWin ? `${multiplier}x` : 'CRACK!';

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'ice_field', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, resultLabel, isWin,
         JSON.stringify({ difficulty, targetRows, survivedRows, failedRow })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Ice Field bet: ${betAmount} Z (${targetRows} rows, difficulty ${difficulty})`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Ice Field win: ${winAmount} Z (${multiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: resultLabel,
        isWin,
        betAmount,
        winAmount,
        multiplier,
        difficulty,
        targetRows,
        survivedRows,
        failedRow,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Arrow Roulette: shoot an arrow at a target with concentric rings
  // Weighted random ring selection (~5% house edge)
  static ARROW_RINGS = [
    { label: 'MISS',  multiplier: 0,    weight: 40 },
    { label: '0.5x',  multiplier: 0.5,  weight: 25 },
    { label: '1x',    multiplier: 1,    weight: 18 },
    { label: '1.5x',  multiplier: 1.5,  weight: 12 },
    { label: '2x',    multiplier: 2,    weight: 7 },
    { label: '5x',    multiplier: 5,    weight: 4 },
    { label: '10x',   multiplier: 10,   weight: 2 },
  ];

  async playArrowRoulette(userId, betAmount) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');

      // Weighted random ring selection
      const rings = GameService.ARROW_RINGS;
      const totalWeight = rings.reduce((s, r) => s + r.weight, 0);
      let rand = Math.random() * totalWeight;
      let ringIndex = 0;
      for (let i = 0; i < rings.length; i++) {
        rand -= rings[i].weight;
        if (rand <= 0) { ringIndex = i; break; }
      }

      const ring = rings[ringIndex];
      const multiplier = ring.multiplier;
      const isWin = multiplier > 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = balanceAfterBet + winAmount;

      await connection.execute(
        'UPDATE users SET balance = ? WHERE id = ?',
        [finalBalance, userId]
      );

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'arrow_roulette', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, ring.label, isWin,
         JSON.stringify({ ringIndex, ringLabel: ring.label })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Arrow Roulette bet: ${betAmount} Z`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Arrow Roulette win: ${winAmount} Z (${multiplier}x - ${ring.label})`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: ring.label,
        ringIndex,
        isWin,
        betAmount,
        winAmount,
        multiplier,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Egg Hatch: pick an egg, reveal a random multiplier (~3% house edge)
  static EGG_MULTIPLIERS = [
    { label: '0x',   multiplier: 0,    weight: 35 },
    { label: '0.5x', multiplier: 0.5,  weight: 28 },
    { label: '1x',   multiplier: 1,    weight: 18 },
    { label: '1.5x', multiplier: 1.5,  weight: 10 },
    { label: '3x',   multiplier: 3,    weight: 5 },
    { label: '5x',   multiplier: 5,    weight: 2.5 },
    { label: '15x',  multiplier: 15,   weight: 1.5 },
  ];

  async playEggHatch(userId, betAmount) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');

      const eggs = GameService.EGG_MULTIPLIERS;
      const totalWeight = eggs.reduce((s, e) => s + e.weight, 0);
      let rand = Math.random() * totalWeight;
      let selectedIndex = 0;
      for (let i = 0; i < eggs.length; i++) {
        rand -= eggs[i].weight;
        if (rand <= 0) { selectedIndex = i; break; }
      }

      const egg = eggs[selectedIndex];
      const multiplier = egg.multiplier;
      const isWin = multiplier > 0;
      const winAmount = isWin ? Math.floor(betAmount * multiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = balanceAfterBet + winAmount;

      await connection.execute('UPDATE users SET balance = ? WHERE id = ?', [finalBalance, userId]);

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'egg_hatch', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, egg.label, isWin,
         JSON.stringify({ eggIndex: selectedIndex, label: egg.label })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId, `Egg Hatch bet: ${betAmount} Z`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Egg Hatch win: ${winAmount} Z (${multiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: egg.label,
        isWin,
        betAmount,
        winAmount,
        multiplier,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Fuse: same mechanic as Balloon Pop but with fuse/dynamite theme
  static FUSE_HOUSE_EDGE = 0.97;

  async playFuse(userId, betAmount, cashoutMultiplier) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (users.length === 0) throw new Error('User not found');

      const user = users[0];
      const currentBalance = parseFloat(user.balance);

      if (betAmount < 1) throw new Error('Minimum bet is 1 Z');
      if (betAmount > 10000) throw new Error('Maximum bet is 10,000 Z');
      if (currentBalance < betAmount) throw new Error('Insufficient balance');
      if (cashoutMultiplier < 1.1 || cashoutMultiplier > 50) throw new Error('Cut point must be between 1.1x and 50x');

      const rawBoom = GameService.FUSE_HOUSE_EDGE / (1 - Math.random());
      const boomPoint = Math.round(Math.max(1.0, Math.min(rawBoom, 100)) * 100) / 100;

      const isWin = cashoutMultiplier <= boomPoint;
      const multiplier = isWin ? cashoutMultiplier : 0;
      const winAmount = isWin ? Math.floor(betAmount * cashoutMultiplier * WIN_PAYOUT_RATIO * 100) / 100 : 0;

      const balanceAfterBet = currentBalance - betAmount;
      const finalBalance = isWin ? balanceAfterBet + winAmount : balanceAfterBet;

      await connection.execute('UPDATE users SET balance = ? WHERE id = ?', [finalBalance, userId]);

      const resultLabel = isWin ? `${cashoutMultiplier}x` : 'BOOM!';

      const [betResult] = await connection.execute(
        `INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, multiplier, result, is_win, details)
         VALUES (?, 'fuse', ?, ?, ?, ?, ?, ?)`,
        [userId, betAmount, winAmount, multiplier, resultLabel, isWin,
         JSON.stringify({ boomPoint, cashoutMultiplier })]
      );

      await connection.execute(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
         VALUES (?, 'game_bet', ?, ?, ?, 'game_bet', ?, ?)`,
        [userId, betAmount, currentBalance, balanceAfterBet, betResult.insertId,
         `Fuse bet: ${betAmount} Z (cut at ${cashoutMultiplier}x)`]
      );

      if (isWin) {
        await connection.execute(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
           VALUES (?, 'game_win', ?, ?, ?, 'game_bet', ?, ?)`,
          [userId, winAmount, balanceAfterBet, finalBalance, betResult.insertId,
           `Fuse win: ${winAmount} Z (${cashoutMultiplier}x)`]
        );
      }

      await connection.commit();

      const responseData = {
        betId: betResult.insertId,
        result: resultLabel,
        isWin,
        betAmount,
        winAmount,
        multiplier: cashoutMultiplier,
        boomPoint,
        newBalance: finalBalance
      };

      if (this.io) {
        this.io.to(`user:${userId}`).emit('balance:update', { balance: finalBalance });
      }

      return responseData;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getHistory(userId, gameType, page = 1, limit = 20) {
    page = Number(page) || 1;
    limit = Number(limit) || 20;
    const offset = (page - 1) * limit;
    let where = 'WHERE user_id = ?';
    const params = [userId];

    if (gameType) {
      where += ' AND game_type = ?';
      params.push(gameType);
    }

    const [rows] = await db.pool.query(
      `SELECT * FROM game_bets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countResult] = await db.pool.query(
      `SELECT COUNT(*) as total FROM game_bets ${where}`,
      params
    );

    return {
      bets: rows,
      total: countResult[0].total,
      page,
      totalPages: Math.ceil(countResult[0].total / limit)
    };
  }

  async getStats(userId) {
    const [rows] = await db.pool.query(
      `SELECT
        game_type,
        COUNT(*) as total_bets,
        SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END) as wins,
        SUM(bet_amount) as total_wagered,
        SUM(win_amount) as total_won
       FROM game_bets
       WHERE user_id = ?
       GROUP BY game_type`,
      [userId]
    );
    return rows;
  }
}

module.exports = GameService;
