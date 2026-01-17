const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get current draw status
router.get('/draw', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    const draw = await cronService.getCurrentDraw();
    res.json({ success: true, data: draw });
  } catch (error) {
    console.error('Get draw error:', error);
    res.status(500).json({ success: false, message: 'Failed to get draw' });
  }
});

// Get trending numbers
router.get('/numbers', async (req, res) => {
  try {
    const lotteryService = req.app.get('lotteryService');
    const limit = parseInt(req.query.limit) || 50;
    const numbers = await lotteryService.getTrendingNumbers(limit);

    res.json({
      success: true,
      data: numbers.map(n => ({
        id: n.id,
        number: n.number,
        owner: n.owner_name,
        ownerId: n.owner_id,
        price: parseFloat(n.price),
        votes: n.total_votes,
        trend: parseFloat(n.vote_trend),
        timesWon: n.times_won
      }))
    });
  } catch (error) {
    console.error('Get numbers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get numbers' });
  }
});

// Get number details
router.get('/numbers/:number', async (req, res) => {
  try {
    const lotteryService = req.app.get('lotteryService');
    const number = await lotteryService.getNumberDetails(req.params.number);

    if (!number) {
      return res.json({
        success: true,
        data: {
          number: req.params.number,
          owner: null,
          price: 10,
          votes: 0,
          trend: 0,
          voteHistory: []
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: number.id,
        number: number.number,
        owner: number.owner_name,
        ownerId: number.owner_id,
        price: parseFloat(number.price),
        votes: number.total_votes,
        trend: parseFloat(number.vote_trend),
        timesWon: number.times_won,
        lastWon: number.last_won_date,
        voteHistory: number.voteHistory
      }
    });
  } catch (error) {
    console.error('Get number error:', error);
    res.status(500).json({ success: false, message: 'Failed to get number' });
  }
});

// Buy a number
router.post('/numbers/:number/buy', authenticateToken, async (req, res) => {
  try {
    const lotteryService = req.app.get('lotteryService');
    const numberStr = req.params.number.padStart(7, '0');

    // Get base price from settings
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'number_base_price'"
    );
    const price = parseFloat(settings[0]?.setting_value || 10);

    const result = await lotteryService.buyNumber(req.user.id, numberStr, price);

    res.json({
      success: true,
      message: 'Number purchased successfully',
      data: result
    });
  } catch (error) {
    console.error('Buy number error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Vote for a number
router.post('/numbers/:number/vote', authenticateToken, async (req, res) => {
  try {
    const lotteryService = req.app.get('lotteryService');
    const numberStr = req.params.number.padStart(7, '0');

    // Get vote cost from settings
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'vote_cost'"
    );
    const voteCost = parseFloat(settings[0]?.setting_value || 1);

    const result = await lotteryService.voteForNumber(req.user.id, numberStr, voteCost);

    res.json({
      success: true,
      message: 'Vote recorded',
      data: result
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get offers for a specific number
router.get('/numbers/:number/offers', async (req, res) => {
  try {
    const numberStr = req.params.number.padStart(7, '0');

    const [offers] = await db.pool.query(
      `SELECT o.id, o.offer_amount as amount, o.status, o.created_at, o.expires_at,
              u.username as from_username, u.id as from_user_id
       FROM offers o
       JOIN numbers n ON o.number_id = n.id
       JOIN users u ON o.from_user_id = u.id
       WHERE n.number = ? AND o.status = 'pending' AND o.expires_at > NOW()
       ORDER BY o.offer_amount DESC`,
      [numberStr]
    );

    res.json({ success: true, data: offers });
  } catch (error) {
    console.error('Get number offers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get offers' });
  }
});

// Create offer for a number
router.post('/numbers/:number/offer', authenticateToken, [
  body('amount').isFloat({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const lotteryService = req.app.get('lotteryService');
    const numberStr = req.params.number.padStart(7, '0');
    const { amount } = req.body;

    const result = await lotteryService.createOffer(req.user.id, numberStr, amount);

    res.json({
      success: true,
      message: 'Offer created',
      data: result
    });
  } catch (error) {
    console.error('Create offer error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get user's pending offers (received)
router.get('/offers', authenticateToken, async (req, res) => {
  try {
    const [offers] = await db.pool.query(
      `SELECT o.*, n.number, u.username as from_username
       FROM offers o
       JOIN numbers n ON o.number_id = n.id
       JOIN users u ON o.from_user_id = u.id
       WHERE o.to_user_id = ? AND o.status = 'pending'
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: offers });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get offers' });
  }
});

// Respond to offer
router.post('/offers/:id/respond', authenticateToken, [
  body('accept').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const lotteryService = req.app.get('lotteryService');
    const result = await lotteryService.respondToOffer(req.user.id, req.params.id, req.body.accept);

    res.json({
      success: true,
      message: req.body.accept ? 'Offer accepted' : 'Offer rejected',
      data: result
    });
  } catch (error) {
    console.error('Respond offer error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get user's numbers
router.get('/my-numbers', authenticateToken, async (req, res) => {
  try {
    const lotteryService = req.app.get('lotteryService');
    const numbers = await lotteryService.getUserNumbers(req.user.id);

    res.json({
      success: true,
      data: numbers.map(n => ({
        id: n.id,
        number: n.number,
        price: parseFloat(n.price),
        votes: n.total_votes,
        trend: parseFloat(n.vote_trend)
      }))
    });
  } catch (error) {
    console.error('Get my numbers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get numbers' });
  }
});

// Get prize pool stats (public)
router.get('/prize-pool', async (req, res) => {
  try {
    // Get current active draw pool
    const [currentDraw] = await db.pool.query(
      `SELECT total_pool FROM daily_draws
       WHERE status IN ('pending', 'revealing', 'active')
       ORDER BY created_at DESC LIMIT 1`
    );

    // Get participant count (unique voters in current draw)
    const [participantCount] = await db.pool.query(
      `SELECT COUNT(DISTINCT v.user_id) as count
       FROM votes v
       JOIN daily_draws d ON v.draw_id = d.id
       WHERE d.status IN ('pending', 'revealing', 'active')`
    );

    // Get total numbers with votes
    const [numbersWithVotes] = await db.pool.query(
      `SELECT COUNT(*) as count FROM numbers WHERE total_votes > 0`
    );

    res.json({
      success: true,
      data: {
        totalPool: parseFloat(currentDraw[0]?.total_pool || 0),
        participants: participantCount[0]?.count || 0,
        activeNumbers: numbersWithVotes[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Get prize pool error:', error);
    res.status(500).json({ success: false, message: 'Failed to get prize pool' });
  }
});

// Get recent winners (public)
router.get('/winners', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const [winners] = await db.pool.query(
      `SELECT w.id, w.period_id, w.matching_digits, w.prize_amount, w.created_at,
              u.username, n.number,
              d.winning_number
       FROM winners w
       JOIN users u ON w.user_id = u.id
       JOIN numbers n ON w.number_id = n.id
       JOIN daily_draws d ON w.draw_id = d.id
       ORDER BY w.created_at DESC
       LIMIT ${limit}`
    );

    const formattedWinners = winners.map(w => ({
      id: w.id,
      username: w.username,
      number: w.number,
      matchedDigits: w.matching_digits,
      prize: parseFloat(w.prize_amount),
      isJackpot: w.matching_digits === 7,
      periodId: w.period_id,
      createdAt: w.created_at
    }));

    res.json({ success: true, data: formattedWinners });
  } catch (error) {
    console.error('Get winners error:', error);
    res.status(500).json({ success: false, message: 'Failed to get winners' });
  }
});

// Get draw history
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const [draws] = await db.pool.query(
      `SELECT id, period_id, draw_date, winning_number, total_pool, status, completed_at
       FROM daily_draws
       WHERE status = 'completed'
       ORDER BY created_at DESC
       LIMIT ${limit}`
    );

    res.json({ success: true, data: draws });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ success: false, message: 'Failed to get history' });
  }
});

module.exports = router;
