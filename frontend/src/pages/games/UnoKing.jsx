import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiTrendingUp, FiAward, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { GiCardJoker } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import {
  getUnoKingState,
  placeUnoKingBet,
  getUnoKingHistory,
  getUnoKingMyBets,
} from '../../services/api';
import socketService from '../../services/socket';
import { sounds } from '../../utils/sounds';
import UnoCard, { decodeUnoCard, UNO_COLORS } from '../../components/UnoCard';
import BetStepper from '../../components/BetStepper';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';

// UNO multipliers — picks bet scales geometrically; group bets are uniform.
const CARD_MULTIPLIERS = { 1: 2, 2: 9, 3: 100, 4: 500 };
const PICK_LABELS = { 1: 'Single', 2: 'Dual', 3: 'Triple', 4: 'Four' };
const KIND_MULTIPLIERS = { color: 2, number: 3, action: 3, wild: 6 };

const BET_KINDS = [
  { id: 'cards',  label: 'Cards' },
  { id: 'color',  label: 'Color' },
  { id: 'number', label: 'Number' },
  { id: 'action', label: 'Action' },
  { id: 'wild',   label: 'Wild' },
];

const ACTIONS = [
  { id: 'skip',     label: 'Skip',    rank: 10 },
  { id: 'reverse',  label: 'Reverse', rank: 11 },
  { id: 'draw_two', label: '+2',      rank: 12 },
];

const QUICK_AMOUNTS = [10, 50, 100, 500];

// History pattern strip — one tile per dealt card colored by its UNO color
// (or slate for wilds).
function unoTone(card) {
  if (card.isWild) return 'bg-slate-900 text-white';
  switch (card.color?.id) {
    case 0: return 'bg-red-500/85 text-white';
    case 1: return 'bg-yellow-400/90 text-black';
    case 2: return 'bg-green-500/85 text-white';
    case 3: return 'bg-blue-500/85 text-white';
    default: return 'bg-dark-700 text-white';
  }
}

function formatPeriodId(periodId) {
  if (!periodId) return '—';
  return String(periodId);
}

function CardChipMini({ id }) {
  // Real UNO sprite at xs size so slip lists show actual card art.
  return (
    <div className="inline-block align-middle">
      <UnoCard id={id} faceUp={true} size="xs" />
    </div>
  );
}

function SlipTarget({ slip }) {
  if (slip.kind === 'cards') {
    return (
      <div className="flex flex-wrap gap-0.5">
        {slip.cards.map((cid) => <CardChipMini key={cid} id={cid} />)}
      </div>
    );
  }
  if (slip.kind === 'color') {
    const c = UNO_COLORS.find((x) => x.name === slip.color);
    return (
      <span
        className="inline-flex items-center px-2 h-6 rounded border font-bold text-[10px] capitalize text-white"
        style={{ background: c?.main || '#444', borderColor: c?.dark || '#222' }}
      >
        {slip.color}
      </span>
    );
  }
  if (slip.kind === 'number') {
    return (
      <span className="inline-flex items-center px-1.5 h-6 rounded border bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-bold text-[10px]">
        Number {slip.number}
      </span>
    );
  }
  if (slip.kind === 'action') {
    const action = ACTIONS.find((a) => a.id === slip.action);
    return (
      <span className="inline-flex items-center px-1.5 h-6 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
        {action?.label || slip.action}
      </span>
    );
  }
  if (slip.kind === 'wild') {
    return (
      <span className="inline-flex items-center px-1.5 h-6 rounded bg-slate-900/70 border border-purple-500/40 text-purple-300 font-bold text-[10px]">
        ★ Wild
      </span>
    );
  }
  return null;
}

function slipKindLabel(slip) {
  if (slip.kind === 'cards')  return PICK_LABELS[slip.cards.length] || '—';
  if (slip.kind === 'color')  return 'Color';
  if (slip.kind === 'number') return 'Number';
  if (slip.kind === 'action') return 'Action';
  if (slip.kind === 'wild')   return 'Wild';
  return slip.kind;
}

