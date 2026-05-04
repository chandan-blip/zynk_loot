import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiZap,
  FiAward,
  FiChevronRight,
  FiArrowUpRight,
  FiArrowDownRight,
  FiSend,
  FiShoppingCart,
  FiHeart,
  FiPlay,
  FiStar,
  FiTarget,
  FiLayers,
  FiGrid,
  FiCrosshair,
  FiGift,
  FiAlertTriangle,
  FiClock,
  FiDollarSign,
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiPodium, GiCardJackHearts, GiCardJoker } from "react-icons/gi";
import { Link } from "react-router-dom";
import OnboardingGuide from "../components/OnboardingGuide";
import FloatingSocialIcons from "../components/FloatingSocialIcons";
import BannerCarousel from "../components/BannerCarousel";
import {
  MutkaPreview,
  UnoPreview,
  SevenDigitPreview,
  CoinFlipPreview,
  DiceRollPreview,
  LuckySpinPreview,
  BalloonPopPreview,
  DragonTowerPreview,
  IceFieldPreview,
  ArrowRoulettePreview,
  EggHatchPreview,
  FusePreview,
} from "../components/GamePreviews";
import { getRecentActivities, getRecentWinners } from "../services/api";
import socketService from "../services/socket";
import { useCurrency } from "../contexts/CurrencyContext";
import usePageTitle from "../hooks/usePageTitle";

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function Home() {
  usePageTitle('Home');
  const { formatCurrency } = useCurrency();

  const formatActivityDescription = (activity) => {
    if (!activity?.description) return '';
    if (!activity?.amount) return activity.description;
    return activity.description.replace(`${activity.amount}Z`, formatCurrency(activity.amount));
  };

  const [recentActivities, setRecentActivities] = useState([]);
  const [lastWinners, setLastWinners] = useState([]);

  const activityMeta = {
    vote: { icon: FiHeart, color: 'text-pink-400', bgColor: 'bg-pink-500/20' },
    buy: { icon: FiShoppingCart, color: 'text-accent', bgColor: 'bg-accent/20' },
    sell: { icon: FiArrowUpRight, color: 'text-purple-light', bgColor: 'bg-purple/20' },
    win: { icon: FiAward, color: 'text-gold-light', bgColor: 'bg-gold/20' },
    zynk_buy: { icon: FiDollarSign, color: 'text-emerald-light', bgColor: 'bg-emerald/20' },
    transfer: { icon: FiSend, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    withdrawal: { icon: FiArrowDownRight, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
    game_win: { icon: FiAward, color: 'text-emerald-light', bgColor: 'bg-emerald/20' },
    game_play: { icon: FiPlay, color: 'text-purple-light', bgColor: 'bg-purple/20' },
  };

  useEffect(() => {
    getRecentWinners(10).then(res => {
      const winnersData = res.data.data || [];
      setLastWinners(winnersData.map(w => ({
        id: w.id,
        username: w.name || w.username || 'Winner',
        number: w.platform ? w.platform.toUpperCase() : (w.number || ''),
        prize: Number(w.amount ?? w.prize ?? 0),
        time: formatTimeAgo(w.createdAt),
      })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getRecentActivities().then(res => {
      const items = (res.data.data || []).map(a => {
        const meta = activityMeta[a.type] || activityMeta.buy;
        return {
          ...a,
          ...meta,
          time: `${Math.max(1, Math.floor((Date.now() - a.timestamp) / 1000))}s ago`
        };
      });
      if (items.length > 0) setRecentActivities(items);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsub = socketService.onActivityNew?.((activity) => {
      const meta = activityMeta[activity.type] || activityMeta.buy;
      const enriched = { ...activity, ...meta };

      setRecentActivities(prev => {
        const filtered = prev.filter(a => a.id !== enriched.id);
        const updated = [enriched, ...filtered].slice(0, 15);
        return updated.map((act, idx) => ({
          ...act,
          time: idx === 0 ? 'Just now' : `${Math.floor((Date.now() - act.timestamp) / 1000)}s ago`
        }));
      });
    });

    return () => unsub?.();
  }, []);

  const lotteryGames = [
    {
      name: '7-Digit Lottery',
      tagline: 'Hourly digit reveals · 3 daily sessions',
      icon: GiTrophy,
      maxWin: '80% Pool',
      color: 'from-gold/20 via-accent/10 to-purple/20',
      border: 'border-gold/30',
      iconColor: 'text-gold-light',
      path: '/games/lottery',
      Preview: SevenDigitPreview,
    },
    {
      name: 'Mutka King',
      tagline: '4-card draw · pick 1–4 · win big',
      icon: GiCardJackHearts,
      maxWin: '500x',
      color: 'from-amber-500/20 via-red-500/10 to-purple/20',
      border: 'border-amber-500/30',
      iconColor: 'text-amber-300',
      path: '/games/mutka-king',
      Preview: MutkaPreview,
    },
    {
      name: 'UNO King',
      tagline: '54-card UNO draw · cards · color · wild',
      icon: GiCardJoker,
      maxWin: '500x',
      color: 'from-red-500/20 via-yellow-500/10 to-blue-500/20',
      border: 'border-red-500/30',
      iconColor: 'text-red-400',
      path: '/games/uno-king',
      Preview: UnoPreview,
    },
  ];

  const instantGames = [
    { name: 'Coin Flip',     icon: GiTwoCoins,       maxWin: '1.95x', color: 'from-yellow-500/20 to-amber-500/20', border: 'border-yellow-500/30', iconColor: 'text-yellow-400', path: '/games/coin-flip',      Preview: CoinFlipPreview },
    { name: 'Dice Roll',     icon: FiZap,            maxWin: '5.7x',  color: 'from-blue-500/20 to-cyan-500/20',     border: 'border-blue-500/30',   iconColor: 'text-blue-400',   path: '/games/dice-roll',      Preview: DiceRollPreview },
    { name: 'Lucky Spin',    icon: FiStar,           maxWin: '10x',   color: 'from-purple-500/20 to-pink-500/20',   border: 'border-purple-500/30', iconColor: 'text-purple-400', path: '/games/lucky-spin',     Preview: LuckySpinPreview },
    { name: 'Balloon Pop',   icon: FiTarget,         maxWin: '50x',   color: 'from-red-500/20 to-pink-500/20',      border: 'border-red-500/30',    iconColor: 'text-red-400',    path: '/games/balloon-pop',    Preview: BalloonPopPreview },
    { name: 'Dragon Tower',  icon: FiLayers,         maxWin: '200x',  color: 'from-amber-500/20 to-orange-500/20',  border: 'border-amber-500/30',  iconColor: 'text-amber-400',  path: '/games/dragon-tower',   Preview: DragonTowerPreview },
    { name: 'Ice Field',     icon: FiGrid,           maxWin: '84x',   color: 'from-cyan-500/20 to-blue-500/20',     border: 'border-cyan-500/30',   iconColor: 'text-cyan-400',   path: '/games/ice-field',      Preview: IceFieldPreview },
    { name: 'Arrow Roulette',icon: FiCrosshair,      maxWin: '10x',   color: 'from-red-500/20 to-orange-500/20',    border: 'border-red-500/30',    iconColor: 'text-red-400',    path: '/games/arrow-roulette', Preview: ArrowRoulettePreview },
    { name: 'Egg Hatch',     icon: FiGift,           maxWin: '15x',   color: 'from-amber-500/20 to-yellow-500/20',  border: 'border-amber-500/30',  iconColor: 'text-amber-400',  path: '/games/egg-hatch',      Preview: EggHatchPreview },
    { name: 'Fuse',          icon: FiAlertTriangle,  maxWin: '50x',   color: 'from-orange-500/20 to-red-500/20',    border: 'border-orange-500/30', iconColor: 'text-orange-400', path: '/games/fuse',           Preview: FusePreview },
  ];

  return (
    <>
      <OnboardingGuide />
      <FloatingSocialIcons />

      <div className="space-y-3">
        {/* Banner Carousel */}
        <BannerCarousel />

        {/* Live Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              <h3 className="text-white font-semibold text-sm">Live Activity</h3>
            </div>
            <span className="text-gray-500 text-xs px-4 py-2.5">{recentActivities.length} recent</span>
          </div>

          <div className="relative px-4 pb-4 pt-1">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
              <AnimatePresence initial={false} mode="popLayout">
                {recentActivities.map((activity) => {
                  const IconComponent = activity.icon;
                  return (
                    <motion.div
                      key={activity.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{
                        layout: { type: 'spring', stiffness: 300, damping: 30 },
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 },
                      }}
                      className="flex-shrink-0 w-full sm:w-max justify-between flex items-center gap-2 px-3 py-3 rounded-lg bg-dark-800/80 border border-dark-600/50 hover:border-dark-500 overflow-hidden"
                      style={{ willChange: 'opacity, transform' }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full ${activity.bgColor} flex items-center justify-center flex-shrink-0`}>
                          <IconComponent className={`w-3.5 h-3.5 ${activity.color}`} />
                        </div>
                        <div className="flex flex-col flex-shrink-0">
                          <span className="text-white text-xs font-medium whitespace-nowrap">
                            {activity.username}
                          </span>
                          <span className="text-accent-500 text-[10px] whitespace-nowrap">
                            {formatActivityDescription(activity)}
                          </span>
                        </div>
                      </div>
                      <span className="text-gray-600 text-[10px] ml-1 whitespace-nowrap flex-shrink-0">
                        {activity.time}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Lottery Games */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
              <GiTrophy className="w-4 h-4 text-gold-light" />
              <h3 className="text-white font-semibold text-sm">Lottery Games</h3>
            </div>
            <Link to="/games" className="text-accent text-xs font-medium flex items-center gap-1 hover:underline px-4 py-2.5">
              View All <FiChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4 pt-1">
            {lotteryGames.map((game) => (
              <Link key={game.name} to={game.path} className="block">
                <div className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.border} p-4 hover:brightness-110 transition-all overflow-hidden min-h-[110px]`}>
                  {game.Preview ? (
                    <game.Preview />
                  ) : (
                    <game.icon className={`absolute -right-3 -bottom-3 w-24 h-24 ${game.iconColor} opacity-[0.10]`} />
                  )}
                  <div className="relative flex items-start gap-3">
                    <div className="w-11 h-11 shrink-0 rounded-lg bg-dark-700/60 border border-white/10 flex items-center justify-center">
                      <game.icon className={`w-5 h-5 ${game.iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white text-sm font-bold truncate">{game.name}</p>
                        <span className="text-gold-light text-[10px] font-bold whitespace-nowrap">{game.maxWin}</span>
                      </div>
                      <p className="text-gray-400 text-[11px] mt-1 flex items-center gap-1">
                        <FiClock className="w-3 h-3" />
                        {game.tagline}
                      </p>
                      <div className="mt-2.5 inline-flex items-center gap-1 text-accent text-[11px] font-semibold">
                        <FiPlay className="w-3 h-3" />
                        Play now <FiChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Instant Games */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
              <FiPlay className="w-4 h-4 text-accent" />
              <h3 className="text-white font-semibold text-sm">Instant Games</h3>
            </div>
            <Link to="/games" className="text-accent text-xs font-medium flex items-center gap-1 hover:underline px-4 py-2.5">
              View All <FiChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-4 pt-1">
            {instantGames.map((game) => (
              <Link
                key={game.name}
                to={game.path}
                className="flex-shrink-0 snap-center w-[calc(50%-6px)] sm:w-[calc(33.33%-8px)] md:w-[calc(25%-9px)]"
              >
                <div className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.border} p-3 hover:brightness-110 transition-all overflow-hidden min-h-[80px]`}>
                  {game.Preview ? (
                    <game.Preview />
                  ) : (
                    <game.icon className={`absolute -right-2 -bottom-2 w-16 h-16 ${game.iconColor} opacity-[0.08]`} />
                  )}
                  <div className="relative flex items-start gap-2.5">
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-dark-700/60 border border-white/10 flex items-center justify-center">
                      <game.icon className={`w-4 h-4 ${game.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{game.name}</p>
                      <p className="text-accent text-[10px] font-bold mt-0.5">up to {game.maxWin}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Winners */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-2">
            <div className="bg-dark-800/30 rounded-br-2xl px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <GiPodium className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-bold text-sm sm:text-base truncate">Recent Winners</h3>
                <p className="text-gray-500 text-[11px] sm:text-xs truncate">Live payouts · updated daily</p>
              </div>
            </div>
            <Link
              to="/winners"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 mr-3 sm:mr-4 mt-3 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-xs font-semibold transition-colors shrink-0"
            >
              <span className="hidden xs:inline">View All</span><span className="xs:hidden">All</span> <FiChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="relative space-y-2 px-3 sm:px-5 pb-3 sm:pb-5 pt-3 sm:pt-4">
            {lastWinners.length > 0 ? (
              lastWinners.slice(0, 5).map((winner, index) => {
                const platformColors = {
                  PHONEPE: 'from-purple-500 to-purple-700',
                  GPAY: 'from-blue-500 to-green-500',
                  PAYTM: 'from-sky-400 to-blue-600',
                  FAMPAY: 'from-yellow-400 to-orange-500',
                  MOBIKWIK: 'from-emerald-400 to-teal-600',
                  AMAZONPAY: 'from-yellow-400 to-amber-600',
                };
                const gradient = platformColors[winner.number] || 'from-accent to-accent/50';
                const initial = (winner.username?.[0] || 'W').toUpperCase();
                return (
                  <motion.div
                    key={winner.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="group flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-dark-800/60 hover:bg-dark-800 border border-dark-600/50 hover:border-accent/30 transition-all"
                  >
                    <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-lg shrink-0`}>
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-white font-semibold text-xs sm:text-sm truncate">{winner.username}</span>
                        {winner.number && (
                          <span className={`px-1.5 py-0.5 rounded bg-gradient-to-r ${gradient} text-white text-[9px] font-bold uppercase tracking-wide shrink-0`}>
                            {winner.number}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-500 truncate">{winner.time}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-400 text-sm sm:text-base leading-tight whitespace-nowrap">
                        ₹{Number(winner.prize).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-gray-600 uppercase tracking-wide">received</p>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="text-center py-8">
                <GiTrophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500">No winners yet</p>
                <p className="text-gray-600 text-sm">Be the first to win!</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}

export default Home;
