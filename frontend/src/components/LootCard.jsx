import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTrendingUp,
  FiTrendingDown,
  FiUser,
  FiThumbsUp,
  FiDollarSign,
  FiClock,
  FiX,
} from "react-icons/fi";
import { GiTwoCoins } from "react-icons/gi";
import { useCurrency } from "../contexts/CurrencyContext";

// Minimal arc progress indicator
function ArcProgress({ percentage, size = 44, strokeWidth = 3 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-semibold text-white/80">
          {percentage.toFixed(1)}%
        </span>
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
  isVirtual = false,
  matchesRevealed = true,
  hasVoted = false,
  index = 0,
  onBuy,
  onVote,
  onUnvote,
  onCashOut,
  onScheduleCashout,
  matchedDigits = 0,
  currentReturn = 0,
  multiplier = 0,
  status = "active",
  canCashOut = false,
  buyAmount = null,
  autoCashoutAt = null,
  periodId = null,
}) {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const [showSchedulePopup, setShowSchedulePopup] = useState(false);

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

  // Status badge config
  const statusBadge = (() => {
    if (!matchesRevealed && (status === "would_lose" || (isVirtual && !matchesRevealed)))
      return { label: "MISMATCHED", cls: "text-orange-400 bg-orange-400/10" };
    if (status === "lost") return { label: "LOST", cls: "text-rose-400 bg-rose-400/10" };
    if (status === "won") return { label: "WINNER", cls: "text-gold-light bg-gold/10 animate-pulse" };
    if (status === "cashed_out") return { label: "CASHED OUT", cls: "text-emerald-400 bg-emerald-400/10" };
    if (status === "sold") return { label: "SOLD", cls: "text-purple-400 bg-purple-400/10" };
    if (isOwned && matchedDigits > 0 && status === "matching")
      return { label: `${matchedDigits} MATCH`, cls: "text-accent bg-accent/10" };
    if (isOwned && status === "active" && autoCashoutAt)
      return { label: `AUTO @${autoCashoutAt}`, cls: "text-amber-400 bg-amber-400/10" };
    if (isOwned && status === "active") return { label: "OWNED", cls: "text-accent bg-accent/10" };
    if ((isVirtual || !owner) && !isOwned && matchesRevealed && status !== "would_lose")
      return { label: "AVAILABLE", cls: "text-emerald-400 bg-emerald-400/10" };
    return null;
  })();

  return (
    <motion.div
      onClick={handleClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="group relative h-full flex flex-col rounded-2xl cursor-pointer overflow-hidden bg-gradient-to-b from-dark-700 to-dark-800 hover:from-dark-600 hover:to-dark-700 transition-all duration-300 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30"
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header: badges + rank */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {statusBadge && (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {periodId && (
              <span className="text-white/30 text-[10px] font-medium">
                #{periodId}
              </span>
            )}
            {rank && rank <= 10 && (
              <span className="text-gold-light/80 text-[11px] font-semibold">
                #{rank}
              </span>
            )}
            {trend !== 0 && (
              <div
                className={`flex items-center gap-0.5 text-[11px] font-medium ${
                  trend > 0 ? "text-emerald-400" : "text-rose-400"
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
          </div>
        </div>

        {/* Number Display */}
        <div className="text-center mb-5">
          <p className="font-mono font-extrabold text-2xl md:text-xl lg:text-lg tracking-[0.3em] text-white">
            {formatNumber(number)}
          </p>
        </div>

        {/* Stats section - always shown */}
        {status === "lost" ? (
          /* Lost ticket stats */
          <div className="flex items-center gap-4 mb-5">
            <ArcProgress percentage={0} size={44} strokeWidth={3} />
            <div className="flex-1 flex items-center justify-between">
              <div className="text-center">
                <p className="text-white/40 font-bold text-sm">{formatVotes(votes)}</p>
                <p className="text-white/20 text-[10px] mt-0.5">votes</p>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="text-center">
                <p className="text-white/40 font-bold text-sm">{formatCurrency(buyAmount || price)}</p>
                <p className="text-white/20 text-[10px] mt-0.5">paid</p>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="text-center">
                <p className="text-rose-400/60 font-bold text-sm">0/7</p>
                <p className="text-white/20 text-[10px] mt-0.5">matched</p>
              </div>
            </div>
          </div>
        ) : status === "cashed_out" ? (
          /* Cashed out ticket stats */
          <div className="flex items-center gap-4 mb-5">
            <ArcProgress percentage={(matchedDigits / 7) * 100} size={44} strokeWidth={3} />
            <div className="flex-1 flex items-center justify-between">
              <div className="text-center">
                <p className="text-emerald-400/70 font-bold text-sm">{matchedDigits}/7</p>
                <p className="text-white/20 text-[10px] mt-0.5">matched</p>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="text-center">
                <p className="text-emerald-400/70 font-bold text-sm">{multiplier}x</p>
                <p className="text-white/20 text-[10px] mt-0.5">multi</p>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="text-center">
                <p className="text-emerald-400/70 font-bold text-sm">
                  {formatCurrency(currentReturn || (buyAmount || price) * multiplier)}
                </p>
                <p className="text-white/20 text-[10px] mt-0.5">earned</p>
              </div>
            </div>
          </div>
        ) : status === "sold" ? (
          /* Sold ticket stats */
          <div className="flex items-center gap-4 mb-5">
            <ArcProgress percentage={winChance} size={44} strokeWidth={3} />
            <div className="flex-1 flex items-center justify-between">
              <div className="text-center">
                <p className="text-white/40 font-bold text-sm">{formatVotes(votes)}</p>
                <p className="text-white/20 text-[10px] mt-0.5">votes</p>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="text-center">
                <p className="text-white/40 font-bold text-sm">{formatCurrency(price)}</p>
                <p className="text-white/20 text-[10px] mt-0.5">price</p>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="text-center">
                <p className="text-white/40 font-bold text-sm">{timesWon}</p>
                <p className="text-white/20 text-[10px] mt-0.5">wins</p>
              </div>
            </div>
          </div>
        ) : isOwned && matchedDigits > 0 ? (
          /* Matching stats */
          <div className="flex items-center gap-4 mb-5">
            <ArcProgress
              percentage={(matchedDigits / 7) * 100}
              size={44}
              strokeWidth={3}
            />
            <div className="flex-1 flex items-center justify-between">
              <div className="text-center">
                <p className="text-white font-bold text-sm">{matchedDigits}/7</p>
                <p className="text-white/30 text-[10px] mt-0.5">matched</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-purple-300 font-bold text-sm">{multiplier}x</p>
                <p className="text-white/30 text-[10px] mt-0.5">multi</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-gold-light font-bold text-sm">
                  {formatCurrency(currentReturn || (buyAmount || price) * multiplier)}
                </p>
                <p className="text-white/30 text-[10px] mt-0.5">return</p>
              </div>
            </div>
          </div>
        ) : (
          /* Default stats */
          <div className="flex items-center gap-4 mb-5">
            <ArcProgress percentage={winChance} size={44} strokeWidth={3} />
            <div className="flex-1 flex items-center justify-between">
              <div className="text-center">
                <p className="text-white font-bold text-sm">{formatVotes(votes)}</p>
                <p className="text-white/30 text-[10px] mt-0.5">votes</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-white font-bold text-sm">{formatCurrency(price)}</p>
                <p className="text-white/30 text-[10px] mt-0.5">price</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-white font-bold text-sm">{winChance.toFixed(1)}%</p>
                <p className="text-white/30 text-[10px] mt-0.5">chance</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <p className="text-white font-bold text-sm">{timesWon}</p>
                <p className="text-white/30 text-[10px] mt-0.5">wins</p>
              </div>
            </div>
          </div>
        )}

        {/* Owner info */}
        {owner && !isOwned && (
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center">
              <FiUser className="w-3 h-3 text-white/50" />
            </div>
            <p className="text-white/40 text-xs truncate">{owner}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
              {!owner ? (
                !matchesRevealed || status === "would_lose" ? (
                  <div className="flex-1 flex items-center justify-center h-10 rounded-xl text-orange-400/80 text-xs font-medium bg-orange-400/5 border border-orange-400/10">
                    Doesn't Match Draw
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleBuy}
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-accent hover:bg-accent/90 text-dark-900 font-semibold text-sm transition-colors"
                    >
                      <GiTwoCoins className="w-4 h-4" />
                      Buy {formatCurrency(price)}
                    </button>
                    <button
                      onClick={handleVote}
                      className={`flex items-center justify-center px-4 h-10 rounded-xl text-sm font-medium transition-all ${
                        hasVoted
                          ? "bg-accent/15 text-accent"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                      }`}
                    >
                      <FiThumbsUp
                        className={`w-4 h-4 ${hasVoted ? "fill-current" : ""}`}
                      />
                    </button>
                  </>
                )
              ) : isOwned ? (
                status === "lost" ? (
                  <div className="flex-1 flex items-center justify-center h-10 rounded-xl text-rose-400/70 text-xs font-medium bg-rose-400/5 border border-rose-400/10">
                    Ticket Lost
                  </div>
                ) : status === "cashed_out" ? (
                  <div className="flex-1 flex items-center justify-center h-10 rounded-xl text-emerald-400/70 text-xs font-medium bg-emerald-400/5 border border-emerald-400/10">
                    Cashed Out
                  </div>
                ) : canCashOut && matchedDigits > 0 ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCashOut?.(
                          id,
                          number,
                          currentReturn || (buyAmount || price) * multiplier,
                        );
                      }}
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-accent hover:bg-accent/90 text-dark-900 font-semibold text-sm transition-colors"
                    >
                      <GiTwoCoins className="w-4 h-4" />
                      Cash Out
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSchedulePopup(prev => !prev);
                        }}
                        className={`flex items-center justify-center gap-1.5 px-3 h-10 rounded-xl text-xs font-medium transition-all ${
                          autoCashoutAt
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                        }`}
                      >
                        <FiClock className="w-3.5 h-3.5" />
                        {autoCashoutAt ? `Auto Cash Out @${autoCashoutAt}` : 'Auto Cashout'}
                      </button>

                      {/* Schedule Popup */}
                      <AnimatePresence>
                        {showSchedulePopup && (
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full right-0 mb-2 w-48 p-3 rounded-xl bg-dark-700 border border-dark-500 shadow-xl z-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-white">Auto Cash Out At</p>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowSchedulePopup(false); }}
                                className="text-gray-500 hover:text-white"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="grid grid-cols-6 gap-1.5">
                              {[1, 2, 3, 4, 5, 6].map(n => {
                                const isActive = autoCashoutAt === n;
                                const isDisabled = n <= matchedDigits;
                                return (
                                  <button
                                    key={n}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const target = isActive ? null : n;
                                      onScheduleCashout?.(id, number, target);
                                      setShowSchedulePopup(false);
                                    }}
                                    disabled={isDisabled}
                                    className={`h-8 rounded-md text-xs font-bold transition-all ${
                                      isActive
                                        ? 'bg-amber-500/20 border border-amber-400/50 text-amber-400'
                                        : isDisabled
                                          ? 'bg-dark-800/50 text-gray-700 cursor-not-allowed'
                                          : 'bg-dark-800/80 border border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                                    }`}
                                  >
                                    {n}
                                  </button>
                                );
                              })}
                            </div>
                            {autoCashoutAt && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onScheduleCashout?.(id, number, null);
                                  setShowSchedulePopup(false);
                                }}
                                className="w-full mt-2 py-1.5 rounded-md text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                              >
                                Remove Auto-Cashout
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleVote}
                      className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium transition-all ${
                        hasVoted
                          ? "bg-accent/15 text-accent"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                      }`}
                    >
                      <FiThumbsUp
                        className={`w-4 h-4 ${hasVoted ? "fill-current" : ""}`}
                      />
                      {hasVoted ? "Voted" : "Boost with Vote"}
                    </button>
                    {status === 'active' && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSchedulePopup(prev => !prev);
                          }}
                          className={`flex items-center justify-center gap-1.5 px-3 h-10 rounded-xl text-xs font-medium transition-all ${
                            autoCashoutAt
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                          }`}
                        >
                          <FiClock className="w-3.5 h-3.5" />
                          {autoCashoutAt ? `Auto Cash Out @${autoCashoutAt}` : 'Auto Cashout'}
                        </button>

                        <AnimatePresence>
                          {showSchedulePopup && (
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute bottom-full right-0 mb-2 w-48 p-3 rounded-xl bg-dark-700 border border-dark-500 shadow-xl z-50"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-white">Auto Cash Out At</p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowSchedulePopup(false); }}
                                  className="text-gray-500 hover:text-white"
                                >
                                  <FiX className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="grid grid-cols-6 gap-1.5">
                                {[1, 2, 3, 4, 5, 6].map(n => (
                                  <button
                                    key={n}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const target = autoCashoutAt === n ? null : n;
                                      onScheduleCashout?.(id, number, target);
                                      setShowSchedulePopup(false);
                                    }}
                                    className={`h-8 rounded-md text-xs font-bold transition-all ${
                                      autoCashoutAt === n
                                        ? 'bg-amber-500/20 border border-amber-400/50 text-amber-400'
                                        : 'bg-dark-800/80 border border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                              {autoCashoutAt && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onScheduleCashout?.(id, number, null);
                                    setShowSchedulePopup(false);
                                  }}
                                  className="w-full mt-2 py-1.5 rounded-md text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                >
                                  Remove Auto-Cashout
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )
              ) : status === "lost" ? (
                <div className="flex-1 flex items-center justify-center h-10 rounded-xl text-rose-400/70 text-xs font-medium bg-rose-400/5 border border-rose-400/10">
                  Lost This Draw
                </div>
              ) : status === "cashed_out" ? (
                <div className="flex-1 flex items-center justify-center h-10 rounded-xl text-white/30 text-xs font-medium bg-white/[0.03] border border-white/5">
                  Cashed Out
                </div>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/number/${number}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-purple-500/10 text-purple-300 font-medium text-sm hover:bg-purple-500/20 transition-colors"
                  >
                    <FiDollarSign className="w-4 h-4" />
                    Make Offer
                  </button>
                  <button
                    onClick={handleVote}
                    className={`flex items-center justify-center px-4 h-10 rounded-xl text-sm font-medium transition-all ${
                      hasVoted
                        ? "bg-accent/15 text-accent"
                        : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                    }`}
                  >
                    <FiThumbsUp
                      className={`w-4 h-4 ${hasVoted ? "fill-current" : ""}`}
                    />
                  </button>
                </>
              )}
        </div>
      </div>

      {/* Bottom hover glow */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.div>
  );
}

export default LootCard;
