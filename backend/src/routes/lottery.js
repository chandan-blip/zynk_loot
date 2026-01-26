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

// Get next upcoming session (when no active draw)
router.get('/upcoming-session', async (req, res) => {
  try {
    const cronService = req.app.get('cronService');

    // First check if there's an active draw
    const currentDraw = await cronService.getCurrentDraw();

    if (currentDraw && currentDraw.id && currentDraw.status !== 'completed' && currentDraw.status !== 'none') {
      // There's an active draw, return it
      return res.json({
        success: true,
        data: {
          hasActiveDraw: true,
          draw: currentDraw
        }
      });
    }

    // No active draw, get upcoming session from job_schedule
    const upcomingSession = await cronService.getNextUpcomingSession();

    if (!upcomingSession) {
      return res.json({
        success: true,
        data: {
          hasActiveDraw: false,
          upcomingSession: null,
          message: 'No upcoming sessions scheduled'
        }
      });
    }

    res.json({
      success: true,
      data: {
        hasActiveDraw: false,
        upcomingSession: {
          sessionNumber: upcomingSession.sessionNumber,
          sessionName: upcomingSession.sessionName,
          startsAt: upcomingSession.nextRunAt,
          timeUntilStart: upcomingSession.timeUntilStart,
          status: upcomingSession.status
        },
        message: `Next draw: Session ${upcomingSession.sessionNumber} (${upcomingSession.sessionName})`
      }
    });
  } catch (error) {
    console.error('Get upcoming session error:', error);
    res.status(500).json({ success: false, message: 'Failed to get upcoming session' });
  }
});

