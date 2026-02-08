const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /tiers — public, list active tiers
router.get('/tiers', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const tiers = await investService.getTiers();
    res.json({ success: true, data: tiers });
  } catch (error) {
    console.error('Get tiers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get tiers' });
  }
});

// GET /platform-growth — public, growth history for chart
router.get('/platform-growth', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const days = parseInt(req.query.days) || 30;
    const history = await investService.getPlatformGrowthHistory(days);
    const latest = await investService.getPlatformMetrics();
    res.json({ success: true, data: { history, latest } });
  } catch (error) {
    console.error('Get platform growth error:', error);
    res.status(500).json({ success: false, message: 'Failed to get platform growth' });
  }
});

// All routes below require authentication
router.use(authenticateToken);

// POST / — create investment
router.post('/', async (req, res) => {
  try {
    const { amount, tierId } = req.body;

    if (!amount || !tierId) {
      return res.status(400).json({ success: false, message: 'Amount and tierId are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const investService = req.app.get('investService');
    const result = await investService.invest(req.user.id, numAmount, tierId);

    res.json({
      success: true,
      message: `Successfully invested ${numAmount} Z in ${result.tier} tier`,
      data: result
    });
  } catch (error) {
    console.error('Create investment error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /:id/withdraw — withdraw investment
router.post('/:id/withdraw', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const result = await investService.withdrawInvestment(req.user.id, parseInt(req.params.id));

    res.json({
      success: true,
      message: result.earlyWithdrawal
        ? `Withdrawn ${result.withdrawAmount} Z (early withdrawal penalty applied)`
        : `Withdrawn ${result.withdrawAmount} Z`,
      data: result
    });
  } catch (error) {
    console.error('Withdraw investment error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /portfolio — user portfolio
router.get('/portfolio', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const portfolio = await investService.getPortfolio(req.user.id);
    res.json({ success: true, data: portfolio });
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ success: false, message: 'Failed to get portfolio' });
  }
});

// GET /stats — user investment summary
router.get('/stats', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const stats = await investService.getInvestmentStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get investment stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get investment stats' });
  }
});

// GET /returns — paginated return history
router.get('/returns', async (req, res) => {
  try {
    const investService = req.app.get('investService');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await investService.getReturnHistory(req.user.id, page, limit);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get returns error:', error);
    res.status(500).json({ success: false, message: 'Failed to get returns' });
  }
});

module.exports = router;
