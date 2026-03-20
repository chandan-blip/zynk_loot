const db = require('../config/database');

class TrackingService {
  constructor(io) {
    this.io = io;
  }

  // Start a new session
  async startSession({ sessionId, userId, deviceType, browser, os, screenResolution, ipAddress, userAgent }) {
    try {
      await db.pool.query(
        `INSERT INTO user_sessions (session_id, user_id, device_type, browser, os, screen_resolution, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = COALESCE(VALUES(user_id), user_id), is_active = TRUE`,
        [sessionId, userId || null, deviceType || 'unknown', browser || null, os || null, screenResolution || null, ipAddress || null, userAgent || null]
      );
    } catch (error) {
      console.error('[Tracking] Error starting session:', error.message);
    }
  }

  // End a session
  async endSession(sessionId, durationSeconds) {
    try {
      await db.pool.query(
        `UPDATE user_sessions SET ended_at = NOW(), duration_seconds = ?, is_active = FALSE WHERE session_id = ?`,
        [durationSeconds || 0, sessionId]
      );
    } catch (error) {
      console.error('[Tracking] Error ending session:', error.message);
    }
  }

  // Associate a user with an existing session (on login)
  async associateUser(sessionId, userId) {
    try {
      await db.pool.query(
        `UPDATE user_sessions SET user_id = ? WHERE session_id = ? AND user_id IS NULL`,
        [userId, sessionId]
      );
    } catch (error) {
      console.error('[Tracking] Error associating user:', error.message);
    }
  }

