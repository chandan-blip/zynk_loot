import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiActivity, FiUsers, FiEye, FiClock, FiMonitor, FiSmartphone, FiTablet, FiMousePointer, FiTrendingUp, FiRefreshCw, FiTarget, FiArrowDown } from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { getTrackingDashboard, getTrackingSessions, getRealtimeStats, getEventBreakdown, getTopClicks, getScrollStats, getPageAnalytics } from '../../services/api';
import toast from 'react-hot-toast';

const COLORS = ['#00d4aa', '#8b5cf6', '#f59e0b', '#6b7280'];

function formatDuration(seconds) {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function AdminAnalytics() {
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState({ sessions: [], total: 0, page: 1 });
  const [realtime, setRealtime] = useState(null);
  const [eventBreakdownData, setEventBreakdownData] = useState([]);
  const [topClicksData, setTopClicksData] = useState([]);
  const [scrollData, setScrollData] = useState([]);
  const [topPagesData, setTopPagesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionsPage, setSessionsPage] = useState(1);

  const fetchDashboard = async () => {
    try {
      const [dashRes, rtRes, ebRes, tcRes, scRes, pgRes] = await Promise.all([
        getTrackingDashboard(30),
        getRealtimeStats(),
        getEventBreakdown(30).catch(() => ({ data: { data: [] } })),
        getTopClicks(30).catch(() => ({ data: { data: [] } })),
        getScrollStats(30).catch(() => ({ data: { data: [] } })),
        getPageAnalytics(30).catch(() => ({ data: { data: [] } })),
      ]);
      setDashboard(dashRes.data.data);
      setRealtime(rtRes.data.data);
      setEventBreakdownData(ebRes.data.data || []);
      setTopClicksData(tcRes.data.data || []);
      setScrollData(scRes.data.data || []);
      setTopPagesData(pgRes.data.data || []);
    } catch (e) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async (page = 1) => {
    try {
      const res = await getTrackingSessions(page, 20);
      setSessions(res.data.data);
      setSessionsPage(page);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchSessions();
    // Auto-refresh realtime every 15s
    const interval = setInterval(async () => {
      try {
        const res = await getRealtimeStats();
        setRealtime(res.data.data);
      } catch (e) {}
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = dashboard?.today || {};
  const daily = dashboard?.daily || [];

  // Device breakdown from today's sessions or latest daily
  const deviceData = [];
  const latestDaily = daily[daily.length - 1];
  if (latestDaily?.device_breakdown) {
    const db = typeof latestDaily.device_breakdown === 'string' ? JSON.parse(latestDaily.device_breakdown) : latestDaily.device_breakdown;
    Object.entries(db).forEach(([key, val]) => {
      if (val > 0) deviceData.push({ name: key, value: val });
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <FiActivity className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <p className="text-gray-500 text-sm">User activity tracking</p>
          </div>
        </div>
        <button onClick={fetchDashboard} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-gray-400 hover:text-white transition-colors text-sm">
          <FiRefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Realtime Banner */}
      {realtime && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-accent/5 border border-accent/20"
        >
          <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
          <span className="text-white font-semibold text-sm">
            {realtime.active_sessions || 0} active sessions
          </span>
          <span className="text-gray-500 text-sm">
            {realtime.active_users || 0} unique users online
          </span>
          {realtime.recentEvents?.map((e, i) => (
            <span key={i} className="text-xs text-gray-600">
              {e.event_type}: {e.count}
            </span>
          ))}
        </motion.div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Sessions Today', value: today.sessions || 0, icon: FiUsers, color: 'text-accent' },
          { label: 'Page Views', value: today.page_views || 0, icon: FiEye, color: 'text-blue-400' },
          { label: 'Clicks', value: today.clicks || 0, icon: FiMousePointer, color: 'text-purple-400' },
          { label: 'Avg Duration', value: formatDuration(today.avgDuration), icon: FiClock, color: 'text-amber-400' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-dark-800 rounded-xl border border-dark-600 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-gray-500 text-xs">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Activity Over Time */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-dark-800 rounded-xl border border-dark-600 p-5"
        >
          <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
            <FiTrendingUp className="w-4 h-4 text-accent" /> Activity (Last 30 Days)
          </h3>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="metric_date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#111921', border: '1px solid #1e2a36', borderRadius: 8 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area type="monotone" dataKey="total_page_views" name="Page Views" stroke="#00d4aa" fill="url(#colorViews)" />
                <Area type="monotone" dataKey="total_sessions" name="Sessions" stroke="#8b5cf6" fill="url(#colorSessions)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-600 text-sm">
              No data yet. Stats aggregate daily at 2:00 AM.
            </div>
          )}
        </motion.div>

        {/* Device Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-dark-800 rounded-xl border border-dark-600 p-5"
        >
          <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
            <FiMonitor className="w-4 h-4 text-accent" /> Devices
          </h3>
          {deviceData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={deviceData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4}>
                    {deviceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111921', border: '1px solid #1e2a36', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {deviceData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-400 capitalize">{d.name}</span>
                    <span className="text-white font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
              No device data yet
            </div>
          )}
        </motion.div>
      </div>

      {/* Event Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Unique Users', value: today.uniqueUsers || 0 },
          { label: 'Logins', value: today.logins || 0 },
          { label: 'Game Plays', value: today.game_plays || 0 },
          { label: 'Total Events', value: today.total_events || 0 },
        ].map((stat) => (
          <div key={stat.label} className="bg-dark-800 rounded-lg border border-dark-600 p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className="text-lg font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Detailed Stats Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Event Type Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-dark-800 rounded-xl border border-dark-600 p-5"
        >
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <FiActivity className="w-4 h-4 text-accent" /> Event Breakdown
          </h3>
          {eventBreakdownData.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {eventBreakdownData.map((e) => {
                const maxCount = eventBreakdownData[0]?.count || 1;
                const pct = Math.round((e.count / maxCount) * 100);
                return (
                  <div key={e.event_type} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-400 text-xs">{e.event_type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-[10px]">{e.unique_users} users</span>
                        <span className="text-white text-xs font-semibold">{e.count}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-8">No event data yet</p>
          )}
        </motion.div>

        {/* Top Pages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-dark-800 rounded-xl border border-dark-600 p-5"
        >
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <FiEye className="w-4 h-4 text-blue-400" /> Top Pages
          </h3>
          {topPagesData.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {topPagesData.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-dark-700/50 last:border-0">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-white text-xs font-medium truncate">{p.page_url}</p>
                    <p className="text-gray-600 text-[10px]">{p.unique_users} unique visitors</p>
                  </div>
                  <span className="text-accent text-xs font-bold flex-shrink-0">{p.views}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-8">No page data yet</p>
          )}
        </motion.div>

        {/* Page Engagement (Scroll + Time) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-dark-800 rounded-xl border border-dark-600 p-5"
        >
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <FiArrowDown className="w-4 h-4 text-purple-400" /> Page Engagement
          </h3>
          {scrollData.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {scrollData.map((s, i) => (
                <div key={i} className="py-1.5 border-b border-dark-700/50 last:border-0">
                  <p className="text-white text-xs font-medium truncate mb-1">{s.page}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <FiArrowDown className="w-3 h-3 text-purple-400" />
                      <span className="text-gray-400 text-[10px]">{s.avg_scroll || 0}% scroll</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FiClock className="w-3 h-3 text-amber-400" />
                      <span className="text-gray-400 text-[10px]">{formatDuration(s.avg_time || 0)} avg</span>
                    </div>
                    <span className="text-gray-600 text-[10px] ml-auto">{s.visits} visits</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-8">No engagement data yet</p>
          )}
        </motion.div>
      </div>

      {/* Top Clicked Elements */}
      {topClicksData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-dark-800 rounded-xl border border-dark-600 p-5"
        >
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <FiTarget className="w-4 h-4 text-accent" /> Most Clicked Elements
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="text-left text-gray-500 font-medium px-3 py-2 text-xs">Label</th>
                  <th className="text-left text-gray-500 font-medium px-3 py-2 text-xs">Element</th>
                  <th className="text-left text-gray-500 font-medium px-3 py-2 text-xs">Page</th>
                  <th className="text-right text-gray-500 font-medium px-3 py-2 text-xs">Clicks</th>
                  <th className="text-right text-gray-500 font-medium px-3 py-2 text-xs">Users</th>
                </tr>
              </thead>
              <tbody>
                {topClicksData.slice(0, 15).map((c, i) => (
                  <tr key={i} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                    <td className="px-3 py-2 text-white text-xs max-w-[200px] truncate">{c.label || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-gray-400">{c.element}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[150px] truncate">{c.page_url || '-'}</td>
                    <td className="px-3 py-2 text-right text-accent text-xs font-bold">{c.clicks}</td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs">{c.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Recent Sessions Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden"
      >
        <div className="p-4 border-b border-dark-600">
          <h3 className="text-white font-semibold text-sm">Recent Sessions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-gray-500 font-medium px-4 py-3">User</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Device</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Browser</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Duration</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Events</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Started</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(sessions.sessions || []).map((s) => (
                <tr key={s.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="px-4 py-3 text-white">{s.username || 'Anonymous'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-400">
                      {s.device_type === 'mobile' ? <FiSmartphone className="w-3.5 h-3.5" /> :
                       s.device_type === 'tablet' ? <FiTablet className="w-3.5 h-3.5" /> :
                       <FiMonitor className="w-3.5 h-3.5" />}
                      {s.device_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{s.browser || '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDuration(s.duration_seconds)}</td>
                  <td className="px-4 py-3 text-gray-400">{s.event_count || 0}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <span className="flex items-center gap-1 text-accent text-xs font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Active
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">Ended</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!sessions.sessions || sessions.sessions.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-600">No sessions yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sessions.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-600">
            <span className="text-gray-500 text-xs">{sessions.total} total sessions</span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchSessions(sessionsPage - 1)}
                disabled={sessionsPage <= 1}
                className="px-3 py-1.5 rounded bg-dark-700 text-gray-400 text-xs disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-gray-500 text-xs px-2 py-1.5">{sessionsPage} / {sessions.totalPages}</span>
              <button
                onClick={() => fetchSessions(sessionsPage + 1)}
                disabled={sessionsPage >= sessions.totalPages}
                className="px-3 py-1.5 rounded bg-dark-700 text-gray-400 text-xs disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default AdminAnalytics;
