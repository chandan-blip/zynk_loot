import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSearch,
  FiTrendingUp,
  FiClock,
  FiZap,
  FiAward,
  FiUsers,
  FiDollarSign,
  FiChevronRight,
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiPodium } from "react-icons/gi";
import LootCard from "../components/LootCard";
import { getNumbers, getCurrentDraw, getPrizePool, getRecentWinners } from "../services/api";
import socketService from "../services/socket";
import useStore from "../store/useStore";
import { useCurrency } from "../contexts/CurrencyContext";
import { formatAmount } from "../utils/formatAmount";

const GENERATE_HOUR = 20; // 8 PM
const REVEAL_HOUR = 21; // 9 PM
const TOTAL_DIGITS = 7;
// First digit shows immediately at 8 PM, remaining 6 digits over 60 minutes
const SECONDS_PER_DIGIT = Math.floor(3600 / (TOTAL_DIGITS - 1)); // ~600 seconds = 10 min

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// Helper to format time ago
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

// Prize tier configuration
// Exact match (7 digits): 40%, Near matches (6 digits): share 10%
const PRIZE_TIERS = [
  { digits: 7, name: 'Exact Match', percentage: 80, color: 'gold', description: 'All 7 digits match' },
  { digits: 6, name: 'Near Match', percentage: 10, color: 'purple', description: 'First 6 digits match (shared)' },
];