  // Batch insert events
  async recordEvents(events, defaultUserId, defaultSessionId) {
    if (!events || events.length === 0) return;

    try {
      const values = [];
      const placeholders = [];

      for (const event of events) {
        const userId = event.userId || defaultUserId || null;
        const sessionId = event.sessionId || defaultSessionId;
        const eventType = event.type;
        const eventData = event.data ? JSON.stringify(event.data) : null;
        const pageUrl = event.page || null;
        const createdAt = event.timestamp ? new Date(event.timestamp) : new Date();

        placeholders.push('(?, ?, ?, ?, ?, ?)');
        values.push(userId, sessionId, eventType, eventData, pageUrl, createdAt);
      }

      await db.pool.query(
        `INSERT INTO user_events (user_id, session_id, event_type, event_data, page_url, created_at)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    } catch (error) {
      console.error('[Tracking] Error recording events:', error.message);
    }
  }

  // Record a single server-side event
  async recordServerEvent(userId, sessionId, eventType, eventData) {
    try {
      await db.pool.query(
        `INSERT INTO user_events (user_id, session_id, event_type, event_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [userId || null, sessionId || 'server', eventType, eventData ? JSON.stringify(eventData) : null]
      );
    } catch (error) {
      console.error('[Tracking] Error recording server event:', error.message);
    }
  }

  // ── Admin query methods ──

  // Dashboard overview
  async getDashboardStats(days = 30) {
    try {
      const [daily] = await db.pool.query(
        `SELECT * FROM user_activity_daily WHERE metric_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY metric_date ASC`,
        [days]
      );

      const [liveStats] = await db.pool.query(
        `SELECT COUNT(*) as active_sessions, COUNT(DISTINCT user_id) as active_users
         FROM user_sessions WHERE is_active = TRUE AND started_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      );

      const [todayStats] = await db.pool.query(
        `SELECT
           COUNT(*) as total_events,
           SUM(event_type = 'page_view') as page_views,
           SUM(event_type = 'click') as clicks,
           SUM(event_type = 'game_play') as game_plays,
           SUM(event_type = 'login') as logins
         FROM user_events WHERE created_at >= CURDATE()`
      );

      const [todaySessions] = await db.pool.query(
        `SELECT COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users, AVG(duration_seconds) as avg_duration
         FROM user_sessions WHERE started_at >= CURDATE()`
      );

      return {
        live: liveStats[0],
        today: {
          ...todayStats[0],
          sessions: todaySessions[0].count,
          uniqueUsers: todaySessions[0].unique_users,
          avgDuration: Math.round(todaySessions[0].avg_duration || 0)
        },
        daily
      };
    } catch (error) {
      console.error('[Tracking] Error getting dashboard stats:', error.message);
      return { live: {}, today: {}, daily: [] };
    }
  }

  // Paginated event log
  async getEvents(page = 1, limit = 50, filters = {}) {
    try {
      const where = ['1=1'];
      const params = [];

      if (filters.userId) {
        where.push('e.user_id = ?');
        params.push(filters.userId);
      }
      if (filters.eventType) {
        where.push('e.event_type = ?');
        params.push(filters.eventType);
      }
      if (filters.sessionId) {
        where.push('e.session_id = ?');
        params.push(filters.sessionId);
      }
      if (filters.startDate) {
        where.push('e.created_at >= ?');
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        where.push('e.created_at <= ?');
        params.push(filters.endDate);
      }

      const offset = (page - 1) * limit;
      const whereClause = where.join(' AND ');

      const [events] = await db.pool.query(
        `SELECT e.*, u.username
         FROM user_events e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE ${whereClause}
         ORDER BY e.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const [countResult] = await db.pool.query(
        `SELECT COUNT(*) as total FROM user_events e WHERE ${whereClause}`,
        params
      );

      return {
        events,
        total: countResult[0].total,
        page,
        totalPages: Math.ceil(countResult[0].total / limit)
      };
    } catch (error) {
      console.error('[Tracking] Error getting events:', error.message);
      return { events: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  // Paginated session list
  async getSessions(page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;

      const [sessions] = await db.pool.query(
        `SELECT s.*, u.username,
                (SELECT COUNT(*) FROM user_events WHERE session_id = s.session_id) as event_count
         FROM user_sessions s
         LEFT JOIN users u ON s.user_id = u.id
         ORDER BY s.started_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const [countResult] = await db.pool.query('SELECT COUNT(*) as total FROM user_sessions');

      return {
        sessions,
        total: countResult[0].total,
        page,
        totalPages: Math.ceil(countResult[0].total / limit)
      };
    } catch (error) {
      console.error('[Tracking] Error getting sessions:', error.message);
      return { sessions: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  // User-specific activity
  async getUserActivity(userId, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;

      const [events] = await db.pool.query(
        `SELECT * FROM user_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      const [countResult] = await db.pool.query(
        'SELECT COUNT(*) as total FROM user_events WHERE user_id = ?',
        [userId]
      );

      const [sessionStats] = await db.pool.query(
        `SELECT COUNT(*) as total_sessions, SUM(duration_seconds) as total_time, AVG(duration_seconds) as avg_duration
         FROM user_sessions WHERE user_id = ?`,
        [userId]
      );

      return {
        events,
        total: countResult[0].total,
        page,
        totalPages: Math.ceil(countResult[0].total / limit),
        sessionStats: sessionStats[0]
      };
    } catch (error) {
      console.error('[Tracking] Error getting user activity:', error.message);
      return { events: [], total: 0, page: 1, totalPages: 0, sessionStats: {} };
    }
  }

  // Top pages
  async getTopPages(days = 30, limit = 20) {
    try {
      const [pages] = await db.pool.query(
        `SELECT page_url, COUNT(*) as views, COUNT(DISTINCT user_id) as unique_users,
                AVG(JSON_EXTRACT(event_data, '$.duration')) as avg_duration
         FROM user_events
         WHERE event_type = 'page_view' AND page_url IS NOT NULL
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY page_url
         ORDER BY views DESC
         LIMIT ?`,
        [days, limit]
      );
      return pages;
    } catch (error) {
      console.error('[Tracking] Error getting top pages:', error.message);
      return [];
    }
  }

  // Event type breakdown
  async getEventBreakdown(days = 30) {
    try {
      const [breakdown] = await db.pool.query(
        `SELECT event_type, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users
         FROM user_events
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY event_type
         ORDER BY count DESC`,
        [days]
      );
      return breakdown;
    } catch (error) {
      console.error('[Tracking] Error getting event breakdown:', error.message);
      return [];
    }
  }

  // Top clicked elements
  async getTopClicks(days = 30, limit = 20) {
    try {
      const [clicks] = await db.pool.query(
        `SELECT
           JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.text')) as label,
           JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.tag')) as element,
           JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.href')) as href,
           page_url,
           COUNT(*) as clicks,
           COUNT(DISTINCT user_id) as unique_users
         FROM user_events
         WHERE event_type = 'click'
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           AND JSON_EXTRACT(event_data, '$.text') IS NOT NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.text')) != ''
         GROUP BY label, element, href, page_url
         ORDER BY clicks DESC
         LIMIT ?`,
        [days, limit]
      );
      return clicks;
    } catch (error) {
      console.error('[Tracking] Error getting top clicks:', error.message);
      return [];
    }
  }

  // Per-page scroll depth stats
  async getScrollStats(days = 30, limit = 15) {
    try {
      const [scrolls] = await db.pool.query(
        `SELECT
           JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.route')) as page,
           ROUND(AVG(JSON_EXTRACT(event_data, '$.scrollDepth'))) as avg_scroll,
           ROUND(AVG(JSON_EXTRACT(event_data, '$.duration'))) as avg_time,
           COUNT(*) as visits
         FROM user_events
         WHERE event_type = 'page_leave'
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           AND JSON_EXTRACT(event_data, '$.route') IS NOT NULL
         GROUP BY page
         ORDER BY visits DESC
         LIMIT ?`,
        [days, limit]
      );
      return scrolls;
    } catch (error) {
      console.error('[Tracking] Error getting scroll stats:', error.message);
      return [];
    }
  }

  // User activity summary (for admin user detail)
  async getUserSummary(userId) {
    try {
      const [eventCounts] = await db.pool.query(
        `SELECT event_type, COUNT(*) as count
         FROM user_events WHERE user_id = ?
         GROUP BY event_type ORDER BY count DESC`,
        [userId]
      );

      const [sessionInfo] = await db.pool.query(
        `SELECT COUNT(*) as total_sessions,
                SUM(duration_seconds) as total_time,
                AVG(duration_seconds) as avg_duration,
                MAX(started_at) as last_seen,
                MIN(started_at) as first_seen
         FROM user_sessions WHERE user_id = ?`,
        [userId]
      );

      const [topPages] = await db.pool.query(
        `SELECT page_url, COUNT(*) as views
         FROM user_events WHERE user_id = ? AND event_type = 'page_view' AND page_url IS NOT NULL
         GROUP BY page_url ORDER BY views DESC LIMIT 10`,
        [userId]
      );

      const [recentEvents] = await db.pool.query(
        `SELECT event_type, event_data, page_url, created_at
         FROM user_events WHERE user_id = ?
         ORDER BY created_at DESC LIMIT 30`,
        [userId]
      );

      return {
        eventCounts,
        sessions: sessionInfo[0],
        topPages,
        recentEvents
      };
    } catch (error) {
      console.error('[Tracking] Error getting user summary:', error.message);
      return { eventCounts: [], sessions: {}, topPages: [], recentEvents: [] };
    }
  }

  // ── Aggregation (called by cron) ──

  async aggregateDaily(date) {
    try {
      const dateStr = date || new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const [stats] = await db.pool.query(
        `SELECT
           COUNT(DISTINCT e.session_id) as total_sessions,
           COUNT(DISTINCT e.user_id) as unique_users,
           SUM(e.event_type = 'page_view') as total_page_views,
           SUM(e.event_type = 'click') as total_clicks,
           SUM(e.event_type = 'login') as total_logins,
           SUM(e.event_type = 'game_play') as total_game_plays,
           SUM(e.event_type = 'number_buy') as total_number_buys,
           SUM(e.event_type = 'vote') as total_votes,
           SUM(e.event_type = 'deposit') as total_deposits,
           SUM(e.event_type = 'withdrawal') as total_withdrawals
         FROM user_events e
         WHERE DATE(e.created_at) = ?`,
        [dateStr]
      );

      const [sessionStats] = await db.pool.query(
        `SELECT AVG(duration_seconds) as avg_duration
         FROM user_sessions WHERE DATE(started_at) = ? AND duration_seconds > 0`,
        [dateStr]
      );

      const [scrollStats] = await db.pool.query(
        `SELECT AVG(JSON_EXTRACT(event_data, '$.depth')) as avg_depth
         FROM user_events
         WHERE event_type = 'scroll' AND DATE(created_at) = ?`,
        [dateStr]
      );

      const topPages = await this.getTopPages(1, 10);

      const [deviceStats] = await db.pool.query(
        `SELECT device_type, COUNT(*) as count
         FROM user_sessions WHERE DATE(started_at) = ?
         GROUP BY device_type`,
        [dateStr]
      );

      const deviceBreakdown = {};
      deviceStats.forEach(d => { deviceBreakdown[d.device_type] = d.count; });

      const row = stats[0];

      await db.pool.query(
        `INSERT INTO user_activity_daily
         (metric_date, total_sessions, unique_users, total_page_views, total_clicks,
          avg_session_duration, avg_scroll_depth, total_logins, total_game_plays,
          total_number_buys, total_votes, total_deposits, total_withdrawals, top_pages, device_breakdown)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          total_sessions=VALUES(total_sessions), unique_users=VALUES(unique_users),
          total_page_views=VALUES(total_page_views), total_clicks=VALUES(total_clicks),
          avg_session_duration=VALUES(avg_session_duration), avg_scroll_depth=VALUES(avg_scroll_depth),
          total_logins=VALUES(total_logins), total_game_plays=VALUES(total_game_plays),
          total_number_buys=VALUES(total_number_buys), total_votes=VALUES(total_votes),
          total_deposits=VALUES(total_deposits), total_withdrawals=VALUES(total_withdrawals),
          top_pages=VALUES(top_pages), device_breakdown=VALUES(device_breakdown)`,
        [
          dateStr, row.total_sessions || 0, row.unique_users || 0,
          row.total_page_views || 0, row.total_clicks || 0,
          Math.round(sessionStats[0]?.avg_duration || 0),
          parseFloat(scrollStats[0]?.avg_depth || 0),
          row.total_logins || 0, row.total_game_plays || 0,
          row.total_number_buys || 0, row.total_votes || 0,
          row.total_deposits || 0, row.total_withdrawals || 0,
          JSON.stringify(topPages), JSON.stringify(deviceBreakdown)
        ]
      );

      console.log(`[Tracking] Daily aggregation completed for ${dateStr}`);
    } catch (error) {
      console.error('[Tracking] Error aggregating daily:', error.message);
    }
  }

  // Cleanup old events
  async cleanupOldEvents(daysToKeep = 90) {
    try {
      const [result] = await db.pool.query(
        `DELETE FROM user_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [daysToKeep]
      );
      console.log(`[Tracking] Cleaned up ${result.affectedRows} old events (older than ${daysToKeep} days)`);
    } catch (error) {
      console.error('[Tracking] Error cleaning up events:', error.message);
    }
  }

  // Mark stale sessions as ended
  async cleanupStaleSessions() {
    try {
      const [result] = await db.pool.query(
        `UPDATE user_sessions SET is_active = FALSE, ended_at = NOW()
         WHERE is_active = TRUE AND started_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      );
      if (result.affectedRows > 0) {
        console.log(`[Tracking] Marked ${result.affectedRows} stale sessions as ended`);
      }
    } catch (error) {
      console.error('[Tracking] Error cleaning stale sessions:', error.message);
    }
  }
}

module.exports = TrackingService;
