import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  FiPlay,
  FiLock,
  FiStar,
  FiZap,
  FiTarget,
  FiLayers,
  FiGrid,
  FiCrosshair,
  FiGift,
  FiAlertTriangle,
  FiUsers,
  FiClock,
  FiAward,
  FiChevronRight,
} from "react-icons/fi";
import {
  GiTwoCoins,
  GiTrophy,
  GiCardJackHearts,
  GiCardJoker,
  GiCardRandom,
} from "react-icons/gi";
import usePageTitle from "../../hooks/usePageTitle";
import { useCurrency } from "../../contexts/CurrencyContext";
import useStore from "../../store/useStore";
import { getThirdPartyGames, getWalletBalance } from "../../services/api";
import {
  MutkaPreview,
  UnoPreview,
  ShuffleCardPreview,
  SevenDigitPreview,
} from "../../components/GamePreviews";

const games = [
  {
    id: "coin-flip",
    name: "Coin Flip",
    description: "Flip a coin and double your bet instantly",
    icon: GiTwoCoins,
    minBet: 1,
    maxWin: "1.95x",
    color: "from-yellow-500/20 to-amber-500/20",
    borderColor: "border-yellow-500/30",
    iconColor: "text-yellow-400",
    path: "/games/coin-flip",
    comingSoon: false,
    basePlayers: 24,
  },
  {
    id: "dice-roll",
    name: "Dice Roll",
    description: "Roll the dice and win up to 5.7x your bet",
    icon: FiZap,
    minBet: 1,
    maxWin: "5.7x",
    color: "from-blue-500/20 to-cyan-500/20",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    path: "/games/dice-roll",
    comingSoon: false,
    basePlayers: 18,
  },
  {
    id: "lucky-spin",
    name: "Lucky Spin",
    description: "Spin the wheel for a chance to win big prizes",
    icon: FiStar,
    minBet: 5,
    maxWin: "10x",
    color: "from-purple-500/20 to-pink-500/20",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
    path: "/games/lucky-spin",
    comingSoon: false,
    basePlayers: 15,
  },
  {
    id: "balloon-pop",
    name: "Balloon Pop",
    description: "Inflate the balloon and cash out before it pops!",
    icon: FiTarget,
    minBet: 1,
    maxWin: "50x",
    color: "from-red-500/20 to-pink-500/20",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
    path: "/games/balloon-pop",
    comingSoon: false,
    basePlayers: 31,
  },
  {
    id: "dragon-tower",
    name: "Dragon Tower",
    description: "Pick doors, climb floors, dodge the dragon!",
    icon: FiLayers,
    minBet: 1,
    maxWin: "200x",
    color: "from-amber-500/20 to-orange-500/20",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
    path: "/games/dragon-tower",
    comingSoon: false,
    basePlayers: 22,
  },
  {
    id: "ice-field",
    name: "Ice Field",
    description: "Walk across frozen tiles without falling through!",
    icon: FiGrid,
    minBet: 1,
    maxWin: "84x",
    color: "from-cyan-500/20 to-blue-500/20",
    borderColor: "border-cyan-500/30",
    iconColor: "text-cyan-400",
    path: "/games/ice-field",
    comingSoon: false,
    basePlayers: 14,
  },
  {
    id: "arrow-roulette",
    name: "Arrow Roulette",
    description: "Shoot the target — hit the bullseye for 10x!",
    icon: FiCrosshair,
    minBet: 1,
    maxWin: "10x",
    color: "from-red-500/20 to-orange-500/20",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
    path: "/games/arrow-roulette",
    comingSoon: false,
    basePlayers: 19,
  },
  {
    id: "egg-hatch",
    name: "Egg Hatch",
    description: "Pick an egg — each hides a multiplier up to 15x!",
    icon: FiGift,
    minBet: 1,
    maxWin: "15x",
    color: "from-amber-500/20 to-yellow-500/20",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
    path: "/games/egg-hatch",
    comingSoon: false,
    basePlayers: 27,
  },
  {
    id: "fuse",
    name: "Fuse",
    description: "Light the fuse and cut it before it blows!",
    icon: FiAlertTriangle,
    minBet: 1,
    maxWin: "50x",
    color: "from-orange-500/20 to-red-500/20",
    borderColor: "border-orange-500/30",
    iconColor: "text-orange-400",
    path: "/games/fuse",
    comingSoon: false,
    basePlayers: 20,
  },
];