// Three face-down cards that gently tilt and shimmer during the betting window
// so the user feels the deck is alive while they choose bets.
// Renders `count` face-down or face-up UNO cards based on the active type.
// Mixes one wild into the placeholders so the back-of-deck hints at the full
// 54-card UNO deck.
const PLACEHOLDER_IDS = [0, 13, 26, 52];
function UnoStage({ revealed, locking, count = 4 }) {
  const safeCount = Math.max(1, Math.min(4, count));
  const placeholders = PLACEHOLDER_IDS.slice(0, safeCount);
  const mid = (safeCount - 1) / 2;
  const cardClass = safeCount >= 3 ? '!w-[72px] sm:!w-[120px]' : '';
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
      <div className={`relative flex items-center justify-center ${safeCount >= 3 ? 'gap-2 sm:gap-5' : 'gap-3 sm:gap-5'}`}>
        {placeholders.map((pid, i) => {
          const cardId = revealed && revealed[i] != null ? revealed[i] : pid;
          const faceUp = !!(revealed && revealed[i] != null);
          return (
            <motion.div
              key={`${safeCount}-${i}`}
              initial={{ y: 20, opacity: 0, rotate: 0 }}
              animate={
                faceUp
                  ? { y: 0, opacity: 1, rotate: (i - mid) * 6 }
                  : locking
                    ? { y: [0, -6, 0], opacity: 1, rotate: [(i - mid) * 6, (i - mid) * 8, (i - mid) * 6] }
                    : { y: [0, -4, 0, 4, 0], opacity: 1, rotate: [(i - mid) * 4, (i - mid) * 8, (i - mid) * 4] }
              }
              transition={{
                duration: locking ? 0.6 : 3.2,
                repeat: faceUp ? 0 : Infinity,
                ease: 'easeInOut',
                delay: i * 0.12,
              }}
            >
              <UnoCard id={cardId} faceUp={faceUp} size="lg" className={cardClass} delay={i * 0.18} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// UnoCardChip — real sprite with hover/scale + selection ring + check pip.
function UnoCardChip({ id, selected, disabled, onClick, size = 'fill' }) {
  return (
    <motion.div
      whileHover={!disabled && !selected ? { y: -2 } : undefined}
      whileTap={!disabled ? { scale: 0.92 } : undefined}
      animate={{ scale: selected ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      onClick={!disabled ? onClick : undefined}
      className={`relative ${disabled ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer hover:brightness-[1.05]'}`}
      style={{ willChange: 'transform' }}
    >
      <UnoCard id={id} faceUp={true} size={size} selected={selected} />
      {selected && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-dark-900 flex items-center justify-center text-[11px] font-black leading-none shadow-lg ring-2 ring-dark-700 z-10">
          ✓
        </span>
      )}
    </motion.div>
  );
}

// 54-card UNO grid — 13 columns × 4 rows of colored cards, plus a final row
// with the 2 wilds at the end.
function CardPickerGrid({ selectedSet, onToggle, allDisabled }) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
        {Array.from({ length: 52 }).map((_, id) => (
          <UnoCardChip
            key={id}
            id={id}
            selected={selectedSet.has(id)}
            disabled={allDisabled}
            onClick={() => onToggle(id)}
          />
        ))}
      </div>
      <div className="grid gap-1 sm:gap-1.5 grid-cols-2 max-w-[24%]">
        <UnoCardChip id={52} selected={selectedSet.has(52)} disabled={allDisabled} onClick={() => onToggle(52)} />
        <UnoCardChip id={53} selected={selectedSet.has(53)} disabled={allDisabled} onClick={() => onToggle(53)} />
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {UNO_COLORS.map((c) => {
        const sel = value === c.name;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => !disabled && onChange(c.name)}
            disabled={disabled}
            className={`h-16 sm:h-20 rounded-lg flex items-center justify-center text-white font-black text-sm capitalize transition-all ${
              sel ? 'ring-2 ring-accent shadow-lg' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ background: `linear-gradient(160deg, ${c.main} 0%, ${c.dark} 100%)` }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberPicker({ value, onChange, disabled }) {
  return (
    <div className="grid gap-1 sm:gap-1.5 grid-cols-10">
      {Array.from({ length: 10 }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => !disabled && onChange(i)}
          disabled={disabled}
          className={`aspect-square rounded-md flex items-center justify-center text-lg font-black transition-all ${
            value === i
              ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg'
              : 'bg-white text-gray-900 hover:brightness-95'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function ActionPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => !disabled && onChange(a.id)}
          disabled={disabled}
          className={`h-16 sm:h-20 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
            value === a.id
              ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg'
              : 'bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function WildPicker({ value, onChange, disabled }) {
  const sel = !!value;
  return (
    <div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!sel)}
        disabled={disabled}
        className={`w-full h-20 sm:h-24 rounded-lg flex items-center justify-center font-black text-base transition-all text-white ${
          sel ? 'ring-2 ring-accent shadow-lg' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ background: 'conic-gradient(from 0deg, #dc2626, #f5c518, #16a34a, #2563eb, #dc2626)' }}
      >
        <span className="bg-black/60 px-4 py-2 rounded-lg">★ Any Wild · 6x</span>
      </button>
      <p className="text-[10px] text-gray-500 mt-1.5 text-center">
        Wins if any dealt card is a Wild or Wild +4 (id 52 or 53).
      </p>
    </div>
  );
}

export default function UnoKing() {
  usePageTitle('UNO King');
  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();

  // ── Per-type state (UNO King now runs 4 parallel instances: 1c/2c/3c/4c) ──
  // Active type drives which round/stage/picker the user sees. Cards-bet pick
  // count is capped at the active type (type-3 → max 3 picks).
  const CARD_COUNT_TYPES = [1, 2, 3, 4];
  const [activeType, setActiveType] = useState(1);

  // Map<type, ...> slices so socket events for different types don't clobber
  // each other.
  const [roundsByType, setRoundsByType] = useState({});         // round metadata per type
  const [phasesByType, setPhasesByType] = useState({});         // 'betting'|'locked'|'reveal'
  const [revealedByType, setRevealedByType] = useState({});     // last revealed cards per type
  const [lastResultByType, setLastResultByType] = useState({}); // most-recent reveal summary per type
  const [pendingSlipsByType, setPendingSlipsByType] = useState({}); // user slips placed this round, per type

  // Derived from active type
  const round = roundsByType[activeType] || null;
  const phase = phasesByType[activeType] || 'betting';
  const revealedCards = revealedByType[activeType] || null;
  const lastResult = lastResultByType[activeType] || null;
  const pendingSlips = pendingSlipsByType[activeType] || [];

  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const HISTORY_PAGE_SIZE = 10;
  const [myBets, setMyBets] = useState([]);
  const [resultModal, setResultModal] = useState(null); // user-specific outcome
  const [lockRemaining, setLockRemaining] = useState(0);

  // Bet builder state
  const [betKind, setBetKind] = useState('cards');
  const [selected, setSelected] = useState([]);
  // Sync pick cap with active type — picking up to N cards in a type-N round.
  const pickTarget = activeType;
  const [pickedColor, setPickedColor] = useState(null);
  const [pickedNumber, setPickedNumber] = useState(null);
  const [pickedAction, setPickedAction] = useState(null);
  const [pickedWild, setPickedWild] = useState(false);
  const [amount, setAmount] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  // Mobile bottom-sheet visibility for the bet controls
  const [sheetOpen, setSheetOpen] = useState(false);

  // Setter helpers that update only the slot for the round's type — they take
  // an explicit `type` so socket handlers can hit the right pane even when the
  // user is currently viewing a different tab.
  const setRoundForType    = (type, r) => setRoundsByType(prev => ({ ...prev, [type]: r }));
  const setPhaseForType    = (type, p) => setPhasesByType(prev => ({ ...prev, [type]: p }));
  const setRevealedForType = (type, c) => setRevealedByType(prev => ({ ...prev, [type]: c }));
  const setLastResultForType   = (type, r) => setLastResultByType(prev => ({ ...prev, [type]: r }));
  const setPendingSlipsForType = (type, updater) =>
    setPendingSlipsByType(prev => ({
      ...prev,
      [type]: typeof updater === 'function' ? updater(prev[type] || []) : updater,
    }));

  const tickRef = useRef(null);
  const historyPageRef = useRef(1);
  useEffect(() => { historyPageRef.current = historyPage; }, [historyPage]);
  // Mirror activeType into a ref so long-lived socket handlers see the
  // current tab instead of the captured-at-mount value.
  const activeTypeRef = useRef(1);
  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  // Tracks the last whole-second we played a countdown sound for, so each
  // tick from 5..0 fires exactly once even though the timer ticks at 200ms.
  const lastBeepSecRef = useRef(null);

  const loadHistoryPage = useCallback(async (page = 1, typeOverride = null) => {
    setHistoryLoading(true);
    const type = typeOverride != null ? typeOverride : activeType;
    try {
      const res = await getUnoKingHistory(page, HISTORY_PAGE_SIZE, type);
      const payload = res.data?.data || {};
      const items = Array.isArray(payload) ? payload : (payload.items || []);
      setHistory(items);
      setHistoryPage(payload.page || page);
      setHistoryTotalPages(payload.totalPages || 1);
      setHistoryTotal(payload.total || items.length);
      // Latest reveal for this type lives on page 1 slot 0.
      if ((payload.page || page) === 1 && items.length > 0) {
        setLastResultForType(type, {
          roundId: items[0].roundId,
          periodId: items[0].periodId,
          cards: items[0].cards || [],
        });
      }
    } catch {}
    setHistoryLoading(false);
  }, [activeType]);

  const refreshMyBets = useCallback(async (typeOverride = null) => {
    if (!user) return;
    const type = typeOverride != null ? typeOverride : activeType;
    try {
      const mine = await getUnoKingMyBets(20, type);
      setMyBets(mine.data.data || []);
    } catch {}
  }, [user, activeType]);

  // Initial fetch + socket subscriptions
  useEffect(() => {
    const token = localStorage.getItem('token');
    socketService.connect(token);

    getUnoKingState()
      .then((res) => {
        const rounds = res.data?.data?.rounds || {};
        for (const t of CARD_COUNT_TYPES) {
          const r = rounds[t];
          if (r) {
            setRoundForType(t, r);
            setPhaseForType(t, r.status);
          }
        }
      })
      .catch(() => {});

    loadHistoryPage(1);
    refreshMyBets();

    const unsubState = socketService.onUnoRoundState?.((r) => {
      if (r && r.cardCountType) {
        setRoundForType(r.cardCountType, r);
        setPhaseForType(r.cardCountType, r.status);
      }
    });
    const unsubOpen = socketService.onUnoRoundOpen?.((r) => {
      const t = r?.cardCountType;
      if (!t) return;
      setRoundForType(t, r);
      setPhaseForType(t, 'betting');
      setRevealedForType(t, null);
      setPendingSlipsForType(t, []);
      if (t === activeTypeRef.current) {
        setSelected([]);
        setPickedColor(null);
        setPickedNumber(null);
        setPickedAction(null);
        setPickedWild(false);
      }
    });
    const unsubLock = socketService.onUnoRoundLock?.((data) => {
      const t = data?.cardCountType;
      if (!t) return;
      setPhaseForType(t, 'locked');
      if (t === activeTypeRef.current) setSheetOpen(false);
    });
    const unsubResult = socketService.onUnoRoundResult?.((data) => {
      const t = data?.cardCountType;
      if (!t) return;
      setRevealedForType(t, data.cards);
      setPhaseForType(t, 'reveal');
      setLastResultForType(t, {
        roundId: data.roundId,
        periodId: data.periodId,
        cards: data.cards || [],
      });
      if (t === activeTypeRef.current) {
        loadHistoryPage(historyPageRef.current, t);
        refreshMyBets(t);
      }
    });
    const unsubSettled = socketService.onUnoRoundSettled?.((data) => {
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

  // When the user switches type tab, reload history & my-bets filtered to that
  // type so the "Pattern History" and "Your Recent Bets" panels match the
  // round they're now viewing.
  useEffect(() => {
    setHistoryPage(1);
    loadHistoryPage(1, activeType);
    refreshMyBets(activeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  // Tick every 200ms for smooth countdowns
  useEffect(() => {
    const tick = () => {
      if (!round) return;
      const now = Date.now();
      const lockMs = new Date(round.lockedAt).getTime();
      const completeMs = new Date(round.completeAt).getTime();
      const remaining = Math.max(0, completeMs - now);
      setLockRemaining(remaining);
      if (phase === 'betting' && now >= lockMs) setPhaseForType(activeType, 'locked');

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

  // Locked when the round is past betting, OR the active type's round hasn't
  // loaded yet (page just opened / between rounds) — guards against bets that
  // would 400 with "Type-N round has not been opened yet".
  const isLocked = phase !== 'betting' || !round;

  const pickCount = selected.length;
  const currentAmount = parseFloat(amount) || 0;
  let currentMultiplier = 0;
  let currentPickLabel = '—';
  let isPickValid = false;
  if (betKind === 'cards') {
    currentMultiplier = CARD_MULTIPLIERS[pickCount] || 0;
    currentPickLabel = PICK_LABELS[pickCount] || '—';
    isPickValid = pickCount > 0;
  } else if (betKind === 'color') {
    currentMultiplier = KIND_MULTIPLIERS.color;
    currentPickLabel = pickedColor || '—';
    isPickValid = pickedColor != null;
  } else if (betKind === 'number') {
    currentMultiplier = KIND_MULTIPLIERS.number;
    currentPickLabel = pickedNumber != null ? String(pickedNumber) : '—';
    isPickValid = pickedNumber != null;
  } else if (betKind === 'action') {
    currentMultiplier = KIND_MULTIPLIERS.action;
    currentPickLabel = pickedAction ? (ACTIONS.find((a) => a.id === pickedAction)?.label || pickedAction) : '—';
    isPickValid = pickedAction != null;
  } else if (betKind === 'wild') {
    currentMultiplier = KIND_MULTIPLIERS.wild;
    currentPickLabel = pickedWild ? 'Any Wild' : '—';
    isPickValid = pickedWild;
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
      if (prev.length >= pickTarget) {
        toast.error(`This tab is set to ${pickTarget} ${pickTarget === 1 ? 'card' : 'cards'} — switch the tab to pick more.`);
        return prev;
      }
      sounds.tap?.();
      return [...prev, id];
    });
  };

  // Switching the type tab switches which round the user is viewing/betting.
  // Also trims any over-selection so the picker can't keep cards beyond the
  // new type's max picks (e.g. switching from type-4 to type-2 keeps the first
  // 2 selections).
  const handlePickTarget = (n) => {
    if (!CARD_COUNT_TYPES.includes(n)) return;
    setActiveType(n);
    setSelected((prev) => prev.slice(0, n));
  };

  const placeBet = async () => {
    if (!user) { toast.error('Please log in to play'); return; }
    if (isLocked) { toast.error('Betting is locked for this round'); return; }
    if (!isPickValid) {
      toast.error(
        betKind === 'cards' ? 'Pick at least 1 card' :
        betKind === 'color'  ? 'Pick a color' :
        betKind === 'number' ? 'Pick a number 0-9' :
        betKind === 'action' ? 'Pick an action' :
                               'Tap the Wild button to confirm'
      );
      return;
    }
    if (currentAmount < 1) { toast.error('Min bet is 1'); return; }
    if (currentAmount > 10000) { toast.error('Max bet is 10,000'); return; }

    const payload = { kind: betKind, amount: currentAmount, cardCountType: activeType };
    if (betKind === 'cards') payload.cards = [...selected].sort((a, b) => a - b);
    else if (betKind === 'color')  payload.color  = pickedColor;
    else if (betKind === 'number') payload.number = pickedNumber;
    else if (betKind === 'action') payload.action = pickedAction;
    // wild has no target field

    setSubmitting(true);
    sounds.click?.();
    try {
      const res = await placeUnoKingBet(payload);
      const data = res.data?.data;
      const slip = {
        id: data.betId,
        kind: betKind,
        amount: currentAmount,
        multiplier: currentMultiplier,
        ...(betKind === 'cards' ? { cards: payload.cards } : {}),
        ...(betKind === 'color'  ? { color: pickedColor }   : {}),
        ...(betKind === 'number' ? { number: pickedNumber } : {}),
        ...(betKind === 'action' ? { action: pickedAction } : {}),
      };
      setPendingSlipsForType(activeType, (prev) => [...prev, slip]);
      // Clear builder
      setSelected([]);
      setPickedColor(null);
      setPickedNumber(null);
      setPickedAction(null);
      setPickedWild(false);
      checkAuth?.();
      toast.success(`Bet placed: ${currentAmount} Z (type ${activeType})`);
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
              {cards.map((cid, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <UnoCard id={cid} faceUp={true} size="xs" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* Stage block — UNO-arcade style: bright 4-color UNO frame, deep navy
          interior, blocky bold marquee, and tabs colored to match the four UNO
          colors (1c→Red, 2c→Yellow, 3c→Green, 4c→Blue). Distinct from
          Shuffle's casino-gold and Mutka's copper-clay aesthetics. */}
      <div
        className="relative overflow-hidden rounded-2xl p-[3px]"
        style={{
          // Bright 4-color UNO conic gradient as the outer frame
          background:
            'conic-gradient(from 0deg, #dc2626 0deg, #dc2626 90deg, #f5c518 90deg, #f5c518 180deg, #16a34a 180deg, #16a34a 270deg, #2563eb 270deg, #2563eb 360deg)',
          boxShadow:
            '0 24px 60px -20px rgba(0,0,0,0.75), 0 0 30px rgba(220,38,38,0.12), 0 0 30px rgba(37,99,235,0.12)',
        }}
      >
        <div
          className="relative rounded-[13px] overflow-hidden"
          style={{
            // Deep navy/black arcade backdrop
            background:
              'radial-gradient(ellipse at 50% -10%, rgba(220,38,38,0.18) 0%, transparent 50%),' +
              'radial-gradient(ellipse at 50% 110%, rgba(37,99,235,0.18) 0%, transparent 55%),' +
              'linear-gradient(180deg, #0a0a1a 0%, #050511 50%, #02020a 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 50px rgba(0,0,0,0.6)',
          }}
        >
          {/* Dense pixel-grid texture — gives it a slight arcade screen feel */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),' +
                'linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          />

          {/* Corner stars — wild-card motif in the four UNO colors */}
          <span className="pointer-events-none absolute top-2 left-3 text-red-500/60 text-xl font-black select-none">★</span>
          <span className="pointer-events-none absolute top-2 right-3 text-yellow-400/60 text-xl font-black select-none">★</span>
          <span className="pointer-events-none absolute bottom-2 left-3 text-green-500/60 text-xl font-black select-none">★</span>
          <span className="pointer-events-none absolute bottom-2 right-3 text-blue-500/60 text-xl font-black select-none">★</span>

          <div className="relative p-4">
            {/* Marquee header — bold blocky UNO-style title + LCD-style period */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <GiCardJoker
                  className="w-6 h-6 shrink-0"
                  style={{
                    color: '#f5c518',
                    filter: 'drop-shadow(0 0 8px rgba(220,38,38,0.7)) drop-shadow(0 0 4px rgba(245,197,24,0.5))',
                  }}
                />
                <h1
                  className="font-black text-base sm:text-xl truncate uppercase tracking-tight"
                  style={{
                    color: '#ffffff',
                    textShadow:
                      '-2px 0 0 #dc2626, 2px 2px 0 #f5c518, 4px 4px 0 rgba(0,0,0,0.6)',
                    fontFamily: '"Arial Black", "Helvetica", sans-serif',
                    fontStyle: 'italic',
                  }}
                >
                  UNO KING
                </h1>
              </div>
              {/* LCD-style yellow period display */}
              <div
                className="shrink-0 px-3 py-1 rounded-md border-2 text-right"
                style={{
                  background: 'linear-gradient(180deg, #1a1a00 0%, #000000 100%)',
                  borderColor: '#f5c518',
                  boxShadow: '0 0 8px rgba(245,197,24,0.4), inset 0 0 8px rgba(0,0,0,0.8)',
                }}
              >
                <p className="text-[9px] text-yellow-400/70 uppercase tracking-[0.18em] leading-none">
                  TYPE {activeType}
                </p>
                <p
                  className="font-mono text-[11px] font-black leading-tight"
                  style={{
                    color: '#f5c518',
                    textShadow: '0 0 6px rgba(245,197,24,0.7)',
                  }}
                >
                  {formatPeriodId(round?.periodId)}
                </p>
              </div>
            </div>

            {/* Card-count type tabs — each tab keyed to one UNO color so the
                row visually echoes a hand of UNO cards. */}
            {(() => {
              const UNO_TAB_COLORS = {
                1: { main: '#dc2626', dark: '#7f1d1d', name: 'red' },
                2: { main: '#f5c518', dark: '#854d0e', name: 'yellow' },
                3: { main: '#16a34a', dark: '#14532d', name: 'green' },
                4: { main: '#2563eb', dark: '#1e3a8a', name: 'blue' },
              };
              return (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {CARD_COUNT_TYPES.map((n) => {
                    const active = activeType === n;
                    const tabRound = roundsByType[n];
                    const tabPhase = phasesByType[n] || 'betting';
                    const phaseColor =
                      tabPhase === 'locked'
                        ? 'bg-amber-400'
                        : tabPhase === 'reveal'
                          ? 'bg-purple-400'
                          : 'bg-emerald-400';
                    const col = UNO_TAB_COLORS[n];
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePickTarget(n)}
                        title={`${n}-card game · ${tabPhase}`}
                        className="relative flex flex-col items-center justify-center py-2 rounded-lg border-2 text-xs font-bold transition-all overflow-hidden"
                        style={
                          active
                            ? {
                                background: `linear-gradient(160deg, ${col.main} 0%, ${col.dark} 100%)`,
                                borderColor: '#ffffff',
                                color: n === 2 ? '#1a1208' : '#ffffff',
                                boxShadow: `0 6px 14px rgba(0,0,0,0.6), 0 0 0 2px ${col.main}77, inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.3)`,
                              }
                            : {
                                background: `linear-gradient(160deg, ${col.dark}33 0%, rgba(0,0,0,0.45) 80%)`,
                                borderColor: `${col.main}66`,
                                color: col.main,
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                              }
                        }
                      >
                        {/* Color-coded swatch in the bottom-left */}
                        <span
                          className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 rounded-full"
                          style={{ background: col.main, boxShadow: `0 0 6px ${col.main}` }}
                        />
                        <span
                          className="relative text-[11px] leading-none font-black uppercase tracking-tight"
                          style={{ fontFamily: '"Arial Black", sans-serif', fontStyle: 'italic' }}
                        >
                          {PICK_LABELS[n] || `${n} Card`}
                        </span>
                        <span
                          className={`relative text-[9px] mt-1 font-mono uppercase tracking-wider ${
                            active && n === 2 ? 'text-[#3a2810]/90' : ''
                          }`}
                          style={!active || n !== 2 ? { color: 'rgba(255,255,255,0.7)' } : undefined}
                        >
                          {n}c
                        </span>
                        {tabRound && (
                          <span
                            className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${phaseColor} shadow-[0_0_4px_currentColor]`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

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

            <UnoStage
              revealed={phase === 'reveal' ? revealedCards : null}
              locking={phase === 'locked'}
              count={activeType}
            />
          </div>
        </div>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>
                    Type-{activeType} round — pick up to <b className="text-white">{pickTarget}</b> card{pickTarget === 1 ? '' : 's'}
                  </span>
                  <span>{selected.length}/{pickTarget} picked · {CARD_MULTIPLIERS[Math.max(selected.length, 1)] || 0}x on match</span>
                </div>
                <CardPickerGrid
                  selectedSet={new Set(selected)}
                  onToggle={(id) => { toggleCard(id); onPicked?.(); }}
                  allDisabled={isLocked}
                />
              </div>
            )}
            {betKind === 'color' && (
              <ColorPicker
                value={pickedColor}
                onChange={(v) => { setPickedColor(v); onPicked?.(); }}
                disabled={isLocked}
              />
            )}
            {betKind === 'number' && (
              <NumberPicker
                value={pickedNumber}
                onChange={(v) => { setPickedNumber(v); onPicked?.(); }}
                disabled={isLocked}
              />
            )}
            {betKind === 'action' && (
              <ActionPicker
                value={pickedAction}
                onChange={(v) => { setPickedAction(v); onPicked?.(); }}
                disabled={isLocked}
              />
            )}
            {betKind === 'wild' && (
              <WildPicker
                value={pickedWild}
                onChange={(v) => { setPickedWild(v); onPicked?.(); }}
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
                          <GiCardJoker className="w-4 h-4 text-amber-300" />
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
                  <th className="px-2 py-2 text-center font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Cards</th>
                  <th className="px-2 py-2 text-center font-semibold">Colors</th>
                  <th className="px-2 py-2 text-center font-semibold">Wild?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/40">
                {history.map((h) => {
                  const cards = h.cards || [];
                  const decoded = cards.map(decodeUnoCard);
                  const hasWild = decoded.some((c) => c.isWild);
                  return (
                    <tr key={h.roundId} className="hover:bg-dark-800/30">
                      <td className="px-3 py-2 text-accent font-mono">{formatPeriodId(h.periodId)}</td>
                      <td className="px-2 py-2 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase">
                          {h.cardCountType}c
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {cards.map((cid, i) => (
                            <UnoCard key={i} id={cid} faceUp={true} size="xs" />
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {decoded.map((c, i) => (
                            <span
                              key={i}
                              className={`w-4 h-4 rounded ${unoTone(c)} flex items-center justify-center text-[9px] font-bold`}
                              title={c.isWild ? 'Wild' : (c.color?.label || '')}
                            >
                              {c.isWild ? '★' : (c.color?.label?.[0] || '?')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            hasWild ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700/60 text-gray-200'
                          }`}
                        >
                          {hasWild ? 'YES' : 'NO'}
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
                  <th className="px-2 py-2 text-center font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Bet</th>
                  <th className="px-2 py-2 text-right font-semibold">Stake</th>
                  <th className="px-2 py-2 text-right font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/40">
                {myBets.map((b) => {
                  const slip = { kind: b.kind, ...(b.details || {}) };
                  // Type column = the round's card_count_type the bet was placed
                  // in (always 1c..4c). Kind chip in the Bet cell shows the
                  // bet's category (Single/Dual/Triple/Four for cards, or
                  // Color/Number/Action/Wild).
                  const cct = b.cardCountType || (b.details?.cards?.length || 0);
                  const kindChip = slipKindLabel(slip);
                  return (
                    <tr key={b.betId} className="hover:bg-dark-800/30">
                      <td className="px-3 py-2 text-accent font-mono text-[10px] whitespace-nowrap">
                        {formatPeriodId(b.periodId)}
                      </td>
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-accent/20 text-accent border border-accent/30">
                          {cct}c
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-dark-700 text-[9px] text-gray-300 uppercase font-bold shrink-0">
                            {kindChip}
                          </span>
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
              UNO King runs <b className="text-white">4 parallel games</b> — pick a type tab (1c / 2c / 3c / 4c) at the top of the stage. A type-N game reveals N cards from a shuffled <b className="text-white">54-card UNO deck</b> (52 colored + 2 wilds) each round. Place bets before the round locks — winnings pay your stake × the multiplier on a hit.
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Cards bet — multiplier per match count</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">1 match</p>
                  <p className="text-gold-light font-black">2x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">2 match</p>
                  <p className="text-gold-light font-black">9x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">3 match</p>
                  <p className="text-gold-light font-black">100x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">4 match</p>
                  <p className="text-gold-light font-black">500x</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Type-N game allows picking 1..N cards. Picks must all appear in the dealt N to win.</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Group bets (any dealt card matches)</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Color</p>
                  <p className="text-gold-light font-black">2x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Number</p>
                  <p className="text-gold-light font-black">3x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Action</p>
                  <p className="text-gold-light font-black">3x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Wild</p>
                  <p className="text-gold-light font-black">6x</p>
                </div>
              </div>
            </div>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li>Each card_count_type has its own period_id, round timer, and history.</li>
              <li>Min bet <b className="text-white">1</b>, max bet <b className="text-white">10,000</b> per slip.</li>
              <li>Place as many slips as you like per type — they all settle when that type's round reveals.</li>
              <li>Bets close when the countdown locks; reveal happens shortly after.</li>
            </ul>
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
          result: (resultModal.cards || []).map((id) => decodeUnoCard(id).label).join(' '),
        } : null}
        show={!!resultModal}
        onClose={closeResultModal}
        title="UNO King"
      />
    </div>
  );
}
