const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Optional auth — extracts user if token present, but allows anonymous
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  req.user = null;

  if (token) {
    try {
      const JWT_SECRET = process.env.JWT_SECRET || require('../middleware/auth').JWT_SECRET;
      const decoded = jwt.verify(token, JWT_SECRET);
      const [users] = await db.pool.query(
        'SELECT id, username, is_admin FROM users WHERE id = ? AND is_active = TRUE',
        [decoded.userId]
      );
      if (users.length > 0) req.user = users[0];
    } catch (e) {
      // Invalid token — continue as anonymous
    }
  }
  next();
};

// Skip tracking for admin users
const skipAdmin = (req) => req.user?.is_admin;

// Start session
router.post('/session/start', optionalAuth, async (req, res) => {
  try {
    if (skipAdmin(req)) return res.json({ success: true });

    const trackingService = req.app.get('trackingService');
    const { sessionId, deviceType, browser, os, screenResolution } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }

    await trackingService.startSession({
      sessionId,
      userId: req.user?.id || null,
      deviceType,
      browser,
      os,
      screenResolution,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ success: false, message: 'Failed to start session' });
  }
});

// End session
router.post('/session/end', optionalAuth, async (req, res) => {
  try {
    if (skipAdmin(req)) return res.json({ success: true });
    const trackingService = req.app.get('trackingService');
    const { sessionId, duration } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }

    await trackingService.endSession(sessionId, duration || 0);
    res.json({ success: true });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ success: false, message: 'Failed to end session' });
  }
});

// Batch event ingestion
router.post('/events', optionalAuth, async (req, res) => {
  try {
    if (skipAdmin(req)) return res.json({ success: true, recorded: 0 });
    const trackingService = req.app.get('trackingService');
    const { events, sessionId } = req.body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ success: false, message: 'events array required' });
    }

    // Cap at 100 events per batch
    const batch = events.slice(0, 100);
    await trackingService.recordEvents(batch, req.user?.id || null, sessionId);

    res.json({ success: true, recorded: batch.length });
  } catch (error) {
    console.error('Record events error:', error);
    res.status(500).json({ success: false, message: 'Failed to record events' });
  }
});

module.exports = router;