// Get numbers with pagination, search, and virtual number generation
router.get('/numbers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    // Get base price from settings
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'number_base_price'"
    );
    const basePrice = parseFloat(settings[0]?.setting_value || 10);

    // Get current draw info to know revealed digits
    const [currentDraw] = await db.pool.query(
      `SELECT winning_number, revealed_digits, status
       FROM daily_draws
       WHERE status IN ('pending', 'revealing', 'active')
       ORDER BY created_at DESC LIMIT 1`
    );

    const draw = currentDraw[0] || null;
    const revealedDigits = draw?.revealed_digits || 0;
    const winningNumber = draw?.winning_number || '';
    const revealedPrefix = winningNumber.substring(0, revealedDigits);

    // Calculate current price based on revealed digits
    // Price multiplier: (revealedDigits + 1)x
    // 0 digits = 1x (10Z), 1 digit = 2x (20Z), 2 digits = 3x (30Z), etc.
    const priceMultiplier = revealedDigits + 1;
    const currentPrice = basePrice * priceMultiplier;

    // Helper to check if a number matches revealed digits
    const matchesRevealed = (num) => {
      if (revealedDigits === 0) return true; // No digits revealed yet, all numbers valid
      return num.substring(0, revealedDigits) === revealedPrefix;
    };

    // Helper to determine virtual number status based on revealed digits
    const getVirtualStatus = (num) => {
      if (revealedDigits === 0) return null; // Draw not started
      if (matchesRevealed(num)) return 'available'; // Still in the running
      return 'would_lose'; // Doesn't match revealed prefix
    };

    // If searching for a specific number
    if (search && search.length > 0) {
      // Check if number exists in database
      const [existingNumbers] = await db.pool.query(
        `SELECT n.*, u.username as owner_name
         FROM numbers n
         LEFT JOIN users u ON n.owner_id = u.id
         WHERE n.number LIKE ?
         ORDER BY n.total_votes DESC
         LIMIT ?`,
        [`%${search}%`, limit]
      );

      const results = existingNumbers.map(n => ({
        id: n.id,
        number: n.number,
        owner: n.owner_name,
        ownerId: n.owner_id,
        price: parseFloat(n.price),
        votes: n.total_votes || 0,
        trend: parseFloat(n.vote_trend) || 0,
        timesWon: n.times_won || 0,
        isVirtual: false,
        ticketStatus: n.ticket_status || 'active',
        matchesRevealed: matchesRevealed(n.number)
      }));

      // Add virtual number for search if not in DB
      if (search.length >= 1 && search.length <= 7) {
        const exactNumber = search.padStart(7, '0');
        const exists = results.some(r => r.number === exactNumber);
        if (!exists) {
          const virtualStatus = getVirtualStatus(exactNumber);
          const matchesRevealedDigits = matchesRevealed(exactNumber);
          results.unshift({
            id: null,
            number: exactNumber,
            owner: null,
            ownerId: null,
            // Price depends on revealed digits - higher as more digits revealed
            price: matchesRevealedDigits ? currentPrice : basePrice,
            votes: 0,
            trend: 0,
            timesWon: 0,
            isVirtual: true,
            ticketStatus: virtualStatus,
            matchesRevealed: matchesRevealedDigits
          });
        }
      }

      return res.json({
        success: true,
        data: results,
        hasMore: false,
        total: results.length,
        revealedDigits,
        revealedPrefix,
        basePrice,
        currentPrice,
        priceMultiplier
      });
    }

    // Get existing numbers from DB with pagination
    const [numbers] = await db.pool.query(
      `SELECT n.*, u.username as owner_name
       FROM numbers n
       LEFT JOIN users u ON n.owner_id = u.id
       ORDER BY n.total_votes DESC, n.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Get total count for pagination
    const [countResult] = await db.pool.query('SELECT COUNT(*) as total FROM numbers');
    const totalInDb = countResult[0].total;

    // Map existing numbers
    // Numbers without owner use dynamic price based on revealed digits
    const existingNumbers = numbers.map(n => ({
      id: n.id,
      number: n.number,
      owner: n.owner_name,
      ownerId: n.owner_id,
      price: n.owner_id ? parseFloat(n.price) : (matchesRevealed(n.number) ? currentPrice : basePrice),
      votes: n.total_votes || 0,
      trend: parseFloat(n.vote_trend) || 0,
      timesWon: n.times_won || 0,
      isVirtual: false,
      ticketStatus: n.ticket_status || 'active',
      matchesRevealed: matchesRevealed(n.number)
    }));

    // Generate virtual numbers that match revealed prefix
    const virtualNumbers = [];
    if (existingNumbers.length < limit) {
      const neededVirtual = limit - existingNumbers.length;
      const existingSet = new Set(numbers.map(n => n.number));

      // Generate virtual numbers that match the revealed prefix
      const generateValidVirtualNumber = (seed) => {
        // If digits are revealed, generate numbers starting with that prefix
        if (revealedDigits > 0 && revealedPrefix) {
          const remainingDigits = 7 - revealedDigits;
          // Generate random remaining digits
          const suffix = String(Math.floor(Math.random() * Math.pow(10, remainingDigits))).padStart(remainingDigits, '0');
          return revealedPrefix + suffix;
        }

        // No digits revealed - generate interesting patterns
        const patterns = [
          () => String(Math.floor(Math.random() * 10)).repeat(7),
          () => '1234567',
          () => '7654321',
          () => String(Math.floor(1000000 + Math.random() * 9000000)),
          () => {
            const d = Math.floor(Math.random() * 10);
            return `${d}${d}${d}${d}${d}${d}${d}`;
          },
          () => {
            const start = Math.floor(Math.random() * 4);
            return Array.from({ length: 7 }, (_, i) => (start + i) % 10).join('');
          },
          () => {
            const half = String(Math.floor(1000 + Math.random() * 9000));
            return half + half.slice(0, 3).split('').reverse().join('');
          }
        ];
        return patterns[seed % patterns.length]().padStart(7, '0').slice(0, 7);
      };

      let attempts = 0;
      const maxAttempts = neededVirtual * 10;
      while (virtualNumbers.length < neededVirtual && attempts < maxAttempts) {
        attempts++;
        const virtualNum = generateValidVirtualNumber(offset + attempts + Date.now() % 1000);

        if (!existingSet.has(virtualNum) &&
            !virtualNumbers.some(v => v.number === virtualNum) &&
            matchesRevealed(virtualNum)) {
          virtualNumbers.push({
            id: null,
            number: virtualNum,
            owner: null,
            ownerId: null,
            // Price increases with revealed digits
            price: currentPrice,
            votes: 0,
            trend: 0,
            timesWon: 0,
            isVirtual: true,
            ticketStatus: 'available',
            matchesRevealed: true
          });
        }
      }
    }

    const allNumbers = [...existingNumbers, ...virtualNumbers];

    res.json({
      success: true,
      data: allNumbers,
      hasMore: offset + limit < totalInDb + 1000,
      total: totalInDb,
      revealedDigits,
      revealedPrefix,
      basePrice,
      currentPrice,
      priceMultiplier
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
    const numberStr = req.params.number.padStart(7, '0');
    const number = await lotteryService.getNumberDetails(numberStr);

    // Get current draw info for pricing
    const [settings] = await db.pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'number_base_price'"
    );
    const basePrice = parseFloat(settings[0]?.setting_value || 10);

    const [currentDraw] = await db.pool.query(
      `SELECT winning_number, revealed_digits, status
       FROM daily_draws
       WHERE status IN ('pending', 'revealing', 'active')
       ORDER BY created_at DESC LIMIT 1`
    );

    const draw = currentDraw[0] || null;
    const revealedDigits = draw?.revealed_digits || 0;
    const winningNumber = draw?.winning_number || '';
    const revealedPrefix = winningNumber.substring(0, revealedDigits);
    const priceMultiplier = revealedDigits + 1;
    const currentPrice = basePrice * priceMultiplier;

    // Check if number matches revealed digits
    const matchesRevealed = revealedDigits === 0 || numberStr.startsWith(revealedPrefix);

    if (!number) {
      return res.json({
        success: true,
        data: {
          number: numberStr,
          owner: null,
          price: matchesRevealed ? currentPrice : basePrice,
          basePrice,
          priceMultiplier: matchesRevealed ? priceMultiplier : 1,
          votes: 0,
          trend: 0,
          voteHistory: [],
          priceHistory: [],
          votesByHour: Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, votes: 0 })),
          activities: [],
          ownershipHistory: [],
          similarNumbers: [],
          uniqueVoters: 0,
          totalTransactions: 0,
          avgDailyVotes: 0,
          peakVotes: 0,
          rank: 0,
          totalPoolVotes: 150000,
          createdAt: 'Not created',
          isVirtual: true,
          matchesRevealed,
          ticketStatus: matchesRevealed ? 'available' : 'would_lose'
        }
      });
    }

    // Calculate canCashOut
    const matchedDigits = number.matched_digits || 0;
    const ticketStatus = number.ticket_status || 'active';
    const canCashOut = matchedDigits > 0 && !['cashed_out', 'sold', 'lost', 'won'].includes(ticketStatus);

    res.json({
      success: true,
      data: {
        id: number.id,
        number: number.number,
        owner: number.owner_name,
        ownerId: number.owner_id,
        price: parseFloat(number.price),
        votes: number.total_votes,
        trend: parseFloat(number.vote_trend) || 0,
        timesWon: number.times_won || 0,
        lastWon: number.last_won_date || 'Never',
        // Analytics data
        voteHistory: number.voteHistory || [],
        priceHistory: number.priceHistory || [],
        votesByHour: number.votesByHour || [],
        activities: number.activities || [],
        ownershipHistory: number.ownershipHistory || [],
        similarNumbers: number.similarNumbers || [],
        // Stats
        uniqueVoters: number.uniqueVoters || 0,
        totalTransactions: number.totalTransactions || 0,
        avgDailyVotes: number.avgDailyVotes || 0,
        peakVotes: number.peakVotes || 0,
        rank: number.rank || 1,
        totalPoolVotes: number.totalPoolVotes || 150000,
        createdAt: number.createdAt || 'Unknown',
        // Ticket matching fields
        drawId: number.draw_id,
        matchedDigits: matchedDigits,
        currentReturn: parseFloat(number.current_return) || 0,
        ticketStatus: ticketStatus,
        buyAmount: parseFloat(number.buy_amount || number.price),
        canCashOut: canCashOut
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
    const basePrice = parseFloat(settings[0]?.setting_value || 10);

    // Get current draw to check revealed digits
    const [currentDraw] = await db.pool.query(
      `SELECT winning_number, revealed_digits, status
       FROM daily_draws
       WHERE status IN ('pending', 'revealing', 'active')
       ORDER BY created_at DESC LIMIT 1`
    );

    const draw = currentDraw[0] || null;
    const revealedDigits = draw?.revealed_digits || 0;
    const winningNumber = draw?.winning_number || '';
    const revealedPrefix = winningNumber.substring(0, revealedDigits);

    // Check if number matches revealed digits
    if (revealedDigits > 0 && !numberStr.startsWith(revealedPrefix)) {
      return res.status(400).json({
        success: false,
        message: `This number doesn't match the revealed digits (${revealedPrefix}...). It would lose this draw.`
      });
    }

    // Calculate price based on revealed digits
    // Price multiplier: (revealedDigits + 1)x
    const priceMultiplier = revealedDigits + 1;
    const price = basePrice * priceMultiplier;

    const result = await lotteryService.buyNumber(req.user.id, numberStr, price);

    res.json({
      success: true,
      message: `Number purchased for ${price} Z (${priceMultiplier}x multiplier)`,
      data: { ...result, price, priceMultiplier }
    });
  } catch (error) {
    console.error('Buy number error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Vote/Unvote for a number
router.post('/numbers/:number/vote', authenticateToken, async (req, res) => {
  try {
    const lotteryService = req.app.get('lotteryService');
    const numberStr = req.params.number.padStart(7, '0');
    const action = req.body.action || 'vote'; // 'vote' or 'unvote'

    const result = await lotteryService.voteForNumber(req.user.id, numberStr, action);

    res.json({
      success: true,
      message: action === 'unvote' ? 'Vote removed' : 'Vote recorded',
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

// Get user's numbers/tickets with matching info
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
        buyAmount: parseFloat(n.buy_amount || n.price),
        votes: n.total_votes,
        trend: parseFloat(n.vote_trend || 0),
        // Ticket matching fields (arc.md #14)
        matchedDigits: n.matched_digits || 0,
        multiplier: n.multiplier || 0,
        currentReturn: parseFloat(n.current_return || 0),
        status: n.ticket_status || 'active',
        canCashOut: n.canCashOut || false,
        // Session info
        sessionNumber: n.session_number || null,
        periodId: n.period_id || null,
        purchasedAt: n.created_at || null,
        // Next reveal info
        nextRevealAt: null // Calculated by cronService, frontend should use draw info
      }))
    });
  } catch (error) {
    console.error('Get my numbers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get numbers' });
  }
});

