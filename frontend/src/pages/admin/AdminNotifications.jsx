import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiBell, FiSend, FiUser, FiGlobe, FiInfo, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { adminCreateNotification, adminGetNotifications } from '../../services/api';

const TYPE_OPTIONS = [
  { value: 'personal', label: 'Personal', icon: FiUser, desc: 'Sent to a specific user' },
  { value: 'global', label: 'Global', icon: FiGlobe, desc: 'Shown to all users' },
  { value: 'update', label: 'Update', icon: FiInfo, desc: 'Platform update for all' },
];

function AdminNotifications() {
  const [type, setType] = useState('global');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    try {
      const res = await adminGetNotifications();
      setNotifications(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message are required');
      return;
    }
    if (type === 'personal' && !userId) {
      toast.error('User ID is required for personal notifications');
      return;
    }

    setSending(true);
    try {
      await adminCreateNotification({
        type,
        userId: type === 'personal' ? parseInt(userId) : undefined,
        title: title.trim(),
        message: message.trim(),
      });
      toast.success('Notification sent!');
      setTitle('');
      setMessage('');
      setUserId('');
      loadNotifications();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Notifications</h1>

      {/* Create Notification */}
      <div className="rounded-xl bg-dark-800 border border-dark-600 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Send Notification</h2>

        <form onSubmit={handleSend} className="space-y-4">
          {/* Type Selector */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                    type === opt.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-dark-600 bg-dark-700/50 text-gray-400 hover:border-dark-500'
                  }`}
                >
                  <opt.icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-[10px] opacity-60">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* User ID (for personal) */}
          {type === 'personal' && (
            <div>
              <label className="text-sm text-gray-400 mb-2 block">User ID</label>
              <input
                type="number"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter user ID"
                className="w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-600 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-600 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notification message..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-600 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 resize-none"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={sending}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-accent hover:bg-accent/90 text-dark-900 font-semibold transition-colors disabled:opacity-50"
          >
            <FiSend className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </form>
      </div>

      {/* Notification History */}
      <div className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sent Notifications</h2>
          <span className="text-xs text-gray-500">{notifications.length} total</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No notifications sent yet</div>
        ) : (
          <div className="divide-y divide-dark-600">
            {notifications.map(n => (
              <div key={n.id} className="px-4 sm:px-6 py-4 hover:bg-dark-700/30 transition-colors">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        n.type === 'personal' ? 'bg-blue-500/20 text-blue-400' :
                        n.type === 'global' ? 'bg-accent/20 text-accent' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {n.type}
                      </span>
                      {n.target_user && (
                        <span className="text-xs text-gray-500">to {n.target_user}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{n.message}</p>
                  </div>
                  <span className="text-[10px] text-gray-600 whitespace-nowrap">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminNotifications;