function Home() {
  const { user } = useStore();
  const { selectedCurrency } = useCurrency();

  // Helper to format amounts using utility function
  const fmtAmount = (amount) => formatAmount(amount, selectedCurrency);
  const [numbers, setNumbers] = useState([]);
  const [draw, setDraw] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [prizePool, setPrizePool] = useState({
    total: 0,
    participants: 0,
    lastWinners: [],
  });
  const [revealState, setRevealState] = useState({
    revealedDigits: 0,
    nextRevealIn: 0,
    timeUntilComplete: 0,
    isComplete: false,
  });

  // Handle scroll for sticky bar
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowStickyBar(scrollY > 280);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate revealed digits based on current time
  const calculateRevealState = useCallback(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Before 8 PM
    if (currentHour < GENERATE_HOUR) {
      const next8PM = new Date(now);
      next8PM.setHours(GENERATE_HOUR, 0, 0, 0);
      return {
        revealedDigits: 0,
        nextRevealIn: Math.floor((next8PM - now) / 1000),
        timeUntilComplete: Math.floor((next8PM - now) / 1000) + 3600,
        isComplete: false,
        status: "waiting",
      };
    }

    // After 9 PM
    if (currentHour >= REVEAL_HOUR) {
      const tomorrow8PM = new Date(now);
      tomorrow8PM.setDate(tomorrow8PM.getDate() + 1);
      tomorrow8PM.setHours(GENERATE_HOUR, 0, 0, 0);
      return {
        revealedDigits: TOTAL_DIGITS,
        nextRevealIn: Math.floor((tomorrow8PM - now) / 1000),
        timeUntilComplete: 0,
        isComplete: true,
        status: "completed",
      };
    }

    // Between 8 PM and 9 PM - progressive reveal
    // First digit shows immediately, remaining 6 over the hour
    const secondsSince8PM =
      (currentHour - GENERATE_HOUR) * 3600 +
      currentMinutes * 60 +
      currentSeconds;
    const additionalDigits = Math.floor(secondsSince8PM / SECONDS_PER_DIGIT);
    const revealedDigits = Math.min(1 + additionalDigits, TOTAL_DIGITS);

    // Time until next digit (based on additional digits after first)
    const nextDigitTime = revealedDigits * SECONDS_PER_DIGIT; // Next reveal time
    const nextRevealIn = Math.max(0, nextDigitTime - secondsSince8PM);

    // Time until 9 PM
    const today9PM = new Date(now);
    today9PM.setHours(REVEAL_HOUR, 0, 0, 0);
    const timeUntilComplete = Math.floor((today9PM - now) / 1000);

    return {
      revealedDigits,
      nextRevealIn,
      timeUntilComplete,
      isComplete: revealedDigits >= TOTAL_DIGITS,
      status: "revealing",
    };
  }, []);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [numbersRes, drawRes, prizePoolRes, winnersRes] = await Promise.all([
          getNumbers(100),
          getCurrentDraw(),
          getPrizePool(),
          getRecentWinners(10),
        ]);
        setNumbers(numbersRes.data.data || []);
        setDraw(drawRes.data.data);

        // Set prize pool data
        const poolData = prizePoolRes.data.data;
        const winnersData = winnersRes.data.data || [];

        setPrizePool({
          total: poolData.totalPool || 0,
          participants: poolData.participants || 0,
          lastWinners: winnersData.map(w => ({
            id: w.id,
            username: w.username,
            number: w.number,
            prize: w.prize,
            matchedDigits: w.matchedDigits,
            time: formatTimeAgo(w.createdAt),
            isJackpot: w.isJackpot
          }))
        });
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setNumbers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Update reveal state every second
  useEffect(() => {
    const updateState = () => {
      setRevealState(calculateRevealState());
    };

    updateState();
    const interval = setInterval(updateState, 1000);
    return () => clearInterval(interval);
  }, [calculateRevealState]);

  // Socket connection for real-time updates
  useEffect(() => {
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsubDraw = socketService.onDrawStatus((data) => {
      setDraw(data);
    });

    const unsubNewDraw = socketService.onNewDraw?.((data) => {
      // Refetch draw data when new draw starts
      getCurrentDraw().then((res) => setDraw(res.data.data));
    });

    const unsubComplete = socketService.onDrawReveal?.((data) => {
      setDraw((prev) => ({ ...prev, ...data, isComplete: true }));
    });

    // Listen for digit reveal (both admin manual and auto-reveal)
    const unsubDigitRevealed = socketService.onDigitRevealed?.((data) => {
      console.log("Digit revealed:", data);
      setDraw((prev) => ({
        ...prev,
        revealedNumber: data.revealedNumber,
        revealedDigits: data.revealedDigits,
        digitsRemaining: data.digitsRemaining,
      }));
      // Also update the reveal state to sync with server
      setRevealState((prev) => ({
        ...prev,
        revealedDigits: data.revealedDigits,
        nextRevealIn: data.nextRevealIn || prev.nextRevealIn,
        status: "revealing",
      }));
    });

    // Listen for draw complete
    const unsubDrawComplete = socketService.onDrawComplete?.((data) => {
      setDraw((prev) => ({
        ...prev,
        revealedNumber: data.winningNumber,
        revealedDigits: 7,
        isComplete: true,
        status: "completed",
      }));
      setRevealState((prev) => ({
        ...prev,
        revealedDigits: 7,
        isComplete: true,
      }));
    });

    const unsubVote = socketService.onNumberVote((data) => {
      setNumbers((prev) =>
        prev.map((n) =>
          n.number === data.number ? { ...n, votes: data.totalVotes } : n
        )
      );
    });

    return () => {
      unsubDraw?.();
      unsubNewDraw?.();
      unsubComplete?.();
      unsubDigitRevealed?.();
      unsubDrawComplete?.();
      unsubVote?.();
    };
  }, []);

  // Get revealed number from server (already masked server-side for security)
  const getRevealedNumber = () => {
    // Server sends revealedNumber with unrevealed digits masked as '?'
    // We trust the server's masking - NEVER receive full number on client
    if (!draw?.revealedNumber) return "XXXXXXX";
    return draw.revealedNumber;
  };

  // Filter numbers
  const filteredNumbers = numbers.filter((num) => {
    if (search && !num.number.includes(search)) return false;
    if (filter === "available" && num.owner) return false;
    if (filter === "owned" && !num.owner) return false;
    return true;
  });

  // Get stats
  const stats = {
    totalNumbers: numbers.length,
    available: numbers.filter((n) => !n.owner).length,
    totalVotes: numbers.reduce((sum, n) => sum + (n.votes || 0), 0),
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <GiTwoCoins className="w-6 h-6 text-accent animate-pulse" />
          </div>
        </div>
        <p className="text-gray-400 text-sm">Loading lucky numbers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky Number Display Bar */}
      <AnimatePresence>
        {showStickyBar && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 right-0 z-50 bg-dark-800/95 backdrop-blur-lg border-b border-dark-600 shadow-lg"
          >
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex justify-between items-center gap-4">
                {/* Left: Draw Info */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                      <FiZap className="w-5 h-5 text-accent" />
                    </div>
                    {!revealState.isComplete && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-white font-semibold text-sm">Today's Draw</p>
                    <p className="text-gray-500 text-xs">
                      {Math.max(revealState.revealedDigits, draw?.revealedDigits || 0)} of {TOTAL_DIGITS} digits
                    </p>
                  </div>
                </div>

                {/* Center: Number Display */}
                <div className="flex items-center gap-1.5">
                  {(draw?.revealedNumber || "XXXXXXX").split("").map((digit, index) => {
                    const actualRevealed = Math.max(revealState.revealedDigits, draw?.revealedDigits || 0);
                    const isRevealed = index < actualRevealed;
                    return (
                      <div
                        key={index}
                        className={`w-8 h-9 sm:w-10 sm:h-12 rounded-lg flex items-center justify-center font-mono font-bold text-lg sm:text-xl ${
                          isRevealed
                            ? "bg-accent/20 text-accent border border-accent/30"
                            : "bg-dark-700 text-gray-600 border border-dark-600"
                        }`}
                      >
                        {isRevealed ? digit : "X"}
                      </div>
                    );
                  })}
                </div>

                
              </div>
              {/* Countdown or Status */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">
                  {revealState.isComplete
                    ? "Draw Complete"
                    : `${getOrdinal(Math.max(revealState.revealedDigits, draw?.revealedDigits || 0) + 1)} digit in`
                  }
                </span>
                {revealState.isComplete ? (
                  <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold flex items-center gap-1">
                    <FiAward className="w-3.5 h-3.5" />
                    Result Announced!
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    {(() => {
                      const totalSecs = revealState.nextRevealIn;
                      const hrs = Math.floor(totalSecs / 3600);
                      const mins = Math.floor((totalSecs % 3600) / 60);
                      const secs = totalSecs % 60;
                      return (
                        <>
                          {hrs > 0 && (
                            <>
                              <div className="flex flex-col items-center">
                                <span className="bg-dark-600 px-2 py-1 rounded text-white font-mono text-sm font-bold min-w-[28px] text-center">
                                  {String(hrs).padStart(2, '0')}
                                </span>
                                <span className="text-[10px] text-gray-600 mt-0.5">HR</span>
                              </div>
                              <span className="text-gray-500 font-bold pb-3">:</span>
                            </>
                          )}
                          <div className="flex flex-col items-center">
                            <span className="bg-dark-600 px-2 py-1 rounded text-white font-mono text-sm font-bold min-w-[28px] text-center">
                              {String(mins).padStart(2, '0')}
                            </span>
                            <span className="text-[10px] text-gray-600 mt-0.5">MIN</span>
                          </div>
                          <span className="text-gray-500 font-bold pb-3">:</span>
                          <div className="flex flex-col items-center">
                            <span className="bg-accent/20 text-accent px-2 py-1 rounded font-mono text-sm font-bold min-w-[28px] text-center">
                              {String(secs).padStart(2, '0')}
                            </span>
                            <span className="text-[10px] text-gray-600 mt-0.5">SEC</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-2">
                <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent to-accent-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.round(
                        (Math.max(revealState.revealedDigits, draw?.revealedDigits || 0) / TOTAL_DIGITS) * 100
                      )}%`,
                    }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section - Today's Draw */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-lg"
      >
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-dark-600 to-purple/10" />
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple/20 rounded-full blur-3xl" />

        <div className="relative rounded-lg p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: Draw Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                    <FiZap className="w-6 h-6 text-accent" />
                  </div>
                  {!revealState.isComplete && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    Today's Draw
                  </h1>
                  <p className="text-gray-400 text-sm">
                    {draw?.periodId && (
                      <span className="text-accent mr-2">#{draw.periodId}</span>
                    )}
                    {Math.max(
                      revealState.revealedDigits,
                      draw?.revealedDigits || 0
                    )}{" "}
                    of {TOTAL_DIGITS} digits revealed
                  </p>
                </div>
              </div>

              {/* Countdown */}
              <div className="flex items-center gap-3">
                <FiClock className="w-4 h-4 text-gray-500" />
                {revealState.isComplete ? (
                  <span className="badge badge-success">
                    <FiAward className="w-3 h-3 mr-1" />
                    Result Announced!
                  </span>
                ) : revealState.status === "waiting" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">
                        Draw starts in
                      </span>
                      <CountdownDisplay
                        seconds={revealState.nextRevealIn}
                        showSeconds
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{getOrdinal(Math.max(revealState.revealedDigits, draw?.revealedDigits || 0) + 1)} digit reveals in</span>
                      <span className="text-accent font-medium">
                        {formatSeconds(revealState.nextRevealIn)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">Next digit in</span>
                    <CountdownDisplay
                      seconds={revealState.nextRevealIn}
                      showSeconds
                    />
                  </div>
                )}
              </div>

              {/* Time until complete */}
              {!revealState.isComplete &&
                revealState.status === "revealing" && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Full reveal at 9:00 PM</span>
                    <span className="text-accent">
                      ({formatSeconds(revealState.timeUntilComplete)} remaining)
                    </span>
                  </div>
                )}
            </div>

            {/* Right: Number Display */}
            <div className="flex flex-col items-center lg:items-end gap-4">
              <NumberDisplay
                number={getRevealedNumber()}
                revealedDigits={Math.max(
                  revealState.revealedDigits,
                  draw?.revealedDigits || 0
                )}
              />

              {/* Progress Bar */}
              <div className="w-full max-w-xs">
                {(() => {
                  const actualRevealed = Math.max(
                    revealState.revealedDigits,
                    draw?.revealedDigits || 0
                  );
                  const progress = Math.round(
                    (actualRevealed / TOTAL_DIGITS) * 100
                  );
                  return (
                    <>
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="progress-bar">
                        <motion.div
                          className="progress-bar-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Prize Pool Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Prize Pool Card */}
        <div className="lg:col-span-1 rounded-xl bg-gradient-to-br from-gold/10 via-dark-700 to-dark-700 border border-gold/20 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
              <GiTrophy className="w-6 h-6 text-gold-light" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Current Prize Pool</p>
              <p className="text-3xl font-bold text-gold-light">{prizePool.total.toLocaleString()} Z</p>
              {/* Show in user's local currency */}
              {selectedCurrency.code !== 'ZYNK' && (
                <p className="text-gray-400 text-sm">
                  {fmtAmount(prizePool.total)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-dark-800/50">
              <div className="flex items-center gap-2 mb-1">
                <FiUsers className="w-4 h-4 text-accent" />
                <span className="text-gray-500 text-xs">Participants</span>
              </div>
              <p className="text-white font-bold text-lg">{prizePool.participants.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-dark-800/50">
              <div className="flex items-center gap-2 mb-1">
                <FiDollarSign className="w-4 h-4 text-emerald-light" />
                <span className="text-gray-500 text-xs">Avg Prize</span>
              </div>
              <p className="text-white font-bold text-lg">{Math.round(prizePool.total / 10)} Z</p>
            </div>
          </div>

          {/* Prize Tiers */}
          <div className="space-y-2">
            <p className="text-gray-500 text-xs font-medium mb-2">Prize Distribution</p>
            {PRIZE_TIERS.map((tier) => (
              <div key={tier.digits} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    tier.color === 'gold' ? 'bg-gold' :
                    tier.color === 'purple' ? 'bg-purple' :
                    tier.color === 'accent' ? 'bg-accent' :
                    tier.color === 'emerald' ? 'bg-emerald' : 'bg-slate'
                  }`} />
                  <span className="text-gray-400">{tier.name}</span>
                </div>
                <span className="text-white font-medium">{tier.percentage}%</span>
              </div>
            ))}
          </div>

        </div>

        {/* Recent Winners */}
        <div className="lg:col-span-2 rounded-xl bg-dark-700 border border-dark-600 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <GiPodium className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Recent Winners</h3>
                <p className="text-gray-500 text-xs">Latest prize distributions</p>
              </div>
            </div>
            <button className="flex items-center gap-1 text-accent text-sm hover:text-accent-400 transition-colors">
              View All <FiChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {prizePool.lastWinners.length > 0 ? (
              prizePool.lastWinners.map((winner, index) => (
                <motion.div
                  key={winner.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    winner.isJackpot
                      ? 'bg-gradient-to-r from-gold/10 to-dark-800/50 border border-gold/20'
                      : 'bg-dark-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      winner.isJackpot
                        ? 'bg-gold/20'
                        : index === 0 ? 'bg-accent/20' : 'bg-dark-600'
                    }`}>
                      {winner.isJackpot ? (
                        <GiTrophy className="w-5 h-5 text-gold-light" />
                      ) : (
                        <span className="text-sm font-bold text-gray-400">#{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{winner.username}</span>
                        {winner.isJackpot && (
                          <span className="px-2 py-0.5 rounded-full bg-gold/20 text-gold-light text-[10px] font-bold">
                            JACKPOT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-gray-500">{winner.number}</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-500">{winner.matchedDigits} digits matched</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${winner.isJackpot ? 'text-gold-light text-lg' : 'text-white'}`}>
                      +{winner.prize.toLocaleString()} Z
                    </p>
                    <p className="text-gray-600 text-xs">{winner.time}</p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8">
                <GiTrophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500">No winners yet</p>
                <p className="text-gray-600 text-sm">Be the first to win!</p>
              </div>
            )}
          </div>

          {/* Jackpot Highlight - show if there's a recent jackpot winner */}
          {prizePool.lastWinners.some(w => w.isJackpot) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 p-4 rounded-xl bg-gradient-to-r from-gold/20 via-gold/10 to-transparent border border-gold/30"
            >
              {(() => {
                const jackpotWinner = prizePool.lastWinners.find(w => w.isJackpot);
                return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gold/30 flex items-center justify-center animate-pulse">
                        <GiTrophy className="w-6 h-6 text-gold-light" />
                      </div>
                      <div>
                        <p className="text-gold-light font-bold">Jackpot Winner!</p>
                        <p className="text-gray-400 text-sm">Congratulations to {jackpotWinner.username}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gold-light">{jackpotWinner.prize.toLocaleString()} Z</p>
                      <p className="text-gray-500 text-xs">7/7 digits matched</p>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Filters Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        {/* Search */}
        <div className="relative flex-1">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number..."
            className="input-premium pl-11"
          />
        </div>
      </motion.div>

      {/* Numbers Grid */}
      <AnimatePresence mode="wait">
        {filteredNumbers.length > 0 ? (
          <motion.div
            key="grid"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {filteredNumbers.map((item, index) => (
              <motion.div key={item.id || item.number} variants={itemVariants}>
                <LootCard
                  number={item.number}
                  votes={item.votes}
                  owner={item.owner}
                  price={item.price}
                  trend={item.trend}
                  isOwned={user && item.ownerId === user.id}
                  index={index}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center py-16 rounded-lg"
          >
            <div className="w-16 h-16 rounded-full bg-dark-700 flex items-center justify-center mb-4">
              <FiSearch className="w-7 h-7 text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">
              No numbers found
            </h3>
            <p className="text-gray-500 text-sm">
              Try adjusting your search or filters
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Format seconds to human readable
// Get ordinal text for digit number (1st, 2nd, 3rd... or Last for 7th)
function getOrdinal(n) {
  const TOTAL_DIGITS = 7;
  if (n >= TOTAL_DIGITS) return "Last";
  const ordinals = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"];
  return ordinals[n] || `${n}th`;
}

function formatSeconds(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// Countdown Display Component
function CountdownDisplay({ seconds, showSeconds = false }) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return (
    <div className="flex items-center gap-1">
      {hours > 0 && (
        <>
          <TimeUnit value={hours} label="h" />
          <span className="text-gray-600">:</span>
        </>
      )}
      <TimeUnit value={minutes} label="m" />
      {(showSeconds || hours === 0) && (
        <>
          <span className="text-gray-600">:</span>
          <TimeUnit value={secs} label="s" />
        </>
      )}
    </div>
  );
}

// Time Unit Component
function TimeUnit({ value, label }) {
  return (
    <div className="flex items-baseline">
      <span className="font-mono font-bold text-white text-lg tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-gray-500 text-xs ml-0.5">{label}</span>
    </div>
  );
}

// Number Display Component
function NumberDisplay({ number, revealedDigits }) {
  const digits = number ? number.split("") : Array(7).fill("X");

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {digits.map((digit, index) => {
        const isRevealed = index < revealedDigits;
        return (
          <motion.div
            key={index}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={`number-digit ${
              isRevealed ? "number-digit-revealed" : "number-digit-hidden"
            }`}
          >
            <span className="font-mono font-bold text-xl sm:text-2xl">
              {isRevealed ? digit : "X"}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export default Home;