const lotteryGames = [
  {
    id: "mutka-king",
    name: "Mutka King",
    description:
      "4 duration lanes (30s / 1m / 5m / 10m). One card is drawn each round — bet the exact card (15x), suit (5x) or colour (2x).",
    icon: GiCardJackHearts,
    stats: [
      { icon: FiClock, label: "Lanes", value: "30s–10m" },
      { icon: FiAward, label: "Max Win", value: "15x", accent: true },
    ],
    color: "from-emerald-500/20 via-green-500/10 to-emerald-700/20",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-300",
    path: "/games/mutka-king",
    comingSoon: false,
    basePlayers: 88,
    image: "/games/mutka-king.png",
    Preview: MutkaPreview,
  },
  {
    id: "shuffle-card",
    name: "Shuffle Card",
    description:
      "4 duration lanes (30s / 1m / 5m / 10m). One card is drawn each round — bet the exact card (15x), suit (5x) or colour (2x).",
    icon: GiCardRandom,
    stats: [
      { icon: FiClock, label: "Lanes", value: "30s–10m" },
      { icon: FiAward, label: "Max Win", value: "15x", accent: true },
    ],
    color: "from-amber-500/20 via-yellow-500/10 to-amber-700/20",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-300",
    path: "/games/shuffle-card",
    comingSoon: false,
    basePlayers: 72,
    image: "/games/suffle-card.png",
    Preview: ShuffleCardPreview,
  },
  
  {
    id: "uno-king",
    name: "UNO King",
    description:
      "4 duration lanes (30s / 1m / 5m / 10m). One UNO card is drawn each round — bet a colour (2x) or the exact card (15x).",
    icon: GiCardJoker,
    stats: [
      { icon: FiClock, label: "Lanes", value: "30s–10m" },
      { icon: FiAward, label: "Max Win", value: "15x", accent: true },
    ],
    color: "from-blue-500/20 via-blue-400/10 to-blue-700/20",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    path: "/games/uno-king",
    comingSoon: false,
    basePlayers: 56,
    image: "/games/uno-king.png",
    Preview: UnoPreview,
  },

  {
    id: "seven-digit",
    name: "7-Digit Lottery",
    description:
      "Pick a 7-digit number, watch digits reveal hourly across 3 daily sessions, and win up to 80% of the prize pool.",
    icon: GiTrophy,
    stats: [
      { icon: FiClock, label: "Sessions", value: "3 per day" },
      { icon: FiAward, label: "Digits", value: "7 digits", accent: true },
    ],
    color: "from-gold/20 via-accent/10 to-purple/20",
    borderColor: "border-gold/30",
    iconColor: "text-gold-light",
    path: "/games/lottery",
    comingSoon: false,
    basePlayers: 142,
    image: "/games/digit-lottery.png",
    Preview: SevenDigitPreview,
  },
];

const randomCount = (base) =>
  base + Math.floor(Math.random() * Math.ceil(base * 0.4));

