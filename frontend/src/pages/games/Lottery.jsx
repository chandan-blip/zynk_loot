import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSearch,
  FiClock,
  FiZap,
  FiAward,
  FiUsers,
  FiDollarSign,
  FiChevronRight,
  FiLoader,
  FiArrowLeft,
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiPodium } from "react-icons/gi";
import { Link } from "react-router-dom";
import LootCard from "../../components/LootCard";
import {
  getNumbers,
  getCurrentDraw,
  getUpcomingSession,
  getPrizePool,
  getRecentWinners,
  getMyNumbers,
  getMyVotes,
  cashOutTicket,
  scheduleTicketCashout,
  buyNumber,
  voteForNumber,
  unvoteForNumber,
} from "../../services/api";
import toast from "react-hot-toast";
import socketService from "../../services/socket";
import useStore from "../../store/useStore";
import { useCurrency } from "../../contexts/CurrencyContext";
import { formatAmount } from "../../utils/formatAmount";
import usePageTitle from "../../hooks/usePageTitle";

const TOTAL_DIGITS = 7;

const SESSION_NAMES = {
  1: 'Morning',
  2: 'Evening',
  3: 'Night'
};

const SESSIONS_UTC = [
  { number: 1, name: 'Morning', utcHour: 2,  utcMinute: 30 },
  { number: 2, name: 'Evening', utcHour: 9,  utcMinute: 30 },
  { number: 3, name: 'Night',   utcHour: 17, utcMinute: 30 },
];

function getNextSessionStart() {
  const now = new Date();
  for (const s of SESSIONS_UTC) {
    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      s.utcHour, s.utcMinute, 0, 0
    ));
    if (start.getTime() > now.getTime()) {
      return { ...s, start };
    }
  }
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    SESSIONS_UTC[0].utcHour, SESSIONS_UTC[0].utcMinute, 0, 0
  ));
  return { ...SESSIONS_UTC[0], start: tomorrow };
}

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

const PRIZE_TIERS = [
  { digits: 7, name: 'Exact Match', percentage: 80, color: 'gold', description: 'All 7 digits match' },
  { digits: 6, name: 'Near Match', percentage: 10, color: 'purple', description: 'First 6 digits match (shared)' },
];

