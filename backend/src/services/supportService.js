const db = require('../config/database');

class SupportService {
  constructor(io, telegramDashService = null) {
    this.io = io;
    this.telegramDashService = telegramDashService;
  }

  // Get or create conversation for a user
  async getOrCreateConversation(userId) {
    const [existing] = await db.pool.query(
      'SELECT * FROM support_conversations WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new conversation
    const [result] = await db.pool.query(
      'INSERT INTO support_conversations (user_id) VALUES (?)',
      [userId]
    );

    const [newConv] = await db.pool.query(
      'SELECT * FROM support_conversations WHERE id = ?',
      [result.insertId]
    );

    return newConv[0];
  }

  // User sends a message
  async sendUserMessage(userId, message) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get or create conversation
      let [convs] = await connection.execute(
        'SELECT * FROM support_conversations WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      let conversation;
      if (convs.length === 0) {
        const [result] = await connection.execute(
          'INSERT INTO support_conversations (user_id, unread_admin_count, last_message_at) VALUES (?, 1, NOW())',
          [userId]
        );
        const [newConv] = await connection.execute(
          'SELECT * FROM support_conversations WHERE id = ?',
          [result.insertId]
        );
        conversation = newConv[0];
      } else {
        conversation = convs[0];
        // Update conversation
        await connection.execute(
          `UPDATE support_conversations
           SET unread_admin_count = unread_admin_count + 1,
               last_message_at = NOW(),
               status = CASE WHEN status = 'closed' THEN 'open' ELSE status END
           WHERE id = ?`,
          [conversation.id]
        );
      }

      // Insert message
      const [msgResult] = await connection.execute(
        'INSERT INTO support_messages (conversation_id, sender_id, sender_type, message) VALUES (?, ?, ?, ?)',
        [conversation.id, userId, 'user', message]
      );

      await connection.commit();

      // Get the full message with sender info
      const [messages] = await db.pool.query(
        `SELECT m.*, u.username as sender_name, u.email as sender_email, u.phone as sender_phone
         FROM support_messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.id = ?`,
        [msgResult.insertId]
      );

      const fullMessage = messages[0];

      // Emit to admin room
      if (this.io) {
        this.io.to('support:admin').emit('support:newMessage', {
          conversationId: conversation.id,
          message: fullMessage
        });
      }

      // Fire-and-forget Telegram notification to the ops dashboard channel.
      if (this.telegramDashService) {
        this.telegramDashService.notifySupportMessage({
          user: {
            id: userId,
            username: fullMessage.sender_name,
            email: fullMessage.sender_email,
            phone: fullMessage.sender_phone,
          },
          conversationId: conversation.id,
          message,
        }).catch(() => {});
      }

      return { conversationId: conversation.id, message: fullMessage };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Admin sends a message
  async sendAdminMessage(adminId, conversationId, message) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get conversation
      const [convs] = await connection.execute(
        'SELECT * FROM support_conversations WHERE id = ? FOR UPDATE',
        [conversationId]
      );

      if (convs.length === 0) {
        throw new Error('Conversation not found');
      }

      const conversation = convs[0];

      // Update conversation
      await connection.execute(
        `UPDATE support_conversations
         SET unread_user_count = unread_user_count + 1,
             last_message_at = NOW()
         WHERE id = ?`,
        [conversationId]
      );

      // Insert message
      const [msgResult] = await connection.execute(
        'INSERT INTO support_messages (conversation_id, sender_id, sender_type, message) VALUES (?, ?, ?, ?)',
        [conversationId, adminId, 'admin', message]
      );

      await connection.commit();

      // Get the full message with sender info
      const [messages] = await db.pool.query(
        `SELECT m.*, u.username as sender_name
         FROM support_messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.id = ?`,
        [msgResult.insertId]
      );

      const fullMessage = messages[0];

      // Emit to user
      if (this.io) {
        this.io.to(`user:${conversation.user_id}`).emit('support:newMessage', {
          conversationId: conversation.id,
          message: fullMessage
        });
      }

      return { conversationId, message: fullMessage };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get messages for a conversation
  async getMessages(conversationId, limit = 50, offset = 0) {
    const [messages] = await db.pool.query(
      `SELECT m.*, u.username as sender_name
       FROM support_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC
       LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );

    const [countResult] = await db.pool.query(
      'SELECT COUNT(*) as total FROM support_messages WHERE conversation_id = ?',
      [conversationId]
    );

    return {
      messages,
      total: countResult[0].total,
      hasMore: offset + limit < countResult[0].total
    };
  }

  // Mark messages as read by user
  async markAsReadByUser(userId) {
    const [convs] = await db.pool.query(
      'SELECT id FROM support_conversations WHERE user_id = ?',
      [userId]
    );

    if (convs.length === 0) return { success: true };

    const conversationId = convs[0].id;

    await db.pool.query(
      `UPDATE support_messages
       SET is_read = TRUE
       WHERE conversation_id = ? AND sender_type = 'admin' AND is_read = FALSE`,
      [conversationId]
    );

    await db.pool.query(
      'UPDATE support_conversations SET unread_user_count = 0 WHERE id = ?',
      [conversationId]
    );

    return { success: true };
  }

  // Mark messages as read by admin
  async markAsReadByAdmin(conversationId) {
    await db.pool.query(
      `UPDATE support_messages
       SET is_read = TRUE
       WHERE conversation_id = ? AND sender_type = 'user' AND is_read = FALSE`,
      [conversationId]
    );

    await db.pool.query(
      'UPDATE support_conversations SET unread_admin_count = 0 WHERE id = ?',
      [conversationId]
    );

    return { success: true };
  }

  // Get unread count for user
  async getUnreadCountForUser(userId) {
    const [result] = await db.pool.query(
      'SELECT unread_user_count FROM support_conversations WHERE user_id = ?',
      [userId]
    );

    return result.length > 0 ? result[0].unread_user_count : 0;
  }

  // Get total unread count for admins
  async getUnreadCountForAdmin() {
    const [result] = await db.pool.query(
      'SELECT SUM(unread_admin_count) as total FROM support_conversations'
    );

    return result[0].total || 0;
  }

  // Get all conversations (admin)
  async getAllConversations(status = null, limit = 50, offset = 0) {
    let query = `
      SELECT c.*, u.username, u.email,
             (SELECT message FROM support_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM support_conversations c
      JOIN users u ON c.user_id = u.id
    `;

    const params = [];

    if (status) {
      query += ' WHERE c.status = ?';
      params.push(status);
    }

    query += ' ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [conversations] = await db.pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM support_conversations';
    const countParams = [];
    if (status) {
      countQuery += ' WHERE status = ?';
      countParams.push(status);
    }

    const [countResult] = await db.pool.query(countQuery, countParams);

    return {
      conversations,
      total: countResult[0].total,
      hasMore: offset + limit < countResult[0].total
    };
  }

  // Update conversation status
  async updateStatus(conversationId, status) {
    await db.pool.query(
      'UPDATE support_conversations SET status = ? WHERE id = ?',
      [status, conversationId]
    );

    // Get conversation to notify user
    const [convs] = await db.pool.query(
      'SELECT user_id FROM support_conversations WHERE id = ?',
      [conversationId]
    );

    if (convs.length > 0 && this.io) {
      this.io.to(`user:${convs[0].user_id}`).emit('support:statusChanged', {
        conversationId,
        status
      });
    }

    return { success: true, status };
  }

  // Get conversation by ID (admin)
  async getConversationById(conversationId) {
    const [convs] = await db.pool.query(
      `SELECT c.*, u.username, u.email
       FROM support_conversations c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [conversationId]
    );

    return convs.length > 0 ? convs[0] : null;
  }
}

module.exports = SupportService;
