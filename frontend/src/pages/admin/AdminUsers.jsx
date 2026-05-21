import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiPlus, FiActivity, FiEye, FiClock, FiMousePointer, FiX, FiLock, FiUnlock, FiAlertOctagon } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import api, { getUserTrackingSummary, freezeUser, unfreezeUser } from '../../services/api';

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [addAmount, setAddAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [activityUser, setActivityUser] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState(null);   // user object opened in freeze modal
  const [freezeNote, setFreezeNote] = useState('');
  const [freezing, setFreezing] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/users?page=${page}&limit=20`);
      setUsers(response.data.data.users);
      setPagination(response.data.data.pagination);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBalance = async () => {
    if (!selectedUser || !addAmount || parseFloat(addAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setAdding(true);
    try {
      const response = await api.post(`/admin/users/${selectedUser.id}/balance`, {
        amount: parseFloat(addAmount)
      });
      if (response.data.success) {
        toast.success(`Added ${addAmount} coins to ${selectedUser.username}`);
        setSelectedUser(null);
        setAddAmount('');
        fetchUsers();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add balance');
    } finally {
      setAdding(false);
    }
  };

  const handleConfirmFreeze = async () => {
    if (!freezeTarget) return;
    const note = freezeNote.trim();
    if (!note) {
      toast.error('Please enter a freeze note');
      return;
    }
    setFreezing(true);
    try {
      await freezeUser(freezeTarget.id, note);
      toast.success(`${freezeTarget.username} frozen`);
      setFreezeTarget(null);
      setFreezeNote('');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to freeze user');
    } finally {
      setFreezing(false);
    }
  };

  const handleUnfreeze = async (user) => {
    if (!window.confirm(`Unfreeze ${user.username}?`)) return;
    try {
      await unfreezeUser(user.id);
      toast.success(`${user.username} unfrozen`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to unfreeze');
    }
  };

  const handleViewActivity = async (user) => {
    setActivityUser(user);
    setActivityLoading(true);
    setActivityData(null);
    try {
      const res = await getUserTrackingSummary(user.id);
      setActivityData(res.data.data);
    } catch (e) {
      toast.error('Failed to load activity');
    } finally {
      setActivityLoading(false);
    }
  };

  // Phone-only signups have null email, and some legacy rows can have a
  // null username — coerce to '' before toLowerCase so the search filter
  // doesn't crash on those rows.
  const q = (search || '').toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!q) return true;
    return (
      (user.username || '').toLowerCase().includes(q) ||
      (user.email || '').toLowerCase().includes(q) ||
      (user.phone || '').toLowerCase().includes(q) ||
      String(user.id || '').includes(q)
    );
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-gray-500">Manage users and balances</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="input-premium w-full pl-12"
        />
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="bg-dark-700">
                <tr>
                  <th>User</th>
                  <th className="hidden sm:table-cell">Email</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right hidden md:table-cell">Spent</th>
                  <th className="text-right hidden md:table-cell">Earned</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-400">
                {filteredUsers.map((user, i) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-dark-700 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center font-bold text-sm lg:text-base ${
                          user.is_frozen ? 'bg-red-500 text-white' : 'bg-accent text-dark-900'
                        }`}>
                          {user.username[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-white">{user.username}</span>
                            {user.is_frozen ? (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30"
                                title={user.freeze_note || 'Frozen'}
                              >
                                <FiLock className="w-2.5 h-2.5" /> Frozen
                              </span>
                            ) : null}
                          </div>
                          <span className="text-xs text-gray-500 sm:hidden">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-gray-400 hidden sm:table-cell">{user.email}</td>
                    <td className="text-right">
                      <span className="font-semibold text-accent">
                        {parseFloat(user.balance).toLocaleString()}
                      </span>
                    </td>
                    <td className="text-right text-gray-400 hidden md:table-cell">
                      {parseFloat(user.total_spent || 0).toLocaleString()}
                    </td>
                    <td className="text-right text-green-400 hidden md:table-cell">
                      {parseFloat(user.total_earned || 0).toLocaleString()}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewActivity(user)}
                          className="px-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-medium"
                          title="View Activity"
                        >
                          <FiActivity className="inline mr-0.5 w-3 h-3" />
                          <span className="hidden lg:inline">Activity</span>
                        </button>
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="px-2 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-xs font-medium"
                        >
                          <FiPlus className="inline mr-0.5 w-3 h-3" />
                          <span className="hidden lg:inline">Balance</span>
                        </button>
                        {user.is_frozen ? (
                          <button
                            onClick={() => handleUnfreeze(user)}
                            className="px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-medium"
                            title={user.freeze_note || 'Unfreeze user'}
                          >
                            <FiUnlock className="inline mr-0.5 w-3 h-3" />
                            <span className="hidden lg:inline">Unfreeze</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => { setFreezeTarget(user); setFreezeNote(''); }}
                            className="px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium"
                            title="Freeze user"
                          >
                            <FiLock className="inline mr-0.5 w-3 h-3" />
                            <span className="hidden lg:inline">Freeze</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-dark-400">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                  page === p
                    ? 'bg-accent text-dark-900'
                    : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Balance Modal */}
      {selectedUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedUser(null)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="card p-4 lg:p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-6">Add Balance</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-dark-700 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900 text-xl">
                  {selectedUser.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white">{selectedUser.username}</p>
                  <p className="text-sm text-gray-500">Current: {parseFloat(selectedUser.balance).toLocaleString()} coins</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Amount</label>
                <div className="relative">
                  <GiTwoCoins className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="input-premium w-full pl-12"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex-1 py-3 rounded-lg font-semibold bg-dark-700 text-white hover:bg-dark-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddBalance}
                  disabled={adding}
                  className="flex-1 py-3 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent-600 transition-colors disabled:opacity-50"
                >
                  {adding ? 'Adding...' : 'Add Balance'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      {/* User Activity Modal */}
      <AnimatePresence>
        {activityUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8"
            onClick={() => setActivityUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="card p-5 max-w-2xl w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900">
                    {activityUser.username[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{activityUser.username}</h3>
                    <p className="text-xs text-gray-500">{activityUser.email}</p>
                  </div>
                </div>
                <button onClick={() => setActivityUser(null)} className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center text-gray-400 hover:text-white">
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              {activityLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activityData ? (
                <div className="space-y-4">
                  {/* Session Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Sessions', value: activityData.sessions?.total_sessions || 0 },
                      { label: 'Total Time', value: (() => { const s = activityData.sessions?.total_time || 0; return s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; })() },
                      { label: 'Avg Session', value: (() => { const s = Math.round(activityData.sessions?.avg_duration || 0); return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`; })() },
                      { label: 'Last Seen', value: activityData.sessions?.last_seen ? new Date(activityData.sessions.last_seen).toLocaleDateString() : 'Never' },
                    ].map(s => (
                      <div key={s.label} className="bg-dark-700 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
                        <p className="text-lg font-bold text-white mt-0.5">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Event Counts & Top Pages side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Event Counts */}
                    <div className="bg-dark-700 rounded-lg p-4">
                      <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5">
                        <FiMousePointer className="w-3.5 h-3.5 text-accent" /> Events
                      </h4>
                      {activityData.eventCounts?.length > 0 ? (
                        <div className="space-y-1.5">
                          {activityData.eventCounts.map(e => (
                            <div key={e.event_type} className="flex items-center justify-between">
                              <span className="text-gray-400 text-xs">{e.event_type}</span>
                              <span className="text-white text-xs font-semibold bg-dark-600 px-2 py-0.5 rounded">{e.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-600 text-xs text-center py-4">No events recorded</p>
                      )}
                    </div>

                    {/* Top Pages */}
                    <div className="bg-dark-700 rounded-lg p-4">
                      <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5">
                        <FiEye className="w-3.5 h-3.5 text-blue-400" /> Top Pages
                      </h4>
                      {activityData.topPages?.length > 0 ? (
                        <div className="space-y-1.5">
                          {activityData.topPages.map((p, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-gray-400 text-xs truncate mr-2">{p.page_url}</span>
                              <span className="text-accent text-xs font-semibold flex-shrink-0">{p.views}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-600 text-xs text-center py-4">No page views</p>
                      )}
                    </div>
                  </div>

                  {/* Recent Activity Timeline */}
                  <div className="bg-dark-700 rounded-lg p-4">
                    <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5">
                      <FiClock className="w-3.5 h-3.5 text-amber-400" /> Recent Activity
                    </h4>
                    {activityData.recentEvents?.length > 0 ? (
                      <div className="space-y-1 max-h-[250px] overflow-y-auto">
                        {activityData.recentEvents.map((e, i) => {
                          const data = typeof e.event_data === 'string' ? JSON.parse(e.event_data || '{}') : (e.event_data || {});
                          let detail = '';
                          if (e.event_type === 'page_view') detail = data.route || e.page_url || '';
                          else if (e.event_type === 'click') detail = data.text || data.href || '';
                          else if (e.event_type === 'page_leave') detail = `${data.route || ''} (${data.duration || 0}s, ${data.scrollDepth || 0}% scroll)`;
                          else if (e.event_type === 'game_play') detail = `${data.game_type || ''} ${data.is_win ? 'Won' : 'Lost'} ${data.bet_amount || ''}Z`;
                          else if (e.event_type === 'number_buy') detail = `#${data.number || ''} for ${data.price || ''}Z`;
                          else if (e.event_type === 'login') detail = `via ${data.method || 'unknown'}`;
                          else detail = JSON.stringify(data).slice(0, 60);

                          return (
                            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-dark-600/50 last:border-0">
                              <span className="text-[10px] text-gray-600 flex-shrink-0 w-[65px] mt-0.5">
                                {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-600 text-gray-400 flex-shrink-0">
                                {e.event_type}
                              </span>
                              <span className="text-xs text-gray-400 truncate">{detail}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-xs text-center py-4">No recent activity</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-600 text-center py-8">Failed to load activity data</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Freeze Confirmation Modal */}
      <AnimatePresence>
        {freezeTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={() => !freezing && setFreezeTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              className="bg-dark-800 border border-red-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center">
                  <FiAlertOctagon className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Freeze {freezeTarget.username}?</h3>
                  <p className="text-xs text-gray-500">User will see a fullscreen lock overlay until they deposit or you unfreeze.</p>
                </div>
              </div>

              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Reason / Note <span className="text-red-400">*</span>
              </label>
              <textarea
                value={freezeNote}
                onChange={(e) => setFreezeNote(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="e.g. Suspicious activity detected — please make a verification deposit to continue."
                className="input-premium w-full resize-none"
                autoFocus
              />
              <p className="text-[11px] text-gray-500 mt-1 text-right">{freezeNote.length} / 500</p>

              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => { setFreezeTarget(null); setFreezeNote(''); }}
                  disabled={freezing}
                  className="flex-1 py-3 rounded-lg bg-dark-700 hover:bg-dark-600 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFreeze}
                  disabled={freezing || !freezeNote.trim()}
                  className="flex-1 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {freezing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiLock className="w-4 h-4" />
                  )}
                  {freezing ? 'Freezing…' : 'Freeze Account'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminUsers;
