const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// Generate or get referral code
router.post('/generate-code', async (req, res) => {
  try {
    const referralService = req.app.get('referralService');
    const code = await referralService.generateReferralCode(req.user.id);
    res.json({ success: true, data: { referralCode: code } });
  } catch (error) {
    console.error('Generate referral code error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate referral code' });
  }
});

// Get referral stats
router.get('/stats', async (req, res) => {
  try {
    const referralService = req.app.get('referralService');
    const stats = await referralService.getReferralStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get referral stats' });
  }
});

// Get list of referred users
router.get('/list', async (req, res) => {
  try {
    const referralService = req.app.get('referralService');
    const referrals = await referralService.getReferrals(req.user.id);
    res.json({ success: true, data: referrals });
  } catch (error) {
    console.error('Get referral list error:', error);
    res.status(500).json({ success: false, message: 'Failed to get referral list' });
  }
});

module.exports = router;
