const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/bonuses/status
// Returns claim status for daily/weekly/monthly + first-deposit info.
router.get('/status', async (req, res) => {
  try {
    const bonusService = req.app.get('bonusService');
    if (!bonusService) {
      return res.status(503).json({ success: false, message: 'Bonus service unavailable' });
    }
    const data = await bonusService.getStatus(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Bonus status error:', error);
    res.status(500).json({ success: false, message: 'Failed to load bonus status' });
  }
});

// POST /api/bonuses/claim   { type: 'daily' | 'weekly' | 'monthly' }
// First-deposit bonus is credited automatically from the wallet flow,
// so it is not claimable here.
router.post('/claim', async (req, res) => {
  try {
    const { type } = req.body || {};
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid bonus type' });
    }
    const bonusService = req.app.get('bonusService');
    if (!bonusService) {
      return res.status(503).json({ success: false, message: 'Bonus service unavailable' });
    }
    const result = await bonusService.claim(req.user.id, type);
    res.json({ success: true, message: 'Bonus claimed', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Failed to claim bonus' });
  }
});

module.exports = router;
