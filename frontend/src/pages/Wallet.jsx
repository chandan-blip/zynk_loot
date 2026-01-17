import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  FiPlus,
  FiCreditCard,
  FiDollarSign,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiTrash2,
  FiStar,
  FiCheck,
  FiClock,
  FiX,
  FiSend,
  FiTrendingUp,
  FiAward,
  FiDownload,
  FiSearch,
  FiChevronLeft,
  FiChevronRight,
  FiUser,
  FiGift,
  FiTarget,
  FiZap,
  FiUsers,
  FiCalendar,
  FiArrowUp,
  FiArrowDown
} from 'react-icons/fi';
import { SiBitcoin, SiEthereum } from 'react-icons/si';
import { BsBank2, BsTrophy, BsLightning, BsStars } from 'react-icons/bs';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import useStore from '../store/useStore';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatAmount } from '../utils/formatAmount';
import {
  getWalletBalance,
  getPaymentMethods,
  addUpiMethod,
  addCryptoMethod,
  addBankMethod,
  setPrimaryPaymentMethod,
  deletePaymentMethod,
  getZynkPackages,
  buyZynkPackage,
  completePurchase,
  getWithdrawals,
  requestWithdrawal,
  getTransactions,
  searchUsers,
  transferZynk,
  getTransferHistory,
  getUserOrders
} from '../services/api';

const CRYPTO_TYPES = [
  { value: 'BTC', label: 'Bitcoin (BTC)', icon: SiBitcoin },
  { value: 'ETH', label: 'Ethereum (ETH)', icon: SiEthereum },
  { value: 'USDT', label: 'Tether (USDT)', icon: FiDollarSign },
  { value: 'BNB', label: 'BNB', icon: FiDollarSign },
  { value: 'SOL', label: 'Solana (SOL)', icon: FiDollarSign },
  { value: 'OTHER', label: 'Other', icon: FiDollarSign },
];

const TIER_THRESHOLDS = [
  { name: 'Bronze', min: 0, max: 999, bonus: 0, color: '#CD7F32', icon: '🥉' },
  { name: 'Silver', min: 1000, max: 4999, bonus: 2, color: '#C0C0C0', icon: '🥈' },
  { name: 'Gold', min: 5000, max: 19999, bonus: 5, color: '#FFD700', icon: '🥇' },
  { name: 'Platinum', min: 20000, max: 49999, bonus: 10, color: '#E5E4E2', icon: '💎' },
  { name: 'Diamond', min: 50000, max: Infinity, bonus: 15, color: '#B9F2FF', icon: '👑' },
];

const ACHIEVEMENTS = [
  { id: 'first_deposit', name: 'First Steps', description: 'Make your first deposit', icon: FiArrowDownCircle, category: 'wallet' },
  { id: 'first_win', name: 'Lucky Start', description: 'Win your first lottery prize', icon: BsTrophy, category: 'lottery' },
  { id: 'high_roller', name: 'High Roller', description: 'Spend 10,000 ZYNK total', icon: FiZap, category: 'spending', threshold: 10000 },
  { id: 'big_spender', name: 'Big Spender', description: 'Spend 50,000 ZYNK total', icon: BsStars, category: 'spending', threshold: 50000 },
  { id: 'lucky_streak', name: 'Lucky Streak', description: 'Win 3 times in a row', icon: BsLightning, category: 'lottery' },
  { id: 'social_butterfly', name: 'Social Butterfly', description: 'Transfer to 5 different users', icon: FiUsers, category: 'transfer', threshold: 5 },
  { id: 'generous', name: 'Generous Soul', description: 'Transfer 1,000 ZYNK to others', icon: FiGift, category: 'transfer', threshold: 1000 },
  { id: 'collector', name: 'Number Collector', description: 'Own 10 numbers at once', icon: FiTarget, category: 'lottery', threshold: 10 },
];

