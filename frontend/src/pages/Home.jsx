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
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy, GiPodium } from "react-icons/gi";
import { Link } from "react-router-dom";
import LootCard from "../components/LootCard";
import OnboardingGuide from "../components/OnboardingGuide";
import { getNumbers, getCurrentDraw, getUpcomingSession, getPrizePool, getRecentWinners, getMyNumbers, getMyVotes, cashOutTicket, scheduleTicketCashout, buyNumber, voteForNumber, unvoteForNumber, getRecentActivities } from "../services/api";
import toast from "react-hot-toast";
import socketService from "../services/socket";
import useStore from "../store/useStore";
import { useCurrency } from "../contexts/CurrencyContext";
import { formatAmount } from "../utils/formatAmount";
import usePageTitle from "../hooks/usePageTitle";

const TOTAL_DIGITS = 7;

// Session names for display
const SESSION_NAMES = {
  1: 'Morning',
  2: 'Evening',
  3: 'Night'
};

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
  usePageTitle('Home');
  const { user } = useStore();
  const { selectedCurrency } = useCurrency();

  // Helper to format amounts using utility function
  const fmtAmount = (amount) => formatAmount(amount, selectedCurrency);
  const [numbers, setNumbers] = useState([]);
  const [draw, setDraw] = useState(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState(""); // Debounced search
  const [loading, setLoading] = useState(true); // Initial page load
  const [numbersLoading, setNumbersLoading] = useState(false); // Numbers grid loading
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
  const [recentActivities, setRecentActivities] = useState([]);

  // Helper to check if there's an active draw (not none/completed)
  const hasActiveDraw = draw && draw.id && draw.status !== 'none' && draw.status !== 'completed';

  // Derived: all digits revealed (even if status isn't formally 'completed' yet)
  const isAllRevealed = (parseInt(draw?.revealedDigits) || 0) >= TOTAL_DIGITS || draw?.isAllRevealed;
  // Treat as complete if formally complete OR all digits have been revealed
  const isEffectivelyComplete = draw?.isComplete || draw?.status === 'completed' || isAllRevealed;

  // Infinite scroll — refs avoid stale closures in IntersectionObserver callbacks
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const fetchingRef = useRef(false);
  const fetchIdRef = useRef(0);
  const searchRef = useRef(search);
  const observerRef = useRef(null);
  const initializedRef = useRef(false);
  const ITEMS_PER_PAGE = 20;
  const MAX_CLIENT_ITEMS = 200;

  // Mirror search into ref so the stable fetchNumbers can read it
  searchRef.current = search;

  // Handle scroll for sticky bar
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowStickyBar(scrollY > 280);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Activity type → visual metadata mapping
  const activityMeta = {
    vote: { icon: FiHeart, color: 'text-pink-400', bgColor: 'bg-pink-500/20' },
    buy: { icon: FiShoppingCart, color: 'text-accent', bgColor: 'bg-accent/20' },
    sell: { icon: FiArrowUpRight, color: 'text-purple-light', bgColor: 'bg-purple/20' },
    win: { icon: FiAward, color: 'text-gold-light', bgColor: 'bg-gold/20' },
    zynk_buy: { icon: FiDollarSign, color: 'text-emerald-light', bgColor: 'bg-emerald/20' },
    transfer: { icon: FiSend, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    withdrawal: { icon: FiArrowDownRight, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  };

  // Load recent activities on mount so first-time visitors see activity immediately
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

  // Live activity feed - connect socket even without login
  useEffect(() => {
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsub = socketService.onActivityNew?.((activity) => {
      const meta = activityMeta[activity.type] || activityMeta.buy;
      const enriched = { ...activity, ...meta };

      setRecentActivities(prev => {
        // Deduplicate by id
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

  // Sync reveal state with draw data from server (SERVER IS SOURCE OF TRUTH)
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

  // Stable fetch — reads search from ref, uses fetchId to discard stale responses
  const fetchNumbers = useCallback(async (reset = false) => {
    // Guard: for append, skip if already fetching, no more, or at client max
    if (!reset && (fetchingRef.current || !hasMoreRef.current)) return;
    if (!reset && offsetRef.current >= MAX_CLIENT_ITEMS) {
      hasMoreRef.current = false;
      setHasMore(false);
      return;
    }

    const currentId = ++fetchIdRef.current;
    fetchingRef.current = true;

    // Set appropriate loading state
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

      // Discard if a newer fetch was started while this one was in flight
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
      // Only clear flags if this is still the latest fetch
      if (currentId === fetchIdRef.current) {
        fetchingRef.current = false;
        initializedRef.current = true;
        setLoading(false);
        setNumbersLoading(false);
        setLoadingMore(false);
      }
    }
  }, []); // Stable — never recreated (reads search from ref)

  // Callback ref for the scroll sentinel — re-observes whenever the node mounts/unmounts
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

  // Cleanup observer on unmount
  useEffect(() => () => observerRef.current?.disconnect(), []);

  // Fetch initial data on mount (draw, prize pool, winners, user tickets)
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

        // Sync reveal state with server data
        syncRevealStateWithDraw(drawData);

        // If no active draw or all digits revealed, fetch upcoming session info
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

        // Fetch user's tickets and votes
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

            // Track voted numbers
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

  // Fetch numbers on search change (and on mount with search='')
  // fetchNumbers is stable so this only re-runs when search changes
  useEffect(() => {
    fetchNumbers(true);
  }, [search, fetchNumbers]);

  // Cash out handler
  const handleCashOut = async (ticketId, number) => {
    if (cashingOut) return;
    setCashingOut(ticketId);

    try {
      const response = await cashOutTicket(ticketId);
      if (response.data.success) {
        toast.success(`Cashed out ${number} for ${response.data.data.payout} Z!`);
        // Update local state
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

  // Schedule auto-cashout handler
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

  // Buy number handler
  const handleBuy = async (number, price) => {
    if (!user) {
      toast.error("Please login to buy numbers");
      return;
    }

    try {
      const response = await buyNumber(number);
      if (response.data.success) {
        const ticketData = response.data.data;
        // Show message based on whether it's for current draw or upcoming session
        const isForUpcoming = ticketData.status === 'pending' || ticketData.isForUpcomingSession;
        const sessionName = ticketData.sessionName || upcomingSession?.sessionName || 'upcoming';

        if (isForUpcoming) {
          toast.success(`Purchased ${number} for ${sessionName} session!`);
        } else {
          toast.success(`Successfully purchased ${number}!`);
        }

        // Update local state - add to my tickets
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
        // Update numbers list - mark as owned
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

  // Vote handler
  const handleVote = async (number) => {
    if (!user) {
      toast.error("Please login to vote");
      return;
    }

    try {
      await voteForNumber(number);
      toast.success(`Voted for ${number}!`);
      // Update local state
      setNumbers(prev => prev.map(n =>
        n.number === number ? { ...n, votes: (n.votes || 0) + 1 } : n
      ));
      // Mark as voted
      setMyVotedNumbers(prev => new Set([...prev, number]));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to vote");
    }
  };

  // Unvote handler
  const handleUnvote = async (number) => {
    if (!user) {
      return;
    }

    try {
      await unvoteForNumber(number);
      toast.success(`Removed vote from ${number}`);
      // Update local state
      setNumbers(prev => prev.map(n =>
        n.number === number ? { ...n, votes: Math.max(0, (n.votes || 0) - 1) } : n
      ));
      // Remove from voted set
      setMyVotedNumbers(prev => {
        const newSet = new Set(prev);
        newSet.delete(number);
        return newSet;
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove vote");
    }
  };

  // Update countdown timer every second (decrement from server values)
  useEffect(() => {
    // Don't run countdown if draw is complete or all digits revealed
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

  // When draw becomes effectively complete, fetch upcoming session
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

  // Socket connection for real-time updates
  useEffect(() => {
    const token = localStorage.getItem("token");
    socketService.connect(token);

    const unsubDraw = socketService.onDrawStatus((data) => {
      setDraw(data);
      syncRevealStateWithDraw(data);
    });

    const unsubNewDraw = socketService.onNewDraw?.(() => {
      // Refetch draw data when new draw starts
      getCurrentDraw().then((res) => {
        setDraw(res.data.data);
        syncRevealStateWithDraw(res.data.data);
      });
      // Refetch numbers — new draw resets prices and virtual numbers
      fetchNumbers(true);
      setUpcomingSession(null);
    });

    const unsubComplete = socketService.onDrawReveal?.((data) => {
      setDraw((prev) => ({ ...prev, ...data, isComplete: true }));
      syncRevealStateWithDraw({ ...data, isComplete: true });
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
      // Sync reveal state with server data
      setRevealState((prev) => ({
        ...prev,
        revealedDigits: data.revealedDigits,
        nextRevealIn: data.nextRevealIn || 3600,
        status: "revealing",
        isComplete: false,
      }));
      // Refetch numbers — prices change with each reveal and mismatched numbers need filtering
      fetchNumbers(true);
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
        status: "completed",
        nextRevealIn: 0,
      }));
      // Refetch numbers — ticket statuses change on draw complete
      fetchNumbers(true);
    });

    const unsubVote = socketService.onNumberVote((data) => {
      setNumbers((prev) =>
        prev.map((n) =>
          n.number === data.number ? { ...n, votes: data.totalVotes } : n
        )
      );
    });

    // Listen for ticket updates (matching state changes)
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

    // Listen for cash-out events
    const unsubCashedOut = socketService.onTicketCashedOut?.((data) => {
      setMyTickets(prev => ({
        ...prev,
        [data.number]: { ...prev[data.number], status: 'cashed_out', canCashOut: false }
      }));
      toast.success(`Cashed out ${data.number} for ${data.payout} Z!`);
    });

    // Listen for prize pool updates
    const unsubPrizePool = socketService.onPrizePoolUpdated?.((data) => {
      setPrizePool(prev => ({
        ...prev,
        total: data.totalPool,
        participants: prev.participants + 1
      }));
    });

    // Listen for user's numbers update (after buying)
    const unsubUserNumbers = socketService.onUserNumbersUpdated?.(async (data) => {
      // Refresh my tickets when user buys a number
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

  // Get revealed number - always show X for unrevealed positions
  const getRevealedNumber = () => {
    const revealedDigits = parseInt(draw?.revealedDigits) || 0;

    // If no digits revealed, show all X's
    if (revealedDigits === 0 || !draw?.revealedNumber) {
      return "XXXXXXX";
    }

    // Use server's masked number, but ensure unrevealed positions show X
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

  // Numbers are already filtered by backend, no client-side filter needed
  const filteredNumbers = numbers;

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
    <>
      {/* Onboarding Guide Modal for First-Time Users */}
      <OnboardingGuide />

      {/* Sticky Number Display Bar - Outside main container to avoid space-y margin */}
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
                {/* Left: Draw Info */}
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

                {/* Center: Number Display */}
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: TOTAL_DIGITS }).map((_, index) => {
                    const actualRevealed = !hasActiveDraw ? 0 : (parseInt(draw?.revealedDigits) || 0);
                    const isRevealed = index < actualRevealed;
                    const serverDigit = draw?.revealedNumber?.[index];
                    // Only show digit if revealed AND valid digit exists
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
              {/* Countdown or Status */}
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

              {/* Progress Bar */}
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

              {/* Countdown */}
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

              {/* Time until complete */}
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

            {/* Right: Number Display */}
            <div className="flex flex-col items-start lg:items-end gap-4">
              <NumberDisplay
                number={!hasActiveDraw ? "XXXXXXX" : getRevealedNumber()}
                revealedDigits={!hasActiveDraw ? 0 : (draw?.revealedDigits || 0)}
              />

              {/* Progress Bar */}
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

      {/* Recent Activity Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl bg-dark-700/50 border border-dark-600 p-4 overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <h3 className="text-white font-semibold text-sm">Live Activity</h3>
          </div>
          <span className="text-gray-500 text-xs">{recentActivities.length} recent</span>
        </div>

        <div className="relative">
          {/* Gradient fade on edges */}
          {/* <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-dark-700/50 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-dark-700/50 to-transparent z-10 pointer-events-none" /> */}

          {/* Scrolling activity feed */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
            <AnimatePresence initial={false} mode="popLayout">
              {recentActivities.map((activity, index) => {
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
                        {activity.description}
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

      {/* Instant Games Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl bg-dark-700/50 border border-dark-600 p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiPlay className="w-4 h-4 text-accent" />
            <h3 className="text-white font-semibold text-sm">Instant Games</h3>
          </div>
          <Link to="/games" className="text-accent text-xs font-medium flex items-center gap-1 hover:underline">
            View All <FiChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
          {[
            { name: 'Coin Flip', icon: GiTwoCoins, maxWin: '1.95x', color: 'from-yellow-500/20 to-amber-500/20', border: 'border-yellow-500/30', iconColor: 'text-yellow-400', path: '/games/coin-flip' },
            { name: 'Dice Roll', icon: FiZap, maxWin: '5.7x', color: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30', iconColor: 'text-blue-400', path: '/games/dice-roll' },
            { name: 'Lucky Spin', icon: FiStar, maxWin: '10x', color: 'from-purple-500/20 to-pink-500/20', border: 'border-purple-500/30', iconColor: 'text-purple-400', path: '/games/lucky-spin' },
            { name: 'Balloon Pop', icon: FiTarget, maxWin: '50x', color: 'from-red-500/20 to-pink-500/20', border: 'border-red-500/30', iconColor: 'text-red-400', path: '/games/balloon-pop' },
            { name: 'Dragon Tower', icon: FiLayers, maxWin: '200x', color: 'from-amber-500/20 to-orange-500/20', border: 'border-amber-500/30', iconColor: 'text-amber-400', path: '/games/dragon-tower' },
            { name: 'Ice Field', icon: FiGrid, maxWin: '84x', color: 'from-cyan-500/20 to-blue-500/20', border: 'border-cyan-500/30', iconColor: 'text-cyan-400', path: '/games/ice-field' },
            { name: 'Arrow Roulette', icon: FiCrosshair, maxWin: '10x', color: 'from-red-500/20 to-orange-500/20', border: 'border-red-500/30', iconColor: 'text-red-400', path: '/games/arrow-roulette' },
            { name: 'Egg Hatch', icon: FiGift, maxWin: '15x', color: 'from-amber-500/20 to-yellow-500/20', border: 'border-amber-500/30', iconColor: 'text-amber-400', path: '/games/egg-hatch' },
            { name: 'Fuse', icon: FiAlertTriangle, maxWin: '50x', color: 'from-orange-500/20 to-red-500/20', border: 'border-orange-500/30', iconColor: 'text-orange-400', path: '/games/fuse' },
          ].map((game) => (
            <Link
              key={game.name}
              to={game.path}
              className="flex-shrink-0 snap-start w-[calc(50%-6px)] sm:w-[calc(33.33%-8px)] md:w-[calc(25%-9px)]"
            >
              <div className={`relative rounded-xl bg-gradient-to-br ${game.color} border ${game.border} p-3 hover:brightness-110 transition-all overflow-hidden`}>
                {/* Background icon */}
                <game.icon className={`absolute -right-2 -bottom-2 w-16 h-16 ${game.iconColor} opacity-[0.08]`} />
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

      {/* Prize Pool Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Prize Pool Card */}
        <div className="lg:col-span-1 rounded-xl bg-gradient-to-br from-gold/10 via-dark-700 to-dark-700 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
              <GiTrophy className="w-6 h-6 text-gold-light" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Current Prize Pool</p>
              <p className="text-3xl font-[900] text-gold-light">{prizePool.total.toLocaleString()} Z</p>
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
              <div className="text-center py-4">
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

      {/* Upcoming Session Banner */}
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

      {/* Search Section */}
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
            value={searchInput}
            onChange={(e) => {
              // Only allow digits, max 7
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

      {/* Numbers Grid */}
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
              // Get ticket info if user owns this number
              const ticketInfo = myTickets[item.number] || {};
              const isOwned = user && item.ownerId === user.id;
              const isVirtual = item.isVirtual || !item.id;
              // Use user's ticket status if owned, otherwise use number's status from API
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
                    // Ticket matching props (from user's tickets or API)
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

      {/* Infinite Scroll Sentinel — callback ref handles observer lifecycle */}
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

// Sticky bar upcoming countdown (compact version)
function StickyUpcomingCountdown({ session }) {
  const [timeLeft, setTimeLeft] = useState(session.timeUntilStart || 0);

  // Re-sync when server provides new timeUntilStart
  useEffect(() => {
    setTimeLeft(session.timeUntilStart || 0);
  }, [session.timeUntilStart]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft > 0]);

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

// Upcoming Session Countdown Component
function UpcomingSessionCountdown({ session }) {
  const [timeLeft, setTimeLeft] = useState(session.timeUntilStart || 0);

  // Re-sync when server provides new timeUntilStart
  useEffect(() => {
    setTimeLeft(session.timeUntilStart || 0);
  }, [session.timeUntilStart]);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft > 0]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-accent text-sm font-medium">
          {session.sessionName} starts in
        </span>
        <div className="flex items-center gap-1">
          {hours > 0 && (
            <>
              <TimeUnit value={hours} label="h" />
              <span className="text-gray-600">:</span>
            </>
          )}
          <TimeUnit value={minutes} label="m" />
          <span className="text-gray-600">:</span>
          <TimeUnit value={seconds} label="s" />
        </div>
      </div>
      <span className="text-xs text-gray-500">
        Buy now to participate in the upcoming session
      </span>
    </div>
  );
}

// Number Display Component - always shows X for unrevealed positions
function NumberDisplay({ number, revealedDigits = 0 }) {
  const safeRevealedDigits = parseInt(revealedDigits) || 0;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {Array.from({ length: 7 }).map((_, index) => {
        const isRevealed = index < safeRevealedDigits;
        // Only show actual digit if: position is revealed AND we have a valid digit
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

export default Home;
