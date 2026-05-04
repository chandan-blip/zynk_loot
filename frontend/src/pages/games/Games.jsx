import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlay, FiLock, FiStar, FiZap, FiTarget, FiLayers, FiGrid, FiCrosshair, FiGift, FiAlertTriangle, FiUsers, FiClock, FiAward, FiChevronRight } from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiCardJackHearts, GiCardJoker } from "react-icons/gi";
import usePageTitle from "../../hooks/usePageTitle";
import PageHeader from "../../components/PageHeader";
import { useCurrency } from "../../contexts/CurrencyContext";
import {
  MutkaPreview,
  UnoPreview,
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
    id: "seven-digit",
    name: "7-Digit Lottery",
    description: "Pick a 7-digit number, watch digits reveal hourly across 3 daily sessions, and win up to 80% of the prize pool.",
    icon: GiTrophy,
    stats: [
      { icon: FiClock, label: "Sessions", value: "3 per day" },
      { icon: FiAward, label: "Digits",   value: "7 digits", accent: true },
    ],
    color: "from-gold/20 via-accent/10 to-purple/20",
    borderColor: "border-gold/30",
    iconColor: "text-gold-light",
    path: "/games/lottery",
    comingSoon: false,
    basePlayers: 142,
    Preview: SevenDigitPreview,
  },
  {
    id: "mutka-king",
    name: "Mutka King",
    description: "4 cards drawn from a 52-card deck. Pick 1 to 4 cards across multiple slips — match all and win up to 500x.",
    icon: GiCardJackHearts,
    stats: [
      { icon: FiZap,  label: "Cards",   value: "4 dealt" },
      { icon: FiAward, label: "Max Win", value: "500x", accent: true },
    ],
    color: "from-amber-500/20 via-red-500/10 to-purple/20",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-300",
    path: "/games/mutka-king",
    comingSoon: false,
    basePlayers: 88,
    Preview: MutkaPreview,
  },
  {
    id: "uno-king",
    name: "UNO King",
    description: "4 UNO cards drawn from a 54-card deck. Pick cards or bet on color, number, action, or wild — win up to 500x.",
    icon: GiCardJoker,
    stats: [
      { icon: FiZap,  label: "Cards",   value: "4 dealt" },
      { icon: FiAward, label: "Max Win", value: "500x", accent: true },
    ],
    color: "from-red-500/20 via-yellow-500/10 to-blue-500/20",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
    path: "/games/uno-king",
    comingSoon: false,
    basePlayers: 56,
    Preview: UnoPreview,
  },
];

const randomCount = (base) => base + Math.floor(Math.random() * Math.ceil(base * 0.4));

function Games() {
  usePageTitle('Lottery Games');
  const { formatCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState('lottery');

  const [playerCounts, setPlayerCounts] = useState(() => {
    const all = [...games, ...lotteryGames];
    return Object.fromEntries(all.map(g => [g.id, randomCount(g.basePlayers || 10)]));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayerCounts(prev => {
        const next = {};
        const all = [...games, ...lotteryGames];
        all.forEach(g => {
          const current = prev[g.id] || 10;
          const drift = Math.floor(Math.random() * 5) - 2;
          const base = g.basePlayers || 10;
          next[g.id] = Math.max(base - 3, Math.min(base + Math.ceil(base * 0.5), current + drift));
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'lottery', label: 'Lottery', icon: GiTrophy },
    { id: 'instant', label: 'Instant', icon: FiZap },
  ];

  return (
    <div className="mx-auto">
      <PageHeader icon={FiPlay} title="Lottery Games" description="Pick your game and play to win" iconColor="text-accent" />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5 border-b border-dark-600">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'text-accent' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="games-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'lottery' ? (
          <motion.div
            key="lottery"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {lotteryGames.map((game, index) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.borderColor} p-4 sm:p-6 overflow-hidden`}
              >
                {/* Faint background watermark */}
                <game.icon className={`absolute -top-4 -right-4 w-28 h-28 sm:w-40 sm:h-40 ${game.iconColor} opacity-[0.07]`} />

                <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-700/70 border border-white/10 z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-gray-400 font-medium">{playerCounts[game.id] || 0}</span>
                  <FiUsers className="w-2.5 h-2.5 text-gray-500" />
                </div>

                <div className="relative flex flex-col h-full">
                  <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-4 pr-16 sm:pr-20">
                    <div className="w-10 h-10 sm:w-14 sm:h-14 shrink-0 rounded-lg sm:rounded-xl bg-dark-700/60 border border-white/10 flex items-center justify-center">
                      <game.icon className={`w-5 h-5 sm:w-7 sm:h-7 ${game.iconColor}`} />
                    </div>
                    {game.Preview && (
                      <div className="relative flex-1 h-10 sm:h-14">
                        <game.Preview />
                      </div>
                    )}
                  </div>

                  <h3 className="text-base sm:text-2xl font-bold text-white mb-1 sm:mb-1.5">
                    {game.name}
                  </h3>
                  <p className="text-[11px] sm:text-sm text-gray-400 mb-2 sm:mb-4 leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                    {game.description}
                  </p>

                  <div className="flex items-center gap-2 sm:gap-3 mb-2.5 sm:mb-5 mt-auto">
                    {(game.stats || []).map((stat, i) => {
                      const StatIcon = stat.icon;
                      return (
                        <div key={i} className="flex-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg bg-dark-700/40 border border-white/5">
                          <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                            {StatIcon && <StatIcon className="w-3 h-3" />} {stat.label}
                          </p>
                          <p className={`text-xs sm:text-sm font-bold ${stat.accent ? 'text-accent' : 'text-white'}`}>
                            {stat.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {game.comingSoon ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-500">
                      <FiLock className="w-4 h-4" />
                      <span className="text-xs sm:text-sm font-medium">Coming Soon</span>
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
                          Open Lottery
                          <FiChevronRight className="w-4 h-4" />
                        </span>
                      </motion.button>
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
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
                <game.icon className={`absolute -top-2 -right-2 w-24 h-24 ${game.iconColor} opacity-[0.07]`} />

                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-700/70 border border-white/10 z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-gray-400 font-medium">{playerCounts[game.id] || 0}</span>
                  <FiUsers className="w-2.5 h-2.5 text-gray-500" />
                </div>

                <div className="relative flex flex-col h-full">
                  <div
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl bg-dark-700/60 border border-white/10 flex items-center justify-center mb-3 sm:mb-4`}
                  >
                    <game.icon className={`w-5 h-5 sm:w-7 sm:h-7 ${game.iconColor}`} />
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                    {game.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4 leading-relaxed line-clamp-2">
                    {game.description}
                  </p>

                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5 mt-auto">
                    <div className="flex-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-700/40 border border-white/5">
                      <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wider">Min Bet</p>
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        {formatCurrency(game.minBet)}
                      </p>
                    </div>
                    <div className="flex-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-dark-700/40 border border-white/5">
                      <p className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wider">Max Win</p>
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
      </AnimatePresence>
    </div>
  );
}

export default Games;
