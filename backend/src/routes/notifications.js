const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin, requireModule } = require('../middleware/auth');
const requireNotifications = requireModule('notifications');

// === Admin routes first (before :id params) ===

// Admin: get all notifications
router.get('/admin/all', authenticateToken, requireAdmin, requireNotifications, async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const notificationService = req.app.get('notificationService');
    const data = await notificationService.adminGetAll(parseInt(page), parseInt(limit));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Admin get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
});

// Admin: create notification
router.post('/admin/create', authenticateToken, requireAdmin, requireNotifications, async (req, res) => {
  try {
    const { userId, type, title, message } = req.body;
    if (!type || !title || !message) {
      return res.status(400).json({ success: false, message: 'Type, title, and message are required' });
    }
    if (type === 'personal' && !userId) {
      return res.status(400).json({ success: false, message: 'User ID is required for personal notifications' });
    }

    const notificationService = req.app.get('notificationService');
    const notification = await notificationService.adminCreate({
      userId: type === 'personal' ? userId : null,
      type,
      title,
      message,
      adminId: req.user.id,
    });
    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to create notification' });
  }
});

// === User routes ===

// Get user's notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const notificationService = req.app.get('notificationService');
    const data = await notificationService.getForUser(req.user.id, parseInt(page), parseInt(limit));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const notificationService = req.app.get('notificationService');
    const unread = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { unread } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

// Mark all as read
router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    const notificationService = req.app.get('notificationService');
    await notificationService.markAllRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

// Mark one as read
router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notificationService = req.app.get('notificationService');
    await notificationService.markRead(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

module.exports = router;
