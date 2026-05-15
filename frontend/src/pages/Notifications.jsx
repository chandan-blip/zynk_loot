import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiBell, FiCheck, FiCheckCircle, FiGlobe, FiUser, FiInfo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api';
import socketService from '../services/socket';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';
import { rewriteAmounts } from '../utils/formatAmount';

const TYPE_CONFIG = {
  personal: { icon: FiUser, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Personal' },
  global: { icon: FiGlobe, color: 'text-accent', bg: 'bg-accent/20', label: 'Global' },
  update: { icon: FiInfo, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Update' },
};

function Notifications() {
  usePageTitle('Notifications');
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { loadNotifications(); }, [page]);

  // Real-time notifications
  useEffect(() => {
    const unsub = socketService.onNotification?.((notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnread(prev => prev + 1);
    });
    return () => unsub?.();
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await getNotifications(page);
      const data = res.data.data;
      setNotifications(data.notifications || []);
      setUnread(data.unread || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch (err) {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
      toast.success('All marked as read');
    } catch (err) {}
  };

  const formatTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader icon={FiBell} title="Notifications" description={unread > 0 ? `${unread} unread` : undefined} iconColor="text-blue-400">
        {unread > 0 && (
          <button onClick={handleMarkAllRead} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 transition-colors">
            <FiCheckCircle className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </PageHeader>

      {/* Notifications List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <FiBell className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n, i) => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.personal;
            const Icon = config.icon;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                  n.is_read
                    ? 'bg-dark-700/20 border-white/5'
                    : 'bg-dark-700/50 border-white/10 hover:border-white/20'
                }`}
              >
                <div className={`w-9 h-9 shrink-0 rounded-lg ${config.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-semibold ${n.is_read ? 'text-gray-400' : 'text-white'}`}>
                      {rewriteAmounts(n.title)}
                    </p>
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    )}
                  </div>
                  <p className={`text-xs leading-relaxed ${n.is_read ? 'text-gray-600' : 'text-gray-400'}`}>
                    {rewriteAmounts(n.message)}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.bg} ${config.color} font-medium`}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-gray-600">{formatTime(n.created_at)}</span>
                  </div>
                </div>
                {!n.is_read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                    className="shrink-0 p-1.5 rounded-md text-gray-600 hover:text-accent hover:bg-accent/10 transition-colors"
                    title="Mark as read"
                  >
                    <FiCheck className="w-3.5 h-3.5" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                page === i + 1
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-dark-700/40 text-gray-500 hover:text-white'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Notifications;
