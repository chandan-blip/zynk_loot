const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// All game routes require auth
router.use(authenticateToken);

// Fire-and-forget tracking for game plays
router.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success && body?.data?.game_type && !req.user?.is_admin) {
      const ts = req.app.get('trackingService');
      ts?.recordServerEvent(req.user?.id, null, 'game_play', {
        game_type: body.data.game_type,
        bet_amount: body.data.bet_amount,
        win_amount: body.data.win_amount,
        is_win: body.data.is_win,
      }).catch(() => {});
    }
    return originalJson(body);
  };
  next();
});

// Play coin flip
router.post('/coin-flip', async (req, res) => {
  try {
    const { amount, prediction } = req.body;

    if (!amount || !prediction) {
      return res.status(400).json({ success: false, message: 'Amount and prediction are required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    if (!['heads', 'tails'].includes(prediction)) {
      return res.status(400).json({ success: false, message: 'Prediction must be heads or tails' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playCoinFlip(req.user.id, betAmount, prediction);

    res.json({
      success: true,
      message: result.isWin ? `You won ${result.winAmount} Z!` : 'Better luck next time!',
      data: result
    });
  } catch (error) {
    console.error('Coin flip error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play dice roll
router.post('/dice-roll', async (req, res) => {
  try {
    const { amount, prediction } = req.body;

    if (!amount || prediction === undefined || prediction === null) {
      return res.status(400).json({ success: false, message: 'Amount and prediction are required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    const pred = parseInt(prediction);
    if (isNaN(pred) || pred < 1 || pred > 6) {
      return res.status(400).json({ success: false, message: 'Prediction must be 1-6' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playDiceRoll(req.user.id, betAmount, pred);

    res.json({
      success: true,
      message: result.isWin ? `You won ${result.winAmount} Z!` : 'Better luck next time!',
      data: result
    });
  } catch (error) {
    console.error('Dice roll error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play lucky spin
router.post('/lucky-spin', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playLuckySpin(req.user.id, betAmount);

    res.json({
      success: true,
      message: result.isWin ? `You won ${result.winAmount} Z!` : 'Better luck next time!',
      data: result
    });
  } catch (error) {
    console.error('Lucky spin error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play balloon pop
router.post('/balloon-pop', async (req, res) => {
  try {
    const { amount, cashoutMultiplier } = req.body;

    if (!amount || !cashoutMultiplier) {
      return res.status(400).json({ success: false, message: 'Amount and cashout target are required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    const target = parseFloat(cashoutMultiplier);
    if (isNaN(target) || target < 1.1 || target > 50) {
      return res.status(400).json({ success: false, message: 'Cashout target must be between 1.1x and 50x' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playBalloonPop(req.user.id, betAmount, target);

    res.json({
      success: true,
      message: result.isWin ? `You cashed out ${result.winAmount} Z!` : 'The balloon popped!',
      data: result
    });
  } catch (error) {
    console.error('Balloon pop error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play dragon tower
router.post('/dragon-tower', async (req, res) => {
  try {
    const { amount, targetFloors } = req.body;

    if (!amount || !targetFloors) {
      return res.status(400).json({ success: false, message: 'Amount and target floors are required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    const floors = parseInt(targetFloors);
    if (isNaN(floors) || floors < 1 || floors > 8) {
      return res.status(400).json({ success: false, message: 'Target floors must be 1-8' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playDragonTower(req.user.id, betAmount, floors);

    res.json({
      success: true,
      message: result.isWin ? `You conquered ${floors} floors and won ${result.winAmount} Z!` : 'The dragon got you!',
      data: result
    });
  } catch (error) {
    console.error('Dragon tower error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play ice field
router.post('/ice-field', async (req, res) => {
  try {
    const { amount, difficulty, targetRows } = req.body;

    if (!amount || !difficulty || !targetRows) {
      return res.status(400).json({ success: false, message: 'Amount, difficulty, and target rows are required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    const diff = parseInt(difficulty);
    if (isNaN(diff) || diff < 1 || diff > 3) {
      return res.status(400).json({ success: false, message: 'Difficulty must be 1-3' });
    }

    const rows = parseInt(targetRows);
    if (isNaN(rows) || rows < 1 || rows > 5) {
      return res.status(400).json({ success: false, message: 'Target rows must be 1-5' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playIceField(req.user.id, betAmount, diff, rows);

    res.json({
      success: true,
      message: result.isWin ? `You crossed the ice and won ${result.winAmount} Z!` : 'You fell through the ice!',
      data: result
    });
  } catch (error) {
    console.error('Ice field error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play arrow roulette
router.post('/arrow-roulette', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bet amount' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playArrowRoulette(req.user.id, betAmount);

    res.json({
      success: true,
      message: result.isWin ? `Hit ${result.result}! You won ${result.winAmount} Z!` : 'Missed the target!',
      data: result
    });
  } catch (error) {
    console.error('Arrow roulette error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play egg hatch
router.post('/egg-hatch', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ success: false, message: 'Amount is required' });

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid bet amount' });

    const gameService = req.app.get('gameService');
    const result = await gameService.playEggHatch(req.user.id, betAmount);

    res.json({
      success: true,
      message: result.isWin ? `You hatched ${result.result}! Won ${result.winAmount} Z!` : 'Empty egg!',
      data: result
    });
  } catch (error) {
    console.error('Egg hatch error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play fuse
router.post('/fuse', async (req, res) => {
  try {
    const { amount, cashoutMultiplier } = req.body;
    if (!amount || !cashoutMultiplier) return res.status(400).json({ success: false, message: 'Amount and cut point are required' });

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid bet amount' });

    const target = parseFloat(cashoutMultiplier);
    if (isNaN(target) || target < 1.1 || target > 50) return res.status(400).json({ success: false, message: 'Cut point must be between 1.1x and 50x' });

    const gameService = req.app.get('gameService');
    const result = await gameService.playFuse(req.user.id, betAmount, target);

    res.json({
      success: true,
      message: result.isWin ? `Cut in time! Won ${result.winAmount} Z!` : 'BOOM! The fuse ran out!',
      data: result
    });
  } catch (error) {
    console.error('Fuse error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play mutka king (52-card multi-slip betting)
router.post('/mutka-king', async (req, res) => {
  try {
    const { bets } = req.body;

    if (!Array.isArray(bets) || bets.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one bet is required' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playMutkaKing(req.user.id, bets);

    res.json({
      success: true,
      message: result.isWin ? `You won ${result.totalWin} Z!` : 'No matches this round.',
      data: {
        ...result,
        game_type: 'mutka_king',
        bet_amount: result.totalWager,
        win_amount: result.totalWin,
        is_win: result.isWin,
      },
    });
  } catch (error) {
    console.error('Mutka King error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Play UNO king (54-card UNO multi-slip betting)
router.post('/uno-king', async (req, res) => {
  try {
    const { bets } = req.body;

    if (!Array.isArray(bets) || bets.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one bet is required' });
    }

    const gameService = req.app.get('gameService');
    const result = await gameService.playUnoKing(req.user.id, bets);

    res.json({
      success: true,
      message: result.isWin ? `You won ${result.totalWin} Z!` : 'No matches this round.',
      data: {
        ...result,
        game_type: 'uno_king',
        bet_amount: result.totalWager,
        win_amount: result.totalWin,
        is_win: result.isWin,
      },
    });
  } catch (error) {
    console.error('UNO King error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get game history
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20, game_type } = req.query;
    const gameService = req.app.get('gameService');
    const data = await gameService.getHistory(req.user.id, game_type, parseInt(page), parseInt(limit));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Game history error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get game stats
router.get('/stats', async (req, res) => {
  try {
    const gameService = req.app.get('gameService');
    const data = await gameService.getStats(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Game stats error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