const CHART_COLORS = ['#00D4AA', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

function Wallet() {
  const navigate = useNavigate();
  const { updateBalance } = useStore();
  const { zynkToUsd, selectedCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState('buy');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState({ balance: 0, totalSpent: 0, totalEarned: 0 });
  const [packages, setPackages] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);

  // Modal states
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentType, setPaymentType] = useState('upi');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [showTransactionDetail, setShowTransactionDetail] = useState(null);

  // Form states
  const [upiForm, setUpiForm] = useState({ upi_id: '', label: '' });
  const [cryptoForm, setCryptoForm] = useState({ wallet_address: '', wallet_type: 'BTC', label: '' });
  const [bankForm, setBankForm] = useState({
    bank_name: '', account_number: '', ifsc_code: '', account_holder: '', label: ''
  });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', payment_method_id: '' });

  // Transfer states
  const [transferForm, setTransferForm] = useState({ recipient: '', amount: '', note: '' });
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [transferFilter, setTransferFilter] = useState('all');

  // Analytics states
  const [analyticsRange, setAnalyticsRange] = useState('30');

  // History filter states
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;

  // Rewards states
  const [unlockedAchievements, setUnlockedAchievements] = useState([]);

  const [processingPackage, setProcessingPackage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
    loadAchievements();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balanceRes, packagesRes, methodsRes, withdrawalsRes, transactionsRes, ordersRes] = await Promise.all([
        getWalletBalance(),
        getZynkPackages(),
        getPaymentMethods(),
        getWithdrawals(),
        getTransactions(),
        getUserOrders()
      ]);

      setBalance(balanceRes.data.data);
      setPackages(packagesRes.data.data);
      setPaymentMethods(methodsRes.data.data);
      setWithdrawals(withdrawalsRes.data.data.withdrawals);
      setTransactions(transactionsRes.data.data.transactions);
      setOrders(ordersRes.data.data.orders || []);

      // Try to load transfers
      try {
        const transfersRes = await getTransferHistory();
        setTransfers(transfersRes.data.data.transfers || []);
      } catch {
        // API may not exist yet, use mock data
        setTransfers([]);
      }
    } catch (error) {
      toast.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const loadAchievements = () => {
    const saved = localStorage.getItem('achievements');
    if (saved) {
      setUnlockedAchievements(JSON.parse(saved));
    }
  };

  const saveAchievement = (achievementId) => {
    const updated = [...unlockedAchievements, achievementId];
    setUnlockedAchievements(updated);
    localStorage.setItem('achievements', JSON.stringify(updated));
  };

  // Compute analytics from transactions
  const analytics = useMemo(() => {
    const days = parseInt(analyticsRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const filtered = transactions.filter(t => new Date(t.created_at) >= cutoff);

    // Daily spending trends
    const dailyData = {};
    filtered.forEach(t => {
      const date = new Date(t.created_at).toLocaleDateString();
      if (!dailyData[date]) {
        dailyData[date] = { date, spent: 0, earned: 0 };
      }
      const amount = parseFloat(t.amount);
      if (['deposit', 'prize', 'sale', 'refund', 'transfer_in'].includes(t.type)) {
        dailyData[date].earned += amount;
      } else {
        dailyData[date].spent += amount;
      }
    });

    const spendingTrends = Object.values(dailyData).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    // Earnings breakdown
    const earningsBySource = {};
    filtered.forEach(t => {
      if (['deposit', 'prize', 'sale', 'refund', 'transfer_in'].includes(t.type)) {
        earningsBySource[t.type] = (earningsBySource[t.type] || 0) + parseFloat(t.amount);
      }
    });
    const earningsBreakdown = Object.entries(earningsBySource).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
      value
    }));

    // Transaction volume by type
    const volumeByType = {};
    filtered.forEach(t => {
      volumeByType[t.type] = (volumeByType[t.type] || 0) + 1;
    });
    const transactionVolume = Object.entries(volumeByType).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
      count
    }));

    // Quick stats
    const totalSpent = filtered.filter(t => !['deposit', 'prize', 'sale', 'refund', 'transfer_in'].includes(t.type))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalEarned = filtered.filter(t => ['deposit', 'prize', 'sale', 'refund', 'transfer_in'].includes(t.type))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const prizeCount = filtered.filter(t => t.type === 'prize').length;
    const avgTransaction = filtered.length > 0
      ? filtered.reduce((sum, t) => sum + parseFloat(t.amount), 0) / filtered.length
      : 0;

    return {
      spendingTrends,
      earningsBreakdown,
      transactionVolume,
      stats: {
        netProfitLoss: totalEarned - totalSpent,
        winCount: prizeCount,
        avgTransaction,
        totalTransactions: filtered.length
      }
    };
  }, [transactions, analyticsRange]);

  // Compute current tier
  const currentTier = useMemo(() => {
    const spent = balance.totalSpent || 0;
    return TIER_THRESHOLDS.find(t => spent >= t.min && spent <= t.max) || TIER_THRESHOLDS[0];
  }, [balance.totalSpent]);

  const nextTier = useMemo(() => {
    const idx = TIER_THRESHOLDS.findIndex(t => t.name === currentTier.name);
    return idx < TIER_THRESHOLDS.length - 1 ? TIER_THRESHOLDS[idx + 1] : null;
  }, [currentTier]);

  const tierProgress = useMemo(() => {
    if (!nextTier) return 100;
    const spent = balance.totalSpent || 0;
    const range = nextTier.min - currentTier.min;
    const progress = spent - currentTier.min;
    return Math.min(100, (progress / range) * 100);
  }, [balance.totalSpent, currentTier, nextTier]);

  // Filter history
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Filter by type
    if (historyFilter !== 'all') {
      result = result.filter(t => t.type === historyFilter);
    }

    // Filter by search
    if (historySearch) {
      const search = historySearch.toLowerCase();
      result = result.filter(t =>
        t.description?.toLowerCase().includes(search) ||
        t.type.toLowerCase().includes(search)
      );
    }

    // Sort by date (newest first)
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return result;
  }, [transactions, historyFilter, historySearch]);

  const paginatedTransactions = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredTransactions.slice(start, start + historyPageSize);
  }, [filteredTransactions, historyPage, historyPageSize]);

  const totalHistoryPages = Math.ceil(filteredTransactions.length / historyPageSize);

  // Filtered transfers
  const filteredTransfers = useMemo(() => {
    if (transferFilter === 'all') return transfers;
    return transfers.filter(t => t.direction === transferFilter);
  }, [transfers, transferFilter]);

  const handleBuyPackage = (pkg) => {
    // Navigate to checkout page with package ID
    navigate(`/checkout?package=${pkg.id}`);
  };

  const handleAddUpi = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addUpiMethod(upiForm.upi_id, upiForm.label);
      toast.success('UPI added successfully');
      setUpiForm({ upi_id: '', label: '' });
      setShowAddPayment(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add UPI');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCrypto = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addCryptoMethod(cryptoForm.wallet_address, cryptoForm.wallet_type, cryptoForm.label);
      toast.success('Crypto wallet added successfully');
      setCryptoForm({ wallet_address: '', wallet_type: 'BTC', label: '' });
      setShowAddPayment(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add crypto wallet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddBank = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addBankMethod(bankForm);
      toast.success('Bank account added successfully');
      setBankForm({ bank_name: '', account_number: '', ifsc_code: '', account_holder: '', label: '' });
      setShowAddPayment(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add bank account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPrimary = async (id) => {
    try {
      await setPrimaryPaymentMethod(id);
      toast.success('Primary method updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update primary method');
    }
  };

  const handleDeleteMethod = async (id) => {
    if (!confirm('Are you sure you want to delete this payment method?')) return;
    try {
      await deletePaymentMethod(id);
      toast.success('Payment method deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete');
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawForm.payment_method_id) {
      toast.error('Please select a payment method');
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestWithdrawal(parseFloat(withdrawForm.amount), parseInt(withdrawForm.payment_method_id));
      toast.success('Withdrawal request submitted!');
      updateBalance(res.data.data.newBalance);
      setBalance(prev => ({ ...prev, balance: res.data.data.newBalance }));
      setWithdrawForm({ amount: '', payment_method_id: '' });
      setShowWithdrawModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Withdrawal failed');
    } finally {
      setSubmitting(false);
    }
  };

  // User search for transfers
  const handleUserSearch = async (query) => {
    setTransferForm({ ...transferForm, recipient: query });
    setSelectedRecipient(null);

    if (query.length < 2) {
      setUserSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const res = await searchUsers(query);
      setUserSearchResults(res.data.data.users || []);
    } catch {
      // Mock some users if API doesn't exist
      setUserSearchResults([
        { id: 1, username: 'demo_user', email: 'demo@example.com' },
        { id: 2, username: 'test_user', email: 'test@example.com' },
      ].filter(u => u.username.includes(query) || u.email.includes(query)));
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSelectRecipient = (user) => {
    setSelectedRecipient(user);
    setTransferForm({ ...transferForm, recipient: user.username });
    setUserSearchResults([]);
  };

  const handleTransferSubmit = (e) => {
    e.preventDefault();
    if (!selectedRecipient) {
      toast.error('Please select a valid recipient');
      return;
    }
    if (parseFloat(transferForm.amount) > balance.balance) {
      toast.error('Insufficient balance');
      return;
    }
    setShowTransferConfirm(true);
  };

  const handleConfirmTransfer = async () => {
    setSubmitting(true);
    try {
      await transferZynk(selectedRecipient.id, parseFloat(transferForm.amount), transferForm.note);
      toast.success(`Successfully transferred ${transferForm.amount} ZYNK to ${selectedRecipient.username}!`);
      setTransferForm({ recipient: '', amount: '', note: '' });
      setSelectedRecipient(null);
      setShowTransferConfirm(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Amount', 'Description', 'Balance After'];
    const rows = filteredTransactions.map(t => [
      new Date(t.created_at).toLocaleString(),
      t.type,
      t.amount,
      t.description || '',
      t.balance_after || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      awaiting_approval: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      approved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      refunded: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };
    const icons = {
      pending: FiClock,
      awaiting_approval: FiClock,
      approved: FiCheck,
      completed: FiCheck,
      rejected: FiX,
      failed: FiX,
      refunded: FiArrowDownCircle,
    };
    const labels = {
      pending: 'Pending',
      awaiting_approval: 'Awaiting Approval',
      approved: 'Approved',
      completed: 'Completed',
      rejected: 'Rejected',
      failed: 'Failed',
      refunded: 'Refunded',
    };
    const Icon = icons[status] || FiClock;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${styles[status] || styles.pending}`}>
        <Icon className="w-3 h-3" />
        {labels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  const getPaymentIcon = (type) => {
    switch (type) {
      case 'upi': return <FiCreditCard className="w-5 h-5" />;
      case 'crypto': return <SiBitcoin className="w-5 h-5" />;
      case 'bank': return <BsBank2 className="w-5 h-5" />;
      default: return <FiCreditCard className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/20 via-dark-700 to-dark-800 border border-accent/20 p-6"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-1">
            <p className="text-gray-400 text-sm">Your Balance</p>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: currentTier.color + '30', color: currentTier.color }}>
              {currentTier.icon} {currentTier.name}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold text-white">{balance.balance.toLocaleString()}</span>
            <span className="text-accent font-semibold">ZYNK</span>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-gray-500">Total Spent</p>
              <p className="text-white font-medium">{balance.totalSpent.toLocaleString()} Z</p>
            </div>
            <div>
              <p className="text-gray-500">Total Earned</p>
              <p className="text-green-400 font-medium">{balance.totalEarned.toLocaleString()} Z</p>
            </div>
          </div>
        </div>
        <div className="mt-4 bottom-4 right-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('buy')}
            className="px-4 py-2 shrink-0 rounded-lg bg-dark-600 hover:bg-dark-500 text-white text-sm transition-colors border border-dark-500"
          >
            Buy Zynk
          </button>
          <button
            onClick={() => setShowWithdrawModal(true)}
            className="px-4 py-2 shrink-0 rounded-lg bg-dark-600 hover:bg-dark-500 text-white text-sm transition-colors border border-dark-500"
          >
            Withdraw
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-dark-700 rounded-lg overflow-x-auto snap-x scroll-smooth">
        {[
          { id: 'buy', label: 'Buy Zynk', icon: FiPlus },
          { id: 'deposits', label: 'Deposits', icon: FiDownload },
          { id: 'methods', label: 'Methods', icon: FiCreditCard },
          { id: 'transfer', label: 'Transfer', icon: FiSend },
          { id: 'analytics', label: 'Analytics', icon: FiTrendingUp },
          { id: 'rewards', label: 'Rewards', icon: FiAward },
          { id: 'history', label: 'History', icon: FiClock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 snap-center px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-accent text-dark-900'
                : 'text-gray-400 hover:text-white hover:bg-dark-600'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* Buy Tab */}
        {activeTab === 'buy' && (
          <motion.div
            key="buy"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {packages.map((pkg) => (
              <motion.div
                key={pkg.id}
                whileHover={{ scale: 1.02 }}
                className={`relative p-5 rounded-xl border transition-all ${
                  pkg.bonus_percent > 0
                    ? 'bg-gradient-to-br from-accent/10 to-dark-700 border-accent/30'
                    : 'bg-dark-700 border-dark-600'
                }`}
              >
                {pkg.bonus_percent > 0 && (
                  <div className="absolute -top-2 -right-2 px-2 py-1 bg-accent text-dark-900 text-xs font-bold rounded-full">
                    +{pkg.bonus_percent}% BONUS
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white mb-1">{pkg.name}</h3>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-bold text-accent">{pkg.zynk_amount.toLocaleString()}</span>
                  <span className="text-gray-400 text-sm">ZYNK</span>
                </div>
                {pkg.bonus_percent > 0 && (
                  <p className="text-xs text-green-400 mb-3">
                    Get {Math.floor(pkg.zynk_amount * pkg.bonus_percent / 100)} extra Zynk!
                  </p>
                )}
                <div className="text-sm mb-4">
                  <p className="text-white font-medium">${(pkg.zynk_amount * zynkToUsd).toFixed(2)}</p>
                  {selectedCurrency && selectedCurrency.code !== 'ZYNK' && selectedCurrency.code !== 'USD' && (
                    <p className="text-gray-500 text-xs">{formatAmount(pkg.zynk_amount, selectedCurrency)}</p>
                  )}
                </div>
                <button
                  onClick={() => handleBuyPackage(pkg)}
                  disabled={processingPackage === pkg.id}
                  className="w-full py-2 rounded-lg bg-accent hover:bg-accent-600 text-dark-900 font-medium transition-colors disabled:opacity-50"
                >
                  {processingPackage === pkg.id ? 'Processing...' : 'Buy Now'}
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Deposits Tab */}
        {activeTab === 'deposits' && (
          <motion.div
            key="deposits"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Deposit History</h3>
                <span className="text-sm text-gray-400">{orders.length} orders</span>
              </div>
              {orders.length === 0 ? (
                <div className="text-center py-8">
                  <FiDownload className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No deposits yet</p>
                  <p className="text-gray-500 text-sm mt-1">Buy Zynk to see your deposit history here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-4 bg-dark-800 rounded-lg hover:bg-dark-600/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                          <FiArrowDownCircle className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">
                            {(order.zynk_amount + (order.bonus_amount || 0)).toLocaleString()} ZYNK
                          </p>
                          <p className="text-sm text-gray-500">
                            {order.payment_method?.replace('_', ' ').toUpperCase()} • ${parseFloat(order.price).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(order.status)}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Methods Tab */}
        {activeTab === 'methods' && (
          <motion.div
            key="methods"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Your Payment Methods</h3>
              <button
                onClick={() => setShowAddPayment(true)}
                className="bg-dark-800 rounded-lg flex items-center justify-center px-4 py-2 text-sm"
              >
                <FiPlus className="w-4 h-4 mr-1" /> Add New
              </button>
            </div>

            {paymentMethods.length === 0 ? (
              <div className="text-center py-12 bg-dark-700 rounded-xl border border-dark-600">
                <FiCreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No payment methods added yet</p>
                <button
                  onClick={() => setShowAddPayment(true)}
                  className="mt-4 text-accent hover:underline"
                >
                  Add your first payment method
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      method.is_primary
                        ? 'bg-accent/10 border-accent/30'
                        : 'bg-dark-700 border-dark-600'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        method.type === 'upi' ? 'bg-purple-500/20 text-purple-400' :
                        method.type === 'crypto' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {getPaymentIcon(method.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{method.label}</p>
                          {method.is_primary && (
                            <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full">Primary</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">
                          {method.type === 'upi' && method.upi_id}
                          {method.type === 'crypto' && `${method.wallet_type} - ${method.wallet_address.slice(0, 10)}...${method.wallet_address.slice(-6)}`}
                          {method.type === 'bank' && `${method.bank_name} - ****${method.account_number.slice(-4)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!method.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(method.id)}
                          className="p-2 text-gray-400 hover:text-accent rounded-lg hover:bg-dark-600 transition-colors"
                          title="Set as primary"
                        >
                          <FiStar className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteMethod(method.id)}
                        className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-dark-600 transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Transfer Tab */}
        {activeTab === 'transfer' && (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid lg:grid-cols-2 gap-6"
          >
            {/* Transfer Form */}
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FiSend className="w-5 h-5 text-accent" />
                Send ZYNK
              </h3>
              <form onSubmit={handleTransferSubmit} className="space-y-4">
                <div className="relative">
                  <label className="block text-sm text-gray-400 mb-1">Recipient</label>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={transferForm.recipient}
                      onChange={(e) => handleUserSearch(e.target.value)}
                      placeholder="Search by username or email"
                      className="input-premium w-full pl-10"
                      required
                    />
                  </div>
                  {userSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {userSearchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleSelectRecipient(u)}
                          className="w-full px-4 py-2 flex items-center gap-3 hover:bg-dark-700 text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                            <FiUser className="w-4 h-4 text-accent" />
                          </div>
                          <div>
                            <p className="text-white text-sm">{u.username}</p>
                            <p className="text-gray-500 text-xs">{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedRecipient && (
                    <div className="mt-2 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FiCheck className="text-accent" />
                        <span className="text-sm text-white">{selectedRecipient.username}</span>
                      </div>
                      <button type="button" onClick={() => { setSelectedRecipient(null); setTransferForm({ ...transferForm, recipient: '' }); }}>
                        <FiX className="text-gray-400 hover:text-white" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Amount</label>
                  <input
                    type="number"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    placeholder="100"
                    min="1"
                    max={balance.balance}
                    className="input-premium w-full"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Available: {balance.balance.toLocaleString()} ZYNK</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Note (optional)</label>
                  <input
                    type="text"
                    value={transferForm.note}
                    onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                    placeholder="Thanks for the help!"
                    className="input-premium w-full"
                    maxLength={100}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!selectedRecipient || !transferForm.amount}
                  className="btn-premium w-full py-3 flex items-center justify-center"
                >
                  <FiSend className="w-4 h-4 mr-2" />
                  Send ZYNK
                </button>
              </form>
            </div>

            {/* Transfer History */}
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Transfer History</h3>
                <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
                  {['all', 'sent', 'received'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setTransferFilter(f)}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${
                        transferFilter === f ? 'bg-accent text-dark-900' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTransfers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FiSend className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No transfers yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredTransfers.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          t.direction === 'sent' ? 'bg-red-500/20' : 'bg-green-500/20'
                        }`}>
                          {t.direction === 'sent'
                            ? <FiArrowUp className="w-4 h-4 text-red-400" />
                            : <FiArrowDown className="w-4 h-4 text-green-400" />
                          }
                        </div>
                        <div>
                          <p className="text-sm text-white">
                            {t.direction === 'sent' ? `To ${t.recipient}` : `From ${t.sender}`}
                          </p>
                          {t.note && <p className="text-xs text-gray-500">{t.note}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${t.direction === 'sent' ? 'text-red-400' : 'text-green-400'}`}>
                          {t.direction === 'sent' ? '-' : '+'}{t.amount} Z
                        </p>
                        <p className="text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Date Range Selector */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Wallet Analytics</h3>
              <div className="flex gap-1 bg-dark-700 rounded-lg p-1">
                {[
                  { value: '7', label: '7 Days' },
                  { value: '30', label: '30 Days' },
                  { value: '90', label: '90 Days' },
                  { value: '365', label: 'All Time' },
                ].map((range) => (
                  <button
                    key={range.value}
                    onClick={() => setAnalyticsRange(range.value)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      analyticsRange === range.value ? 'bg-accent text-dark-900' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
                <p className="text-gray-400 text-sm mb-1">Net Profit/Loss</p>
                <p className={`text-2xl font-bold ${analytics.stats.netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {analytics.stats.netProfitLoss >= 0 ? '+' : ''}{analytics.stats.netProfitLoss.toLocaleString()} Z
                </p>
              </div>
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
                <p className="text-gray-400 text-sm mb-1">Wins</p>
                <p className="text-2xl font-bold text-white">{analytics.stats.winCount}</p>
              </div>
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
                <p className="text-gray-400 text-sm mb-1">Avg Transaction</p>
                <p className="text-2xl font-bold text-white">{analytics.stats.avgTransaction.toFixed(0)} Z</p>
              </div>
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
                <p className="text-gray-400 text-sm mb-1">Total Transactions</p>
                <p className="text-2xl font-bold text-white">{analytics.stats.totalTransactions}</p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Spending Trends */}
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
                <h4 className="text-white font-medium mb-4">Spending vs Earnings</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.spendingTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="earned" stroke="#10B981" fill="#10B981" fillOpacity={0.3} name="Earned" />
                      <Area type="monotone" dataKey="spent" stroke="#EF4444" fill="#EF4444" fillOpacity={0.3} name="Spent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Earnings Breakdown */}
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
                <h4 className="text-white font-medium mb-4">Earnings by Source</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.earningsBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {analytics.earningsBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                        formatter={(value) => `${value.toLocaleString()} Z`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transaction Volume */}
              <div className="bg-dark-700 rounded-xl border border-dark-600 p-4 lg:col-span-2">
                <h4 className="text-white font-medium mb-4">Transaction Volume by Type</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.transactionVolume}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="count" fill="#00D4AA" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Rewards Tab */}
        {activeTab === 'rewards' && (
          <motion.div
            key="rewards"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Tier Progress */}
            <div className="bg-gradient-to-br from-dark-700 to-dark-800 rounded-xl border border-dark-600 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{currentTier.icon}</span>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: currentTier.color }}>{currentTier.name} Tier</h3>
                    <p className="text-gray-400 text-sm">
                      {currentTier.bonus > 0 ? `${currentTier.bonus}% bonus on all earnings` : 'Earn bonuses by leveling up!'}
                    </p>
                  </div>
                </div>
                {nextTier && (
                  <div className="text-right">
                    <p className="text-gray-400 text-sm">Next: {nextTier.name}</p>
                    <p className="text-white font-medium">{(nextTier.min - balance.totalSpent).toLocaleString()} Z to go</p>
                  </div>
                )}
              </div>

              {nextTier && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{balance.totalSpent.toLocaleString()} / {nextTier.min.toLocaleString()} Z spent</span>
                    <span className="text-accent">{tierProgress.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 bg-dark-600 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${tierProgress}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: currentTier.color }}
                    />
                  </div>
                </div>
              )}

              {/* Tier Benefits */}
              <div className="mt-6 pt-4 border-t border-dark-600">
                <h4 className="text-white font-medium mb-3">All Tier Benefits</h4>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {TIER_THRESHOLDS.map((tier) => (
                    <div
                      key={tier.name}
                      className={`p-3 rounded-lg border ${
                        tier.name === currentTier.name
                          ? 'border-accent bg-accent/10'
                          : balance.totalSpent >= tier.min
                            ? 'border-green-500/30 bg-green-500/10'
                            : 'border-dark-500 bg-dark-800 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{tier.icon}</span>
                        <span className="text-sm font-medium" style={{ color: tier.color }}>{tier.name}</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {tier.bonus > 0 ? `+${tier.bonus}% bonus` : 'No bonus'}
                      </p>
                      <p className="text-xs text-gray-500">{tier.min.toLocaleString()}+ Z</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Achievements */}
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FiAward className="text-accent" />
                Achievements
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {ACHIEVEMENTS.map((achievement) => {
                  const isUnlocked = unlockedAchievements.includes(achievement.id);
                  const Icon = achievement.icon;

                  // Calculate progress for threshold achievements
                  let progress = 0;
                  if (achievement.threshold) {
                    if (achievement.category === 'spending') {
                      progress = Math.min(100, (balance.totalSpent / achievement.threshold) * 100);
                    }
                  }

                  return (
                    <div
                      key={achievement.id}
                      className={`relative p-4 rounded-xl border transition-all ${
                        isUnlocked
                          ? 'bg-accent/10 border-accent/30'
                          : 'bg-dark-800 border-dark-600 opacity-60'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                        isUnlocked ? 'bg-accent/20 text-accent' : 'bg-dark-600 text-gray-500'
                      }`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <h4 className="text-white font-medium text-sm">{achievement.name}</h4>
                      <p className="text-gray-400 text-xs mt-1">{achievement.description}</p>

                      {!isUnlocked && achievement.threshold && progress > 0 && (
                        <div className="mt-2">
                          <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent/50 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{progress.toFixed(0)}%</p>
                        </div>
                      )}

                      {isUnlocked && (
                        <div className="absolute top-2 right-2">
                          <FiCheck className="w-5 h-5 text-accent" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* History Tab (Enhanced) */}
        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Filters */}
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <select
                    value={historyFilter}
                    onChange={(e) => { setHistoryFilter(e.target.value); setHistoryPage(1); }}
                    className="input-premium text-sm py-2 px-3"
                  >
                    <option value="all">All Types</option>
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                    <option value="purchase">Purchase</option>
                    <option value="sale">Sale</option>
                    <option value="prize">Prize</option>
                    <option value="transfer_in">Transfer In</option>
                    <option value="transfer_out">Transfer Out</option>
                    <option value="vote">Vote</option>
                    <option value="refund">Refund</option>
                  </select>
                  <div className="relative flex-1 max-w-xs">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                      placeholder="Search..."
                      className="input-premium w-full text-sm py-2 pl-9 pr-3"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{filteredTransactions.length} transactions</span>
                  {(historyFilter !== 'all' || historySearch) && (
                    <button
                      onClick={() => { setHistoryFilter('all'); setHistorySearch(''); setHistoryPage(1); }}
                      className="text-accent hover:text-accent-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-dark-700 rounded-xl border border-dark-600 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Description</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-dark-600 hover:bg-dark-600/50 cursor-pointer"
                          onClick={() => setShowTransactionDetail(t)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {new Date(t.created_at).toLocaleDateString()}
                            <span className="text-xs ml-1 text-gray-600">
                              {new Date(t.created_at).toLocaleTimeString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                              ['deposit', 'prize', 'sale', 'refund'].includes(t.type)
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-white max-w-xs truncate">
                            {t.description || '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${
                            ['deposit', 'prize', 'sale', 'refund'].includes(t.type) ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {['deposit', 'prize', 'sale', 'refund'].includes(t.type) ? '+' : '-'}
                            {parseFloat(t.amount).toLocaleString()} Z
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalHistoryPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-dark-600">
                  <span className="text-sm text-gray-400">
                    Showing {((historyPage - 1) * historyPageSize) + 1}-{Math.min(historyPage * historyPageSize, filteredTransactions.length)} of {filteredTransactions.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                      className="p-1 rounded hover:bg-dark-600 disabled:opacity-50"
                    >
                      <FiChevronLeft className="w-5 h-5 text-gray-400" />
                    </button>
                    <span className="text-sm text-white px-2">
                      {historyPage} / {totalHistoryPages}
                    </span>
                    <button
                      onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                      disabled={historyPage >= totalHistoryPages}
                      className="p-1 rounded hover:bg-dark-600 disabled:opacity-50"
                    >
                      <FiChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Withdrawals Section */}
            <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Withdrawal Requests</h3>
              {withdrawals.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No withdrawal requests yet</p>
              ) : (
                <div className="space-y-2">
                  {withdrawals.map((w) => (
                    <div key={w.id} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                          <FiArrowUpCircle className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm">{parseFloat(w.amount).toLocaleString()} ZYNK</p>
                          <p className="text-xs text-gray-500">{w.payment_label}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(w.status)}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(w.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Payment Method Modal */}
      <AnimatePresence>
        {showAddPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddPayment(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl border border-dark-600 p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-white">Add Payment Method</h3>
                <button
                  onClick={() => setShowAddPayment(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-dark-700"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-2 mb-6">
                {[
                  { id: 'upi', label: 'UPI', icon: FiCreditCard },
                  { id: 'crypto', label: 'Crypto', icon: SiBitcoin },
                  { id: 'bank', label: 'Bank', icon: BsBank2 },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setPaymentType(type.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                      paymentType === type.id
                        ? 'bg-accent text-dark-900'
                        : 'bg-dark-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </button>
                ))}
              </div>

              {paymentType === 'upi' && (
                <form onSubmit={handleAddUpi} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">UPI ID</label>
                    <input
                      type="text"
                      value={upiForm.upi_id}
                      onChange={(e) => setUpiForm({ ...upiForm, upi_id: e.target.value })}
                      placeholder="username@paytm"
                      className="input-premium w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Label (optional)</label>
                    <input
                      type="text"
                      value={upiForm.label}
                      onChange={(e) => setUpiForm({ ...upiForm, label: e.target.value })}
                      placeholder="My PayTM"
                      className="input-premium w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-premium w-full py-3"
                  >
                    {submitting ? 'Adding...' : 'Add UPI'}
                  </button>
                </form>
              )}

              {paymentType === 'crypto' && (
                <form onSubmit={handleAddCrypto} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Wallet Type</label>
                    <select
                      value={cryptoForm.wallet_type}
                      onChange={(e) => setCryptoForm({ ...cryptoForm, wallet_type: e.target.value })}
                      className="input-premium w-full"
                    >
                      {CRYPTO_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Wallet Address</label>
                    <input
                      type="text"
                      value={cryptoForm.wallet_address}
                      onChange={(e) => setCryptoForm({ ...cryptoForm, wallet_address: e.target.value })}
                      placeholder="0x..."
                      className="input-premium w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Label (optional)</label>
                    <input
                      type="text"
                      value={cryptoForm.label}
                      onChange={(e) => setCryptoForm({ ...cryptoForm, label: e.target.value })}
                      placeholder="My ETH Wallet"
                      className="input-premium w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-premium w-full py-3"
                  >
                    {submitting ? 'Adding...' : 'Add Wallet'}
                  </button>
                </form>
              )}

              {paymentType === 'bank' && (
                <form onSubmit={handleAddBank} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={bankForm.bank_name}
                      onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                      placeholder="HDFC Bank"
                      className="input-premium w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Account Holder Name</label>
                    <input
                      type="text"
                      value={bankForm.account_holder}
                      onChange={(e) => setBankForm({ ...bankForm, account_holder: e.target.value })}
                      placeholder="John Doe"
                      className="input-premium w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={bankForm.account_number}
                      onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                      placeholder="1234567890"
                      className="input-premium w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={bankForm.ifsc_code}
                      onChange={(e) => setBankForm({ ...bankForm, ifsc_code: e.target.value.toUpperCase() })}
                      placeholder="HDFC0001234"
                      className="input-premium w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Label (optional)</label>
                    <input
                      type="text"
                      value={bankForm.label}
                      onChange={(e) => setBankForm({ ...bankForm, label: e.target.value })}
                      placeholder="My Savings Account"
                      className="input-premium w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-premium w-full py-3"
                  >
                    {submitting ? 'Adding...' : 'Add Bank Account'}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowWithdrawModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl border border-dark-600 p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-white">Withdraw Zynk</h3>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-dark-700"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {paymentMethods.length === 0 ? (
                <div className="text-center py-8">
                  <FiCreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 mb-4">Add a payment method first</p>
                  <button
                    onClick={() => {
                      setShowWithdrawModal(false);
                      setShowAddPayment(true);
                    }}
                    className="btn-premium px-6 py-2"
                  >
                    Add Payment Method
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdraw} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Amount (min 10 ZYNK)</label>
                    <input
                      type="number"
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                      placeholder="100"
                      min="10"
                      max={balance.balance}
                      className="input-premium w-full"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Available: {balance.balance.toLocaleString()} ZYNK</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Payment Method</label>
                    <select
                      value={withdrawForm.payment_method_id}
                      onChange={(e) => setWithdrawForm({ ...withdrawForm, payment_method_id: e.target.value })}
                      className="input-premium w-full"
                      required
                    >
                      <option value="">Select payment method</option>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.label} ({method.type.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-400">
                      Withdrawals require admin approval and may take 24-48 hours to process.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !withdrawForm.amount || !withdrawForm.payment_method_id}
                    className="btn-premium w-full py-3"
                  >
                    {submitting ? 'Submitting...' : 'Request Withdrawal'}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer Confirmation Modal */}
      <AnimatePresence>
        {showTransferConfirm && selectedRecipient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTransferConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl border border-dark-600 p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiSend className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Confirm Transfer</h3>
                <p className="text-gray-400 mb-6">
                  Send <span className="text-accent font-bold">{transferForm.amount} ZYNK</span> to <span className="text-white font-medium">{selectedRecipient.username}</span>?
                </p>
                {transferForm.note && (
                  <p className="text-sm text-gray-500 mb-4 bg-dark-700 rounded-lg p-2">
                    Note: {transferForm.note}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowTransferConfirm(false)}
                    className="flex-1 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmTransfer}
                    disabled={submitting}
                    className="flex-1 btn-premium py-2"
                  >
                    {submitting ? 'Sending...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {showTransactionDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTransactionDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl border border-dark-600 p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-white">Transaction Details</h3>
                <button
                  onClick={() => setShowTransactionDetail(null)}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-dark-700"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span className={`font-medium ${
                    ['deposit', 'prize', 'sale', 'refund'].includes(showTransactionDetail.type)
                      ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {showTransactionDetail.type.charAt(0).toUpperCase() + showTransactionDetail.type.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount</span>
                  <span className={`font-bold ${
                    ['deposit', 'prize', 'sale', 'refund'].includes(showTransactionDetail.type)
                      ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {['deposit', 'prize', 'sale', 'refund'].includes(showTransactionDetail.type) ? '+' : '-'}
                    {parseFloat(showTransactionDetail.amount).toLocaleString()} Z
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Date</span>
                  <span className="text-white">{new Date(showTransactionDetail.created_at).toLocaleString()}</span>
                </div>
                {showTransactionDetail.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Description</span>
                    <span className="text-white text-right max-w-[200px]">{showTransactionDetail.description}</span>
                  </div>
                )}
                {showTransactionDetail.balance_after && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Balance After</span>
                    <span className="text-white">{parseFloat(showTransactionDetail.balance_after).toLocaleString()} Z</span>
                  </div>
                )}
                {showTransactionDetail.reference && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Reference</span>
                    <span className="text-white font-mono text-sm">{showTransactionDetail.reference}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Wallet;