function Lottery() {
  usePageTitle('7-Digit Lottery');
  const { user } = useStore();
  const { selectedCurrency, formatCurrency } = useCurrency();

  const fmtAmount = (amount) => formatAmount(amount, selectedCurrency);

  const [numbers, setNumbers] = useState([]);
  const [draw, setDraw] = useState(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
  const [upcomingSession, setUpcomingSession] = useState(null);
  const [myTickets, setMyTickets] = useState({});
  const [myVotedNumbers, setMyVotedNumbers] = useState(new Set());
  const [cashingOut, setCashingOut] = useState(null);

  const hasActiveDraw = draw && draw.id && draw.status !== 'none' && draw.status !== 'completed';
  const isAllRevealed = (parseInt(draw?.revealedDigits) || 0) >= TOTAL_DIGITS || draw?.isAllRevealed;
  const isEffectivelyComplete = draw?.isComplete || draw?.status === 'completed' || isAllRevealed;

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const fetchingRef = useRef(false);
  const fetchIdRef = useRef(0);
  const searchRef = useRef(search);
  const observerRef = useRef(null);
  const initializedRef = useRef(false);
  const ITEMS_PER_PAGE = 20;
  const MAX_CLIENT_ITEMS = 200;

  searchRef.current = search;

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowStickyBar(scrollY > 280);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const syncRevealStateWithDraw = useCallback((drawData) => {
    if (!drawData) return;

    const serverRevealedDigits = drawData.revealedDigits || 0;
    const isComplete = drawData.isComplete || drawData.status === 'completed';
    const allRevealed = serverRevealedDigits >= TOTAL_DIGITS || drawData.isAllRevealed;
    const sessionNumber = drawData.sessionNumber || 1;

    setRevealState({
      revealedDigits: serverRevealedDigits,
      isComplete,
      status: (isComplete || allRevealed) ? 'completed' : (serverRevealedDigits > 0 ? 'revealing' : 'waiting'),
      nextRevealIn: (isComplete || allRevealed) ? 0 : (drawData.nextRevealIn || 0),
      timeUntilComplete: (isComplete || allRevealed) ? 0 : (drawData.timeUntilComplete || 0),
      session: sessionNumber,
      sessionName: SESSION_NAMES[sessionNumber] || 'Current'
    });
  }, []);

  const fetchNumbers = useCallback(async (reset = false) => {
    if (!reset && (fetchingRef.current || !hasMoreRef.current)) return;
    if (!reset && offsetRef.current >= MAX_CLIENT_ITEMS) {
      hasMoreRef.current = false;
      setHasMore(false);
      return;
    }

    const currentId = ++fetchIdRef.current;
    fetchingRef.current = true;

    if (reset) {
      offsetRef.current = 0;
      hasMoreRef.current = true;
      if (!initializedRef.current) {
        setLoading(true);
      } else {
        setNumbersLoading(true);
      }
    } else {
      setLoadingMore(true);
    }

    try {
      const offset = reset ? 0 : offsetRef.current;
      const res = await getNumbers({
        limit: ITEMS_PER_PAGE,
        offset,
        search: searchRef.current,
      });

      if (currentId !== fetchIdRef.current) return;

      const incoming = res.data.data || [];
      const nextOffset = reset ? incoming.length : offsetRef.current;
      const more = res.data.hasMore && incoming.length > 0 && nextOffset + incoming.length < MAX_CLIENT_ITEMS;

      hasMoreRef.current = more;
      setHasMore(more);

      if (reset) {
        setNumbers(incoming);
        offsetRef.current = incoming.length;
      } else {
        setNumbers((prev) => {
          const seen = new Set(prev.map((n) => n.number));
          const fresh = incoming.filter((n) => !seen.has(n.number));
          offsetRef.current = prev.length + fresh.length;
          return [...prev, ...fresh];
        });
      }
    } catch (err) {
      if (currentId !== fetchIdRef.current) return;
      console.error('Failed to fetch numbers:', err);
    } finally {
      if (currentId === fetchIdRef.current) {
        fetchingRef.current = false;
        initializedRef.current = true;
        setLoading(false);
        setNumbersLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const sentinelRef = useCallback(
    (node) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && hasMoreRef.current && !fetchingRef.current) {
            fetchNumbers(false);
          }
        },
        { rootMargin: '200px' }
      );
      observerRef.current.observe(node);
    },
    [fetchNumbers],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [drawRes, prizePoolRes, winnersRes] = await Promise.all([
          getCurrentDraw(),
          getPrizePool(),
          getRecentWinners(10),
        ]);

        const drawData = drawRes.data.data;
        setDraw(drawData);

        syncRevealStateWithDraw(drawData);

        const allRevealed = (parseInt(drawData?.revealedDigits) || 0) >= TOTAL_DIGITS || drawData?.isAllRevealed;
        if (!drawData || !drawData.id || drawData.status === 'none' || drawData.status === 'completed' || allRevealed) {
          try {
            const upcomingRes = await getUpcomingSession();
            if (upcomingRes.data.success && upcomingRes.data.data.upcomingSession) {
              setUpcomingSession(upcomingRes.data.data.upcomingSession);
            }
          } catch (e) {
            console.log("Could not fetch upcoming session");
          }
        } else {
          setUpcomingSession(null);
        }

        const poolData = prizePoolRes.data.data;
        const winnersData = winnersRes.data.data || [];

        setPrizePool({
          total: poolData.totalPool || 0,
          participants: poolData.participants || 0,
          lastWinners: winnersData.map(w => ({
            id: w.id,
            username: w.name || w.username || 'Winner',
            number: w.platform ? w.platform.toUpperCase() : (w.number || ''),
            prize: Number(w.amount ?? w.prize ?? 0),
            matchedDigits: w.data?.utr ? `UTR ${w.data.utr}` : (w.matchedDigits ? `${w.matchedDigits} digits matched` : ''),
            time: formatTimeAgo(w.createdAt),
            isJackpot: false
          }))
        });

        if (user) {
          try {
            const [ticketsRes, votesRes] = await Promise.all([
              getMyNumbers(),
              getMyVotes()
            ]);
            const ticketsMap = {};
            (ticketsRes.data.data || []).forEach(t => {
              ticketsMap[t.number] = t;
            });
            setMyTickets(ticketsMap);

            const votedSet = new Set();
            (votesRes.data.data || []).forEach(v => {
              votedSet.add(v.number);
            });
            setMyVotedNumbers(votedSet);
          } catch (e) {
            console.log("Could not fetch user data");
          }
        }
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      }
    };

    fetchInitialData();
  }, [user, syncRevealStateWithDraw]);

  useEffect(() => {
    fetchNumbers(true);
  }, [search, fetchNumbers]);

  const handleCashOut = async (ticketId, number) => {
    if (cashingOut) return;
    setCashingOut(ticketId);

    try {
      const response = await cashOutTicket(ticketId);
      if (response.data.success) {
        toast.success(`Cashed out ${number} for ${fmtAmount(response.data.data.payout)}!`);
        setMyTickets(prev => ({
          ...prev,
          [number]: { ...prev[number], status: 'cashed_out', canCashOut: false }
        }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to cash out");
    } finally {
      setCashingOut(null);
    }
  };

  const handleScheduleCashout = async (ticketId, number, matchedDigitsTarget) => {
    try {
      await scheduleTicketCashout(ticketId, matchedDigitsTarget);
      setMyTickets(prev => ({
        ...prev,
        [number]: { ...prev[number], autoCashoutAt: matchedDigitsTarget }
      }));
      toast.success(matchedDigitsTarget ? `Auto-cashout set at ${matchedDigitsTarget} matches` : 'Auto-cashout removed');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to set auto-cashout');
    }
  };

  const handleBuy = async (number, price) => {
    if (!user) {
      toast.error("Please login to buy numbers");
      return;
    }

    try {
      const response = await buyNumber(number);
      if (response.data.success) {
        const ticketData = response.data.data;
        const isForUpcoming = ticketData.status === 'pending' || ticketData.isForUpcomingSession;
        const sessionName = ticketData.sessionName || upcomingSession?.sessionName || 'upcoming';

        if (isForUpcoming) {
          toast.success(`Purchased ${number} for ${sessionName} session!`);
        } else {
          toast.success(`Successfully purchased ${number}!`);
        }

        setMyTickets(prev => ({
          ...prev,
          [number]: {
            id: ticketData.numberId || ticketData.id,
            number,
            status: ticketData.status || 'active',
            matchedDigits: 0,
            canCashOut: false,
            buyAmount: price,
            isForUpcomingSession: isForUpcoming,
            sessionName: sessionName
          }
        }));
        setNumbers(prev => prev.map(n =>
          n.number === number
            ? { ...n, owner: user.username, ownerId: user.id, isVirtual: false }
            : n
        ));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to buy number");
    }
  };

  const handleVote = async (number) => {
    if (!user) {
      toast.error("Please login to vote");
      return;
    }

    try {
      await voteForNumber(number);
      toast.success(`Voted for ${number}!`);
      setNumbers(prev => prev.map(n =>
        n.number === number ? { ...n, votes: (n.votes || 0) + 1 } : n
      ));
      setMyVotedNumbers(prev => new Set([...prev, number]));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to vote");
    }
  };

  const handleUnvote = async (number) => {
    if (!user) {
      return;
    }

    try {
      await unvoteForNumber(number);
      toast.success(`Removed vote from ${number}`);
      setNumbers(prev => prev.map(n =>
        n.number === number ? { ...n, votes: Math.max(0, (n.votes || 0) - 1) } : n
      ));
      setMyVotedNumbers(prev => {
        const newSet = new Set(prev);
        newSet.delete(number);
        return newSet;
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove vote");
    }
  };

  useEffect(() => {
    if (isEffectivelyComplete) return;

    const interval = setInterval(() => {
      setRevealState(prev => ({
        ...prev,
        nextRevealIn: Math.max(0, prev.nextRevealIn - 1),
        timeUntilComplete: Math.max(0, prev.timeUntilComplete - 1),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isEffectivelyComplete]);

  useEffect(() => {
    if (isEffectivelyComplete && hasActiveDraw) {
      const fetchUpcoming = async () => {
        try {
          const upcomingRes = await getUpcomingSession();
          if (upcomingRes.data.success && upcomingRes.data.data.upcomingSession) {
            setUpcomingSession(upcomingRes.data.data.upcomingSession);
          }
        } catch (e) {
          console.log("Could not fetch upcoming session");
        }
      };
      fetchUpcoming();
    }
  }, [isEffectivelyComplete, hasActiveDraw]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsubDraw = socketService.onDrawStatus((data) => {
      setDraw(data);
      syncRevealStateWithDraw(data);
    });

    const unsubNewDraw = socketService.onNewDraw?.(() => {
      getCurrentDraw().then((res) => {
        setDraw(res.data.data);
        syncRevealStateWithDraw(res.data.data);
      });
      fetchNumbers(true);
      setUpcomingSession(null);
    });

    const unsubComplete = socketService.onDrawReveal?.((data) => {
      setDraw((prev) => ({ ...prev, ...data, isComplete: true }));
      syncRevealStateWithDraw({ ...data, isComplete: true });
    });

    const unsubDigitRevealed = socketService.onDigitRevealed?.((data) => {
      setDraw((prev) => ({
        ...prev,
        revealedNumber: data.revealedNumber,
        revealedDigits: data.revealedDigits,
        digitsRemaining: data.digitsRemaining,
      }));
      setRevealState((prev) => ({
        ...prev,
        revealedDigits: data.revealedDigits,
        nextRevealIn: data.nextRevealIn || 3600,
        status: "revealing",
        isComplete: false,
      }));
      fetchNumbers(true);
    });

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
        status: "completed",
        nextRevealIn: 0,
      }));
      fetchNumbers(true);
    });

    const unsubVote = socketService.onNumberVote((data) => {
      setNumbers((prev) =>
        prev.map((n) =>
          n.number === data.number ? { ...n, votes: data.totalVotes } : n
        )
      );
    });

    const unsubTicketUpdate = socketService.onTicketUpdate?.((data) => {
      setMyTickets(prev => ({
        ...prev,
        [data.number]: {
          ...prev[data.number],
          matchedDigits: data.matchedDigits,
          multiplier: data.multiplier,
          currentReturn: data.currentReturn,
          status: data.status,
          canCashOut: data.matchedDigits > 0 && !['cashed_out', 'sold', 'lost'].includes(data.status)
        }
      }));
    });

    const unsubCashedOut = socketService.onTicketCashedOut?.((data) => {
      setMyTickets(prev => ({
        ...prev,
        [data.number]: { ...prev[data.number], status: 'cashed_out', canCashOut: false }
      }));
      toast.success(`Cashed out ${data.number} for ${fmtAmount(data.payout)}!`);
    });

    const unsubPrizePool = socketService.onPrizePoolUpdated?.((data) => {
      setPrizePool(prev => ({
        ...prev,
        total: data.totalPool,
        participants: prev.participants + 1
      }));
    });

    const unsubUserNumbers = socketService.onUserNumbersUpdated?.(async (data) => {
      if (data.action === 'bought') {
        try {
          const ticketsRes = await getMyNumbers();
          const ticketsMap = {};
          (ticketsRes.data.data || []).forEach(t => {
            ticketsMap[t.number] = t;
          });
          setMyTickets(ticketsMap);
        } catch (e) {
          console.log("Could not refresh tickets");
        }
      }
    });

    return () => {
      unsubDraw?.();
      unsubNewDraw?.();
      unsubComplete?.();
      unsubDigitRevealed?.();
      unsubDrawComplete?.();
      unsubVote?.();
      unsubTicketUpdate?.();
      unsubCashedOut?.();
      unsubPrizePool?.();
      unsubUserNumbers?.();
    };
  }, [syncRevealStateWithDraw]);

  const getRevealedNumber = () => {
    const revealedDigits = parseInt(draw?.revealedDigits) || 0;

    if (revealedDigits === 0 || !draw?.revealedNumber) {
      return "XXXXXXX";
    }

    const serverNumber = draw.revealedNumber || "";
    let result = "";
    for (let i = 0; i < TOTAL_DIGITS; i++) {
      if (i < revealedDigits && serverNumber[i] && serverNumber[i] !== 'X') {
        result += serverNumber[i];
      } else {
        result += "X";
      }
    }
    return result;
  };

  const filteredNumbers = numbers;

  if (loading) {
    return (
      <>
        <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
          <FiArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Games</span>
        </Link>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <GiTwoCoins className="w-6 h-6 text-accent animate-pulse" />
            </div>
          </div>
          <p className="text-gray-400 text-sm">Loading lucky numbers...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <AnimatePresence>
        {showStickyBar && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 right-0 z-50 bg-dark-400/40 backdrop-blur-lg border-b border-dark-600 shadow-lg"
          >
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                      <FiZap className="w-5 h-5 text-accent" />
                    </div>
                    {hasActiveDraw && !isEffectivelyComplete && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-white font-semibold text-sm">
                      {hasActiveDraw && !isEffectivelyComplete ? "Today's Draw" : (upcomingSession ? `Next: ${upcomingSession.sessionName}` : isEffectivelyComplete ? "Draw Complete" : "No Active Draw")}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {hasActiveDraw && !isEffectivelyComplete ? `${parseInt(draw.revealedDigits) || 0} of ${TOTAL_DIGITS} digits` : (upcomingSession ? "Buy for upcoming session" : isEffectivelyComplete ? "All digits revealed" : "Waiting...")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: TOTAL_DIGITS }).map((_, index) => {
                    const actualRevealed = !hasActiveDraw ? 0 : (parseInt(draw?.revealedDigits) || 0);
                    const isRevealed = index < actualRevealed;
                    const serverDigit = draw?.revealedNumber?.[index];
                    const showDigit = isRevealed && serverDigit && serverDigit !== 'X';

                    return (
                      <div
                        key={index}
                        className={`w-8 h-9 sm:w-10 sm:h-12 rounded-lg flex items-center justify-center font-mono font-bold text-lg sm:text-xl ${
                          showDigit
                            ? "bg-accent/20 text-accent border border-accent/30"
                            : "bg-dark-700 text-gray-600 border border-dark-600"
                        }`}
                      >
                        {showDigit ? serverDigit : "X"}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">
                  {isEffectivelyComplete && upcomingSession
                    ? `${upcomingSession.sessionName} starts in`
                    : isEffectivelyComplete
                      ? "Draw Complete"
                      : !hasActiveDraw && upcomingSession
                        ? `${upcomingSession.sessionName} starts in`
                        : !hasActiveDraw
                          ? "Waiting for draw..."
                          : `${getOrdinal((parseInt(draw.revealedDigits) || 0) + 1)} digit in`
                  }
                </span>
                {isEffectivelyComplete && upcomingSession ? (
                  <StickyUpcomingCountdown session={upcomingSession} />
                ) : isEffectivelyComplete ? (
                  <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold flex items-center gap-1">
                    <FiAward className="w-3.5 h-3.5" />
                    Result Announced!
                  </span>
                ) : !hasActiveDraw && upcomingSession ? (
                  <StickyUpcomingCountdown session={upcomingSession} />
                ) : !hasActiveDraw ? (
                  <span className="text-xs text-gray-500">Waiting...</span>
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

              <div className="mt-2">
                <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent to-accent-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.round(
                        ((!hasActiveDraw ? 0 : (parseInt(draw?.revealedDigits) || 0)) / TOTAL_DIGITS) * 100
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

      <div className="space-y-3">
        <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <FiArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Games</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-lg"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-dark-600 to-purple/10" />
          <div className="absolute inset-0 bg-grid opacity-30" />
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple/20 rounded-full blur-3xl" />

          <div className="relative rounded-lg p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                      <FiZap className="w-6 h-6 text-accent" />
                    </div>
                    {hasActiveDraw && !isEffectivelyComplete && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">
                      {hasActiveDraw && !isEffectivelyComplete ? (revealState.sessionName || 'Current') + ' Session' : (
                        upcomingSession ? `Next: ${upcomingSession.sessionName} Session` : isEffectivelyComplete ? 'Draw Complete' : 'No Active Draw'
                      )}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      {hasActiveDraw && !isEffectivelyComplete ? (
                        <>
                          {draw.periodId && (
                            <span className="text-accent mr-2">#{draw.periodId}</span>
                          )}
                          {draw.sessionNumber && (
                            <span className="text-purple-light mr-2">Session {draw.sessionNumber}</span>
                          )} <br />
                          <span>{parseInt(draw.revealedDigits) || 0} of {TOTAL_DIGITS} digits revealed</span>
                        </>
                      ) : !hasActiveDraw && upcomingSession ? (
                        <span className="text-accent">Buy now for {upcomingSession.sessionName} session</span>
                      ) : isEffectivelyComplete ? (
                        <span className="text-accent">All {TOTAL_DIGITS} digits revealed</span>
                      ) : (
                        <span className="text-gray-500">Waiting for next draw to start...</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <FiClock className="w-4 h-4 text-gray-500" />
                    {isEffectivelyComplete && upcomingSession ? (
                      <UpcomingSessionCountdown session={upcomingSession} />
                    ) : isEffectivelyComplete ? (
                      <span className="badge badge-success">
                        <FiAward className="w-3 h-3 mr-1" />
                        Result Announced!
                      </span>
                    ) : !hasActiveDraw && upcomingSession ? (
                      <UpcomingSessionCountdown session={upcomingSession} />
                    ) : !hasActiveDraw ? (
                      <span className="text-gray-500 text-sm">Waiting for next draw...</span>
                    ) : revealState.status === "waiting" ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">
                            First digit in
                          </span>
                          <CountdownDisplay
                            seconds={revealState.nextRevealIn}
                            showSeconds
                          />
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
                  <div className="flex items-center gap-3 pl-7">
                    <UpcomingSessionCountdown />
                  </div>
                </div>

                {!isEffectivelyComplete &&
                  revealState.status === "revealing" && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Hourly reveals • Session ends in</span>
                      <span className="text-accent">
                        {formatSeconds(revealState.timeUntilComplete)}
                      </span>
                    </div>
                  )}
              </div>

              <div className="flex flex-col items-start lg:items-end gap-4">
                <NumberDisplay
                  number={!hasActiveDraw ? "XXXXXXX" : getRevealedNumber()}
                  revealedDigits={!hasActiveDraw ? 0 : (draw?.revealedDigits || 0)}
                />

                <div className="w-full max-w-xs">
                  {(() => {
                    const actualRevealed = !hasActiveDraw ? 0 : (parseInt(draw?.revealedDigits) || 0);
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
          <div className="lg:col-span-1 rounded-xl bg-gradient-to-br from-gold/10 via-dark-700 to-dark-700 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                <GiTrophy className="w-6 h-6 text-gold-light" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Current Prize Pool</p>
                <p className="text-3xl font-[900] text-gold-light">{fmtAmount(prizePool.total)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-dark-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <FiUsers className="w-4 h-4 text-accent" />
                  <span className="text-gray-500 text-xs">Participants</span>
                </div>
                <p className="text-white font-bold text-lg">{prizePool.participants >= 2000 ? prizePool.participants.toLocaleString() : String(Math.floor(100 + (prizePool.total % 900))).padStart(3, '0')}</p>
              </div>
              <div className="p-3 rounded-lg bg-dark-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <FiDollarSign className="w-4 h-4 text-emerald-light" />
                  <span className="text-gray-500 text-xs">Avg Prize</span>
                </div>
                <p className="text-white font-bold text-lg">{fmtAmount(Math.round(prizePool.total / 10))}</p>
              </div>
            </div>

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

          <div className="lg:col-span-2 rounded-xl bg-gradient-to-br from-dark-700 to-dark-800 border border-dark-600 p-3 sm:p-5 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex items-center justify-between gap-2 mb-4 sm:mb-5">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
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
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-xs font-semibold transition-colors shrink-0"
              >
                <span className="hidden xs:inline">View All</span><span className="xs:hidden">All</span> <FiChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="relative space-y-2">
              {prizePool.lastWinners.length > 0 ? (
                prizePool.lastWinners.slice(0, 5).map((winner, index) => {
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
          </div>
        </motion.div>

        {!hasActiveDraw && upcomingSession && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-purple/10 border border-purple/30"
          >
            <div className="w-10 h-10 rounded-lg bg-purple/20 flex items-center justify-center flex-shrink-0">
              <FiClock className="w-5 h-5 text-purple-light" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">
                Buying for {upcomingSession.sessionName} Session
              </p>
              <p className="text-gray-400 text-xs">
                Numbers purchased now will be active when the next session starts
              </p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 7);
                setSearchInput(val);
              }}
              placeholder="Search any 7-digit number (e.g., 1234567)..."
              className="input-premium pl-11"
              maxLength={7}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            )}
          </div>
          {search && (
            <div className="text-sm text-gray-400 flex items-center gap-2">
              <span>Searching for:</span>
              <span className="font-mono text-accent">{search.padStart(7, '0')}</span>
            </div>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {numbersLoading ? (
            <motion.div
              key="numbers-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-16"
            >
              <div className="flex items-center gap-3 text-gray-400">
                <FiLoader className="w-6 h-6 animate-spin text-accent" />
                <span>Searching numbers...</span>
              </div>
            </motion.div>
          ) : filteredNumbers.length > 0 ? (
            <motion.div
              key="grid"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            >
              {filteredNumbers.map((item, index) => {
                const ticketInfo = myTickets[item.number] || {};
                const isOwned = user && item.ownerId === user.id;
                const isVirtual = item.isVirtual || !item.id;
                const ticketStatus = isOwned
                  ? (ticketInfo.status || 'active')
                  : (item.ticketStatus || 'active');

                return (
                  <motion.div key={item.id || `virtual-${item.number}`} variants={itemVariants}>
                    <LootCard
                      id={ticketInfo.id || item.id}
                      number={item.number}
                      votes={item.votes}
                      owner={item.owner}
                      price={item.price}
                      trend={item.trend}
                      isOwned={isOwned}
                      isVirtual={isVirtual}
                      matchesRevealed={item.matchesRevealed !== false}
                      hasVoted={myVotedNumbers.has(item.number)}
                      index={index}
                      periodId={item.periodId || draw?.periodId}
                      matchedDigits={ticketInfo.matchedDigits || 0}
                      currentReturn={ticketInfo.currentReturn || 0}
                      multiplier={ticketInfo.multiplier || 0}
                      status={ticketStatus}
                      canCashOut={ticketInfo.canCashOut || false}
                      buyAmount={ticketInfo.buyAmount}
                      autoCashoutAt={ticketInfo.autoCashoutAt || null}
                      onBuy={handleBuy}
                      onVote={handleVote}
                      onUnvote={handleUnvote}
                      onCashOut={handleCashOut}
                      onScheduleCashout={handleScheduleCashout}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          ) : !loading ? (
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
                Try searching for a different number
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {filteredNumbers.length > 0 && (
          hasMore ? (
            <div ref={sentinelRef} className="flex items-center justify-center py-8">
              {loadingMore && (
                <div className="flex items-center gap-3 text-gray-400">
                  <FiLoader className="w-5 h-5 animate-spin" />
                  <span>Loading more numbers...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>{search ? 'No more results' : 'Search for a specific number to find more'}</p>
            </div>
          )
        )}
      </div>
    </>
  );
}

function getOrdinal(n) {
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

function StickyUpcomingCountdown() {
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, Math.floor((getNextSessionStart().start.getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((getNextSessionStart().start.getTime() - Date.now()) / 1000));
      setTimeLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const hrs = Math.floor(timeLeft / 3600);
  const mins = Math.floor((timeLeft % 3600) / 60);
  const secs = timeLeft % 60;

  return (
    <div className="flex items-center gap-1">
      {hrs > 0 && (
        <>
          <div className="flex flex-col items-center">
            <span className="bg-purple/20 text-purple-light px-2 py-1 rounded font-mono text-sm font-bold min-w-[28px] text-center">
              {String(hrs).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-gray-600 mt-0.5">HR</span>
          </div>
          <span className="text-gray-500 font-bold pb-3">:</span>
        </>
      )}
      <div className="flex flex-col items-center">
        <span className="bg-purple/20 text-purple-light px-2 py-1 rounded font-mono text-sm font-bold min-w-[28px] text-center">
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
    </div>
  );
}

function UpcomingSessionCountdown() {
  const [next, setNext] = useState(() => getNextSessionStart());

  useEffect(() => {
    const interval = setInterval(() => {
      setNext(getNextSessionStart());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const localStartTime = next.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400">Next {next.name} session at</span>
      <span className="text-accent font-semibold">{localStartTime}</span>
    </div>
  );
}

function NumberDisplay({ number, revealedDigits = 0 }) {
  const safeRevealedDigits = parseInt(revealedDigits) || 0;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {Array.from({ length: 7 }).map((_, index) => {
        const isRevealed = index < safeRevealedDigits;
        const digit = (number && number[index] && number[index] !== 'X') ? number[index] : null;
        const showDigit = isRevealed && digit;

        return (
          <motion.div
            key={index}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={`number-digit ${
              showDigit ? "number-digit-revealed" : "number-digit-hidden"
            }`}
          >
            <span className="font-mono font-bold text-xl sm:text-2xl">
              {showDigit ? digit : "X"}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export default Lottery;
