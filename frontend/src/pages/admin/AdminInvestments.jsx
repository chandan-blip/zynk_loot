import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiTrendingUp,
  FiDollarSign,
  FiUsers,
  FiActivity,
  FiSearch,
  FiChevronLeft,
  FiChevronRight,
  FiSave,
  FiToggleRight,
  FiEdit3,
  FiPlus
} from 'react-icons/fi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import toast from 'react-hot-toast';
import {
  getAdminInvestmentStats,
  getAdminInvestments,
  getAdminPlatformMetrics,
  getAdminInvestmentTiers,
  updateInvestmentTier,
  createInvestmentTier
} from '../../services/api';

function AdminInvestments() {
  const [stats, setStats] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [metrics, setMetrics] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [usernameSearch, setUsernameSearch] = useState('');
  const [page, setPage] = useState(1);

  // Tier editing
  const [editingTier, setEditingTier] = useState(null);
  const [tierForm, setTierForm] = useState({});
  const [savingTier, setSavingTier] = useState(false);
  const [showNewTier, setShowNewTier] = useState(false);
  const [newTierForm, setNewTierForm] = useState({
    name: '', slug: '', lock_days: '', multiplier: '',
    min_amount: '100', max_amount: '100000', description: ''
  });

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    fetchInvestments();
  }, [page, statusFilter, tierFilter, usernameSearch]);

  const fetchAll = async () => {
    try {
      const [statsRes, metricsRes, tiersRes] = await Promise.all([
        getAdminInvestmentStats(),
        getAdminPlatformMetrics(90),
        getAdminInvestmentTiers()
      ]);
      setStats(statsRes.data.data);
      setMetrics(metricsRes.data.data || []);
      setTiers(tiersRes.data.data || []);
    } catch (error) {
      console.error('Failed to load admin investment data:', error);
      toast.error('Failed to load investment data');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvestments = async () => {
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (tierFilter) filters.tier_id = tierFilter;
      if (usernameSearch) filters.username = usernameSearch;

      const res = await getAdminInvestments(page, 20, filters);
      setInvestments(res.data.data.investments || []);
      setPagination(res.data.data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (error) {
      console.error('Failed to load investments:', error);
    }
  };

  const handleEditTier = (tier) => {
    setEditingTier(tier.id);
    setTierForm({
      name: tier.name,
      lock_days: tier.lock_days,
      multiplier: tier.multiplier,
      min_amount: tier.min_amount,
      max_amount: tier.max_amount,
      is_active: tier.is_active
    });
  };

  const handleSaveTier = async (tierId) => {
    setSavingTier(true);
    try {
      await updateInvestmentTier(tierId, tierForm);
      toast.success('Tier updated');
      setEditingTier(null);
      const tiersRes = await getAdminInvestmentTiers();
      setTiers(tiersRes.data.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update tier');
    } finally {
      setSavingTier(false);
    }
  };

  const handleCreateTier = async () => {
    if (!newTierForm.name || !newTierForm.slug || !newTierForm.lock_days || !newTierForm.multiplier) {
      toast.error('Fill all required fields');
      return;
    }
    setSavingTier(true);
    try {
      await createInvestmentTier({
        ...newTierForm,
        lock_days: parseInt(newTierForm.lock_days),
        multiplier: parseFloat(newTierForm.multiplier),
        min_amount: parseFloat(newTierForm.min_amount),
        max_amount: parseFloat(newTierForm.max_amount)
      });
      toast.success('Tier created');
      setShowNewTier(false);
      setNewTierForm({ name: '', slug: '', lock_days: '', multiplier: '', min_amount: '100', max_amount: '100000', description: '' });
      const tiersRes = await getAdminInvestmentTiers();
      setTiers(tiersRes.data.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create tier');
    } finally {
      setSavingTier(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const chartData = metrics.map(m => ({
    date: new Date(m.metric_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    growthScore: parseFloat(m.growth_score),
    baseRate: parseFloat(m.base_daily_rate) * 100,
    volume: parseFloat(m.transaction_volume),
    invested: parseFloat(m.total_invested)
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Investments</h1>
        <p className="text-gray-500">Manage investment pool, tiers, and view platform metrics</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pool', value: `${(stats?.totalPool || 0).toLocaleString()} Z`, icon: FiDollarSign, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Active Value', value: `${(stats?.activeValue || 0).toLocaleString()} Z`, icon: FiTrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Unique Investors', value: stats?.uniqueInvestors || 0, icon: FiUsers, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Returns Distributed', value: `${(stats?.totalReturnsDistributed || 0).toLocaleString()} Z`, icon: FiActivity, color: 'text-purple-400', bg: 'bg-purple-500/10' }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-xl bg-dark-800 border border-dark-600"
          >
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-gray-500 text-xs">{stat.label}</p>
            <p className="text-xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Platform Metrics Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl bg-dark-800 border border-dark-600 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Platform Metrics (90 days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a36" />
                <XAxis dataKey="date" stroke="#4a5568" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis stroke="#4a5568" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111921', border: '1px solid #1e2a36', borderRadius: '8px', color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area type="monotone" dataKey="growthScore" name="Growth Score" stroke="#00d4aa" fill="url(#colorScore)" strokeWidth={2} />
                <Line type="monotone" dataKey="baseRate" name="Base Rate %" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Investments Table */}
      <div className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-600">
          <h2 className="text-lg font-semibold text-white mb-3">Investments</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg bg-dark-700 border border-dark-500 text-white text-sm focus:outline-none"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="matured">Matured</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={tierFilter}
              onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg bg-dark-700 border border-dark-500 text-white text-sm focus:outline-none"
            >
              <option value="">All Tiers</option>
              {tiers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[150px]">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Search username..."
                value={usernameSearch}
                onChange={(e) => { setUsernameSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-dark-700 border border-dark-500 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-dark-600">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Tier</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Current Value</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Returns</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Invested</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Locked Until</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {investments.map((inv) => (
                <tr key={inv.id} className="hover:bg-dark-700 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{inv.username}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="px-2 py-0.5 rounded bg-dark-600 text-gray-300 text-xs">
                      {inv.tier_name} ({inv.multiplier}x)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white">{parseFloat(inv.amount).toLocaleString()} Z</td>
                  <td className="px-4 py-3 text-right text-green-400 hidden lg:table-cell">{parseFloat(inv.current_value).toLocaleString()} Z</td>
                  <td className="px-4 py-3 text-right text-accent hidden md:table-cell">+{parseFloat(inv.total_returns).toLocaleString()} Z</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      inv.status === 'active' ? 'bg-blue-500/10 text-blue-400' :
                      inv.status === 'matured' ? 'bg-green-500/10 text-green-400' :
                      inv.status === 'withdrawn' ? 'bg-gray-500/10 text-gray-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDate(inv.invested_at)}</td>
                  <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{formatDate(inv.locked_until)}</td>
                </tr>
              ))}
              {investments.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-500">No investments found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t border-dark-600 flex items-center justify-between">
            <p className="text-gray-500 text-sm">
              Page {pagination.page} of {pagination.pages} ({pagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-dark-700 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="p-2 rounded-lg bg-dark-700 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tier Management */}
      <div className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Tier Management</h2>
          <button
            onClick={() => setShowNewTier(!showNewTier)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
          >
            <FiPlus className="w-4 h-4" />
            New Tier
          </button>
        </div>

        {/* New tier form */}
        {showNewTier && (
          <div className="p-4 border-b border-dark-600 bg-dark-700/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <input
                placeholder="Name"
                value={newTierForm.name}
                onChange={e => setNewTierForm(p => ({ ...p, name: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-dark-600 border border-dark-500 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
              <input
                placeholder="Slug"
                value={newTierForm.slug}
                onChange={e => setNewTierForm(p => ({ ...p, slug: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-dark-600 border border-dark-500 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
              <input
                placeholder="Lock Days"
                type="number"
                value={newTierForm.lock_days}
                onChange={e => setNewTierForm(p => ({ ...p, lock_days: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-dark-600 border border-dark-500 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
              <input
                placeholder="Multiplier"
                type="number"
                step="0.1"
                value={newTierForm.multiplier}
                onChange={e => setNewTierForm(p => ({ ...p, multiplier: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-dark-600 border border-dark-500 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateTier}
                disabled={savingTier}
                className="px-4 py-2 rounded-lg bg-accent text-dark-900 font-medium text-sm hover:bg-accent/90 disabled:opacity-50"
              >
                {savingTier ? 'Creating...' : 'Create Tier'}
              </button>
              <button
                onClick={() => setShowNewTier(false)}
                className="px-4 py-2 rounded-lg bg-dark-600 text-gray-400 text-sm hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-dark-600">
          {tiers.map(tier => (
            <div key={tier.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {editingTier === tier.id ? (
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Name</label>
                    <input
                      type="text"
                      value={tierForm.name}
                      onChange={e => setTierForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-dark-600 border border-dark-500 text-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Lock Days</label>
                    <input
                      type="number"
                      min="1"
                      value={tierForm.lock_days}
                      onChange={e => setTierForm(p => ({ ...p, lock_days: parseInt(e.target.value) || '' }))}
                      className="w-full px-2 py-1.5 rounded bg-dark-600 border border-dark-500 text-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={tierForm.multiplier}
                      onChange={e => setTierForm(p => ({ ...p, multiplier: parseFloat(e.target.value) }))}
                      className="w-full px-2 py-1.5 rounded bg-dark-600 border border-dark-500 text-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Min Amount</label>
                    <input
                      type="number"
                      value={tierForm.min_amount}
                      onChange={e => setTierForm(p => ({ ...p, min_amount: parseFloat(e.target.value) }))}
                      className="w-full px-2 py-1.5 rounded bg-dark-600 border border-dark-500 text-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Max Amount</label>
                    <input
                      type="number"
                      value={tierForm.max_amount}
                      onChange={e => setTierForm(p => ({ ...p, max_amount: parseFloat(e.target.value) }))}
                      className="w-full px-2 py-1.5 rounded bg-dark-600 border border-dark-500 text-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Active</label>
                    <select
                      value={tierForm.is_active ? '1' : '0'}
                      onChange={e => setTierForm(p => ({ ...p, is_active: e.target.value === '1' }))}
                      className="w-full px-2 py-1.5 rounded bg-dark-600 border border-dark-500 text-white text-sm focus:outline-none"
                    >
                      <option value="1">Yes</option>
                      <option value="0">No</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => handleSaveTier(tier.id)}
                      disabled={savingTier}
                      className="px-3 py-1.5 rounded bg-accent text-dark-900 text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                    >
                      <FiSave className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingTier(null)}
                      className="px-3 py-1.5 rounded bg-dark-600 text-gray-400 text-sm hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${tier.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <div>
                      <span className="text-white font-medium">{tier.name}</span>
                      <span className="text-gray-500 text-sm ml-2">({tier.slug})</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-400">
                    <span>{tier.lock_days}d lock</span>
                    <span className="text-accent font-medium">{tier.multiplier}x</span>
                    <span>{parseFloat(tier.min_amount).toLocaleString()} - {parseFloat(tier.max_amount).toLocaleString()} Z</span>
                    <button
                      onClick={() => handleEditTier(tier)}
                      className="p-1.5 rounded hover:bg-dark-600 text-gray-400 hover:text-white transition-colors"
                    >
                      <FiEdit3 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status Summary */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-dark-800 border border-dark-600 text-center">
            <p className="text-blue-400 text-2xl font-bold">{stats.activeCount}</p>
            <p className="text-gray-500 text-sm">Active</p>
          </div>
          <div className="p-4 rounded-xl bg-dark-800 border border-dark-600 text-center">
            <p className="text-green-400 text-2xl font-bold">{stats.maturedCount}</p>
            <p className="text-gray-500 text-sm">Matured</p>
          </div>
          <div className="p-4 rounded-xl bg-dark-800 border border-dark-600 text-center">
            <p className="text-gray-400 text-2xl font-bold">{stats.withdrawnCount}</p>
            <p className="text-gray-500 text-sm">Withdrawn</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminInvestments;
