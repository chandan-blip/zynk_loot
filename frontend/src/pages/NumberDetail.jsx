import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiThumbsUp, FiUser, FiTrendingUp, FiTrendingDown,
  FiClock, FiDollarSign, FiTarget, FiAward, FiActivity,
  FiBarChart2, FiPieChart, FiZap, FiShield,
  FiRepeat, FiStar, FiHash
} from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line
} from 'recharts';
import { getNumberDetails, buyNumber, voteForNumber, createOffer, getNumberOffers, respondToOffer } from '../services/api';
import socketService from '../services/socket';
import useStore from '../store/useStore';

// Radial Progress Chart Component
function RadialChart({ percentage, size = 120, strokeWidth = 10, label = "Win Chance" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1d2b3a"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#radialGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
          <defs>
            <linearGradient id="radialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-white">{percentage.toFixed(2)}%</span>
        </div>
      </div>
      <span className="mt-2 text-sm text-gray-400">{label}</span>
    </div>
  );
}

// Mini Stat Card
function StatCard({ icon: Icon, label, value, subValue, color = "accent", trend }) {
  const colorClasses = {
    accent: "text-accent bg-accent/10",
    gold: "text-gold-light bg-gold/10",
    purple: "text-purple-light bg-purple/10",
    emerald: "text-emerald-light bg-emerald/10",
    rose: "text-rose-light bg-rose/10",
  };

  return (
    <div className="p-3 rounded-xl bg-dark-700 border border-dark-600">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${trend >= 0 ? 'text-emerald-light' : 'text-rose-light'}`}>
            {trend >= 0 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-white font-bold text-lg">{value}</p>
      <p className="text-gray-500 text-xs">{label}</p>
      {subValue && <p className="text-gray-600 text-[10px] mt-0.5">{subValue}</p>}
    </div>
  );
}

// Activity Item
function ActivityItem({ type, user, amount, time, icon: Icon }) {
  const typeColors = {
    vote: "bg-accent/10 text-accent",
    buy: "bg-gold/10 text-gold-light",
    offer: "bg-purple/10 text-purple-light",
    win: "bg-emerald/10 text-emerald-light",
    transfer: "bg-rose/10 text-rose-light",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/50 hover:bg-dark-800 transition-colors">
      <div className={`w-9 h-9 rounded-lg ${typeColors[type]} flex items-center justify-center`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{user}</p>
        <p className="text-gray-500 text-xs">{time}</p>
      </div>
      {amount && (
        <span className={`text-sm font-semibold ${type === 'vote' ? 'text-accent' : 'text-gold-light'}`}>
          {amount}
        </span>
      )}
    </div>
  );
}

function NumberDetail() {
  const { number } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useStore();
  const [numberData, setNumberData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [offerAmount, setOfferAmount] = useState('');
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [voteCount, setVoteCount] = useState(1);
  const [pendingOffers, setPendingOffers] = useState([]);

  // Generate comprehensive demo data
  const generateDemoData = (num, basePrice = 10) => {
    const seed = parseInt(num?.replace(/\D/g, '') || '1234567') % 1000;

    // Price history
    const priceHistory = Array.from({ length: 30 }, (_, i) => {
      const variance = Math.sin(seed + i * 0.5) * 3 + Math.cos(seed * 0.1 + i * 0.3) * 2;
      const trend = i * 0.15;
      const price = Math.max(1, basePrice + variance + trend);
      return {
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: Math.round(price * 100) / 100,
        votes: Math.floor(50 + Math.random() * 200 + i * 10)
      };
    });

    // Vote history by hour
    const votesByHour = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}:00`,
      votes: Math.floor(10 + Math.random() * 90 + Math.sin(i / 3) * 30)
    }));

    // Digit analysis
    const digits = num?.split('').map((d, i) => ({
      position: i + 1,
      digit: d,
      frequency: Math.floor(5 + Math.random() * 20),
      isHot: Math.random() > 0.5
    })) || [];

    // Recent activity
    const activities = [
      { type: 'vote', user: 'john_lucky', amount: '+5 votes', time: '2 mins ago', icon: FiThumbsUp },
      { type: 'vote', user: 'sarah_winner', amount: '+3 votes', time: '5 mins ago', icon: FiThumbsUp },
      { type: 'offer', user: 'mike_player', amount: '150 Z', time: '12 mins ago', icon: FiDollarSign },
      { type: 'vote', user: 'emma_jackpot', amount: '+10 votes', time: '18 mins ago', icon: FiThumbsUp },
      { type: 'buy', user: 'david_seven', amount: '100 Z', time: '1 hour ago', icon: GiTwoCoins },
      { type: 'win', user: 'lisa_fortune', amount: '500 Z', time: '2 days ago', icon: GiTrophy },
      { type: 'transfer', user: 'alex_numbers', amount: null, time: '5 days ago', icon: FiRepeat },
    ];

    // Ownership history
    const ownershipHistory = [
      { owner: 'emma_jackpot', from: 'Dec 15, 2025', to: 'Present', duration: '32 days', price: 85 },
      { owner: 'david_seven', from: 'Nov 20, 2025', to: 'Dec 15, 2025', duration: '25 days', price: 60 },
      { owner: 'sarah_winner', from: 'Oct 1, 2025', to: 'Nov 20, 2025', duration: '50 days', price: 45 },
      { owner: null, from: 'Launch', to: 'Oct 1, 2025', duration: '90 days', price: 10 },
    ];

    // Similar numbers
    const similarNumbers = [
      { number: String((parseInt(num) + 1) % 10000000).padStart(7, '0'), votes: 2340, price: 45, trend: 8 },
      { number: String((parseInt(num) - 1 + 10000000) % 10000000).padStart(7, '0'), votes: 1890, price: 32, trend: -3 },
      { number: String((parseInt(num) + 1000000) % 10000000).padStart(7, '0'), votes: 3100, price: 78, trend: 15 },
      { number: num?.split('').reverse().join('') || '0000000', votes: 1560, price: 28, trend: 5 },
    ];

    return {
      number: num || '0000000',
      votes: 2847 + seed,
      totalPoolVotes: 150000,
      owner: seed % 3 === 0 ? null : 'emma_jackpot',
      ownerId: seed % 3 === 0 ? null : 4,
      price: priceHistory[priceHistory.length - 1].price,
      trend: Math.round((Math.random() - 0.3) * 30),
      rank: Math.floor(Math.random() * 100) + 1,
      timesWon: Math.floor(Math.random() * 5),
      lastWon: seed % 2 === 0 ? 'Dec 10, 2025' : 'Never',
      createdAt: 'Sep 1, 2025',
      totalTransactions: 156,
      uniqueVoters: 89,
      avgDailyVotes: 42,
      peakVotes: 312,
      winChance: ((2847 + seed) / 150000 * 100),
      priceHistory,
      votesByHour,
      digits,
      activities,
      ownershipHistory,
      similarNumbers,
      voteHistory: priceHistory.map(p => ({ date: p.date, votes: p.votes })),
    };
  };

  const fetchOffers = async () => {
    try {
      const res = await getNumberOffers(number);
      const offers = res.data.data.map(offer => ({
        id: offer.id,
        from: offer.from_username,
        fromUserId: offer.from_user_id,
        amount: parseFloat(offer.amount),
        expires: formatTimeRemaining(new Date(offer.expires_at)),
        status: offer.status
      }));
      setPendingOffers(offers);
    } catch (error) {
      console.error('Failed to fetch offers:', error);
      setPendingOffers([]);
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const diff = expiresAt - now;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0) return `${days}d ${remainingHours}h`;
    return `${hours}h`;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getNumberDetails(number);
        const data = res.data.data;
        const demoData = generateDemoData(number, data.price || 10);
        setNumberData({ ...demoData, ...data, priceHistory: demoData.priceHistory });
      } catch (error) {
        console.error('Failed to fetch number:', error);
        setNumberData(generateDemoData(number, 10));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    fetchOffers();
    socketService.subscribeToNumber(number);

    return () => {
      socketService.unsubscribeFromNumber(number);
    };
  }, [number]);

  useEffect(() => {
    const unsub = socketService.onNumberVote((data) => {
      if (data.number === number) {
        setNumberData(prev => prev ? { ...prev, votes: data.totalVotes } : prev);
      }
    });
    return () => unsub?.();
  }, [number]);

  const formatNumber = (num) => num.toString().padStart(7, '0').split('').join(' ');
  const formatVotes = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleBuy = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to buy');
      navigate('/login');
      return;
    }
    try {
      await buyNumber(number);
      toast.success('Number purchased successfully!');
      const res = await getNumberDetails(number);
      setNumberData(prev => ({ ...prev, ...res.data.data }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to buy number');
    }
  };

  const handleVote = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to vote');
      navigate('/login');
      return;
    }
    try {
      await voteForNumber(number);
      toast.success(`${voteCount} vote(s) recorded!`);
      setNumberData(prev => prev ? { ...prev, votes: prev.votes + voteCount } : prev);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to vote');
    }
  };

  const handleOffer = async () => {
    if (!offerAmount || parseFloat(offerAmount) <= 0) {
      toast.error('Enter a valid offer amount');
      return;
    }
    try {
      await createOffer(number, parseFloat(offerAmount));
      toast.success('Offer sent to owner!');
      setShowOfferModal(false);
      setOfferAmount('');
      fetchOffers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create offer');
    }
  };

  const handleAcceptOffer = async (offerId) => {
    try {
      await respondToOffer(offerId, true);
      toast.success('Offer accepted! Number transferred.');
      fetchOffers();
      const res = await getNumberDetails(number);
      const data = res.data.data;
      const demoData = generateDemoData(number, data.price || 10);
      setNumberData({ ...demoData, ...data, priceHistory: demoData.priceHistory });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to accept offer');
    }
  };

  const handleRejectOffer = async (offerId) => {
    try {
      await respondToOffer(offerId, false);
      toast.success('Offer rejected');
      fetchOffers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject offer');
    }
  };

  const winChance = useMemo(() => {
    if (!numberData) return 0;
    return Math.min(((numberData.votes / (numberData.totalPoolVotes || 150000)) * 100), 99.9);
  }, [numberData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = user && numberData?.ownerId === user.id;
  const tabs = ['overview', 'analytics', 'history', 'offers'];

  return (
    <div className="space-y-4 pb-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <FiArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      {/* Main Header Card */}
      <div className="rounded-2xl bg-dark-700 border border-dark-600 overflow-hidden">
        {/* Number Display with Gradient Background */}
        <div className="relative p-6 bg-gradient-to-br from-dark-700 via-dark-700 to-accent/5">
          <div className="absolute top-4 right-4 flex gap-2">
            {isOwner && (
              <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold border border-accent/30">
                OWNED
              </span>
            )}
            {numberData?.rank <= 10 && (
              <span className="px-3 py-1 rounded-full bg-gold/20 text-gold-light text-xs font-bold border border-gold/30">
                #{numberData.rank} Ranked
              </span>
            )}
          </div>

          <div className="text-center mb-6">
            <p className="text-gray-500 text-sm mb-2">Number</p>
            <p className="text-white text-2xl sm:text-5xl font-mono font-extrabold tracking-[0.3em] mb-3">
              {formatNumber(numberData?.number)}
            </p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="text-gray-400">Created {numberData?.createdAt}</span>
              <span className="text-gray-600">•</span>
              <span className={`font-medium flex items-center gap-1 ${(numberData?.trend || 0) >= 0 ? 'text-emerald-light' : 'text-rose-light'}`}>
                {(numberData?.trend || 0) >= 0 ? <FiTrendingUp /> : <FiTrendingDown />}
                {(numberData?.trend || 0) > 0 ? '+' : ''}{numberData?.trend || 0}% today
              </span>
            </div>
          </div>

          {/* Win Chance & Quick Stats */}
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
            <RadialChart percentage={winChance} size={100} strokeWidth={8} label="Win Chance" />
          </div>
        </div>

        {/* Price Chart */}
        {numberData?.priceHistory?.length > 0 && (
          <div className="p-4 border-t border-dark-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400 text-sm font-medium">Price & Vote Trend (30 days)</span>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={numberData.priceHistory} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1d2b3a', border: '1px solid #2b3f4e', borderRadius: '8px', color: '#fff' }}
                    formatter={(value, name) => [name === 'price' ? `${value} Z` : value, name === 'price' ? 'Price' : 'Votes']}
                  />
                  <Area type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={2} fill="url(#priceGradient)" dot={false} />
                  <Line type="monotone" dataKey="votes" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Owner & Actions */}
        <div className="p-4 border-t border-dark-600">
          <div className="flex flex-col sm:flex-row gap-3">
            {numberData?.owner ? (
              <div className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-dark-800/50 border border-dark-600/50">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/30 to-purple/30 flex items-center justify-center">
                  <FiUser className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-gray-500 text-xs">Owned by</p>
                  <p className="text-white font-semibold">{numberData.owner}</p>
                  <p className="text-gray-600 text-xs">Since {numberData.ownershipHistory?.[0]?.from}</p>
                </div>
                {!isOwner && (
                  <button
                    onClick={() => setShowOfferModal(true)}
                    className="px-5 py-2.5 rounded-lg bg-purple/20 text-purple-light font-semibold text-sm hover:bg-purple/30 border border-purple/30 transition-colors"
                  >
                    Make Offer
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleBuy}
                className="flex-1 py-3.5 rounded-xl bg-accent text-dark-900 font-bold text-lg hover:bg-accent-400 transition-colors flex items-center justify-center gap-2"
              >
                <GiTwoCoins className="w-5 h-5" />
                Buy for {numberData?.price || 10} Zynk
              </button>
            )}

            <div className="flex gap-2">
              <div className="flex items-center rounded-xl bg-dark-800 border border-dark-600">
                <button
                  onClick={() => setVoteCount(Math.max(1, voteCount - 1))}
                  className="px-3 py-3 text-gray-400 hover:text-white transition-colors"
                >
                  -
                </button>
                <span className="px-3 text-white font-semibold">{voteCount}</span>
                <button
                  onClick={() => setVoteCount(voteCount + 1)}
                  className="px-3 py-3 text-gray-400 hover:text-white transition-colors"
                >
                  +
                </button>
              </div>
              <button
                onClick={handleVote}
                className="px-6 py-3 rounded-xl bg-dark-600 text-white font-semibold hover:bg-dark-500 border border-dark-500 transition-colors flex items-center gap-2"
              >
                <FiThumbsUp className="w-5 h-5" />
                Vote ({voteCount} Z)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-dark-700 border border-dark-600">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium capitalize rounded-lg transition-all ${
              activeTab === tab
                ? 'bg-accent text-dark-900'
                : 'text-gray-400 hover:text-white hover:bg-dark-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stats Grid */}
              <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={FiThumbsUp} label="Total Votes" value={formatVotes(numberData?.votes)} trend={numberData?.trend} color="accent" />
                <StatCard icon={FiDollarSign} label="Current Price" value={`${numberData?.price} Z`} subValue="Market value" color="gold" />
                <StatCard icon={FiTarget} label="Win Chance" value={`${winChance.toFixed(2)}%`} subValue="Based on votes" color="purple" />
                <StatCard icon={FiAward} label="Times Won" value={numberData?.timesWon} subValue={`Last: ${numberData?.lastWon}`} color="emerald" />
                <StatCard icon={FiActivity} label="Avg Daily Votes" value={numberData?.avgDailyVotes} color="accent" />
                <StatCard icon={FiZap} label="Peak Votes" value={numberData?.peakVotes} subValue="All time high" color="gold" />
                <StatCard icon={FiUser} label="Unique Voters" value={numberData?.uniqueVoters} color="purple" />
                <StatCard icon={FiRepeat} label="Transactions" value={numberData?.totalTransactions} color="emerald" />
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <FiActivity className="w-4 h-4 text-accent" />
                  Recent Activity
                </h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {numberData?.activities?.map((activity, i) => (
                    <ActivityItem key={i} {...activity} />
                  ))}
                </div>
              </div>

              {/* Number Info */}
              <div className="lg:col-span-2 rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiHash className="w-4 h-4 text-accent" />
                  Number Details
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Created</p>
                    <p className="text-white font-medium">{numberData?.createdAt}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Last Won</p>
                    <p className="text-white font-medium">{numberData?.lastWon}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Global Rank</p>
                    <p className="text-white font-medium">#{numberData?.rank}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Pool Share</p>
                    <p className="text-accent font-medium">{winChance.toFixed(4)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total Owners</p>
                    <p className="text-white font-medium">{numberData?.ownershipHistory?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <p className={`font-medium ${numberData?.owner ? 'text-rose-light' : 'text-emerald-light'}`}>
                      {numberData?.owner ? 'Owned' : 'Available'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Similar Numbers */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <FiStar className="w-4 h-4 text-gold-light" />
                  Similar Numbers
                </h3>
                <div className="space-y-2">
                  {numberData?.similarNumbers?.map((num, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(`/number/${num.number}`)}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-dark-800/50 hover:bg-dark-800 cursor-pointer transition-colors"
                    >
                      <span className="font-mono text-white text-sm">{num.number.split('').join(' ')}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">{formatVotes(num.votes)} votes</span>
                        <span className={num.trend >= 0 ? 'text-emerald-light' : 'text-rose-light'}>
                          {num.trend > 0 ? '+' : ''}{num.trend}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Votes by Hour */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiBarChart2 className="w-4 h-4 text-accent" />
                  Votes by Hour (Today)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={numberData?.votesByHour}>
                      <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} interval={3} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1d2b3a', border: '1px solid #2b3f4e', borderRadius: '8px' }} />
                      <Bar dataKey="votes" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Digit Analysis */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiPieChart className="w-4 h-4 text-purple-light" />
                  Digit Analysis
                </h3>
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {numberData?.digits?.map((d, i) => (
                    <div key={i} className={`p-3 rounded-lg text-center ${d.isHot ? 'bg-accent/20 border border-accent/30' : 'bg-dark-800/50'}`}>
                      <p className="text-2xl font-mono font-bold text-white">{d.digit}</p>
                      <p className="text-[10px] text-gray-500">Pos {d.position}</p>
                      <p className={`text-xs font-medium ${d.isHot ? 'text-accent' : 'text-gray-400'}`}>
                        {d.isHot ? 'Hot' : 'Cold'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/30"></span> Hot Digit</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-dark-800"></span> Cold Digit</span>
                </div>
              </div>

              {/* Price vs Votes Correlation */}
              <div className="lg:col-span-2 rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiTrendingUp className="w-4 h-4 text-emerald-light" />
                  Price vs Votes Trend (30 Days)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={numberData?.priceHistory}>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <YAxis yAxisId="price" orientation="left" axisLine={false} tickLine={false} tick={{ fill: '#22c55e', fontSize: 10 }} />
                      <YAxis yAxisId="votes" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#8b5cf6', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1d2b3a', border: '1px solid #2b3f4e', borderRadius: '8px' }} />
                      <Line yAxisId="price" type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={2} dot={false} name="Price (Z)" />
                      <Line yAxisId="votes" type="monotone" dataKey="votes" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Votes" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-3 text-xs">
                  <span className="flex items-center gap-2"><span className="w-4 h-0.5 bg-accent"></span> Price</span>
                  <span className="flex items-center gap-2"><span className="w-4 h-0.5 bg-purple"></span> Votes</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Ownership History */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiUser className="w-4 h-4 text-accent" />
                  Ownership History
                </h3>
                <div className="space-y-3">
                  {numberData?.ownershipHistory?.map((h, i) => (
                    <div key={i} className="relative pl-6 pb-4 border-l-2 border-dark-600 last:pb-0">
                      <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-accent"></div>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-medium">{h.owner || 'Unclaimed'}</p>
                          <p className="text-gray-500 text-xs">{h.from} - {h.to}</p>
                          <p className="text-gray-600 text-xs">{h.duration}</p>
                        </div>
                        <span className="text-gold-light text-sm font-medium">{h.price} Z</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiClock className="w-4 h-4 text-purple-light" />
                  Activity Timeline
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {numberData?.activities?.map((activity, i) => (
                    <ActivityItem key={i} {...activity} />
                  ))}
                </div>
              </div>

              {/* Vote History Chart */}
              <div className="lg:col-span-2 rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiThumbsUp className="w-4 h-4 text-accent" />
                  Vote History (30 Days)
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={numberData?.voteHistory}>
                      <defs>
                        <linearGradient id="voteGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1d2b3a', border: '1px solid #2b3f4e', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="votes" stroke="#8b5cf6" strokeWidth={2} fill="url(#voteGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'offers' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pending Offers */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FiDollarSign className="w-4 h-4 text-gold-light" />
                  Pending Offers ({pendingOffers.length})
                </h3>
                {pendingOffers.length > 0 ? (
                  <div className="space-y-3">
                    {pendingOffers.map((offer) => (
                      <div key={offer.id} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-dark-600/50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple/20 flex items-center justify-center">
                            <FiUser className="w-5 h-5 text-purple-light" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{offer.from}</p>
                            <p className="text-gray-500 text-xs">Expires in {offer.expires}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-gold-light font-bold">{offer.amount} Z</p>
                          {isOwner && (
                            <div className="flex gap-1 mt-1">
                              <button
                                onClick={() => handleAcceptOffer(offer.id)}
                                className="px-2 py-1 text-xs rounded bg-accent/20 text-accent hover:bg-accent/30"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleRejectOffer(offer.id)}
                                className="px-2 py-1 text-xs rounded bg-rose/20 text-rose-light hover:bg-rose/30"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No pending offers
                  </div>
                )}
              </div>

              {/* Make Offer Card */}
              <div className="rounded-xl bg-dark-700 border border-dark-600 p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <GiTwoCoins className="w-4 h-4 text-accent" />
                  Make an Offer
                </h3>
                {numberData?.owner && !isOwner ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Offer Amount (Zynk)</label>
                      <input
                        type="number"
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-dark-800 border border-dark-600 text-white text-lg font-semibold focus:outline-none focus:border-accent"
                        placeholder="Enter amount..."
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Current Price</span>
                      <span className="text-white">{numberData?.price} Z</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Suggested Offer</span>
                      <span className="text-accent">{Math.round((numberData?.price || 10) * 1.2)} Z (+20%)</span>
                    </div>
                    <button
                      onClick={handleOffer}
                      className="w-full py-3 rounded-lg bg-accent text-dark-900 font-bold hover:bg-accent-400 transition-colors"
                    >
                      Send Offer
                    </button>
                  </div>
                ) : numberData?.owner && isOwner ? (
                  <div className="text-center py-8">
                    <FiShield className="w-12 h-12 text-accent mx-auto mb-3" />
                    <p className="text-white font-medium">You own this number</p>
                    <p className="text-gray-500 text-sm">Manage offers from the pending list</p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <GiTwoCoins className="w-12 h-12 text-gold-light mx-auto mb-3" />
                    <p className="text-white font-medium">This number is available</p>
                    <p className="text-gray-500 text-sm mb-4">Buy it directly instead of making an offer</p>
                    <button
                      onClick={handleBuy}
                      className="px-6 py-2.5 rounded-lg bg-accent text-dark-900 font-semibold hover:bg-accent-400 transition-colors"
                    >
                      Buy for {numberData?.price} Z
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Offer Modal */}
      {showOfferModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowOfferModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-700 rounded-2xl p-6 w-full max-w-md border border-dark-600"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold text-xl mb-2">Make an Offer</h3>
            <p className="text-gray-400 text-sm mb-6">
              Offer to buy <span className="text-white font-mono">{formatNumber(number)}</span> from {numberData?.owner}
            </p>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Offer Amount (Zynk)</label>
              <input
                type="number"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="w-full px-4 py-4 rounded-xl bg-dark-800 border border-dark-600 text-white text-xl font-bold focus:outline-none focus:border-accent text-center"
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-between text-sm mb-6 p-3 rounded-lg bg-dark-800/50">
              <span className="text-gray-500">Current market price</span>
              <span className="text-gold-light font-semibold">{numberData?.price} Z</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOfferModal(false)}
                className="flex-1 py-3.5 rounded-xl bg-dark-600 text-white font-semibold hover:bg-dark-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleOffer}
                className="flex-1 py-3.5 rounded-xl bg-accent text-dark-900 font-bold hover:bg-accent-400 transition-colors"
              >
                Send Offer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default NumberDetail;
