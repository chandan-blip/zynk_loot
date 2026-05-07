import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiTrendingUp, FiAward, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { GiCardRandom } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import {
  getShuffleCardState,
  placeShuffleCardBet,
  getShuffleCardHistory,
  getShuffleCardMyBets,
} from '../../services/api';
import socketService from '../../services/socket';
import { sounds } from '../../utils/sounds';
import PlayingCard, { decodeCard, SUITS, RANK_LABELS } from '../../components/PlayingCard';
import BetStepper from '../../components/BetStepper';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';

const CARD_MULTIPLIERS = { 1: 3, 2: 50, 3: 500 };
const PICK_LABELS = { 1: 'Single', 2: 'Dual', 3: 'Triple' };
const KIND_MULTIPLIERS = { rank: 4, suit: 2, color: 2 };

const BET_KINDS = [
  { id: 'cards', label: 'Cards' },
  { id: 'rank',  label: 'Rank' },
  { id: 'suit',  label: 'Suit' },
  { id: 'color', label: 'Color' },
];

const QUICK_AMOUNTS = [10, 50, 100, 500];

// Tile colors for the history pattern strip — cycle through suits to give the
// "study the pattern" feel: each row is a colored chip block per dealt card.
function suitTone(suitIdx) {
  switch (suitIdx) {
    case 0: return 'bg-gray-700 text-gray-200';   // ♣ clubs
    case 1: return 'bg-red-500/80 text-white';    // ♦ diamonds
    case 2: return 'bg-rose-500/80 text-white';   // ♥ hearts
    case 3: return 'bg-slate-900 text-white';     // ♠ spades
    default: return 'bg-dark-700 text-white';
  }
}

function formatPeriodId(periodId) {
  if (!periodId) return '—';
  return String(periodId);
}

function CardChipMini({ id }) {
  const { rank, suit } = decodeCard(id);
  return (
    <span
      className="inline-flex flex-col items-center justify-center w-7 h-9 rounded bg-white border border-gray-300 font-bold text-[11px] leading-none"
      style={{ color: suit.color }}
      title={`${rank}${suit.symbol}`}
    >
      <span>{rank}</span>
      <span className="text-[10px]">{suit.symbol}</span>
    </span>
  );
}

function SlipTarget({ slip }) {
  if (slip.kind === 'cards') {
    return (
      <div className="flex flex-wrap gap-1">
        {slip.cards.map((cid) => <CardChipMini key={cid} id={cid} />)}
      </div>
    );
  }
  if (slip.kind === 'rank') {
    return (
      <span className="inline-flex items-center px-2 h-9 rounded bg-white border border-gray-300 font-bold text-xs text-gray-900">
        Rank {RANK_LABELS[slip.rank]}
      </span>
    );
  }
  if (slip.kind === 'suit') {
    const s = SUITS[slip.suit];
    return (
      <span
        className="inline-flex items-center gap-1 px-2 h-9 rounded bg-white border border-gray-300 font-bold text-xs"
        style={{ color: s.color }}
      >
        <span className="text-base leading-none">{s.symbol}</span>
        <span className="capitalize">{s.name}</span>
      </span>
    );
  }
  if (slip.kind === 'color') {
    const isRed = slip.color === 'red';
    return (
      <span className={`inline-flex items-center px-3 h-9 rounded border font-bold text-xs capitalize ${
        isRed ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-gray-700/40 border-gray-500/40 text-gray-200'
      }`}>
        {slip.color}
      </span>
    );
  }
  return null;
}

function slipKindLabel(slip) {
  if (slip.kind === 'cards') return PICK_LABELS[slip.cards.length] || '—';
  if (slip.kind === 'rank')  return 'Rank';
  if (slip.kind === 'suit')  return 'Suit';
  if (slip.kind === 'color') return 'Color';
  return slip.kind;
}

