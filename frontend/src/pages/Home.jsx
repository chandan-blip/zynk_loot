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
  FiShield,
  FiUsers,
  FiCheckCircle,
  FiTrendingUp,
  FiHeadphones,
  FiRefreshCw,
  FiDownload,
  FiX,
  FiSmartphone,
} from "react-icons/fi";
import {
  GiTwoCoins,
  GiTrophy,
  GiPodium,
  GiCardJackHearts,
  GiCardJoker,
  GiCardRandom,
} from "react-icons/gi";
import { Link } from "react-router-dom";
import OnboardingGuide from "../components/OnboardingGuide";
import FloatingSocialIcons from "../components/FloatingSocialIcons";
import BannerCarousel from "../components/BannerCarousel";
import TopWinnersStage from "../components/TopWinnersStage";
import AllGamesAtAGlance from "../components/AllGamesAtAGlance";
import {
  MutkaPreview,
  UnoPreview,
  ShuffleCardPreview,
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

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function Home() {
  usePageTitle("Home");
  const { formatCurrency } = useCurrency();

  const formatActivityDescription = (activity) => {
    if (!activity?.description) return "";
    if (!activity?.amount) return activity.description;
    return activity.description.replace(
      `${activity.amount}Z`,
      formatCurrency(activity.amount),
    );
  };

  const [recentActivities, setRecentActivities] = useState([]);
  const [lastWinners, setLastWinners] = useState([]);

  // Android APK download banner
  const APK_URL = '/loot.apk';
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    // Show only on Android devices.
    const isAndroid = /android/i.test(navigator.userAgent || '');
    if (!isAndroid) return;

    // Suppress for 7 days after the user dismisses.
    const dismissedAt = parseInt(localStorage.getItem('apkPromptDismissedAt') || '0', 10);
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

    setShowInstall(true);
  }, []);

  const handleInstallClick = () => {
    // Triggers an APK download. The user will get an "install from this source"
    // prompt on Android once the file lands in their Downloads folder.
    const a = document.createElement('a');
    a.href = APK_URL;
    a.download = 'loot.apk';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDismissInstall = () => {
    setShowInstall(false);
    localStorage.setItem('apkPromptDismissedAt', Date.now().toString());
  };

  const activityMeta = {
    vote: { icon: FiHeart, color: "text-pink-400", bgColor: "bg-pink-500/20" },
    buy: {
      icon: FiShoppingCart,
      color: "text-accent",
      bgColor: "bg-accent/20",
    },
    sell: {
      icon: FiArrowUpRight,
      color: "text-purple-light",
      bgColor: "bg-purple/20",
    },
    win: { icon: FiAward, color: "text-gold-light", bgColor: "bg-gold/20" },
    zynk_buy: {
      icon: FiDollarSign,
      color: "text-emerald-light",
      bgColor: "bg-emerald/20",
    },
    transfer: {
      icon: FiSend,
      color: "text-blue-400",
      bgColor: "bg-blue-500/20",
    },
    withdrawal: {
      icon: FiArrowDownRight,
      color: "text-orange-400",
      bgColor: "bg-orange-500/20",
    },
    game_win: {
      icon: FiAward,
      color: "text-emerald-light",
      bgColor: "bg-emerald/20",
    },
    game_play: {
      icon: FiPlay,
      color: "text-purple-light",
      bgColor: "bg-purple/20",
    },
    bonus_daily: {
      icon: FiGift,
      color: "text-amber-300",
      bgColor: "bg-amber-500/20",
    },
    bonus_weekly: {
      icon: FiGift,
      color: "text-emerald-300",
      bgColor: "bg-emerald-500/20",
    },
    bonus_monthly: {
      icon: FiGift,
      color: "text-fuchsia-300",
      bgColor: "bg-fuchsia-500/20",
    },
    bonus_first_deposit: {
      icon: FiGift,
      color: "text-accent",
      bgColor: "bg-accent/20",
    },
    invest: {
      icon: FiTrendingUp,
      color: "text-purple-light",
      bgColor: "bg-purple/20",
    },
    invest_return: {
      icon: FiTrendingUp,
      color: "text-emerald-light",
      bgColor: "bg-emerald/20",
    },
  };

  useEffect(() => {
    getRecentWinners(10)
      .then((res) => {
        const winnersData = res.data.data || [];
        setLastWinners(
          winnersData.map((w) => ({
            id: w.id,
            username: w.name || w.username || "Winner",
            number: w.platform ? w.platform.toUpperCase() : w.number || "",
            prize: Number(w.amount ?? w.prize ?? 0),
            time: formatTimeAgo(w.createdAt),
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getRecentActivities()
      .then((res) => {
        const items = (res.data.data || []).map((a) => {
          const meta = activityMeta[a.type] || activityMeta.buy;
          return {
            ...a,
            ...meta,
            time: `${Math.max(1, Math.floor((Date.now() - a.timestamp) / 1000))}s ago`,
          };
        });
        if (items.length > 0) setRecentActivities(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsub = socketService.onActivityNew?.((activity) => {
      const meta = activityMeta[activity.type] || activityMeta.buy;
      const enriched = { ...activity, ...meta };

      setRecentActivities((prev) => {
        const filtered = prev.filter((a) => a.id !== enriched.id);
        const updated = [enriched, ...filtered].slice(0, 15);
        return updated.map((act, idx) => ({
          ...act,
          time:
            idx === 0
              ? "Just now"
              : `${Math.floor((Date.now() - act.timestamp) / 1000)}s ago`,
        }));
      });
    });

    return () => unsub?.();
  }, []);

  const lotteryGames = [
    {
      name: "Shuffle Card",
      tagline: "60s rounds · 3 cards · live pattern study",
      icon: GiCardRandom,
      maxWin: "500x",
      color: "from-emerald-500/20 via-amber-500/10 to-purple/20",
      border: "border-emerald-500/30",
      iconColor: "text-emerald-300",
      path: "/games/shuffle-card",
      Preview: ShuffleCardPreview,
    },
    {
      name: "Mutka King",
      tagline: "4-card draw · pick 1–4 · win big",
      icon: GiCardJackHearts,
      maxWin: "500x",
      color: "from-amber-500/20 via-red-500/10 to-purple/20",
      border: "border-amber-500/30",
      iconColor: "text-amber-300",
      path: "/games/mutka-king",
      Preview: MutkaPreview,
    },
    {
      name: "UNO King",
      tagline: "54-card UNO draw · cards · color · wild",
      icon: GiCardJoker,
      maxWin: "500x",
      color: "from-red-500/20 via-yellow-500/10 to-blue-500/20",
      border: "border-red-500/30",
      iconColor: "text-red-400",
      path: "/games/uno-king",
      Preview: UnoPreview,
    },
    {
      name: "7-Digit Lottery",
      tagline: "Hourly digit reveals · 3 daily sessions",
      icon: GiTrophy,
      maxWin: "80% Pool",
      color: "from-gold/20 via-accent/10 to-purple/20",
      border: "border-gold/30",
      iconColor: "text-gold-light",
      path: "/games/lottery",
      Preview: SevenDigitPreview,
    },
  ];

  const instantGames = [
    {
      name: "Coin Flip",
      icon: GiTwoCoins,
      maxWin: "1.95x",
      color: "from-yellow-500/20 to-amber-500/20",
      border: "border-yellow-500/30",
      iconColor: "text-yellow-400",
      path: "/games/coin-flip",
      Preview: CoinFlipPreview,
    },
    {
      name: "Dice Roll",
      icon: FiZap,
      maxWin: "5.7x",
      color: "from-blue-500/20 to-cyan-500/20",
      border: "border-blue-500/30",
      iconColor: "text-blue-400",
      path: "/games/dice-roll",
      Preview: DiceRollPreview,
    },
    {
      name: "Lucky Spin",
      icon: FiStar,
      maxWin: "10x",
      color: "from-purple-500/20 to-pink-500/20",
      border: "border-purple-500/30",
      iconColor: "text-purple-400",
      path: "/games/lucky-spin",
      Preview: LuckySpinPreview,
    },
    {
      name: "Balloon Pop",
      icon: FiTarget,
      maxWin: "50x",
      color: "from-red-500/20 to-pink-500/20",
      border: "border-red-500/30",
      iconColor: "text-red-400",
      path: "/games/balloon-pop",
      Preview: BalloonPopPreview,
    },
    {
      name: "Dragon Tower",
      icon: FiLayers,
      maxWin: "200x",
      color: "from-amber-500/20 to-orange-500/20",
      border: "border-amber-500/30",
      iconColor: "text-amber-400",
      path: "/games/dragon-tower",
      Preview: DragonTowerPreview,
    },
    {
      name: "Ice Field",
      icon: FiGrid,
      maxWin: "84x",
      color: "from-cyan-500/20 to-blue-500/20",
      border: "border-cyan-500/30",
      iconColor: "text-cyan-400",
      path: "/games/ice-field",
      Preview: IceFieldPreview,
    },
    {
      name: "Arrow Roulette",
      icon: FiCrosshair,
      maxWin: "10x",
      color: "from-red-500/20 to-orange-500/20",
      border: "border-red-500/30",
      iconColor: "text-red-400",
      path: "/games/arrow-roulette",
      Preview: ArrowRoulettePreview,
    },
    {
      name: "Egg Hatch",
      icon: FiGift,
      maxWin: "15x",
      color: "from-amber-500/20 to-yellow-500/20",
      border: "border-amber-500/30",
      iconColor: "text-amber-400",
      path: "/games/egg-hatch",
      Preview: EggHatchPreview,
    },
    {
      name: "Fuse",
      icon: FiAlertTriangle,
      maxWin: "50x",
      color: "from-orange-500/20 to-red-500/20",
      border: "border-orange-500/30",
      iconColor: "text-orange-400",
      path: "/games/fuse",
      Preview: FusePreview,
    },
  ];

  return (
    <>
      <OnboardingGuide />
      <FloatingSocialIcons />

      <div className="space-y-3">
        {/* Banner Carousel */}
        <BannerCarousel />

        {/* Free money / bonuses entry — daily, weekly, monthly + 2x first deposit */}
        <Link to="/bonus" className="block">
          <div
            className="relative rounded-2xl overflow-hidden border border-emerald-500/15 cursor-pointer"
            style={{
              background:
                'linear-gradient(135deg, #0f4c4a 0%, #082b2a 55%, #050a0a 100%)',
            }}
          >
            {/* Soft glow behind the money so the card feels lit from the right */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 82% 55%, rgba(16,185,129,0.22), transparent 62%)',
              }}
            />
            <div className="relative flex items-center justify-between px-5 py-4 sm:py-5">
              <div className="min-w-0">
                <h3 className="text-white text-xl sm:text-2xl font-black leading-tight tracking-tight">
                  Free<br />money
                </h3>
                <p className="text-emerald-300/80 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] mt-1.5">
                  Daily · Weekly · Monthly
                </p>
              </div>
              <span
                style={{ filter: 'drop-shadow(0 6px 14px rgba(16,185,129,0.35))' }}
                className="text-7xl sm:text-6xl select-none shrink-0 ml-3"
                aria-hidden="true"
              >
                💸
              </span>
            </div>
          </div>
        </Link>

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
              <h3 className="text-white font-semibold text-sm">
                Live Activity
              </h3>
            </div>
            <span className="text-gray-500 text-xs px-4 py-2.5">
              {recentActivities.length} recent
            </span>
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
                        layout: { type: "spring", stiffness: 300, damping: 30 },
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 },
                      }}
                      className="flex-shrink-0 w-full sm:w-max justify-between flex items-center gap-2 px-3 py-3 rounded-lg bg-dark-800/80 border border-dark-600/50 hover:border-dark-500 overflow-hidden"
                      style={{ willChange: "opacity, transform" }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full ${activity.bgColor} flex items-center justify-center flex-shrink-0`}
                        >
                          <IconComponent
                            className={`w-3.5 h-3.5 ${activity.color}`}
                          />
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
              <h3 className="text-white font-semibold text-sm">
                Lottery Games
              </h3>
            </div>
            <Link
              to="/games"
              className="text-accent text-xs font-medium flex items-center gap-1 hover:underline px-4 py-2.5"
            >
              View All <FiChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4 pt-1">
            {lotteryGames.map((game) => (
              <Link key={game.name} to={game.path} className="block">
                <div
                  className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.border} p-4 hover:brightness-110 transition-all overflow-hidden min-h-[110px]`}
                >
                  {game.Preview ? (
                    <game.Preview />
                  ) : (
                    <game.icon
                      className={`absolute -right-3 -bottom-3 w-24 h-24 ${game.iconColor} opacity-[0.10]`}
                    />
                  )}
                  <div className="relative flex items-start gap-3">
                    <div className="w-11 h-11 shrink-0 rounded-lg bg-dark-700/60 border border-white/10 flex items-center justify-center">
                      <game.icon className={`w-5 h-5 ${game.iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white text-sm font-bold truncate">
                          {game.name}
                        </p>
                        <span className="text-gold-light text-[10px] font-bold whitespace-nowrap">
                          {game.maxWin}
                        </span>
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
              <h3 className="text-white font-semibold text-sm">
                Instant Games
              </h3>
            </div>
            <Link
              to="/games"
              className="text-accent text-xs font-medium flex items-center gap-1 hover:underline px-4 py-2.5"
            >
              View All <FiChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-1">
            {instantGames.slice(0, 6).map((game) => (
              <Link key={game.name} to={game.path} className="block">
                <div
                  className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.border} p-3 hover:brightness-110 transition-all overflow-hidden min-h-[80px]`}
                >
                  {game.Preview ? (
                    <game.Preview />
                  ) : (
                    <game.icon
                      className={`absolute -right-2 -bottom-2 w-16 h-16 ${game.iconColor} opacity-[0.08]`}
                    />
                  )}
                  <div className="relative flex items-start gap-2.5">
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-dark-700/60 border border-white/10 flex items-center justify-center">
                      <game.icon className={`w-4 h-4 ${game.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-semibold truncate">
                        {game.name}
                      </p>
                      <p className="text-accent text-[10px] font-bold mt-0.5">
                        up to {game.maxWin}
                      </p>
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
                <h3 className="text-white font-bold text-sm sm:text-base truncate">
                  Recent Winners
                </h3>
                <p className="text-gray-500 text-[11px] sm:text-xs truncate">
                  Live payouts · updated daily
                </p>
              </div>
            </div>
            <Link
              to="/winners"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 mr-3 sm:mr-4 mt-3 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-xs font-semibold transition-colors shrink-0"
            >
              <span className="hidden xs:inline">View All</span>
              <span className="xs:hidden">All</span>{" "}
              <FiChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="relative space-y-2 px-3 sm:px-5 pb-3 sm:pb-5 pt-3 sm:pt-4">
            {lastWinners.length > 0 ? (
              lastWinners.slice(0, 5).map((winner, index) => {
                const platformColors = {
                  PHONEPE: "from-purple-500 to-purple-700",
                  GPAY: "from-blue-500 to-green-500",
                  PAYTM: "from-sky-400 to-blue-600",
                  FAMPAY: "from-yellow-400 to-orange-500",
                  MOBIKWIK: "from-emerald-400 to-teal-600",
                  AMAZONPAY: "from-yellow-400 to-amber-600",
                };
                const gradient =
                  platformColors[winner.number] || "from-accent to-accent/50";
                const initial = (winner.username?.[0] || "W").toUpperCase();
                return (
                  <motion.div
                    key={winner.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="group flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-dark-800/60 hover:bg-dark-800 border border-dark-600/50 hover:border-accent/30 transition-all"
                  >
                    <div
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-lg shrink-0`}
                    >
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-white font-semibold text-xs sm:text-sm truncate">
                          {winner.username}
                        </span>
                        {winner.number && (
                          <span
                            className={`px-1.5 py-0.5 rounded bg-gradient-to-r ${gradient} text-white text-[9px] font-bold uppercase tracking-wide shrink-0`}
                          >
                            {winner.number}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-500 truncate">
                        {winner.time}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-400 text-sm sm:text-base leading-tight whitespace-nowrap">
                        ₹{Number(winner.prize).toLocaleString("en-IN")}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-gray-600 uppercase tracking-wide">
                        received
                      </p>
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

        {/* Hall of Champions — canvas-rendered hanging-medallion stage. */}
        {lastWinners.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.11 }}
            className="rounded-2xl overflow-hidden border border-white/5 bg-dark-700/50"
          >
            <div className="flex items-start justify-between">
              <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
                <GiTrophy className="w-4 h-4 text-gold-light" />
                <h3 className="text-white font-semibold text-sm">Top Winners</h3>
              </div>
            </div>
            <TopWinnersStage
              winners={[...lastWinners]
                .sort((a, b) => Number(b.prize) - Number(a.prize))
                .slice(0, 3)}
            />
          </motion.div>
        )}

        {/* Hot Promotions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
              <FiGift className="w-4 h-4 text-pink-400" />
              <h3 className="text-white font-semibold text-sm">
                Hot Promotions
              </h3>
            </div>
            <span className="text-pink-400 text-[10px] font-bold flex items-center gap-1 px-4 py-2.5 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse" />
              Limited
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4 pt-1">
            <Link to="/wallet" className="block">
              <div className="relative rounded-xl bg-gradient-to-br from-pink-500/20 via-purple/20 to-accent/20 border border-pink-500/30 p-4 hover:brightness-110 transition-all overflow-hidden min-h-[110px]">
                <FiGift className="absolute -right-3 -bottom-3 w-24 h-24 text-pink-400 opacity-[0.10]" />
                <div className="relative">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-pink-500/30 text-pink-200 text-[9px] font-bold uppercase tracking-wide mb-2">
                    New User
                  </span>
                  <p className="text-white text-base font-bold">
                    100% Welcome Bonus
                  </p>
                  <p className="text-gray-300 text-[11px] mt-1">
                    Double your first deposit up to ₹5,000
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-1 text-accent text-[11px] font-semibold">
                    Claim now <FiChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/wallet" className="block">
              <div className="relative rounded-xl bg-gradient-to-br from-emerald-500/20 via-accent/20 to-blue-500/20 border border-emerald-500/30 p-4 hover:brightness-110 transition-all overflow-hidden min-h-[110px]">
                <FiRefreshCw className="absolute -right-3 -bottom-3 w-24 h-24 text-emerald-400 opacity-[0.10]" />
                <div className="relative">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 text-[9px] font-bold uppercase tracking-wide mb-2">
                    Daily
                  </span>
                  <p className="text-white text-base font-bold">
                    Daily Cashback 10%
                  </p>
                  <p className="text-gray-300 text-[11px] mt-1">
                    Lose nothing — get back 10% every 24h
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-1 text-accent text-[11px] font-semibold">
                    Activate <FiChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/promote" className="block sm:col-span-2">
              <div className="relative rounded-xl bg-gradient-to-br from-gold/20 via-amber-500/20 to-orange-500/20 border border-gold/30 p-4 hover:brightness-110 transition-all overflow-hidden min-h-[90px]">
                <FiUsers className="absolute -right-3 -bottom-3 w-24 h-24 text-gold-light opacity-[0.10]" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-gold/30 text-gold-light text-[9px] font-bold uppercase tracking-wide mb-2">
                      Refer & Earn
                    </span>
                    <p className="text-white text-base font-bold">
                      Earn ₹100 per friend
                    </p>
                    <p className="text-gray-300 text-[11px] mt-1">
                      Plus 5% lifetime commission on their plays
                    </p>
                  </div>
                  <FiChevronRight className="w-5 h-5 text-gold-light shrink-0" />
                </div>
              </div>
            </Link>
          </div>
        </motion.div>

        {/* Platform Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
              <FiTrendingUp className="w-4 h-4 text-emerald-light" />
              <h3 className="text-white font-semibold text-sm">
                Platform Stats
              </h3>
            </div>
            <span className="text-gray-500 text-[10px] px-4 py-2.5 uppercase tracking-wide">
              Live · Today
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-4 pt-1">
            {[
              {
                label: "Total Payouts",
                value: "₹2.4Cr+",
                icon: FiDollarSign,
                color: "text-emerald-light",
                bg: "from-emerald-500/20 to-emerald-700/10",
                border: "border-emerald-500/30",
              },
              {
                label: "Active Players",
                value: "12,480",
                icon: FiUsers,
                color: "text-accent",
                bg: "from-accent/20 to-purple/10",
                border: "border-accent/30",
              },
              {
                label: "Games Played",
                value: "84,210",
                icon: FiPlay,
                color: "text-purple-light",
                bg: "from-purple/20 to-pink-500/10",
                border: "border-purple/30",
              },
              {
                label: "Winners Today",
                value: "1,524",
                icon: FiAward,
                color: "text-gold-light",
                bg: "from-gold/20 to-amber-500/10",
                border: "border-gold/30",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl bg-gradient-to-br ${stat.bg} border ${stat.border} p-3`}
              >
                <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
                <p className="text-white font-bold text-base sm:text-lg leading-tight">
                  {stat.value}
                </p>
                <p className="text-gray-400 text-[10px] mt-0.5 uppercase tracking-wide">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Why Choose Us */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-xl bg-dark-700/50 overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="bg-dark-800/30 rounded-br-2xl px-4 py-2.5 flex items-center gap-2">
              <FiShield className="w-4 h-4 text-accent" />
              <h3 className="text-white font-semibold text-sm">
                Why Choose Us
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-1">
            {[
              {
                title: "100% Secure",
                desc: "Bank-grade encryption",
                icon: FiShield,
                color: "text-emerald-light",
                bg: "bg-emerald-500/15",
              },
              {
                title: "Instant Payouts",
                desc: "Withdraw within minutes",
                icon: FiZap,
                color: "text-yellow-400",
                bg: "bg-yellow-500/15",
              },
              {
                title: "Provably Fair",
                desc: "Transparent results",
                icon: FiCheckCircle,
                color: "text-accent",
                bg: "bg-accent/15",
              },
              {
                title: "24/7 Support",
                desc: "Always here to help",
                icon: FiHeadphones,
                color: "text-purple-light",
                bg: "bg-purple/15",
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="flex items-start gap-2.5 rounded-xl bg-dark-800/60 border border-dark-600/50 p-3"
              >
                <div
                  className={`w-9 h-9 shrink-0 rounded-lg ${feat.bg} flex items-center justify-center`}
                >
                  <feat.icon className={`w-4 h-4 ${feat.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-semibold">
                    {feat.title}
                  </p>
                  <p className="text-gray-400 text-[10px] mt-0.5">
                    {feat.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* All Games at a Glance — bottom of home */}
        <AllGamesAtAGlance className="mt-6" maxHeight="none" />

        {/* Safety / 18+ disclaimer block — final element on the home feed
            so the responsible-gaming notice is the last thing the user
            sees before scrolling off the page. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative mt-6 rounded-2xl overflow-hidden bg-gradient-to-br from-dark-800 via-dark-900 to-dark-800 border border-dark-600"
        >
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            {/* 18+ badge */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 ring-2 ring-red-500/30">
                <span className="text-white font-black text-lg">18+</span>
              </div>
              <div className="hidden sm:block w-px h-12 bg-dark-600" />
            </div>

            {/* Center text */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h3 className="text-white font-bold text-base sm:text-lg leading-tight">
                Play Responsibly — Strictly 18+
              </h3>
              <p className="text-gray-400 text-xs sm:text-sm mt-1 leading-relaxed">
                This platform is intended for adults only. Gamble within your means and
                seek help if play stops being fun.
              </p>
            </div>

            {/* 100% safe badge */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:block w-px h-12 bg-dark-600" />
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-700/15 border border-emerald-500/40">
                <FiShield className="w-5 h-5 text-emerald-400" />
                <div className="text-left">
                  <p className="text-emerald-300 font-black text-sm leading-none">100% Safe</p>
                  <p className="text-emerald-400/70 text-[10px] mt-0.5">Secure &amp; Encrypted</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Sticky PWA install banner — sits above the mobile bottom nav. */}
      <AnimatePresence>
        {showInstall && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed left-0 right-0 z-30 px-3 lg:hidden pointer-events-none"
            style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="pointer-events-auto max-w-[1400px] mx-auto">
              <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-dark-800/95 backdrop-blur-md shadow-lg shadow-black/40 p-3">
                <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src="/icon-192.png"
                    alt="LOOT"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <FiSmartphone className="w-3.5 h-3.5 text-accent" />
                    Get the LOOT Android App
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    Download APK · Faster &amp; smoother experience
                  </p>
                </div>
                <button
                  onClick={handleInstallClick}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-dark-900 text-xs font-bold hover:bg-accent/90 transition-colors"
                >
                  <FiDownload className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={handleDismissInstall}
                  aria-label="Dismiss APK download prompt"
                  className="shrink-0 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Home;
