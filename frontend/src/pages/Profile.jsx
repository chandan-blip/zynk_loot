import { useState, useEffect } from "react";
import { copyToClipboard } from "../utils/clipboard";
import PageHeader from "../components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiCalendar,
  FiTrendingUp,
  FiTrendingDown,
  FiHash,
  FiDollarSign,
  FiActivity,
  FiChevronDown,
  FiCopy,
  FiCheck,
  FiGlobe,
  FiClock,
  FiArrowUpRight,
  FiArrowDownRight,
  FiSend,
  FiDownload,
  FiShield,
  FiStar,
  FiThumbsUp,
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiPodium } from "react-icons/gi";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import CountUp from "react-countup";
import { getUserProfile, getMyNumbers, getMyVotes, cashOutTicket } from "../services/api";
import socketService from "../services/socket";
import { useCurrency } from "../contexts/CurrencyContext";
import usePageTitle from "../hooks/usePageTitle";

function Profile() {
  usePageTitle('Profile');

  const {
    selectedCurrency,
    setSelectedCurrency,
    currencies,
    formatCurrency,
    formatCurrencyFull,
  } = useCurrency();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [myTickets, setMyTickets] = useState([]);
  const [myVotes, setMyVotes] = useState([]);
  const [cashingOut, setCashingOut] = useState(null);

  useEffect(() => {
    fetchProfile();
    fetchMyTickets();
    fetchMyVotes();

    // Subscribe to ticket updates
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsubTicketUpdate = socketService.onTicketUpdate?.((data) => {
      setMyTickets(prev => prev.map(t =>
        t.id === data.numberId ? {
          ...t,
          matchedDigits: data.matchedDigits,
          multiplier: data.multiplier,
          currentReturn: data.currentReturn,
          status: data.status
        } : t
      ));
    });

    const unsubCashedOut = socketService.onTicketCashedOut?.((data) => {
      setMyTickets(prev => prev.map(t =>
        t.id === data.numberId ? { ...t, status: 'cashed_out' } : t
      ));
      toast.success(`Cashed out ${data.number} for ${data.payout} Z!`);
    });

    // Listen for user's numbers update (after buying)
    const unsubUserNumbers = socketService.onUserNumbersUpdated?.((data) => {
      if (data.action === 'bought') {
        fetchMyTickets();
        fetchProfile(); // Also refresh balance
      }
    });

    // Listen for vote rewards
    const unsubVoteReward = socketService.onVoteReward?.((data) => {
      toast.success(`You earned ${data.reward} Z for predicting ${data.number}!`);
      fetchProfile(); // Refresh balance
      fetchMyVotes(); // Refresh votes
    });

    return () => {
      unsubTicketUpdate?.();
      unsubCashedOut?.();
      unsubUserNumbers?.();
      unsubVoteReward?.();
    };
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await getUserProfile();
      setProfile(response.data.data);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchMyTickets = async () => {
    try {
      const response = await getMyNumbers();
      setMyTickets(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch tickets:", error);
    }
  };

  const fetchMyVotes = async () => {
    try {
      const response = await getMyVotes();
      setMyVotes(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch votes:", error);
    }
  };

  const handleCashOut = async (ticketId, number) => {
    if (cashingOut) return;
    setCashingOut(ticketId);

    try {
      const response = await cashOutTicket(ticketId);
      if (response.data.success) {
        toast.success(`Cashed out ${number} for ${response.data.data.payout} Z!`);
        // Update local state
        setMyTickets(prev => prev.map(t =>
          t.id === ticketId ? { ...t, status: 'cashed_out' } : t
        ));
        // Refresh profile to update balance
        fetchProfile();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to cash out");
    } finally {
      setCashingOut(null);
    }
  };

  const copyUserId = () => {
    copyToClipboard(profile?.user?.id?.toString() || "");
    setCopiedId(true);
    toast.success("User ID copied!");
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case "deposit":
        return <FiDownload className="w-4 h-4 text-green-400" />;
      case "withdrawal":
        return <FiArrowUpRight className="w-4 h-4 text-red-400" />;
      case "transfer_out":
        return <FiSend className="w-4 h-4 text-orange-400" />;
      case "transfer_in":
        return <FiArrowDownRight className="w-4 h-4 text-blue-400" />;
      case "purchase":
        return <FiHash className="w-4 h-4 text-purple-400" />;
      case "prize":
        return <GiTrophy className="w-4 h-4 text-gold-light" />;
      default:
        return <FiActivity className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActivityColor = (type) => {
    switch (type) {
      case "deposit":
      case "transfer_in":
      case "prize":
        return "text-green-400";
      case "withdrawal":
      case "transfer_out":
      case "purchase":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <FiUser className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Profile Not Found</h2>
        <p className="text-gray-500">Unable to load your profile data</p>
      </div>
    );
  }

  const { user: userData, stats, recentActivity } = profile;

  // Chart data for balance breakdown
  const balanceData = [
    { name: "Current", value: userData.balance, color: "#00FF88" },
    {
      name: "Spent",
      value: stats.totalSpent || userData.totalSpent,
      color: "#FF6B6B",
    },
    { name: "Earned", value: userData.totalEarned, color: "#4ECDC4" },
  ].filter((d) => d.value > 0);

  return (
    <div className="mx-auto space-y-3">
      {/* Header with Currency Selector */}
      <PageHeader icon={FiUser} title="Profile" description="Your account & statistics">
        {/* Currency Selector */}
        <div className="flex justify-end items-center w-full relative">
          <button
            onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
            className="flex items-center w-full gap-3 px-4 py-2.5 justify-between rounded-xl bg-dark-700 border border-dark-500 hover:border-accent/50 transition-colors"
          >
            <FiGlobe className="w-4 h-4 text-accent" />
            <span className="text-white font-medium">
              {selectedCurrency.symbol} {selectedCurrency.code}
            </span>
            <FiChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                showCurrencyDropdown ? "rotate-180" : ""
              }`}
            />
          </button>

          <AnimatePresence>
            {showCurrencyDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 w-72 top-0 mt-2 rounded-xl bg-dark-800 border border-dark-500 shadow-xl z-50 overflow-hidden"
              >
                <div className="p-2 border-b border-dark-500">
                  <p className="text-xs text-gray-500 px-2">Display Currency</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {currencies.map((currency) => {
                    // Calculate rate for display (rateFromZynk = how many units of currency per 1 Zynk)
                    let rateDisplay = "";
                    if (currency.code === "ZYNK") {
                      rateDisplay = "1 Z = 1 Z";
                    } else {
                      const rate = currency.rateFromZynk || 0;
                      rateDisplay = `1 Z = ${currency.symbol}${rate.toFixed(
                        currency.precision || 2
                      )}`;
                    }

                    return (
                      <button
                        key={currency.code}
                        onClick={() => {
                          setSelectedCurrency(currency);
                          setShowCurrencyDropdown(false);
                          toast.success(`Currency changed to ${currency.code}`);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors ${
                          selectedCurrency.code === currency.code
                            ? "bg-accent/10"
                            : ""
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center shrink-0">
                          <span className={`text-sm font-bold ${selectedCurrency.code === currency.code ? 'text-accent' : 'text-white'}`}>{currency.symbol}</span>
                        </div>
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${selectedCurrency.code === currency.code ? 'text-accent' : 'text-white'}`}>{currency.code}</span>
                            <span className="text-[10px] text-gray-600">{currency.name}</span>
                          </div>
                          <span className="text-[11px] font-mono text-gray-500">{rateDisplay}</span>
                        </div>
                        {selectedCurrency.code === currency.code && (
                          <FiCheck className="w-4 h-4 text-accent shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PageHeader>

      {/* User Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-700 via-dark-800 to-dark-700 border border-dark-500"
      >
        {/* Background pattern */}
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-accent/10 rounded-full blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-4xl sm:text-5xl font-bold text-dark-900">
                {userData.username[0].toUpperCase()}
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white">
                    {userData.username}
                  </h2>
                  <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold">
                    <FiShield className="inline w-3 h-3 mr-1" />
                    Verified
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-gray-400">
                  {userData.phone ? (
                    <>
                      <FiPhone className="w-4 h-4" />
                      <span>{userData.phone}</span>
                    </>
                  ) : userData.email ? (
                    <>
                      <FiMail className="w-4 h-4" />
                      <span>{userData.email}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-400">
                  <FiCalendar className="w-4 h-4" />
                  <span>Joined {formatDate(userData.joinedAt)}</span>
                </div>
              </div>

              {/* Balance Display */}
              <div className="pt-4 border-t border-dark-500">
                <p className="text-gray-400 text-sm mb-1">Current Balance</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl sm:text-4xl font-bold text-accent">
                    {formatCurrencyFull(userData.balance)}
                  </span>
                  {selectedCurrency.code !== "ZYNK" && (
                    <span className="text-gray-500 text-sm">
                      ({userData.balance.toLocaleString()} Z)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Earned",
            value: userData.totalEarned,
            icon: FiTrendingUp,
            color: "text-green-400",
            bg: "bg-green-500/10",
          },
          {
            label: "Total Spent",
            value: userData.totalSpent,
            icon: FiTrendingDown,
            color: "text-red-400",
            bg: "bg-red-500/10",
          },
          {
            label: "Numbers Owned",
            value: stats.numbersOwned,
            icon: FiHash,
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            isCount: true,
          },
          {
            label: "Total Wins",
            value: stats.wins,
            icon: GiTrophy,
            color: "text-gold-light",
            bg: "bg-gold/10",
            isCount: true,
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-5 rounded-xl bg-dark-800 border border-dark-600"
          >
            <div
              className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}
            >
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className="text-gray-400 text-sm mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>
              {stat.isCount ? (
                <CountUp end={stat.value} duration={1.5} />
              ) : (
                formatCurrency(stat.value)
              )}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-dark-800 border border-dark-600">
        {[
          { id: "overview", label: "Overview", icon: FiActivity },
          { id: "numbers", label: "My Numbers", icon: FiHash },
          { id: "votes", label: "My Votes", icon: FiThumbsUp },
          { id: "activity", label: "Activity", icon: FiClock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-accent text-dark-900"
                : "text-gray-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid lg:grid-cols-2 gap-6"
          >
            {/* Balance Breakdown Chart */}
            <div className="p-6 rounded-xl bg-dark-800 border border-dark-600">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <FiDollarSign className="text-accent" />
                Balance Breakdown
              </h3>
              <div className="flex items-center gap-6">
                <div className="w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={balanceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {balanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {balanceData.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-gray-400 text-sm">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-white font-medium">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Transaction Stats */}
            <div className="p-6 rounded-xl bg-dark-800 border border-dark-600">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <FiActivity className="text-accent" />
                Transaction Summary
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    label: "Total Transactions",
                    value: stats.totalTransactions,
                    color: "text-white",
                  },
                  {
                    label: "Deposits",
                    value: stats.deposits,
                    color: "text-green-400",
                  },
                  {
                    label: "Withdrawals",
                    value: stats.withdrawals,
                    color: "text-red-400",
                  },
                  {
                    label: "Transfers Sent",
                    value: stats.transfersSent,
                    color: "text-orange-400",
                  },
                  {
                    label: "Transfers Received",
                    value: stats.transfersReceived,
                    color: "text-blue-400",
                  },
                  {
                    label: "Total Winnings",
                    value: stats.totalWinnings,
                    color: "text-gold-light",
                    isCurrency: true,
                  },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-lg bg-dark-700">
                    <p className="text-gray-500 text-xs">{item.label}</p>
                    <p className={`text-xl font-bold ${item.color}`}>
                      {item.isCurrency
                        ? formatCurrency(item.value)
                        : item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements/Badges */}
            <div className="lg:col-span-2 p-6 rounded-xl bg-dark-800 border border-dark-600">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <FiStar className="text-gold-light" />
                Achievements
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    name: "First Number",
                    desc: "Buy your first number",
                    unlocked: stats.numbersOwned > 0,
                    icon: FiHash,
                  },
                  {
                    name: "Winner",
                    desc: "Win a prize",
                    unlocked: stats.wins > 0,
                    icon: GiTrophy,
                  },
                  {
                    name: "Collector",
                    desc: "Own 10+ numbers",
                    unlocked: stats.numbersOwned >= 10,
                    icon: GiPodium,
                  },
                  {
                    name: "High Roller",
                    desc: "Earn 1000+ Zynk",
                    unlocked: userData.totalEarned >= 1000,
                    icon: GiTwoCoins,
                  },
                ].map((badge) => (
                  <div
                    key={badge.name}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      badge.unlocked
                        ? "bg-accent/10 border-accent/30"
                        : "bg-dark-700 border-dark-600 opacity-50"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center ${
                        badge.unlocked ? "bg-accent/20" : "bg-dark-600"
                      }`}
                    >
                      <badge.icon
                        className={`w-6 h-6 ${
                          badge.unlocked ? "text-accent" : "text-gray-500"
                        }`}
                      />
                    </div>
                    <p
                      className={`font-semibold ${
                        badge.unlocked ? "text-white" : "text-gray-500"
                      }`}
                    >
                      {badge.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{badge.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "numbers" && (
          <motion.div
            key="numbers"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden"
          >
            <div className="p-4 border-b border-dark-600">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FiHash className="text-accent" />
                My Tickets ({myTickets?.length || 0})
              </h3>
            </div>
            {myTickets && myTickets.length > 0 ? (
              <div className="divide-y divide-dark-600">
                {myTickets.map((ticket, i) => {
                  const matchedDigits = ticket.matchedDigits || 0;
                  const multiplier = ticket.multiplier || 0;
                  const currentReturn = ticket.currentReturn || ((ticket.buyAmount || ticket.price) * multiplier);
                  const status = ticket.status || 'active';
                  const canCashOut = ticket.canCashOut && matchedDigits > 0 && !['cashed_out', 'sold', 'lost'].includes(status);

                  return (
                    <motion.div
                      key={ticket.number}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`p-4 hover:bg-dark-700 transition-colors ${
                        status === 'lost' ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                          {/* Number with match highlighting */}
                          <div className="flex gap-1">
                            {ticket.number.split("").map((digit, idx) => (
                              <span
                                key={idx}
                                className={`w-8 h-10 rounded-lg font-mono font-bold flex items-center justify-center ${
                                  idx < matchedDigits
                                    ? 'bg-accent/20 text-accent border border-accent/30'
                                    : status === 'lost' && idx === matchedDigits
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : 'bg-dark-600 text-gray-400'
                                }`}
                              >
                                {digit}
                              </span>
                            ))}
                          </div>

                          {/* Status badges and info */}
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-2">
                              {status === 'lost' && (
                                <span className="px-2 py-1 rounded-full bg-rose-500/20 text-rose-400 text-xs font-semibold">
                                  LOST
                                </span>
                              )}
                              {status === 'won' && (
                                <span className="px-2 py-1 rounded-full bg-gold/20 text-gold-light text-xs font-semibold animate-pulse">
                                  <GiTrophy className="inline w-3 h-3 mr-1" />
                                  WINNER!
                                </span>
                              )}
                              {status === 'cashed_out' && (
                                <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                                  CASHED OUT
                                </span>
                              )}
                              {status === 'matching' && matchedDigits > 0 && (
                                <span className="px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold">
                                  {matchedDigits}/7 MATCH
                                </span>
                              )}
                              {ticket.sessionNumber && (
                                <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                                  Session {ticket.sessionNumber}
                                </span>
                              )}
                            </div>
                            {/* Purchase info */}
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              {ticket.periodId && (
                                <span>#{ticket.periodId}</span>
                              )}
                              {ticket.purchasedAt && (
                                <span className="flex items-center gap-1">
                                  <FiClock className="w-3 h-3" />
                                  {formatTimeAgo(ticket.purchasedAt)}
                                </span>
                              )}
                              <span className="text-gray-600">
                                Bought for {ticket.buyAmount || ticket.price} Z
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stats and actions */}
                        <div className="flex items-center gap-4">
                          {/* Match stats */}
                          {matchedDigits > 0 && status !== 'lost' && (
                            <div className="flex gap-3 text-sm">
                              <div className="text-center">
                                <p className="text-purple-light font-bold">{multiplier}x</p>
                                <p className="text-gray-500 text-xs">multiplier</p>
                              </div>
                              <div className="text-center">
                                <p className="text-gold-light font-bold">{currentReturn} Z</p>
                                <p className="text-gray-500 text-xs">return</p>
                              </div>
                            </div>
                          )}

                          {/* Cash out button */}
                          {canCashOut ? (
                            <button
                              onClick={() => handleCashOut(ticket.id, ticket.number)}
                              disabled={cashingOut === ticket.id}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/20 text-gold-light font-semibold text-sm hover:bg-gold/30 border border-gold/30 transition-colors disabled:opacity-50"
                            >
                              {cashingOut === ticket.id ? (
                                <div className="w-4 h-4 border-2 border-gold-light border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <GiTwoCoins className="w-4 h-4" />
                              )}
                              <span>Cash Out</span>
                            </button>
                          ) : status === 'cashed_out' ? (
                            <div className="text-right">
                              <p className="text-emerald-400 font-medium">
                                +{ticket.cashout_payout || currentReturn} Z
                              </p>
                              <p className="text-gray-500 text-xs">cashed out</p>
                            </div>
                          ) : (
                            <div className="text-right">
                              <p className="text-white font-medium">
                                {ticket.votes || 0} votes
                              </p>
                              <p className="text-gray-500 text-xs">
                                {formatTimeAgo(ticket.created_at)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center">
                <FiHash className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">You don't own any tickets yet</p>
                <p className="text-gray-500 text-sm">
                  Buy numbers to participate in draws!
                </p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "votes" && (
          <motion.div
            key="votes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden"
          >
            <div className="p-4 border-b border-dark-600">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FiThumbsUp className="text-accent" />
                My Votes ({myVotes?.length || 0})
              </h3>
            </div>
            {myVotes && myVotes.length > 0 ? (
              <div className="divide-y divide-dark-600">
                {myVotes.map((vote, i) => (
                  <motion.div
                    key={vote.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 hover:bg-dark-700 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        {/* Number display */}
                        <div className="flex gap-1">
                          {vote.number.split("").map((digit, idx) => (
                            <span
                              key={idx}
                              className={`w-7 h-9 rounded-md font-mono font-bold flex items-center justify-center text-sm ${
                                vote.voteStatus === 'won'
                                  ? 'bg-accent/20 text-accent border border-accent/30'
                                  : vote.voteStatus === 'lost'
                                  ? 'bg-dark-600 text-gray-500'
                                  : 'bg-dark-600 text-gray-300'
                              }`}
                            >
                              {digit}
                            </span>
                          ))}
                        </div>

                        {/* Status badges */}
                        <div className="flex flex-wrap gap-2">
                          {vote.voteStatus === 'won' && (
                            <span className="px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold">
                              <GiTrophy className="inline w-3 h-3 mr-1" />
                              WON +{vote.reward} Z
                            </span>
                          )}
                          {vote.voteStatus === 'lost' && (
                            <span className="px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 text-xs font-semibold">
                              LOST
                            </span>
                          )}
                          {vote.voteStatus === 'pending' && (
                            <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Vote info */}
                      <div className="flex items-center gap-4 text-sm">
                        {vote.periodId && (
                          <div className="text-center">
                            <p className="text-gray-400 font-medium">Session {vote.sessionNumber || '-'}</p>
                            <p className="text-gray-500 text-xs">{vote.periodId}</p>
                          </div>
                        )}
                        <div className="text-right">
                          <p className="text-gray-400">{vote.totalVotes} total votes</p>
                          <p className="text-gray-500 text-xs">
                            {formatTimeAgo(vote.votedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <FiThumbsUp className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">You haven't voted yet</p>
                <p className="text-gray-500 text-sm">
                  Vote on numbers to predict winners and earn 10 Z rewards!
                </p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "activity" && (
          <motion.div
            key="activity"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden"
          >
            <div className="p-4 border-b border-dark-600">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FiClock className="text-accent" />
                Recent Activity
              </h3>
            </div>
            {recentActivity && recentActivity.length > 0 ? (
              <div className="divide-y divide-dark-600">
                {recentActivity.map((activity, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 flex items-center justify-between hover:bg-dark-700 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-dark-600 flex items-center justify-center">
                        {getActivityIcon(activity.type)}
                      </div>
                      <div>
                        <p className="text-white font-medium capitalize">
                          {activity.type.replace("_", " ")}
                        </p>
                        <p className="text-gray-500 text-sm">
                          {activity.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold ${getActivityColor(
                          activity.type
                        )}`}
                      >
                        {["deposit", "transfer_in", "prize"].includes(
                          activity.type
                        )
                          ? "+"
                          : "-"}
                        {formatCurrency(parseFloat(activity.amount))}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {formatTimeAgo(activity.created_at)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <FiActivity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No recent activity</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close dropdown on outside click */}
      {showCurrencyDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowCurrencyDropdown(false)}
        />
      )}
    </div>
  );
}

export default Profile;