function Games() {
  usePageTitle("Lottery Games");
  const { formatCurrency } = useCurrency();

  // Active tab is driven by the `?tab=` query param so tabs are deep-linkable
  // (e.g. /games?tab=third-party) and the back button restores the right tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_IDS = ["lottery", "instant", "third-party"];
  const tabParam = searchParams.get("tab");
  const activeTab = TAB_IDS.includes(tabParam) ? tabParam : "lottery";
  const setActiveTab = (id) =>
    setSearchParams(id === "lottery" ? {} : { tab: id }, { replace: true });

  const [playerCounts, setPlayerCounts] = useState(() => {
    const all = [...games, ...lotteryGames];
    return Object.fromEntries(
      all.map((g) => [g.id, randomCount(g.basePlayers || 10)]),
    );
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayerCounts((prev) => {
        const next = {};
        const all = [...games, ...lotteryGames];
        all.forEach((g) => {
          const current = prev[g.id] || 10;
          const drift = Math.floor(Math.random() * 5) - 2;
          const base = g.basePlayers || 10;
          next[g.id] = Math.max(
            base - 3,
            Math.min(base + Math.ceil(base * 0.5), current + drift),
          );
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: "lottery", label: "Lottery", icon: GiTrophy },
    { id: "instant", label: "Instant", icon: FiZap },
    { id: "third-party", label: "Third Party", icon: FiGrid },
  ];

  // Third-party games are an admin-managed catalog of image tiles. Opening one
  // is gated behind a first deposit.
  const navigate = useNavigate();
  const { isAuthenticated } = useStore();
  const [thirdPartyGames, setThirdPartyGames] = useState([]);
  const [hasDeposited, setHasDeposited] = useState(false);
  const [depositPrompt, setDepositPrompt] = useState(false);

  useEffect(() => {
    getThirdPartyGames()
      .then((res) => setThirdPartyGames(res.data?.data || []))
      .catch(() => setThirdPartyGames([]));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setHasDeposited(false); return; }
    getWalletBalance()
      .then((res) => setHasDeposited((res.data?.data?.totalDeposited || 0) > 0))
      .catch(() => {});
  }, [isAuthenticated]);

  const handleThirdPartyClick = (game) => {
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!hasDeposited) { setDepositPrompt(true); return; }
    if (game.game_url) {
      window.open(game.game_url, "_blank", "noopener,noreferrer");
    } else {
      toast("This game is coming soon!", { icon: "🎮" });
    }
  };

  return (
    <div className="mx-auto">
      {/* Tabs — segmented control with a sliding active pill */}
      <div className="flex items-center gap-1 mb-5 p-1 rounded-xl bg-dark-800 border border-dark-600">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                isActive ? "text-dark-900" : "text-gray-400 hover:text-white"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="games-tab-pill"
                  className="absolute inset-0 rounded-lg bg-accent shadow-lg shadow-accent/25"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <Icon className="relative z-10 w-4 h-4" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "lottery" && (
          <motion.div
            key="lottery"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {lotteryGames.map((game, index) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link
                  to={game.path}
                  className="group relative block rounded-xl overflow-hidden border border-dark-600 bg-dark-800 aspect-[3/4]"
                >
                  <img
                    src={game.image}
                    alt={game.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <p className="text-sm font-bold text-white truncate drop-shadow">{game.name}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                      <FiPlay className="w-3 h-3" /> Play
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
        {activeTab === "instant" && (
          <motion.div
            key="instant"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
          >
            {games.map((game, index) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.borderColor} p-3 sm:p-5 overflow-hidden`}
              >
                <game.icon
                  className={`absolute -top-2 -right-2 w-24 h-24 ${game.iconColor} opacity-[0.07]`}
                />

                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-700/70 border border-white/10 z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-gray-400 font-medium">
                    {playerCounts[game.id] || 0}
                  </span>
                  <FiUsers className="w-2.5 h-2.5 text-gray-500" />
                </div>

                <div className="relative flex flex-col h-full">
                  <div
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl bg-dark-700/60 border border-white/10 flex items-center justify-center mb-3 sm:mb-4`}
                  >
                    <game.icon
                      className={`w-5 h-5 sm:w-7 sm:h-7 ${game.iconColor}`}
                    />
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                    {game.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4 leading-relaxed line-clamp-2">
                    {game.description}
                  </p>

                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5 mt-auto">
                    <div className="flex-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-700/40 border border-white/5">
                      <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wider">
                        Min Bet
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        {formatCurrency(game.minBet)}
                      </p>
                    </div>
                    <div className="flex-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-700/40 border border-white/5">
                      <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wider">
                        Max Win
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-accent truncate">
                        {game.maxWin}
                      </p>
                    </div>
                  </div>

                  {game.comingSoon ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-500">
                      <FiLock className="w-4 h-4" />
                      <span className="text-sm font-medium">Coming Soon</span>
                    </div>
                  ) : (
                    <Link to={game.path}>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full btn-premium py-3 sm:py-4 text-xs sm:text-sm"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <FiPlay className="w-4 h-4" />
                          Play Now
                        </span>
                      </motion.button>
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {activeTab === "third-party" && (
          <motion.div
            key="third-party"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {thirdPartyGames.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FiGrid className="w-10 h-10 text-gray-600 mb-3" />
                <p className="text-gray-400 font-medium">No third-party games yet</p>
                <p className="text-gray-600 text-sm mt-1">Check back soon — new games are added regularly.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {thirdPartyGames.map((game, index) => (
                  <motion.button
                    key={game.id}
                    type="button"
                    onClick={() => handleThirdPartyClick(game)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="group relative rounded-xl overflow-hidden border border-dark-600 bg-dark-800 aspect-[3/4] text-left"
                  >
                    <img
                      src={game.image_url}
                      alt={game.name || "Game"}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    {!hasDeposited && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] font-semibold text-amber-300">
                        <FiLock className="w-2.5 h-2.5" /> Deposit
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-2.5">
                      {game.name && (
                        <p className="text-sm font-bold text-white truncate drop-shadow">{game.name}</p>
                      )}
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                        <FiPlay className="w-3 h-3" /> Play
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deposit-required gate for third-party games */}
      <AnimatePresence>
        {depositPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setDepositPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-dark-600 bg-dark-800 p-6 text-center"
            >
              <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/15 grid place-items-center mb-4">
                <FiLock className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-lg font-bold text-white">Deposit to unlock</h3>
              <p className="text-sm text-gray-400 mt-1.5">
                Make your first deposit to start playing third-party games.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setDepositPrompt(false)}
                  className="flex-1 py-2.5 rounded-lg bg-dark-700 border border-dark-600 text-sm font-semibold text-gray-300 hover:text-white"
                >
                  Not now
                </button>
                <button
                  onClick={() => navigate("/wallet?tab=buy")}
                  className="flex-1 py-2.5 rounded-lg bg-accent text-dark-900 text-sm font-bold hover:opacity-90"
                >
                  Deposit now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Games;