// Get user's vote history
router.get('/my-votes', authenticateToken, async (req, res) => {
  try {
    const db = require('../config/database');
    const [votes] = await db.pool.query(
      `SELECT v.id, v.vote_count, v.created_at,
              n.number, n.total_votes,
              d.period_id, d.winning_number, d.status as draw_status, d.session_number,
              CASE
                WHEN d.status = 'completed' AND n.number = d.winning_number THEN 'won'
                WHEN d.status = 'completed' THEN 'lost'
                ELSE 'pending'
              END as vote_status,
              CASE
                WHEN d.status = 'completed' AND n.number = d.winning_number THEN 10
                ELSE 0
              END as reward
       FROM votes v
       JOIN numbers n ON v.number_id = n.id
       LEFT JOIN daily_draws d ON v.draw_id = d.id
       WHERE v.user_id = ?
       ORDER BY v.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: votes.map(v => ({
        id: v.id,
        number: v.number,
        totalVotes: v.total_votes,
        voteCount: v.vote_count,
        votedAt: v.created_at,
        periodId: v.period_id,
        sessionNumber: v.session_number,
        drawStatus: v.draw_status,
        voteStatus: v.vote_status,
        winningNumber: v.draw_status === 'completed' ? v.winning_number : null,
        reward: v.reward
      }))
    });
  } catch (error) {
    console.error('Get my votes error:', error);
    res.status(500).json({ success: false, message: 'Failed to get votes' });
  }
});

// Cash out a ticket
router.post('/tickets/:id/cashout', authenticateToken, async (req, res) => {
  try {
    const ticketService = req.app.get('ticketService');
    if (!ticketService) {
      return res.status(500).json({ success: false, message: 'Ticket service not available' });
    }

    const result = await ticketService.cashOut(req.user.id, req.params.id);

    res.json({
      success: true,
      message: `Cashed out with ${result.multiplier}x multiplier`,
      data: result
    });
  } catch (error) {
    console.error('Cash out error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get ticket details
router.get('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticketService = req.app.get('ticketService');
    if (!ticketService) {
      return res.status(500).json({ success: false, message: 'Ticket service not available' });
    }

    const ticket = await ticketService.getTicketDetails(req.params.id, req.user.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to get ticket' });
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
      `SELECT COUNT(DISTINCT v.owner_id) as count
       FROM numbers v
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
