import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiTrendingUp,
  FiTrendingDown,
  FiUser,
  FiThumbsUp,
  FiDollarSign,
  FiTarget,
  FiAward,
} from "react-icons/fi";
import { GiTwoCoins } from "react-icons/gi";

// Radial Progress Chart Component
function RadialChart({ percentage, size = 60, strokeWidth = 5 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1d2b3a"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-white">{percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function LootCard({
  id,
  number = "0000000",
  votes = 0,
  totalPoolVotes = 100000,
  owner = null,
  price = 10,
  trend = 0,
  rank = null,
  timesWon = 0,
  isOwned = false,
  index = 0,
  onBuy,
  onVote,
}) {
  const navigate = useNavigate();

  // Calculate win chance based on votes (simplified formula)
  const winChance = totalPoolVotes > 0
    ? Math.min(((votes / totalPoolVotes) * 100), 99.9)
    : 0.01;

  const formatNumber = (num) => {
    return num.toString().padStart(7, "0").split("").join(" ");
  };

  const formatVotes = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const handleClick = () => {
    navigate(`/number/${number}`);
  };

  const handleBuy = (e) => {
    e.stopPropagation();
    onBuy?.(number, price);
  };

  const handleVote = (e) => {
    e.stopPropagation();
    onVote?.(number);
  };

  return (
    <motion.div
      onClick={handleClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative bg-dark-700 border border-dark-800 rounded-xl p-4 cursor-pointer hover:border-accent/30 transition-all duration-300 hover:shadow-glow-sm"
    >
      {/* Badges */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        {isOwned && (
          <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold border border-accent/30">
            OWNED
          </span>
        )}
        {rank && rank <= 10 && (
          <span className="px-2 py-0.5 rounded-full bg-gold/20 text-gold-light text-[10px] font-bold border border-gold/30">
            #{rank}
          </span>
        )}
      </div>

      {/* Number Display */}
      <div className="relative mb-4 py-4 px-3 rounded-lg bg-dark-800/80 border border-dark-600/50">
        <p className="text-center font-bold text-xl md:text-2xl tracking-[0.25em] text-white">
          {formatNumber(number)}
        </p>

        {/* Trend indicator */}
        {trend !== 0 && (
          <div className={`absolute top-2 left-2 flex items-center gap-0.5 text-[10px] font-medium ${
            trend > 0 ? "text-emerald-light" : "text-rose-light"
          }`}>
            {trend > 0 ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
            {trend > 0 ? "+" : ""}{trend}%
          </div>
        )}
      </div>

      {/* Stats Section with Radial Chart */}
      <div className="flex items-center gap-3 mb-4">
        {/* Radial Win Chance */}
        <div className="flex-shrink-0">
          <RadialChart percentage={winChance} size={56} strokeWidth={4} />
        </div>

        {/* Stats Grid */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          {/* Votes */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-dark-800/50">
            <FiThumbsUp className="w-3.5 h-3.5 text-accent" />
            <div>
              <p className="text-white font-bold text-xs">{formatVotes(votes)}</p>
              <p className="text-gray-500 text-[9px]">votes</p>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-dark-800/50">
            <FiDollarSign className="w-3.5 h-3.5 text-gold-light" />
            <div>
              <p className="text-white font-bold text-xs">{price} Z</p>
              <p className="text-gray-500 text-[9px]">price</p>
            </div>
          </div>

          {/* Win Chance */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-dark-800/50">
            <FiTarget className="w-3.5 h-3.5 text-purple-light" />
            <div>
              <p className="text-white font-bold text-xs">{winChance.toFixed(2)}%</p>
              <p className="text-gray-500 text-[9px]">chance</p>
            </div>
          </div>

          {/* Times Won */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-dark-800/50">
            <FiAward className="w-3.5 h-3.5 text-emerald-light" />
            <div>
              <p className="text-white font-bold text-xs">{timesWon}</p>
              <p className="text-gray-500 text-[9px]">wins</p>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Section */}
      {owner && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-dark-800/30 border border-dark-600/30">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/30 to-purple/30 flex items-center justify-center">
            <FiUser className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-300 text-xs font-medium truncate">{owner}</p>
            <p className="text-gray-600 text-[9px]">Owner</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!owner ? (
          <>
            <button
              onClick={handleBuy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-accent text-dark-900 font-semibold text-sm hover:bg-accent-400 transition-colors"
            >
              <GiTwoCoins className="w-4 h-4" />
              <span>Buy {price} Z</span>
            </button>
            <button
              onClick={handleVote}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-dark-600 text-white font-medium text-sm hover:bg-dark-500 border border-dark-500 transition-colors"
            >
              <FiThumbsUp className="w-4 h-4" />
              <span>Vote</span>
            </button>
          </>
        ) : isOwned ? (
          <button
            onClick={handleVote}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-accent/10 text-accent font-semibold text-sm hover:bg-accent/20 border border-accent/30 transition-colors"
          >
            <FiThumbsUp className="w-4 h-4" />
            <span>Boost with Vote</span>
          </button>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/number/${number}`);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-purple/20 text-purple-light font-semibold text-sm hover:bg-purple/30 border border-purple/30 transition-colors"
            >
              <FiDollarSign className="w-4 h-4" />
              <span>Make Offer</span>
            </button>
            <button
              onClick={handleVote}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-dark-600 text-white font-medium text-sm hover:bg-dark-500 border border-dark-500 transition-colors"
            >
              <FiThumbsUp className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
    </motion.div>
  );
}

export default LootCard;
