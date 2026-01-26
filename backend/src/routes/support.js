const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ================== USER ENDPOINTS ==================

// Get user's conversation
router.get('/conversation', authenticateToken, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    const conversation = await supportService.getOrCreateConversation(req.user.id);

    // Get messages
    const messagesData = await supportService.getMessages(conversation.id);

    res.json({
      success: true,
      data: {
        conversation,
        messages: messagesData.messages,
        total: messagesData.total
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to get conversation' });
  }
});

// User sends a message
router.post('/message', authenticateToken, [
  body('message').trim().notEmpty().isLength({ max: 2000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const supportService = req.app.get('supportService');
    const result = await supportService.sendUserMessage(req.user.id, req.body.message);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Mark messages as read
router.post('/read', authenticateToken, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    await supportService.markAsReadByUser(req.user.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

// Get unread count
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    const count = await supportService.getUnreadCountForUser(req.user.id);

    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get unread error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

// ================== ADMIN ENDPOINTS ==================

// Get all conversations
router.get('/admin/conversations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await supportService.getAllConversations(status, limit, offset);

    res.json({
      success: true,
      data: result.conversations,
      total: result.total,
      hasMore: result.hasMore
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to get conversations' });
  }
});

// Get conversation messages
router.get('/admin/conversations/:id/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    const conversationId = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const conversation = await supportService.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const result = await supportService.getMessages(conversationId, limit, offset);

    res.json({
      success: true,
      data: {
        conversation,
        messages: result.messages,
        total: result.total,
        hasMore: result.hasMore
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get messages' });
  }
});

// Admin sends a message
router.post('/admin/conversations/:id/message', authenticateToken, requireAdmin, [
  body('message').trim().notEmpty().isLength({ max: 2000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const supportService = req.app.get('supportService');
    const conversationId = parseInt(req.params.id);

    const result = await supportService.sendAdminMessage(req.user.id, conversationId, req.body.message);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Send admin message error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send message' });
  }
});

// Admin marks messages as read
router.post('/admin/conversations/:id/read', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    const conversationId = parseInt(req.params.id);

    await supportService.markAsReadByAdmin(conversationId);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

// Update conversation status
router.put('/admin/conversations/:id/status', authenticateToken, requireAdmin, [
  body('status').isIn(['open', 'resolved', 'closed'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const supportService = req.app.get('supportService');
    const conversationId = parseInt(req.params.id);

    const result = await supportService.updateStatus(conversationId, req.body.status);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Get total unread count for admin
router.get('/admin/unread', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supportService = req.app.get('supportService');
    const count = await supportService.getUnreadCountForAdmin();

    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get admin unread error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

module.exports = router;
