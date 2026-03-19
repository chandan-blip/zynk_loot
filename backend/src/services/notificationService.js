const db = require('../config/database');

class NotificationService {
  constructor(io) {
    this.io = io;
  }

  // Create a notification and emit in real-time
  async create({ userId, type = 'personal', title, message, createdBy = null }) {
    const [result] = await db.pool.query(
      `INSERT INTO notifications (user_id, type, title, message, created_by) VALUES (?, ?, ?, ?, ?)`,
      [type === 'personal' ? userId : null, type, title, message, createdBy]
    );

    const notification = {
      id: result.insertId,
      user_id: userId || null,
      type,
      title,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    // Emit real-time
    if (this.io) {
      if (type === 'personal' && userId) {
        this.io.to(`user:${userId}`).emit('notification:new', notification);
      } else {
        // Global/update — broadcast to all
        this.io.emit('notification:new', notification);
      }
    }

    return notification;
  }

  // Get notifications for a user (personal + global/update)
  async getForUser(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [rows] = await db.pool.query(
      `SELECT * FROM notifications
       WHERE user_id = ? OR type IN ('global', 'update')
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await db.pool.query(
      `SELECT COUNT(*) as total FROM notifications WHERE user_id = ? OR type IN ('global', 'update')`,
      [userId]
    );

    const [unreadResult] = await db.pool.query(
      `SELECT COUNT(*) as unread FROM notifications
       WHERE (user_id = ? OR type IN ('global', 'update')) AND is_read = FALSE`,
      [userId]
    );

    return {
      notifications: rows,
      total: countResult[0].total,
      unread: unreadResult[0].unread,
      page,
      totalPages: Math.ceil(countResult[0].total / limit),
    };
  }

  // Get unread count
  async getUnreadCount(userId) {
    const [result] = await db.pool.query(
      `SELECT COUNT(*) as unread FROM notifications
       WHERE (user_id = ? OR type IN ('global', 'update')) AND is_read = FALSE`,
      [userId]
    );
    return result[0].unread;
  }

  // Mark one as read
  async markRead(userId, notificationId) {
    await db.pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = ? AND (user_id = ? OR type IN ('global', 'update'))`,
      [notificationId, userId]
    );
  }

  // Mark all as read
  async markAllRead(userId) {
    await db.pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE (user_id = ? OR type IN ('global', 'update')) AND is_read = FALSE`,
      [userId]
    );
  }

  // Admin: create notification
  async adminCreate({ userId, type, title, message, adminId }) {
    return this.create({ userId, type, title, message, createdBy: adminId });
  }

  // Admin: get all notifications
  async adminGetAll(page = 1, limit = 30) {
    const offset = (page - 1) * limit;
    const [rows] = await db.pool.query(
      `SELECT n.*, u.username as target_user
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );
    return rows;
  }
}

module.exports = NotificationService;
