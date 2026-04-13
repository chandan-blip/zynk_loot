import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiTrendingUp,
  FiDollarSign,
  FiClock,
  FiCheck,
  FiAlertTriangle,
  FiChevronDown,
  FiChevronUp,
  FiActivity,
  FiX
} from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  getInvestmentTiers,
  getPlatformGrowth,
  createInvestment,
  withdrawInvestment,
  getInvestmentPortfolio,
  getInvestmentStats,
  getInvestmentReturns
} from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

function Invest() {
  usePageTitle('Invest');

  const { user, checkAuth } = useStore();
  const { formatCurrency, selectedCurrency } = useCurrency();
  const [tiers, setTiers] = useState([]);
  const [stats, setStats] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [growthData, setGrowthData] = useState({ history: [], latest: null });
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState(null);
  const [amount, setAmount] = useState('');
  const [investing, setInvesting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(null);
  const [showReturns, setShowReturns] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const publicCalls = [getInvestmentTiers(), getPlatformGrowth(30)];
      const authCalls = user
        ? [getInvestmentPortfolio(), getInvestmentStats(), getInvestmentReturns(1, 10)]
        : [];

      const [tiersRes, growthRes, ...authRes] = await Promise.all([...publicCalls, ...authCalls]);
      setTiers(tiersRes.data.data || []);
      setGrowthData(growthRes.data.data || { history: [], latest: null });

      if (user && authRes.length === 3) {
        setPortfolio(authRes[0].data.data || []);
        setStats(authRes[1].data.data || null);
        setReturns(authRes[2].data.data?.returns || []);
      }
    } catch (error) {
      console.error('Failed to load invest data:', error);
      toast.error('Failed to load investment data');
    } finally {
      setLoading(false);
    }
  };

  const handleInvest = async () => {
    if (!user) {
      toast.error('Please login to invest');
      return;
    }
    if (!selectedTier || !amount) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setInvesting(true);
    try {
      const res = await createInvestment(numAmount, selectedTier.id);
      if (res.data.success) {
        toast.success(res.data.message);
        setAmount('');
        setSelectedTier(null);
        await fetchAll();
        checkAuth();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Investment failed');
    } finally {
      setInvesting(false);
    }
  };

  const handleWithdraw = async (investmentId) => {
    setWithdrawing(investmentId);
    try {
      const res = await withdrawInvestment(investmentId);
      if (res.data.success) {
        toast.success(res.data.message);
        await fetchAll();
        checkAuth();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(null);
    }
  };

  const quickAmounts = selectedTier
    ? [
        parseFloat(selectedTier.min_amount),
        Math.round(parseFloat(selectedTier.min_amount) * 5),
        Math.round(parseFloat(selectedTier.min_amount) * 10),
        Math.round(parseFloat(selectedTier.max_amount) / 2)
      ]
    : [100, 500, 1000, 5000];

  const projectedDaily = useMemo(() => {
    if (!selectedTier || !amount) return null;
    const investAmount = parseFloat(amount);
    if (isNaN(investAmount) || investAmount <= 0) return null;
    const effectiveRate = selectedTier.daily_rate != null
      ? parseFloat(selectedTier.daily_rate)
      : growthData.latest
        ? parseFloat(growthData.latest.base_daily_rate || 0) * parseFloat(selectedTier.multiplier)
        : 0;
    if (effectiveRate <= 0) return null;
    const daily = investAmount * effectiveRate;
    const lockDays = parseInt(selectedTier.lock_days) || 1;
    const totalLockReturn = daily * lockDays;
    const maturityValue = investAmount + totalLockReturn;
    return { rate: effectiveRate, daily, monthly: daily * 30, lockDays, totalLockReturn, maturityValue, investAmount };
  }, [selectedTier, amount, growthData.latest]);

  // SVG mini line chart
  const GrowthChart = ({ data }) => {
    if (!data || data.length === 0) return null;
    const scores = data.map(d => parseFloat(d.growth_score));
    const max = Math.max(...scores, 1);
    const min = Math.min(...scores, 0);
    const range = max - min || 1;
    const w = 300;
    const h = 80;
    const points = scores.map((s, i) => {
      const x = (i / Math.max(scores.length - 1, 1)) * w;
      const y = h - ((s - min) / range) * h;
      return `${x},${y}`;
    });
    const polyline = points.join(' ');
    const areaPoints = `0,${h} ${polyline} ${w},${h}`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(0,212,170)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(0,212,170)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#growthGrad)" />
        <polyline points={polyline} fill="none" stroke="rgb(0,212,170)" strokeWidth="2" />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-4">
      <PageHeader icon={FiTrendingUp} title="Invest" description="Grow your Zynk with daily returns" />

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invested', value: `${(stats?.totalInvested || 0).toLocaleString()} Z`, icon: GiTwoCoins, color: 'text-accent' },
          { label: 'Total Returns', value: `${(stats?.totalReturns || 0).toLocaleString()} Z`, icon: FiDollarSign, color: 'text-green-400' },
          { label: 'Active', value: stats?.activeCount || 0, icon: FiActivity, color: 'text-blue-400' },
          { label: 'Current Value', value: `${(stats?.totalCurrentValue || 0).toLocaleString()} Z`, icon: FiTrendingUp, color: 'text-purple-400' }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-xl bg-dark-800 border border-dark-600"
          >
            <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
            <p className="text-gray-500 text-xs">{stat.label}</p>
            <p className="text-lg font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Platform Growth */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl bg-dark-800 border border-dark-600 p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FiActivity className="text-accent" />
            Platform Growth
          </h2>
          {growthData.latest && (
            <div className="flex items-center flex-col-reverse md:flex-row gap-2">
              <span className="px-3 py-1 rounded-full bg-accent/10 text-accent font-bold text-sm">
                Score: {parseFloat(growthData.latest.growth_score).toFixed(1)}
              </span>
              <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 font-bold text-sm">
                Rate: {(parseFloat(growthData.latest.base_daily_rate) * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <GrowthChart data={growthData.history} />
        <p className="text-gray-500 text-xs mt-2">30-day growth score trend</p>
      </motion.div>

      {/* Tiers */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Investment Tiers</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {tiers.map((tier, i) => {
            const estDaily = tier.daily_rate != null
              ? (parseFloat(tier.daily_rate) * 100).toFixed(2)
              : growthData.latest
                ? (parseFloat(growthData.latest.base_daily_rate) * parseFloat(tier.multiplier) * 100).toFixed(2)
                : '—';

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className="text-left p-5 rounded-xl border bg-dark-800 border-dark-600 hover:border-dark-400 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold text-lg">{tier.name}</h3>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-dark-600 text-gray-300">
                    {tier.daily_rate != null ? `${(parseFloat(tier.daily_rate) * 100).toFixed(2)}%/day` : `${tier.multiplier}x`}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Lock Period</span>
                    <span className="text-white font-medium">{tier.lock_days} days</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Est. Daily</span>
                    <span className="text-green-400 font-medium">{estDaily}%</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Min / Max</span>
                    <span className="text-white font-medium">{parseFloat(tier.min_amount).toLocaleString()} - {parseFloat(tier.max_amount).toLocaleString()} Z</span>
                  </div>
                </div>
                {tier.description && (
                  <p className="text-gray-500 text-xs mt-3">{tier.description}</p>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedTier(tier); setAmount(''); }}
                  className="w-full mt-4 py-2.5 rounded-lg bg-accent text-dark-900 font-bold text-sm hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
                >
                  <FiTrendingUp className="w-4 h-4" />
                  Invest
                </motion.button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Bottom Off-Canvas - Invest Form */}
      <AnimatePresence>
        {selectedTier && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setSelectedTier(null)}
            />

            {/* Off-canvas sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-dark-800 border-t border-dark-500"
            >
              {/* Drag handle */}
              <div className="sticky top-0 bg-dark-800 pt-3 pb-2 px-6 z-10">
                <div className="w-10 h-1 bg-dark-500 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <FiTrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">Invest in {selectedTier.name}</h3>
                      <p className="text-gray-500 text-xs">{selectedTier.multiplier}x multiplier &middot; {selectedTier.lock_days} day lock</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTier(null)}
                    className="p-2 rounded-lg hover:bg-dark-600 text-gray-400 hover:text-white transition-colors"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="px-6 pb-8 pt-2 space-y-4">
                {/* Amount input */}
                <div>
                  <label className="text-gray-400 text-sm mb-1.5 block">Amount (Z)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Min ${parseFloat(selectedTier.min_amount).toLocaleString()} Z`}
                    className="w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-500 text-white placeholder-gray-500 focus:outline-none focus:border-accent text-lg"
                    autoFocus
                  />
                </div>

                {/* Quick amounts */}
                <div className="flex flex-wrap gap-2">
                  {quickAmounts.map(qa => (
                    <button
                      key={qa}
                      onClick={() => setAmount(String(qa))}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        amount === String(qa)
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-dark-700 border-dark-500 text-gray-300 hover:border-accent hover:text-white'
                      }`}
                    >
                      {qa.toLocaleString()} Z
                    </button>
                  ))}
                </div>

                {/* Growth breakdown */}
                {projectedDaily && (
                  <div className="p-4 rounded-lg bg-gradient-to-br from-dark-700/80 to-dark-700/40 border border-dark-600 space-y-4">
                    {/* Summary message */}
                    <div className="p-3 rounded-lg bg-accent/5 border border-accent/15">
                      <p className="text-sm text-gray-300 leading-relaxed">
                        Invest <span className="text-white font-bold">{projectedDaily.investAmount.toLocaleString()} Z</span> in
                        the <span className="text-accent font-semibold">{selectedTier.name}</span> tier.
                        Your money is locked for <span className="text-white font-semibold">{projectedDaily.lockDays} day{projectedDaily.lockDays !== 1 ? 's' : ''}</span> and
                        earns ~<span className="text-green-400 font-bold">{projectedDaily.daily.toFixed(2)} Z</span>/day at
                        {selectedTier.daily_rate != null ? ' a ' : ' the current '}{(projectedDaily.rate * 100).toFixed(3)}% daily rate.
                        After {projectedDaily.lockDays} day{projectedDaily.lockDays !== 1 ? 's' : ''} you'll
                        have ~<span className="text-green-400 font-bold">{projectedDaily.maturityValue.toFixed(2)} Z</span> ({projectedDaily.totalLockReturn.toFixed(2)} Z earned).
                      </p>
                    </div>

                    {/* Numbers grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-dark-800/60">
                        <p className="text-[11px] text-gray-500 mb-1">Daily Earnings</p>
                        <p className="text-green-400 font-bold text-lg">{projectedDaily.daily.toFixed(2)} Z</p>
                        <p className="text-[10px] text-gray-600">{(projectedDaily.rate * 100).toFixed(3)}% rate</p>
                      </div>
                      <div className="p-3 rounded-lg bg-dark-800/60">
                        <p className="text-[11px] text-gray-500 mb-1">At Maturity ({projectedDaily.lockDays}d)</p>
                        <p className="text-accent font-bold text-lg">{projectedDaily.maturityValue.toFixed(2)} Z</p>
                        <p className="text-[10px] text-gray-600">+{projectedDaily.totalLockReturn.toFixed(2)} Z profit</p>
                      </div>
                      <div className="p-3 rounded-lg bg-dark-800/60">
                        <p className="text-[11px] text-gray-500 mb-1">Est. 30 Days</p>
                        <p className="text-green-400 font-bold text-lg">{projectedDaily.monthly.toFixed(2)} Z</p>
                        <p className="text-[10px] text-gray-600">if rate holds</p>
                      </div>
                      <div className="p-3 rounded-lg bg-dark-800/60">
                        <p className="text-[11px] text-gray-500 mb-1">{selectedTier.daily_rate != null ? 'Daily Rate' : 'Multiplier'}</p>
                        <p className="text-white font-bold text-lg">
                          {selectedTier.daily_rate != null ? `${(parseFloat(selectedTier.daily_rate) * 100).toFixed(2)}%` : `${selectedTier.multiplier}x`}
                        </p>
                        <p className="text-[10px] text-gray-600">{selectedTier.daily_rate != null ? 'fixed daily' : 'base rate boost'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tier details summary */}
                <div className="p-3 rounded-lg bg-dark-700/30 border border-dark-600/50 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Lock Period</span>
                    <span className="text-white font-medium">{selectedTier.lock_days} day{parseInt(selectedTier.lock_days) !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Range</span>
                    <span className="text-white font-medium">{parseFloat(selectedTier.min_amount).toLocaleString()} - {parseFloat(selectedTier.max_amount).toLocaleString()} Z</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Early Withdraw</span>
                    <span className="text-orange-400 font-medium">10% penalty</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Currency</span>
                    <span className="text-accent font-medium">{selectedCurrency.code}</span>
                  </div>
                </div>

                {/* Invest button */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleInvest}
                  disabled={investing || !amount || parseFloat(amount) <= 0}
                  className="w-full py-3.5 rounded-lg bg-accent text-dark-900 font-bold text-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {investing ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                      Investing...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <FiTrendingUp className="w-5 h-5" />
                      Invest {amount ? `${parseFloat(amount).toLocaleString()} Z` : 'Now'}
                    </span>
                  )}
                </motion.button>

                <p className="text-gray-500 text-xs text-center">
                  Your balance: {parseFloat(user?.balance || 0).toLocaleString()} Z
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Active Investments */}
      {portfolio.filter(p => p.status === 'active' || p.status === 'matured').length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Active Investments</h2>
          <div className="space-y-3">
            {portfolio
              .filter(p => p.status === 'active' || p.status === 'matured')
              .map((inv, i) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl bg-dark-800 border border-dark-600 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      inv.status === 'matured'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-accent/10 text-accent'
                    }`}>
                      {inv.tierName} ({inv.multiplier}x)
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      inv.status === 'matured'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {inv.status === 'matured' ? 'Matured' : 'Active'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleWithdraw(inv.id)}
                    disabled={withdrawing === inv.id}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                      inv.status === 'matured'
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                    }`}
                  >
                    {withdrawing === inv.id ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : inv.status === 'matured' ? (
                      'Withdraw'
                    ) : (
                      <span className="flex items-center gap-1">
                        <FiAlertTriangle className="w-3 h-3" />
                        Withdraw Early
                      </span>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Invested</p>
                    <p className="text-white font-bold">{inv.amount.toLocaleString()} Z</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Current Value</p>
                    <p className="text-green-400 font-bold">{inv.currentValue.toLocaleString()} Z</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Returns</p>
                    <p className="text-accent font-bold">+{inv.totalReturns.toLocaleString()} Z</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="relative">
                  <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${inv.progress}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`h-full rounded-full ${
                        inv.status === 'matured' ? 'bg-green-400' : 'bg-accent'
                      }`}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-500">
                      {inv.status === 'matured' ? 'Completed' : `${inv.daysRemaining}d remaining`}
                    </span>
                    <span className="text-xs text-gray-500">{inv.progress}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Withdrawn investments */}
      {portfolio.filter(p => p.status === 'withdrawn').length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Past Investments</h2>
          <div className="space-y-2">
            {portfolio.filter(p => p.status === 'withdrawn').slice(0, 5).map((inv) => (
              <div key={inv.id} className="rounded-lg bg-dark-800/50 border border-dark-600 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/10 text-gray-400">{inv.tierName}</span>
                  <span className="text-white font-medium">{inv.amount.toLocaleString()} Z</span>
                </div>
                <div className="text-right">
                  <span className="text-green-400 font-medium">+{inv.totalReturns.toLocaleString()} Z</span>
                  <p className="text-xs text-gray-500">Withdrawn</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Returns History */}
      {returns.length > 0 && (
        <div className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden">
          <button
            onClick={() => setShowReturns(!showReturns)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-dark-700 transition-colors"
          >
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FiDollarSign className="text-accent" />
              Recent Returns ({returns.length})
            </h3>
            {showReturns ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
          </button>

          <AnimatePresence>
            {showReturns && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="divide-y divide-dark-600">
                  {returns.map((ret) => (
                    <div key={ret.id} className="px-4 py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="text-white">{ret.tier_name}</span>
                        <span className="text-gray-500 ml-2">
                          {new Date(ret.metric_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-green-400 font-medium">+{parseFloat(ret.return_amount).toFixed(2)} Z</span>
                        <span className="text-gray-500 ml-2 text-xs">
                          ({(parseFloat(ret.effective_rate) * 100).toFixed(3)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {portfolio.length === 0 && (
        <div className="text-center py-8">
          <FiTrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No investments yet</p>
          <p className="text-gray-500 text-sm">Select a tier above to start investing</p>
        </div>
      )}
    </div>
  );
}

export default Invest;
