import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/useStore";
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
  FiClock,
  FiArrowUpRight,
  FiArrowDownRight,
  FiSend,
  FiDownload,
  FiShield,
  FiStar,
  FiThumbsUp,
  FiLogOut,
  FiPlay,
  FiAward,
  FiUsers,
  FiRefreshCw,
  FiGift,
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiPodium } from "react-icons/gi";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import CountUp from "react-countup";
import {
  getUserProfile,
  getUserActivity,
  getMyNumbers,
  getMyVotes,
  cashOutTicket,
} from "../services/api";
import socketService from "../services/socket";
import { useCurrency } from "../contexts/CurrencyContext";
import { rewriteAmounts } from "../utils/formatAmount";
import usePageTitle from "../hooks/usePageTitle";

function Profile() {
  usePageTitle("Profile");
  const navigate = useNavigate();
  const { logout } = useStore();

  const { formatCurrency, formatCurrencyFull } = useCurrency();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [myTickets, setMyTickets] = useState([]);
  const [myVotes, setMyVotes] = useState([]);
  const [cashingOut, setCashingOut] = useState(null);

  // Paginated history feed (Profile → History tab). 10 per page, with an
  // optional `type` filter driven by the dropdown above the list. We
  // lazy-load the first page when the tab opens so users who never visit
  // History don't pay the API cost on page load.
  const [activityItems, setActivityItems] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);
  const [historyType, setHistoryType] = useState("all");
  const HISTORY_PAGE_SIZE = 10;

  useEffect(() => {
    fetchProfile();
    fetchMyTickets();
    fetchMyVotes();

    // Subscribe to ticket updates
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsubTicketUpdate = socketService.onTicketUpdate?.((data) => {
      setMyTickets((prev) =>
        prev.map((t) =>
          t.id === data.numberId
            ? {
                ...t,
                matchedDigits: data.matchedDigits,
                multiplier: data.multiplier,
                currentReturn: data.currentReturn,
                status: data.status,
              }
            : t,
        ),
      );
    });

    const unsubCashedOut = socketService.onTicketCashedOut?.((data) => {
      setMyTickets((prev) =>
        prev.map((t) =>
          t.id === data.numberId ? { ...t, status: "cashed_out" } : t,
        ),
      );
      toast.success(
        `Cashed out ${data.number} for ${formatCurrency(data.payout)}!`,
      );
    });

    // Listen for user's numbers update (after buying)
    const unsubUserNumbers = socketService.onUserNumbersUpdated?.((data) => {
      if (data.action === "bought") {
        fetchMyTickets();
        fetchProfile(); // Also refresh balance
      }
    });

    // Listen for vote rewards
    const unsubVoteReward = socketService.onVoteReward?.((data) => {
      toast.success(
        `You earned ${formatCurrency(data.reward)} for predicting ${data.number}!`,
      );
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

  const fetchActivity = async (page, type = historyType) => {
    setActivityLoading(true);
    try {
      const res = await getUserActivity(
        page,
        HISTORY_PAGE_SIZE,
        type === "all" ? null : type,
      );
      const d = res.data.data || {};
      setActivityItems(d.items || []);
      setActivityTotalPages(d.totalPages || 1);
      setActivityPage(d.page || page);
    } catch (error) {
      console.error("Failed to fetch history:", error);
      toast.error("Failed to load history");
    } finally {
      setActivityLoading(false);
    }
  };

  // Lazy-load the first page when the History tab opens.
  useEffect(() => {
    if (
      activeTab === "history" &&
      activityItems.length === 0 &&
      !activityLoading
    ) {
      fetchActivity(1, historyType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Refetch from page 1 when the type filter changes (only if tab is open).
  useEffect(() => {
    if (activeTab === "history") {
      fetchActivity(1, historyType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyType]);

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
        toast.success(
          `Cashed out ${number} for ${formatCurrency(response.data.data.payout)}!`,
        );
        // Update local state
        setMyTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId ? { ...t, status: "cashed_out" } : t,
          ),
        );
        // Refresh profile to update balance
        fetchProfile();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to cash out");
    } finally {
      setCashingOut(null);
    }
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

  // Transaction → visual metadata. Centralised so icon, badge background,
  // amount color, label and credit/debit sign all stay in sync.
  const ACTIVITY_META = {
    deposit: {
      Icon: FiDownload,
      fg: "text-emerald-400",
      bg: "bg-emerald-500/15",
      label: "Deposit",
      credit: true,
    },
    withdrawal: {
      Icon: FiArrowUpRight,
      fg: "text-red-400",
      bg: "bg-red-500/15",
      label: "Withdrawal",
      credit: false,
    },
    purchase: {
      Icon: FiHash,
      fg: "text-purple-400",
      bg: "bg-purple-500/15",
      label: "Purchase",
      credit: false,
    },
    sale: {
      Icon: FiTrendingUp,
      fg: "text-emerald-400",
      bg: "bg-emerald-500/15",
      label: "Sale",
      credit: true,
    },
    vote: {
      Icon: FiThumbsUp,
      fg: "text-pink-400",
      bg: "bg-pink-500/15",
      label: "Vote",
      credit: false,
    },
    prize: {
      Icon: GiTrophy,
      fg: "text-gold-light",
      bg: "bg-gold/15",
      label: "Prize",
      credit: true,
    },
    refund: {
      Icon: FiRefreshCw,
      fg: "text-blue-400",
      bg: "bg-blue-500/15",
      label: "Refund",
      credit: true,
    },
    transfer_out: {
      Icon: FiSend,
      fg: "text-orange-400",
      bg: "bg-orange-500/15",
      label: "Transfer Out",
      credit: false,
    },
    transfer_in: {
      Icon: FiArrowDownRight,
      fg: "text-blue-400",
      bg: "bg-blue-500/15",
      label: "Transfer In",
      credit: true,
    },
    cashout: {
      Icon: FiDollarSign,
      fg: "text-emerald-400",
      bg: "bg-emerald-500/15",
      label: "Cashout",
      credit: true,
    },
    referral_commission: {
      Icon: FiUsers,
      fg: "text-gold-light",
      bg: "bg-gold/15",
      label: "Referral",
      credit: true,
    },
    invest: {
      Icon: FiTrendingUp,
      fg: "text-purple-400",
      bg: "bg-purple-500/15",
      label: "Invest",
      credit: false,
    },
    invest_return: {
      Icon: FiTrendingUp,
      fg: "text-emerald-400",
      bg: "bg-emerald-500/15",
      label: "Invest Return",
      credit: true,
    },
    invest_withdraw: {
      Icon: FiTrendingDown,
      fg: "text-emerald-400",
      bg: "bg-emerald-500/15",
      label: "Invest Withdraw",
      credit: true,
    },
    game_bet: {
      Icon: FiPlay,
      fg: "text-purple-light",
      bg: "bg-purple/15",
      label: "Game Bet",
      credit: false,
    },
    game_win: {
      Icon: FiAward,
      fg: "text-emerald-400",
      bg: "bg-emerald-500/15",
      label: "Game Win",
      credit: true,
    },
    bonus: {
      Icon: FiGift,
      fg: "text-amber-300",
      bg: "bg-amber-500/15",
      label: "Bonus",
      credit: true,
    },
  };

  const getActivityMeta = (type) =>
    ACTIVITY_META[type] || {
      Icon: FiActivity,
      fg: "text-gray-400",
      bg: "bg-gray-500/15",
      label: (type || "Activity")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      credit: false,
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

  const { user: userData, stats } = profile;

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
      <PageHeader
        icon={FiUser}
        title="Profile"
        description="Your account & statistics"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-dark-800 border border-dark-600 overflow-x-auto">
        {[
          { id: "profile", label: "Profile", icon: FiUser },
          { id: "numbers", label: "My Numbers", icon: FiHash },
          { id: "votes", label: "My Votes", icon: FiThumbsUp },
          { id: "history", label: "History", icon: FiClock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-accent text-dark-900 shadow-lg shadow-accent/20"
                : "text-gray-400 hover:text-white hover:bg-dark-700/60"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* User Card — hero block with avatar, identity, copyable ID, balance */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 via-dark-800 to-dark-900 border border-accent/20 shadow-xl"
            >
              <div className="absolute inset-0 bg-grid opacity-10" />
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-accent/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl" />

              <div className="relative p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex-shrink-0 self-center sm:self-start">
                    <div className="relative">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-accent via-accent/80 to-accent/40 flex items-center justify-center shadow-lg shadow-accent/30 ring-2 ring-accent/40">
                        <FiUser className="w-10 h-10 sm:w-12 sm:h-12 text-dark-900" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full w-6 h-6 border-2 border-dark-900 flex items-center justify-center">
                        <FiShield className="w-3 h-3 text-dark-900" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 min-w-0">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
                          {userData.username}
                        </h2>
                        <span className="px-2.5 py-1 rounded-full bg-accent/15 text-accent text-[11px] font-bold uppercase tracking-wider border border-accent/30">
                          Verified
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-gray-400 text-sm flex-wrap">
                        {userData.phone && (
                          <span className="flex items-center gap-1.5">
                            <FiPhone className="w-3.5 h-3.5" /> {userData.phone}
                          </span>
                        )}
                        {userData.email && (
                          <span className="flex items-center gap-1.5">
                            <FiMail className="w-3.5 h-3.5" /> {userData.email}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1.5">
                          <FiCalendar className="w-3.5 h-3.5" />
                          Joined {formatDate(userData.joinedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                      <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">
                        Current Balance
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent">
                          {formatCurrencyFull(userData.balance)}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => navigate('/wallet?tab=buy')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors"
                        >
                          <FiDownload className="w-3.5 h-3.5" />
                          Deposit
                        </button>
                        <button
                          onClick={() => navigate('/wallet?tab=withdrawals')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 transition-colors"
                        >
                          <FiArrowUpRight className="w-3.5 h-3.5" />
                          Withdraw
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Headline stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                {
                  label: "Total Earned",
                  value: userData.totalEarned,
                  icon: FiTrendingUp,
                  color: "text-emerald-400",
                  bg: "bg-emerald-500/10",
                  ring: "ring-emerald-500/20",
                },
                {
                  label: "Total Spent",
                  value: userData.totalSpent,
                  icon: FiTrendingDown,
                  color: "text-red-400",
                  bg: "bg-red-500/10",
                  ring: "ring-red-500/20",
                },
                {
                  label: "Numbers Owned",
                  value: stats.numbersOwned,
                  icon: FiHash,
                  color: "text-purple-400",
                  bg: "bg-purple-500/10",
                  ring: "ring-purple-500/20",
                  isCount: true,
                },
                {
                  label: "Total Wins",
                  value: stats.wins,
                  icon: GiTrophy,
                  color: "text-gold-light",
                  bg: "bg-gold/10",
                  ring: "ring-gold/20",
                  isCount: true,
                },
              ].map((stat, idx) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -2 }}
                  className={`p-4 sm:p-5 rounded-xl bg-dark-800 border border-dark-600 hover:border-accent/30 hover:ring-1 ${stat.ring} transition-all`}
                >
                  <div
                    className={`w-11 h-11 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}
                  >
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">
                    {stat.label}
                  </p>
                  <p className={`text-xl sm:text-2xl font-bold ${stat.color}`}>
                    {stat.isCount ? (
                      <CountUp end={stat.value} duration={1.5} />
                    ) : (
                      formatCurrency(stat.value)
                    )}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Insight grid: balance breakdown + transaction summary + achievements */}
            <div className="grid lg:grid-cols-2 gap-4">
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
                    <div
                      key={item.label}
                      className="p-3 rounded-lg bg-dark-700"
                    >
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
                      desc: `Earn ${formatCurrency(1000)}+`,
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
                  const currentReturn =
                    ticket.currentReturn ||
                    (ticket.buyAmount || ticket.price) * multiplier;
                  const status = ticket.status || "active";
                  const canCashOut =
                    ticket.canCashOut &&
                    matchedDigits > 0 &&
                    !["cashed_out", "sold", "lost"].includes(status);

                  return (
                    <motion.div
                      key={ticket.number}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`p-4 hover:bg-dark-700 transition-colors ${
                        status === "lost" ? "opacity-60" : ""
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
                                    ? "bg-accent/20 text-accent border border-accent/30"
                                    : status === "lost" && idx === matchedDigits
                                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                      : "bg-dark-600 text-gray-400"
                                }`}
                              >
                                {digit}
                              </span>
                            ))}
                          </div>

                          {/* Status badges and info */}
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-2">
                              {status === "lost" && (
                                <span className="px-2 py-1 rounded-full bg-rose-500/20 text-rose-400 text-xs font-semibold">
                                  LOST
                                </span>
                              )}
                              {status === "won" && (
                                <span className="px-2 py-1 rounded-full bg-gold/20 text-gold-light text-xs font-semibold animate-pulse">
                                  <GiTrophy className="inline w-3 h-3 mr-1" />
                                  WINNER!
                                </span>
                              )}
                              {status === "cashed_out" && (
                                <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                                  CASHED OUT
                                </span>
                              )}
                              {status === "matching" && matchedDigits > 0 && (
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
                                Bought for{" "}
                                {formatCurrency(
                                  ticket.buyAmount || ticket.price,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stats and actions */}
                        <div className="flex items-center gap-4">
                          {/* Match stats */}
                          {matchedDigits > 0 && status !== "lost" && (
                            <div className="flex gap-3 text-sm">
                              <div className="text-center">
                                <p className="text-purple-light font-bold">
                                  {multiplier}x
                                </p>
                                <p className="text-gray-500 text-xs">
                                  multiplier
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-gold-light font-bold">
                                  {formatCurrency(currentReturn)}
                                </p>
                                <p className="text-gray-500 text-xs">return</p>
                              </div>
                            </div>
                          )}

                          {/* Cash out button */}
                          {canCashOut ? (
                            <button
                              onClick={() =>
                                handleCashOut(ticket.id, ticket.number)
                              }
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
                          ) : status === "cashed_out" ? (
                            <div className="text-right">
                              <p className="text-emerald-400 font-medium">
                                +
                                {formatCurrency(
                                  ticket.cashout_payout || currentReturn,
                                )}
                              </p>
                              <p className="text-gray-500 text-xs">
                                cashed out
                              </p>
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
                                vote.voteStatus === "won"
                                  ? "bg-accent/20 text-accent border border-accent/30"
                                  : vote.voteStatus === "lost"
                                    ? "bg-dark-600 text-gray-500"
                                    : "bg-dark-600 text-gray-300"
                              }`}
                            >
                              {digit}
                            </span>
                          ))}
                        </div>

                        {/* Status badges */}
                        <div className="flex flex-wrap gap-2">
                          {vote.voteStatus === "won" && (
                            <span className="px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold">
                              <GiTrophy className="inline w-3 h-3 mr-1" />
                              WON +{formatCurrency(vote.reward)}
                            </span>
                          )}
                          {vote.voteStatus === "lost" && (
                            <span className="px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 text-xs font-semibold">
                              LOST
                            </span>
                          )}
                          {vote.voteStatus === "pending" && (
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
                            <p className="text-gray-400 font-medium">
                              Session {vote.sessionNumber || "-"}
                            </p>
                            <p className="text-gray-500 text-xs">
                              {vote.periodId}
                            </p>
                          </div>
                        )}
                        <div className="text-right">
                          <p className="text-gray-400">
                            {vote.totalVotes} total votes
                          </p>
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
                  Vote on numbers to predict winners and earn{" "}
                  {formatCurrency(10)} rewards!
                </p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl bg-gradient-to-br from-dark-800 to-dark-900 border border-dark-600 overflow-hidden shadow-xl"
          >
            {/* Header + filter dropdown */}
            <div className="p-4 sm:p-5 border-b border-dark-600 bg-dark-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
                  <FiClock className="text-accent w-4 h-4" />
                </div>
                Transaction History
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-gray-500 hidden sm:block">
                  Filter:
                </label>
                <select
                  value={historyType}
                  onChange={(e) => setHistoryType(e.target.value)}
                  className="bg-dark-700 border border-dark-500 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="all">All Types</option>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="purchase">Purchase</option>
                  <option value="sale">Sale</option>
                  <option value="vote">Vote</option>
                  <option value="prize">Prize</option>
                  <option value="refund">Refund</option>
                  <option value="transfer_in">Transfer In</option>
                  <option value="transfer_out">Transfer Out</option>
                  <option value="cashout">Cashout</option>
                  <option value="referral_commission">Referral</option>
                  <option value="invest">Invest</option>
                  <option value="invest_return">Invest Return</option>
                  <option value="invest_withdraw">Invest Withdraw</option>
                  <option value="game_bet">Game Bet</option>
                  <option value="game_win">Game Win</option>
                  <option value="bonus">Bonus</option>
                </select>
              </div>
            </div>

            {activityLoading && activityItems.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activityItems.length > 0 ? (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="divide-y divide-dark-600/60"
                >
                  {activityItems.map((activity, i) => {
                    const meta = getActivityMeta(activity.type);
                    const Icon = meta.Icon;
                    const amount = Math.abs(parseFloat(activity.amount) || 0);
                    // `status` only set for rows that came from zynk_orders
                    // (pending deposits). Render a colored pill so users
                    // know whether their deposit is approved, pending, etc.
                    const status = activity.status;
                    const STATUS_PILL = {
                      pending: {
                        label: "Pending",
                        className:
                          "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
                      },
                      awaiting_approval: {
                        label: "Awaiting",
                        className:
                          "bg-orange-500/15 text-orange-300 border-orange-500/30",
                      },
                      approved: {
                        label: "Approved",
                        className:
                          "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                      },
                      rejected: {
                        label: "Rejected",
                        className:
                          "bg-red-500/15 text-red-300 border-red-500/30",
                      },
                      refunded: {
                        label: "Refunded",
                        className:
                          "bg-purple-500/15 text-purple-300 border-purple-500/30",
                      },
                      failed: {
                        label: "Failed",
                        className:
                          "bg-red-500/15 text-red-300 border-red-500/30",
                      },
                    };
                    const pill = status ? STATUS_PILL[status] : null;
                    const isPendingDeposit = status && status !== "approved";
                    return (
                      <motion.div
                        key={`${activityPage}-${historyType}-${i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.025, duration: 0.2 }}
                        className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-dark-700/40 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-11 h-11 rounded-xl ${meta.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                          >
                            <Icon className={`w-5 h-5 ${meta.fg}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-semibold text-sm truncate">
                                {meta.label}
                              </p>
                              {pill && (
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${pill.className}`}
                                >
                                  {pill.label}
                                </span>
                              )}
                            </div>
                            {activity.description && (
                              <p className="text-gray-500 text-xs truncate mt-0.5">
                                {rewriteAmounts(activity.description)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-bold text-sm whitespace-nowrap ${
                              isPendingDeposit
                                ? "text-gray-400"
                                : meta.credit
                                  ? "text-emerald-400"
                                  : "text-red-400"
                            }`}
                          >
                            {isPendingDeposit ? "" : meta.credit ? "+" : "−"}
                            {formatCurrency(amount)}
                          </p>
                          <p className="text-gray-500 text-[11px] whitespace-nowrap mt-0.5">
                            {formatTimeAgo(activity.created_at)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>

                {activityTotalPages > 1 && (
                  <div className="flex items-center justify-between p-3 sm:p-4 border-t border-dark-600 bg-dark-900/60">
                    <button
                      type="button"
                      onClick={() =>
                        fetchActivity(
                          Math.max(1, activityPage - 1),
                          historyType,
                        )
                      }
                      disabled={activityLoading || activityPage <= 1}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-200 bg-dark-700 border border-dark-500 hover:bg-dark-600 hover:border-accent/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Prev
                    </button>
                    <span className="text-xs text-gray-400">
                      {activityLoading
                        ? "Loading…"
                        : `Page ${activityPage} of ${activityTotalPages}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        fetchActivity(
                          Math.min(activityTotalPages, activityPage + 1),
                          historyType,
                        )
                      }
                      disabled={
                        activityLoading || activityPage >= activityTotalPages
                      }
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-200 bg-dark-700 border border-dark-500 hover:bg-dark-600 hover:border-accent/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mx-auto mb-4">
                  <FiActivity className="w-7 h-7 text-gray-600" />
                </div>
                <p className="text-gray-300 font-semibold">No history yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  {historyType === "all"
                    ? "Your transactions will show up here."
                    : 'No transactions match this filter. Try "All Types".'}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6"
      >
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold hover:bg-red-500/20 transition-colors"
        >
          <FiLogOut className="w-5 h-5" />
          Log Out
        </button>
      </motion.div>
    </div>
  );
}

export default Profile;