// Three face-down cards that gently tilt and shimmer during the betting window
// so the user feels the deck is alive while they choose bets.
function ShuffleStage({ revealed, locking }) {
  const placeholders = [0, 13, 26];
  return (
    <div className="relative h-44 sm:h-56 flex items-center justify-center">
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        style={{
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(245,210,122,0.10) 30deg, transparent 60deg, transparent 180deg, rgba(0,212,170,0.10) 210deg, transparent 240deg)',
          maskImage: 'radial-gradient(closest-side, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(closest-side, black 30%, transparent 75%)',
        }}
      />
      <div className="relative flex items-center justify-center gap-3 sm:gap-5">
        {placeholders.map((pid, i) => {
          const cardId = revealed && revealed[i] != null ? revealed[i] : pid;
          const faceUp = !!(revealed && revealed[i] != null);
          return (
            <motion.div
              key={i}
              initial={{ y: 20, opacity: 0, rotate: 0 }}
              animate={
                faceUp
                  ? { y: 0, opacity: 1, rotate: (i - 1) * 6 }
                  : locking
                    ? { y: [0, -6, 0], opacity: 1, rotate: [(i - 1) * 6, (i - 1) * 8, (i - 1) * 6] }
                    : { y: [0, -4, 0, 4, 0], opacity: 1, rotate: [(i - 1) * 4, (i - 1) * 8, (i - 1) * 4] }
              }
              transition={{
                duration: locking ? 0.6 : 3.2,
                repeat: faceUp ? 0 : Infinity,
                ease: 'easeInOut',
                delay: i * 0.12,
              }}
            >
              <PlayingCard id={cardId} faceUp={faceUp} size="lg" delay={i * 0.18} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function CardPickerGrid({ selectedSet, onToggle, allDisabled }) {
  // 52-card grid — 13 columns × 4 rows (one suit per row)
  return (
    <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
      {Array.from({ length: 52 }).map((_, id) => {
        const sel = selectedSet.has(id);
        const { rank, suit } = decodeCard(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => !allDisabled && onToggle(id)}
            disabled={allDisabled}
            className={`relative aspect-[5/7] rounded-md flex flex-col items-center justify-center text-[10px] sm:text-[11px] font-black transition-all ${
              sel
                ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg'
                : 'bg-white text-gray-900 hover:brightness-95'
            } ${allDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={!sel ? { color: suit.color } : undefined}
            title={`${rank}${suit.symbol}`}
          >
            <span>{rank}</span>
            <span className="text-[9px] sm:text-[10px] leading-none">{suit.symbol}</span>
          </button>
        );
      })}
    </div>
  );
}

function RankPicker({ value, onChange, disabled }) {
  return (
    <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
      {RANK_LABELS.map((r, i) => (
        <button
          key={r}
          type="button"
          onClick={() => !disabled && onChange(i)}
          disabled={disabled}
          className={`aspect-[5/7] rounded-md flex items-center justify-center text-base font-black transition-all ${
            value === i
              ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg'
              : 'bg-white text-gray-900 hover:brightness-95'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function SuitPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {SUITS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => !disabled && onChange(s.id)}
          disabled={disabled}
          className={`aspect-[5/7] rounded-lg flex flex-col items-center justify-center transition-all ${
            value === s.id
              ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg'
              : 'bg-white hover:brightness-95'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="text-3xl sm:text-4xl font-black" style={{ color: value === s.id ? '#0a0a0a' : s.color }}>
            {s.symbol}
          </span>
          <span className="text-[10px] sm:text-xs font-bold capitalize mt-1" style={{ color: value === s.id ? '#0a0a0a' : s.color }}>
            {s.name}
          </span>
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {['red', 'black'].map((c) => {
        const sel = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => !disabled && onChange(c)}
            disabled={disabled}
            className={`h-16 sm:h-20 rounded-lg flex items-center justify-center text-white font-black text-base capitalize transition-all ${
              sel ? 'ring-2 ring-accent shadow-lg' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              background: c === 'red'
                ? 'linear-gradient(160deg, #ef4444 0%, #991b1b 100%)'
                : 'linear-gradient(160deg, #1f2937 0%, #030712 100%)',
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

export default function ShuffleCard() {
  usePageTitle('Shuffle Card');
  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();

  const [round, setRound] = useState(null);            // current round metadata from server
  const [phase, setPhase] = useState('betting');       // 'betting' | 'locked' | 'reveal'
  const [revealedCards, setRevealedCards] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const HISTORY_PAGE_SIZE = 10;
  // Last completed round (kept independent of pagination so the strip above
  // the stage always reflects the most recent reveal).
  const [lastResult, setLastResult] = useState(null);
  const [myBets, setMyBets] = useState([]);
  const [resultModal, setResultModal] = useState(null); // user-specific outcome
  const [lockRemaining, setLockRemaining] = useState(0);

  // Bet builder state
  const [betKind, setBetKind] = useState('cards');
  const [selected, setSelected] = useState([]);
  const [pickedRank, setPickedRank] = useState(null);
  const [pickedSuit, setPickedSuit] = useState(null);
  const [pickedColor, setPickedColor] = useState(null);
  const [amount, setAmount] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  // Bets the user placed in the *current* round (used to show their slip list)
  const [pendingSlips, setPendingSlips] = useState([]);
  // Mobile bottom-sheet visibility for the bet controls
  const [sheetOpen, setSheetOpen] = useState(false);

  const tickRef = useRef(null);
  const historyPageRef = useRef(1);
  useEffect(() => { historyPageRef.current = historyPage; }, [historyPage]);
  // Tracks the last whole-second we played a countdown sound for, so each
  // tick from 5..0 fires exactly once even though the timer ticks at 200ms.
  const lastBeepSecRef = useRef(null);

  const loadHistoryPage = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await getShuffleCardHistory(page, HISTORY_PAGE_SIZE);
      const payload = res.data?.data || {};
      const items = Array.isArray(payload) ? payload : (payload.items || []);
      setHistory(items);
      setHistoryPage(payload.page || page);
      setHistoryTotalPages(payload.totalPages || 1);
      setHistoryTotal(payload.total || items.length);
      // Latest reveal lives on page 1, slot 0.
      if ((payload.page || page) === 1 && items.length > 0) {
        setLastResult({
          roundId: items[0].roundId,
          periodId: items[0].periodId,
          cards: items[0].cards || [],
        });
      }
    } catch {}
    setHistoryLoading(false);
  }, []);

  const refreshMyBets = useCallback(async () => {
    if (!user) return;
    try {
      const mine = await getShuffleCardMyBets(20);
      setMyBets(mine.data.data || []);
    } catch {}
  }, [user]);

  // Initial fetch + socket subscriptions
  useEffect(() => {
    const token = localStorage.getItem('token');
    socketService.connect(token);

    getShuffleCardState()
      .then((res) => {
        const r = res.data?.data?.round;
        if (r) {
          setRound(r);
          setPhase(r.status);
        }
      })
      .catch(() => {});

    loadHistoryPage(1);
    refreshMyBets();

    const unsubState = socketService.onShuffleRoundState?.((r) => {
      setRound(r);
      setPhase(r.status);
    });
    const unsubOpen = socketService.onShuffleRoundOpen?.((r) => {
      setRound(r);
      setPhase('betting');
      setRevealedCards(null);
      setPendingSlips([]);
      // Clear bet builder selections at round start
      setSelected([]);
      setPickedRank(null);
      setPickedSuit(null);
      setPickedColor(null);
    });
    const unsubLock = socketService.onShuffleRoundLock?.(() => {
      setPhase('locked');
      setSheetOpen(false);
    });
    const unsubResult = socketService.onShuffleRoundResult?.((data) => {
      setRevealedCards(data.cards);
      setPhase('reveal');
      // Always remember the most recent reveal for the strip above the stage.
      setLastResult({
        roundId: data.roundId,
        periodId: data.periodId,
        cards: data.cards || [],
      });
      // Refresh whichever page of history the user is currently viewing.
      loadHistoryPage(historyPageRef.current);
      refreshMyBets();
    });
    const unsubSettled = socketService.onShuffleRoundSettled?.((data) => {
      setResultModal(data);
      checkAuth?.();
    });
    const unsubBalance = socketService.onBalanceUpdate?.(() => {
      checkAuth?.();
    });

    return () => {
      unsubState?.();
      unsubOpen?.();
      unsubLock?.();
      unsubResult?.();
      unsubSettled?.();
      unsubBalance?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick every 200ms for smooth countdowns
  useEffect(() => {
    const tick = () => {
      if (!round) return;
      const now = Date.now();
      const lockMs = new Date(round.lockedAt).getTime();
      const completeMs = new Date(round.completeAt).getTime();
      const remaining = Math.max(0, completeMs - now);
      setLockRemaining(remaining);
      if (phase === 'betting' && now >= lockMs) setPhase('locked');

      // Final 5-second countdown SFX. Ticks fire once per integer second
      // 5..2, then a dramatic "drop" sound at the last tick (1s) so the
      // moment feels conclusive before the reveal at 0. Reset once we
      // leave the window.
      const wholeSec = Math.ceil(remaining / 1000);
      if (remaining > 0 && wholeSec <= 5) {
        if (lastBeepSecRef.current !== wholeSec) {
          lastBeepSecRef.current = wholeSec;
          if (wholeSec === 1) {
            sounds.countdownGo?.();
          } else {
            // step grows as we approach the drop (6 - sec) → 1..4
            sounds.countdownTick?.(6 - wholeSec);
          }
        }
      } else if (wholeSec > 5) {
        lastBeepSecRef.current = null;
      }
    };
    tick();
    tickRef.current = setInterval(tick, 200);
    return () => clearInterval(tickRef.current);
  }, [round, phase]);

  const isLocked = phase !== 'betting';

  const pickCount = selected.length;
  const currentAmount = parseFloat(amount) || 0;
  let currentMultiplier = 0;
  let currentPickLabel = '—';
  let isPickValid = false;
  if (betKind === 'cards') {
    currentMultiplier = CARD_MULTIPLIERS[pickCount] || 0;
    currentPickLabel = PICK_LABELS[pickCount] || '—';
    isPickValid = pickCount > 0;
  } else if (betKind === 'rank') {
    currentMultiplier = KIND_MULTIPLIERS.rank;
    currentPickLabel = pickedRank != null ? RANK_LABELS[pickedRank] : '—';
    isPickValid = pickedRank != null;
  } else if (betKind === 'suit') {
    currentMultiplier = KIND_MULTIPLIERS.suit;
    currentPickLabel = pickedSuit != null ? SUITS[pickedSuit].name : '—';
    isPickValid = pickedSuit != null;
  } else if (betKind === 'color') {
    currentMultiplier = KIND_MULTIPLIERS.color;
    currentPickLabel = pickedColor || '—';
    isPickValid = pickedColor != null;
  }
  const projectedWin = currentMultiplier * currentAmount;

  const totalPendingWager = useMemo(
    () => pendingSlips.reduce((s, b) => s + Number(b.amount || 0), 0),
    [pendingSlips]
  );

  const toggleCard = (id) => {
    if (isLocked) return;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        toast.error('Pick max 3 cards');
        return prev;
      }
      sounds.tap?.();
      return [...prev, id];
    });
  };

  const placeBet = async () => {
    if (!user) { toast.error('Please log in to play'); return; }
    if (isLocked) { toast.error('Betting is locked for this round'); return; }
    if (!isPickValid) {
      toast.error(
        betKind === 'cards' ? 'Pick at least 1 card' :
        betKind === 'rank' ? 'Pick a rank' :
        betKind === 'suit' ? 'Pick a suit' : 'Pick a color'
      );
      return;
    }
    if (currentAmount < 1) { toast.error('Min bet is 1'); return; }
    if (currentAmount > 10000) { toast.error('Max bet is 10,000'); return; }

    const payload = { kind: betKind, amount: currentAmount };
    if (betKind === 'cards') payload.cards = [...selected].sort((a, b) => a - b);
    else if (betKind === 'rank')  payload.rank = pickedRank;
    else if (betKind === 'suit')  payload.suit = pickedSuit;
    else if (betKind === 'color') payload.color = pickedColor;

    setSubmitting(true);
    sounds.click?.();
    try {
      const res = await placeShuffleCardBet(payload);
      const data = res.data?.data;
      const slip = {
        id: data.betId,
        kind: betKind,
        amount: currentAmount,
        multiplier: currentMultiplier,
        ...(betKind === 'cards' ? { cards: payload.cards } : {}),
        ...(betKind === 'rank'  ? { rank: pickedRank } : {}),
        ...(betKind === 'suit'  ? { suit: pickedSuit } : {}),
        ...(betKind === 'color' ? { color: pickedColor } : {}),
      };
      setPendingSlips((prev) => [...prev, slip]);
      // Clear builder
      setSelected([]);
      setPickedRank(null);
      setPickedSuit(null);
      setPickedColor(null);
      checkAuth?.();
      toast.success(`Bet placed: ${currentAmount} Z`);
      setSheetOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to place bet');
    } finally {
      setSubmitting(false);
    }
  };

  const closeResultModal = () => {
    setResultModal(null);
  };

  // Countdown values rounded
  const lockSecs = Math.ceil(lockRemaining / 1000);
  // Pretty 10-0 countdown during locked phase
  const lockPhaseSec = Math.max(0, Math.min(10, lockSecs));

  return (
    <div className="space-y-3">
      {/* Header — just the back link; game name + period live inside the
          stage block to keep the chrome minimal. */}
      <div className="flex items-center">
        <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <FiArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Games</span>
        </Link>
      </div>

      {/* Two-column responsive layout: on md+ the history/your-bets panels
          sit on the left and the live game moves to the right column. On
          mobile the game stays first (default order) so users see the stage
          before scrolling into history. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
       <div className="space-y-3 min-w-0 md:order-2">

      {/* Last revealed cards — sits above the live stage so the player always
          sees the most recent result without scrolling to the history table. */}
      {lastResult && (() => {
        const last = lastResult;
        const cards = last.cards || [];
        return (
          <motion.div
            key={last.roundId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-xl bg-dark-800/60 border border-dark-600/50 px-3 py-2 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase tracking-widest">
                Last
              </span>
              <span className="text-gray-400 font-mono text-[11px] truncate">
                {formatPeriodId(last.periodId)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {cards.map((cid, i) => {
                const { rank, suit } = decodeCard(cid);
                return (
                  <motion.span
                    key={i}
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.06 }}
                    className="inline-flex flex-col items-center justify-center w-8 h-10 rounded-md bg-white border border-gray-200 font-black text-[12px] leading-none shadow-sm"
                    style={{ color: suit.color }}
                    title={`${rank}${suit.symbol}`}
                  >
                    <span>{rank}</span>
                    <span className="text-[11px]">{suit.symbol}</span>
                  </motion.span>
                );
              })}
            </div>
          </motion.div>
        );
      })()}

      {/* Stage block — wraps the game name, period id, animated cards, and
          progress bar in a single container. */}
      <div className="rounded-xl border border-white/5 p-4 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <GiCardRandom className="w-5 h-5 text-amber-300 shrink-0" />
            <h1 className="text-white font-bold text-base truncate">Shuffle Card</h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-none">Period</p>
            <p className="text-accent font-mono text-xs font-bold">{formatPeriodId(round?.periodId)}</p>
          </div>
        </div>

        {/* Beautiful inline countdown — full-width rectangle with flipping
            digit tiles, a thin progress sweep underneath, and phase-aware
            color/urgency pulses. */}
        {(() => {
          const totalSec = Math.max(0, Math.ceil(lockRemaining / 1000));
          const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
          const ss = String(totalSec % 60).padStart(2, '0');
          const urgent = phase === 'betting' && totalSec <= 5 && totalSec > 0;
          const isLockPhase = phase === 'locked';
          const isReveal = phase === 'reveal';

          let ringFrom = '#10b981';
          let ringTo = '#34d399';
          let glow = 'rgba(16, 185, 129, 0.45)';
          if (isLockPhase) {
            ringFrom = '#f59e0b';
            ringTo = '#fbbf24';
            glow = 'rgba(245, 158, 11, 0.55)';
          } else if (isReveal) {
            ringFrom = '#8b5cf6';
            ringTo = '#a78bfa';
            glow = 'rgba(139, 92, 246, 0.45)';
          } else if (urgent) {
            ringFrom = '#ef4444';
            ringTo = '#f87171';
            glow = 'rgba(239, 68, 68, 0.6)';
          }

          const tileStyle = {
            width: 44,
            height: 56,
            background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
          };
          const digitStyle = {
            fontSize: 32,
            lineHeight: 1,
            textShadow: `0 0 14px ${glow}`,
          };

          return (
            <div className="mt-3 mb-2 relative">
              <div className="relative w-full rounded-2xl px-4 py-3 overflow-hidden">
                {/* Urgency ambient glow */}
                {urgent && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    animate={{ opacity: [0.25, 0.55, 0.25] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      background: `radial-gradient(circle at 50% 50%, ${ringFrom}33 0%, transparent 70%)`,
                    }}
                  />
                )}

                {/* Drifting twinkles */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      className="absolute w-1 h-1 rounded-full"
                      style={{
                        background: ringTo,
                        boxShadow: `0 0 6px ${ringTo}`,
                        top: `${12 + i * 18}%`,
                        left: '-5%',
                      }}
                      animate={{ x: ['0%', '2400%'], opacity: [0, 1, 1, 0] }}
                      transition={{
                        duration: 4 + i * 0.6,
                        repeat: Infinity,
                        ease: 'linear',
                        delay: i * 0.7,
                      }}
                    />
                  ))}
                </div>

                {/* Digit row — fills the width */}
                <div className="relative flex items-center justify-center gap-1.5 sm:gap-2">
                  {isReveal ? (
                    <motion.span
                      key="reveal-go"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.4 }}
                      className="font-black tracking-[0.3em]"
                      style={{
                        fontSize: 36,
                        color: 'white',
                        textShadow: `0 0 24px ${glow}`,
                      }}
                    >
                      RESULT
                    </motion.span>
                  ) : (
                    <>
                      {[mm[0], mm[1], ':', ss[0], ss[1]].map((ch, idx) => {
                        if (ch === ':') {
                          return (
                            <motion.span
                              key="colon"
                              className="font-black text-white/70 tabular-nums"
                              style={{ fontSize: 32, lineHeight: 1 }}
                              animate={{ opacity: [1, 0.2, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            >
                              :
                            </motion.span>
                          );
                        }
                        return (
                          <div
                            key={`tile-${idx}`}
                            className="relative inline-flex items-center justify-center rounded-lg overflow-hidden"
                            style={tileStyle}
                          >
                            <span
                              className="absolute left-0 right-0 top-1/2 h-px pointer-events-none"
                              style={{ background: 'rgba(255,255,255,0.06)' }}
                            />
                            <AnimatePresence mode="popLayout" initial={false}>
                              <motion.span
                                key={ch}
                                initial={{ y: 18, opacity: 0, scale: 0.7 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: -18, opacity: 0, scale: 1.15 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className="font-black tabular-nums text-white"
                                style={digitStyle}
                              >
                                {ch}
                              </motion.span>
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

              </div>
            </div>
          );
        })()}

        <ShuffleStage revealed={phase === 'reveal' ? revealedCards : null} locking={phase === 'locked'} />
      </div>

      {/* Bet controls — inline on tablet/desktop. On mobile only the bet-kind
          tabs are visible inline; tapping any tab opens the bottom sheet
          containing the picker + amount form for that kind. */}
      {(() => {
        const renderTabs = (onTabClick) => (
          <div className="flex border-b border-dark-600/60">
            {BET_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setBetKind(k.id);
                  onTabClick?.(k.id);
                }}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  betKind === k.id ? 'text-accent border-b-2 border-accent bg-dark-800/40' : 'text-gray-400 hover:text-white'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        );

        // Picker grid for the active bet kind. `onPicked` lets mobile auto-
        // open the bottom sheet the moment the user makes a selection.
        const renderPicker = (onPicked) => (
          <div className="p-3 sm:p-4">
            {betKind === 'cards' && (
              <CardPickerGrid
                selectedSet={new Set(selected)}
                onToggle={(id) => { toggleCard(id); onPicked?.(); }}
                allDisabled={isLocked}
              />
            )}
            {betKind === 'rank' && (
              <RankPicker
                value={pickedRank}
                onChange={(v) => { setPickedRank(v); onPicked?.(); }}
                disabled={isLocked}
              />
            )}
            {betKind === 'suit' && (
              <SuitPicker
                value={pickedSuit}
                onChange={(v) => { setPickedSuit(v); onPicked?.(); }}
                disabled={isLocked}
              />
            )}
            {betKind === 'color' && (
              <ColorPicker
                value={pickedColor}
                onChange={(v) => { setPickedColor(v); onPicked?.(); }}
                disabled={isLocked}
              />
            )}
          </div>
        );

        const stakeForm = (
          <div className="p-3 sm:p-4">
            <div className="rounded-lg bg-dark-800/60 p-3 border border-dark-600/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Stake</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Pick: <b className="text-white">{currentPickLabel}</b></span>
              </div>
              <BetStepper amount={amount} setAmount={setAmount} min={1} max={10000} step={5} disabled={isLocked} />
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String(q))}
                    className="px-2.5 py-1 rounded bg-dark-700 hover:bg-dark-600 text-xs text-white font-semibold border border-dark-500/50"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-gray-400">Multiplier</span>
                <span className="text-gold-light font-bold">{currentMultiplier ? `${currentMultiplier}x` : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Projected win</span>
                <span className="text-emerald-400 font-bold">{projectedWin > 0 ? formatCurrency(projectedWin) : '—'}</span>
              </div>
              <button
                type="button"
                onClick={placeBet}
                disabled={isLocked || submitting || !isPickValid}
                className="w-full py-2.5 rounded-lg bg-accent hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-dark-900 font-bold text-sm flex items-center justify-center gap-2"
              >
                <FiPlus className="w-4 h-4" /> {submitting ? 'Placing…' : 'Place Bet'}
              </button>
            </div>
          </div>
        );

        // Shared 10..0 countdown overlay shown over the picker block during
        // the lock phase. Sits over both the mobile-inline picker and the
        // desktop bet panel.
        const lockOverlay = (
          <AnimatePresence>
            {phase === 'locked' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 backdrop-blur-sm bg-dark-900/85 flex flex-col items-center justify-center"
              >
                <p className="text-yellow-300 text-xs uppercase tracking-widest font-bold mb-2">Betting closed</p>
                <motion.div
                  key={lockPhaseSec}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.4, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-white font-black text-7xl sm:text-8xl tabular-nums"
                  style={{ textShadow: '0 0 40px rgba(245, 210, 122, 0.7)' }}
                >
                  {lockPhaseSec}
                </motion.div>
                <p className="text-gray-300 text-xs mt-2">Cards revealing in {lockPhaseSec}s</p>
              </motion.div>
            )}
          </AnimatePresence>
        );

        return (
          <>
            {/* Inline (tablet/desktop) — hidden on mobile. Tabs + body. */}
            <div className="relative rounded-xl bg-dark-700/50 overflow-hidden hidden sm:block">
              {lockOverlay}
              {renderTabs()}
              {renderPicker()}
              {stakeForm}
            </div>

            {/* Mobile — inline tabs + picker grid. Tapping any option in the
                grid opens the bottom sheet to enter the stake amount. */}
            <div className="sm:hidden relative rounded-xl bg-dark-700/50 overflow-hidden">
              {lockOverlay}
              {renderTabs()}
              {renderPicker(() => !isLocked && setSheetOpen(true))}
            </div>

            {/* Pending slips — always visible inline so the user can track
                their bets without re-opening the bottom sheet on mobile. */}
            {pendingSlips.length > 0 && (
              <div className="rounded-xl bg-dark-700/50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-600/50">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Your bets this round</span>
                  <span className="text-xs text-white font-bold">{formatCurrency(totalPendingWager)}</span>
                </div>
                <div className="divide-y divide-dark-700/60 max-h-48 overflow-y-auto">
                  {pendingSlips.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-dark-700 text-[10px] text-gray-300 uppercase font-bold">{slipKindLabel(s)}</span>
                        <SlipTarget slip={s} />
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white text-xs font-bold">{formatCurrency(s.amount)}</p>
                        <p className="text-gold-light text-[10px] font-bold">{s.multiplier}x</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile bottom-sheet */}
            <AnimatePresence>
              {sheetOpen && (
                <motion.div
                  className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSheetOpen(false)}
                  />
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                    className="relative bg-dark-800 rounded-t-2xl border-t border-dark-600/60 max-h-[88vh] flex flex-col"
                  >
                    {/* Drag handle + header */}
                    <div className="px-4 pt-2 pb-1 flex flex-col items-center">
                      <div className="w-10 h-1 rounded-full bg-dark-500 mb-2" />
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <GiCardRandom className="w-4 h-4 text-amber-300" />
                          <h3 className="text-white font-semibold text-sm">Place a bet</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSheetOpen(false)}
                          className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-gray-300 hover:text-white"
                          aria-label="Close"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {renderTabs()}
                    <div className="overflow-y-auto">
                      {renderPicker()}
                      {stakeForm}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        );
      })()}
       </div>

       {/* Left column on md+ (history + your bets); appears below game on mobile */}
       <div className="space-y-3 min-w-0 md:order-1">

      {/* History — pattern table, newest first, paginated */}
      <div className="rounded-xl bg-dark-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-600/50">
          <div className="flex items-center gap-2">
            <FiTrendingUp className="w-4 h-4 text-accent" />
            <h3 className="text-white font-semibold text-sm">Pattern History</h3>
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{historyTotal} rounds</span>
        </div>

        {history.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No completed rounds yet — sit tight.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-dark-800/40 text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Period</th>
                  <th className="px-3 py-2 text-left font-semibold">Cards</th>
                  <th className="px-2 py-2 text-center font-semibold">Suits</th>
                  <th className="px-2 py-2 text-center font-semibold">Color</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/40">
                {history.map((h) => {
                  const cards = h.cards || [];
                  const suits = cards.map((c) => Math.floor(c / 13));
                  const reds = cards.filter((c) => {
                    const s = Math.floor(c / 13);
                    return s === 1 || s === 2;
                  }).length;
                  const dom = reds > cards.length - reds ? 'red' : 'black';
                  return (
                    <tr key={h.roundId} className="hover:bg-dark-800/30">
                      <td className="px-3 py-2 text-accent font-mono">{formatPeriodId(h.periodId)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {cards.map((cid, i) => {
                            const { rank, suit } = decodeCard(cid);
                            return (
                              <span
                                key={i}
                                className="inline-flex flex-col items-center justify-center w-6 h-8 rounded bg-white border border-gray-200 font-black text-[10px] leading-none"
                                style={{ color: suit.color }}
                              >
                                <span>{rank}</span>
                                <span className="text-[9px]">{suit.symbol}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {suits.map((s, i) => (
                            <span
                              key={i}
                              className={`w-4 h-4 rounded ${suitTone(s)} flex items-center justify-center text-[9px] font-bold`}
                              title={SUITS[s].name}
                            >
                              {SUITS[s].symbol}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            dom === 'red' ? 'bg-red-500/20 text-red-300' : 'bg-gray-700/60 text-gray-200'
                          }`}
                        >
                          {dom}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {historyTotalPages > 1 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-dark-600/40 bg-dark-800/30">
            <button
              type="button"
              onClick={() => loadHistoryPage(Math.max(1, historyPage - 1))}
              disabled={historyPage <= 1 || historyLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-dark-700 hover:bg-dark-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-white"
            >
              <FiChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-[11px] text-gray-400">
              Page <b className="text-white">{historyPage}</b> / {historyTotalPages}
            </span>
            <button
              type="button"
              onClick={() => loadHistoryPage(Math.min(historyTotalPages, historyPage + 1))}
              disabled={historyPage >= historyTotalPages || historyLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-dark-700 hover:bg-dark-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-white"
            >
              Next <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Your recent bets across rounds */}
      <div className="rounded-xl bg-dark-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-600/50">
          <div className="flex items-center gap-2">
            <FiAward className="w-4 h-4 text-gold-light" />
            <h3 className="text-white font-semibold text-sm">Your Recent Bets</h3>
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{myBets.length} bets</span>
        </div>
        {myBets.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No bets yet.</div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-dark-800/40 text-gray-400 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Period</th>
                  <th className="px-3 py-2 text-left font-semibold">Bet</th>
                  <th className="px-2 py-2 text-right font-semibold">Stake</th>
                  <th className="px-2 py-2 text-right font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/40">
                {myBets.map((b) => {
                  const slip = { kind: b.kind, ...(b.details || {}) };
                  return (
                    <tr key={b.betId} className="hover:bg-dark-800/30">
                      <td className="px-3 py-2 text-accent font-mono text-[10px] whitespace-nowrap">
                        {formatPeriodId(b.periodId)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-dark-700 text-[9px] text-gray-300 uppercase font-bold shrink-0">{slipKindLabel(slip)}</span>
                          <SlipTarget slip={slip} />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-white font-semibold whitespace-nowrap">
                        {formatCurrency(b.amount)}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {b.status === 'pending' ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 text-[10px] font-bold uppercase">
                            Pending
                          </span>
                        ) : b.isWin ? (
                          <span className="text-emerald-400 font-bold">+{formatCurrency(b.winAmount || 0)}</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] font-bold uppercase">
                            Lost
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
       </div>
      </div>

      {/* Rules + FAQ — payout reference and common questions. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl bg-dark-700/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600/50">
            <FiAward className="w-4 h-4 text-amber-300" />
            <h3 className="text-white font-semibold text-sm">Game Rules & Payouts</h3>
          </div>
          <div className="p-4 space-y-3 text-xs text-gray-300">
            <p className="text-gray-400 leading-relaxed">
              Each round the dealer reveals <b className="text-white">3 cards</b> from a shuffled 52-card deck. Place bets before the round locks — winnings pay your stake × the multiplier on a hit.
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Cards bet (pick exact cards)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Single</p>
                  <p className="text-gold-light font-black">3x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Dual</p>
                  <p className="text-gold-light font-black">50x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Triple</p>
                  <p className="text-gold-light font-black">500x</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Group bets (any of the 3 cards qualifies)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Rank</p>
                  <p className="text-gold-light font-black">4x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Suit</p>
                  <p className="text-gold-light font-black">2x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Color</p>
                  <p className="text-gold-light font-black">2x</p>
                </div>
              </div>
            </div>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li>Min bet <b className="text-white">1</b>, max bet <b className="text-white">10,000</b> per slip.</li>
              <li>Place as many slips as you like — they all settle when the round reveals.</li>
              <li>Bets close when the countdown locks; reveal happens shortly after.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl bg-dark-700/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600/50">
            <GiCardRandom className="w-4 h-4 text-accent" />
            <h3 className="text-white font-semibold text-sm">All Games at a Glance</h3>
          </div>
          <div className="divide-y divide-dark-600/40 max-h-[520px] overflow-y-auto">
            {[
              {
                name: 'Shuffle Card',
                tag: 'Live · Card',
                desc: 'Bet on 3 cards drawn from a shuffled deck each round. Pick exact cards, a rank, suit, or color.',
                payouts: 'Single 3x · Dual 50x · Triple 500x · Rank 4x · Suit 2x · Color 2x',
              },
              {
                name: 'Mutka King',
                tag: 'Card',
                desc: '4-card draw with picks for exact cards or groups. Higher card combos pay big.',
                payouts: '1c 2x · 2c 9x · 3c 100x · 4c 500x · Rank 3x · Suit 2x · Color 2x',
              },
              {
                name: 'UNO King',
                tag: 'Card',
                desc: 'UNO-deck variant — bet on color, number, action, or wild card outcomes.',
                payouts: 'Color 2x · Number 3x · Action 3x · Wild 6x · 1c 2x to 4c 500x',
              },
              {
                name: '7-Digit Lottery',
                tag: 'Live · Lottery',
                desc: 'Pick a 7-digit ticket; partial matches still pay. Live draws on a fixed schedule.',
                payouts: 'Tiered by digits matched · Jackpot for all 7',
              },
              {
                name: 'Lucky Spin',
                tag: 'Wheel',
                desc: 'Spin the wheel — landing slot determines your multiplier.',
                payouts: 'Variable · up to 50x',
              },
              {
                name: 'Coin Flip',
                tag: 'Classic',
                desc: 'Pick heads or tails. Simple 50/50 with instant settle.',
                payouts: '~1.96x on a hit',
              },
              {
                name: 'Dice Roll',
                tag: 'Classic',
                desc: 'Set an over/under target; multiplier scales with the chance you take.',
                payouts: 'Variable · risk-based',
              },
              {
                name: 'Arrow Roulette',
                tag: 'Wheel',
                desc: 'Spinning arrow lands on a colored sector — bet on the sector or color.',
                payouts: 'Sector & color tiers',
              },
              {
                name: 'Dragon Tower',
                tag: 'Crash · Skill',
                desc: 'Climb floors of the tower; cash out before you pick the cursed tile.',
                payouts: 'Compounds × ~1.94 per floor',
              },
              {
                name: 'Ice Field',
                tag: 'Crash · Skill',
                desc: 'Step across the ice — each safe step grows your multiplier; cash out anytime.',
                payouts: 'Compounding by step',
              },
              {
                name: 'Balloon Pop',
                tag: 'Crash',
                desc: 'Inflate the balloon for higher multipliers — pop and you lose your stake.',
                payouts: '1.5x · 2x · 3x · 5x · 10x · 25x presets',
              },
              {
                name: 'Fuse',
                tag: 'Crash',
                desc: 'Light the fuse — defuse before it burns out to lock in your multiplier.',
                payouts: '1.5x · 2x · 3x · 5x · 10x · 25x presets',
              },
              {
                name: 'Egg Hatch',
                tag: 'Mystery',
                desc: 'Choose an egg; hatch reveals a random multiplier from a weighted pool.',
                payouts: '0x to 15x weighted',
              },
            ].map((g, i) => (
              <details key={i} className="group">
                <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer list-none hover:bg-dark-800/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-white text-xs font-semibold truncate">{g.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider shrink-0">
                      {g.tag}
                    </span>
                  </div>
                  <span className="text-accent text-lg font-bold group-open:rotate-45 transition-transform shrink-0">+</span>
                </summary>
                <div className="px-4 pb-3 pt-1 text-xs text-gray-400 leading-relaxed space-y-1.5">
                  <p>{g.desc}</p>
                  <p className="text-[10px] text-gold-light/90 font-mono">{g.payouts}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* General FAQ — applies across the platform */}
      <div className="rounded-xl bg-dark-700/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600/50">
          <FiAward className="w-4 h-4 text-gold-light" />
          <h3 className="text-white font-semibold text-sm">FAQ</h3>
        </div>
        <div className="divide-y divide-dark-600/40">
          {[
            {
              q: 'Are the games provably fair?',
              a: 'Outcomes are generated server-side using cryptographic randomness. Round seeds and results are stored so any draw can be audited.',
            },
            {
              q: 'Can I cancel a placed bet?',
              a: 'No — once a slip is submitted it is locked into the round. Double-check your stake and selection before placing.',
            },
            {
              q: 'How fast are winnings credited?',
              a: 'Wins are credited to your wallet automatically the moment the round settles. The balance widget updates in real-time over the socket.',
            },
            {
              q: 'What are the global stake limits?',
              a: 'Min 1 and max 10,000 per slip on most games. Some games (Lottery, Lucky Spin) use their own ticket pricing — check that game for specifics.',
            },
            {
              q: 'Can I play multiple games at once?',
              a: 'Yes. Each game runs on its own round/timer and your wallet is shared, so you can keep slips active across several games simultaneously.',
            },
            {
              q: 'Where can I see my history?',
              a: 'Every game page has a "Your Recent Bets" panel with the last 20+ outcomes. Your full transaction log is on the Profile page.',
            },
          ].map((item, i) => (
            <details key={i} className="group">
              <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer list-none hover:bg-dark-800/30">
                <span className="text-white text-xs font-semibold">{item.q}</span>
                <span className="text-accent text-lg font-bold group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-4 pb-3 pt-1 text-xs text-gray-400 leading-relaxed">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Win/Loss overlay — uses the shared component so the modal animation
          and styling matches every other game (Mutka King, Coin Flip, etc.). */}
      <GameResultOverlay
        result={resultModal ? {
          isWin: resultModal.isWin,
          betAmount: resultModal.totalBet || 0,
          winAmount: resultModal.totalWin || 0,
          multiplier: (resultModal.totalBet || 0) > 0
            ? Math.round((resultModal.totalWin / resultModal.totalBet) * 100) / 100
            : 0,
          result: (resultModal.cards || []).map((id) => {
            const c = decodeCard(id);
            return `${c.rank}${c.suit.symbol}`;
          }).join(' '),
        } : null}
        show={!!resultModal}
        onClose={closeResultModal}
        title="Shuffle Card"
      />
    </div>
  );
}
