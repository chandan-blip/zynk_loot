import { useState } from 'react';
import { motion } from 'framer-motion';
import { GiTrophy, GiCrown, GiPodium } from 'react-icons/gi';
import { FiChevronDown } from 'react-icons/fi';

const mockLeaderboard = Array.from({ length: 50 }, (_, i) => ({
  rank: i + 1,
  username: `Player${Math.floor(Math.random() * 9000) + 1000}`,
  totalWins: Math.floor(Math.random() * 100) + 1,
  totalEarnings: Math.floor(Math.random() * 50000) + 1000,
  winRate: Math.floor(Math.random() * 60) + 20,
}));

const timeFilters = ['All Time', 'This Month', 'This Week', 'Today'];

function Leaderboard() {
  const [timeFilter, setTimeFilter] = useState('All Time');
  const [showDropdown, setShowDropdown] = useState(false);

  const top3 = mockLeaderboard.slice(0, 3);
  const rest = mockLeaderboard.slice(3);

  const getRankStyle = (rank) => {
    if (rank === 1) return 'from-yellow-500 to-amber-600';
    if (rank === 2) return 'from-gray-300 to-gray-400';
    if (rank === 3) return 'from-amber-600 to-amber-700';
    return 'from-dark-600 to-dark-700';
  };

  const getRankBg = (rank) => {
    if (rank === 1) return 'bg-yellow-500/10 border-yellow-500/30';
    if (rank === 2) return 'bg-gray-400/10 border-gray-400/30';
    if (rank === 3) return 'bg-amber-600/10 border-amber-600/30';
    return 'bg-dark-700/50 border-dark-400/30';
  };

  return (
    <div className="w-full mx-auto space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <GiTrophy className="text-accent" />
            Leaderboard
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Top players ranked by earnings</p>
        </div>

        {/* Time Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-dark-700/50 border border-dark-400/50 text-white hover:bg-dark-700 transition-colors w-full sm:w-auto justify-between sm:justify-start"
          >
            <span className="text-sm font-medium">{timeFilter}</span>
            <FiChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 mt-2 w-full sm:w-48 rounded-lg bg-dark-800 border border-dark-400/50 shadow-xl z-10 overflow-hidden"
            >
              {timeFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setTimeFilter(filter); setShowDropdown(false); }}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-dark-700 transition-colors ${
                    timeFilter === filter ? 'text-accent bg-accent/10' : 'text-gray-300'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
        {[1, 0, 2].map((orderIndex) => {
          const player = top3[orderIndex];
          const isFirst = orderIndex === 0;
          return (
            <motion.div
              key={player.rank}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: orderIndex * 0.1 }}
              className={`${isFirst ? 'order-2' : orderIndex === 1 ? 'order-1' : 'order-3'}`}
            >
              <div className={`relative p-3 sm:p-6 rounded-lg sm:rounded-lg border ${getRankBg(player.rank)} text-center ${isFirst ? 'pb-6 sm:pb-8' : ''}`}>
                {/* Crown for #1 */}
                {player.rank === 1 && (
                  <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2">
                    <GiCrown className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500" />
                  </div>
                )}

                {/* Rank Badge */}
                <div className={`w-10 h-10 sm:w-14 sm:h-14 mx-auto rounded-full bg-gradient-to-br ${getRankStyle(player.rank)} flex items-center justify-center mb-2 sm:mb-3 shadow-lg`}>
                  <span className="text-lg sm:text-2xl font-bold text-dark-900">#{player.rank}</span>
                </div>

                {/* Username */}
                <h3 className="text-xs sm:text-lg font-bold text-white truncate">{player.username}</h3>

                {/* Earnings */}
                <p className="text-sm sm:text-2xl font-bold text-accent mt-1 sm:mt-2">
                  {player.totalEarnings.toLocaleString()}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500">coins earned</p>

                {/* Stats */}
                <div className="flex justify-center gap-2 sm:gap-4 mt-2 sm:mt-4 text-[10px] sm:text-xs">
                  <div>
                    <p className="text-gray-500">Wins</p>
                    <p className="text-white font-semibold">{player.totalWins}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Rate</p>
                    <p className="text-white font-semibold">{player.winRate}%</p>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Rest of Leaderboard */}
      <div className="bg-dark-800/50 rounded-lg sm:rounded-lg border border-dark-400/30 overflow-hidden">
        {/* Table Header - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 bg-dark-700/30 border-b border-dark-400/30 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="col-span-1">Rank</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-2 text-right">Wins</div>
          <div className="col-span-3 text-right">Earnings</div>
          <div className="col-span-2 text-right">Win Rate</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-dark-400/20">
          {rest.map((player, i) => (
            <motion.div
              key={player.rank}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="grid grid-cols-12 gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 hover:bg-dark-700/30 transition-colors items-center"
            >
              {/* Rank */}
              <div className="col-span-2 sm:col-span-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-dark-700/50 flex items-center justify-center text-xs sm:text-sm font-bold text-gray-400 border border-dark-400/30">
                  #{player.rank}
                </div>
              </div>

              {/* Player */}
              <div className="col-span-5 sm:col-span-4">
                <p className="text-white font-medium text-sm sm:text-base truncate">{player.username}</p>
              </div>

              {/* Wins - Hidden label on desktop */}
              <div className="col-span-2 sm:col-span-2 text-right">
                <p className="text-white font-semibold text-sm sm:text-base">{player.totalWins}</p>
                <p className="text-[10px] text-gray-500 sm:hidden">wins</p>
              </div>

              {/* Earnings */}
              <div className="col-span-3 sm:col-span-3 text-right">
                <p className="text-accent font-bold text-sm sm:text-base">{player.totalEarnings.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500 sm:hidden">coins</p>
              </div>

              {/* Win Rate - Hidden on mobile, shown inline */}
              <div className="hidden sm:block sm:col-span-2 text-right">
                <span className="px-2 py-1 rounded-md bg-accent/10 text-accent text-sm font-medium">
                  {player.winRate}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Leaderboard;
