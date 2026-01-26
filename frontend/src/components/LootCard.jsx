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
        <span className="text-xs font-bold text-white">
          {percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// Multiplier mapping (from backend)
const MULTIPLIER_MAP = { 0: 0, 1: 2, 2: 4, 3: 9, 4: 16, 5: 25, 6: 36, 7: 49 };

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
  isVirtual = false, // True if number doesn't exist in DB yet
  matchesRevealed = true, // True if number matches currently revealed digits
  hasVoted = false, // True if current user has voted for this number
  index = 0,
  onBuy,
  onVote,
  onUnvote,
  onCashOut,
  // Ticket matching props (from backend)
  matchedDigits = 0,
  currentReturn = 0,
  multiplier = 0,
  status = "active", // active, matching, lost, won, cashed_out, sold, would_lose
  canCashOut = false,
  buyAmount = null,
}) {
  const navigate = useNavigate();

  // Calculate win chance based on votes (simplified formula)
  const winChance =
    totalPoolVotes > 0 ? Math.min((votes / totalPoolVotes) * 100, 99.9) : 0.01;

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
    if (hasVoted) {
      onUnvote?.(number);
    } else {
      onVote?.(number);
    }
  };

  return (
    <motion.div
      onClick={handleClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="group relative bg-dark-700 border border-dark-800 rounded-xl p-4 cursor-pointer transition-all duration-300"
    >
      {/* Badges */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5 flex-wrap justify-end">
        {/* Would lose badge - number doesn't match revealed digits */}
        {!matchesRevealed &&
          (status === "would_lose" || (isVirtual && !matchesRevealed)) && (
            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/30">
              MISMATCHED
            </span>
          )}
        {/* Virtual/Available badge - only if matches revealed */}
        {(isVirtual || !owner) &&
          !isOwned &&
          matchesRevealed &&
          status !== "would_lose" && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
              AVAILABLE
            </span>
          )}
        {/* Status badges */}
        {status === "lost" && (
          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
            LOST
          </span>
        )}
        {status === "won" && (
          <span className="px-2 py-0.5 rounded-full bg-gold/20 text-gold-light text-[10px] font-bold border border-gold/30 animate-pulse">
            WINNER!
          </span>
        )}
        {status === "cashed_out" && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
            CASHED OUT
          </span>
        )}
        {status === "sold" && (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold border border-purple-500/30">
            SOLD
          </span>
        )}
        {/* Matching badge */}
        {isOwned && matchedDigits > 0 && status === "matching" && (
          <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold border border-accent/30">
            {matchedDigits} MATCH
          </span>
        )}
        {isOwned && status === "active" && (
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
      <div className="flex justify-between items-center mb-4 py-4 px-5 rounded-lg bg-dark-800/80 border border-dark-600/50">
        {/* Trend indicator */}
        {trend !== 0 && (
          <div
            className={`flex items-center gap-0.5 text-[10px] font-medium ${
              trend > 0 ? "text-emerald-light" : "text-rose-light"
            }`}
          >
            {trend > 0 ? (
              <FiTrendingUp className="w-3 h-3" />
            ) : (
              <FiTrendingDown className="w-3 h-3" />
            )}
            {trend > 0 ? "+" : ""}
            {trend}%
          </div>
        )}
        <p className="text-center font-[900] text-[28px] leading-7 md:text-2xl lg:text-[17px] xl:text-md tracking-[0.25em] text-white">
          {formatNumber(number)}
        </p>
      </div>

      {/* For lost/cashed out tickets - show minimal info */}
      {status === "lost" || status === "cashed_out" ? (
        <div className="flex items-center justify-center text-xs">
          {status === "lost" ? (
            <span className="text-red-400/70">
              This ticket did not match the winning number
            </span>
          ) : (
            <span className="text-accent-400/70">Successfully cashed out</span>
          )}
        </div>
      ) : (
        <>
          {/* Stats Section with Radial Chart */}
          <div className="flex items-center gap-3 mb-4">
            {/* Radial Win Chance or Match Progress */}
            <div className="flex-shrink-0">
              {isOwned && matchedDigits > 0 ? (
                <RadialChart
                  percentage={(matchedDigits / 7) * 100}
                  size={56}
                  strokeWidth={4}
                />
              ) : (
                <RadialChart percentage={winChance} size={56} strokeWidth={4} />
              )}
            </div>

            {/* Stats Grid */}
            <div className="flex-1 grid grid-cols-2 gap-2">
              {/* Show different stats based on ownership and matching */}
              {isOwned && matchedDigits > 0 ? (
                <>
                  {/* Matched Digits */}
                  <div className="flex items-center gap-1.5 p-2 rounded-lg bg-accent/10 border border-accent/20">
                    <FiTarget className="w-3.5 h-3.5 text-accent" />
                    <div>
                      <p className="text-accent font-bold text-xs">
                        {matchedDigits}/7
                      </p>
                      <p className="text-gray-500 text-[9px]">matched</p>
                    </div>
                  </div>

                  {/* Multiplier */}
                  <div className="flex items-center gap-1.5 p-2 rounded-lg bg-purple/10 border border-purple/20">
                    <FiTrendingUp className="w-3.5 h-3.5 text-purple-light" />
                    <div>
                      <p className="text-purple-light font-bold text-xs">
                        {multiplier || MULTIPLIER_MAP[matchedDigits]}x
                      </p>
                      <p className="text-gray-500 text-[9px]">multiplier</p>
                    </div>
                  </div>

                  {/* Current Return */}
                  <div className="col-span-1 sm:col-span-2 xl:col-span-1 flex items-center gap-1.5 p-2 rounded-lg bg-gold/10 border border-gold/20">
                    <GiTwoCoins className="w-4 h-4 text-gold-light" />
                    <div>
                      <p className="text-gold-light font-bold text-sm">
                        {currentReturn ||
                          (buyAmount || price) *
                            (multiplier || MULTIPLIER_MAP[matchedDigits])}{" "}
                        Z
                      </p>
                      <p className="text-gray-500 text-[9px]">current return</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Votes */}
                  <div className="flex items-center gap-1.5 p-2 rounded-lg bg-dark-800/50">
                    <FiThumbsUp className="w-3.5 h-3.5 text-accent" />
                    <div>
                      <p className="text-white font-bold text-xs">
                        {formatVotes(votes)}
                      </p>
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
                      <p className="text-white font-bold text-xs">
                        {winChance.toFixed(2)}%
                      </p>
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
                </>
              )}
            </div>
          </div>

          {/* Owner Section - only show if owned by another user */}
          {owner && !isOwned && (
            <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-dark-800/30 border border-dark-600/30">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/30 to-purple/30 flex items-center justify-center">
                <FiUser className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-300 text-xs font-medium truncate">
                  {owner}
                </p>
                <p className="text-gray-600 text-[9px]">Owner</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {!owner ? (
              // No owner - check if matches revealed digits
              !matchesRevealed || status === "would_lose" ? (
                // Doesn't match revealed digits - would lose if bought
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-orange-500/10 text-orange-400 font-semibold text-sm border border-orange-500/30">
                  <span>Doesn't Match Draw</span>
                </div>
              ) : (
                // Matches revealed digits - can buy
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
                    className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                      hasVoted
                        ? "bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
                        : "bg-dark-600 text-white border border-dark-500 hover:bg-dark-500"
                    }`}
                  >
                    <FiThumbsUp
                      className={`w-4 h-4 ${hasVoted ? "fill-current" : ""}`}
                    />
                    <span>{hasVoted ? "Voted" : "Vote"}</span>
                  </button>
                </>
              )
            ) : isOwned ? (
              // Owner actions based on ticket status
              status === "lost" ? (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-rose-500/10 text-rose-400 font-semibold text-sm border border-rose-500/30">
                  <span>Ticket Lost</span>
                </div>
              ) : status === "cashed_out" ? (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold text-sm border border-emerald-500/30">
                  <span>Cashed Out</span>
                </div>
              ) : canCashOut && matchedDigits > 0 ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCashOut?.(
                        id,
                        number,
                        currentReturn ||
                          (buyAmount || price) *
                            (multiplier || MULTIPLIER_MAP[matchedDigits]),
                      );
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-accent text-dark-900 font-semibold text-sm hover:bg-accent-400 transition-colors"
                  >
                    <GiTwoCoins className="w-4 h-4" />
                    <span>Cash Out</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleVote}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    hasVoted
                      ? "bg-accent/30 text-accent border border-accent/50 hover:bg-accent/40"
                      : "bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
                  }`}
                >
                  <FiThumbsUp
                    className={`w-4 h-4 ${hasVoted ? "fill-current" : ""}`}
                  />
                  <span>{hasVoted ? "Voted" : "Boost with Vote"}</span>
                </button>
              )
            ) : status === "lost" ? (
              // Non-owner viewing a lost ticket - cannot trade
              <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-rose-500/10 text-rose-400 font-semibold text-sm border border-rose-500/30">
                <span>Lost This Draw</span>
              </div>
            ) : status === "cashed_out" ? (
              // Non-owner viewing a cashed out ticket
              <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-500/10 text-gray-400 font-semibold text-sm border border-gray-500/30">
                <span>Cashed Out</span>
              </div>
            ) : (
              // Normal owned number - can make offer
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
                  className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                    hasVoted
                      ? "bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
                      : "bg-dark-600 text-white border border-dark-500 hover:bg-dark-500"
                  }`}
                >
                  <FiThumbsUp
                    className={`w-4 h-4 ${hasVoted ? "fill-current" : ""}`}
                  />
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
    </motion.div>
  );
}

export default LootCard;
