import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiTrendingUp, FiAward, FiX, FiChevronLeft, FiChevronRight, FiInfo, FiDownload, FiArrowUpRight, FiVolume2 } from 'react-icons/fi';
import { GiCardRandom } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import {
  getMutkaKingState,
  placeMutkaKingBet,
  getMutkaKingHistory,
  getMutkaKingMyBets,
} from '../../services/api';
import socketService from '../../services/socket';
import { sounds } from '../../utils/sounds';
import { decodeCard, SUITS } from '../../components/PlayingCard';
import BetStepper from '../../components/BetStepper';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';

// Mutka King runs 4 parallel DURATION lanes. Each round reveals ONE card.
// The lane id (1..4) is carried in the legacy `cardCountType` field.
const LANES = [
  { id: 1, label: '30s' },
  { id: 2, label: '1m' },
  { id: 3, label: '5m' },
  { id: 4, label: '10m' },
];
const LANE_LABEL = { 1: '30s', 2: '1m', 3: '5m', 4: '10m' };

// Flat multipliers — one card decides everything.
const MUTKA_MULTIPLIERS = { cards: 15, suit: 5, color: 2 };

const QUICK_AMOUNTS = [10, 50, 100, 500];

// Rotating safety notices shown in the announcement banner under the balance.
const SAFETY_NOTICES = [
  'Always play only on our real and official website — lootmarket.store. Any other site or app using our name is fake.',
  "Don't trust any other platform, group, or person claiming to be us — we operate only through lootmarket.store.",
  "Never pay or scan any QR code shared on Telegram, WhatsApp, or DM — these are scams and your money will be lost.",
  'We never ask for payments outside the official site. All deposits and withdrawals happen only inside your wallet here.',
  'Beware of fake agents, cloned websites, and impersonators. When in doubt, type lootmarket.store directly in your browser.',
];

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

// Suit → on-dark tone pair. Used by CardChipMini and the slip-target suit chip
// so the whole page reads in the same dark accent palette.
function suitChipTone(suitIdx) {
  switch (suitIdx) {
    case 0: return { bg: 'bg-slate-700/60', border: 'border-slate-500/40', fg: 'text-slate-100' };   // ♣
    case 1: return { bg: 'bg-red-500/15',   border: 'border-red-500/40',   fg: 'text-red-300' };     // ♦
    case 2: return { bg: 'bg-rose-500/15',  border: 'border-rose-500/40',  fg: 'text-rose-300' };    // ♥
    case 3: return { bg: 'bg-slate-900/70', border: 'border-slate-600/50', fg: 'text-slate-100' };   // ♠
    default: return { bg: 'bg-dark-700',    border: 'border-dark-500',     fg: 'text-gray-200' };
  }
}

function CardChipMini({ id }) {
  const { rank, suit, suitIdx } = decodeCard(id);
  const tone = suitChipTone(suitIdx);
  return (
    <span
      className={`inline-flex flex-col items-center justify-center w-6 h-7 rounded border font-bold text-[9px] leading-none ${tone.bg} ${tone.border} ${tone.fg}`}
      title={`${rank}${suit.symbol}`}
    >
      <span>{rank}</span>
      <span className="text-[8px] -mt-0.5">{suit.symbol}</span>
    </span>
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
  if (slip.kind === 'suit') {
    const s = SUITS[slip.suit];
    const tone = suitChipTone(slip.suit);
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border font-bold text-[10px] ${tone.bg} ${tone.border} ${tone.fg}`}>
        <span className="text-xs leading-none">{s.symbol}</span>
        <span className="capitalize">{s.name}</span>
      </span>
    );
  }
  if (slip.kind === 'color') {
    const isRed = slip.color === 'red';
    return (
      <span className={`inline-flex items-center px-2 h-6 rounded border font-bold text-[10px] capitalize ${
        isRed ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-slate-700/50 border-slate-500/40 text-slate-200'
      }`}>
        {slip.color}
      </span>
    );
  }
  return null;
}

function slipKindLabel(slip) {
  if (slip.kind === 'cards') return 'Card';
  if (slip.kind === 'suit')  return 'Suit';
  if (slip.kind === 'color') return 'Color';
  return slip.kind;
}

// A small 3D metallic clock — brushed-steel bezel with depth, glassy face and
// hands. `idKey` keeps the gradient ids unique per instance so multiple clocks
// render correctly on the same page. `active` flips the face/hand tones to read
// on the lit green tab vs the dark inactive tab.
function Clock3D({ size = 26, active = false, idKey = '' }) {
  const g = (s) => `mkclock-${idKey}-${s}`;
  // Brushed-steel bezel works on both the lit (green) and dark tab; green
  // accent hands/ticks tie it to the app theme.
  const faceTop = active ? '#1d2b3a' : '#16232e';
  const faceBot = '#0a1118';
  const hand = active ? '#86efac' : '#4ade80';
  const tick = active ? 'rgba(134,239,172,0.7)' : 'rgba(74,222,128,0.6)';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]">
      <defs>
        {/* Brushed-steel bezel — soft metallic gray sheen */}
        <linearGradient id={g('bezel')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="28%" stopColor="#94a3b8" />
          <stop offset="55%" stopColor="#475569" />
          <stop offset="80%" stopColor="#243544" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        {/* Recessed face — radial depth */}
        <radialGradient id={g('face')} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor={faceTop} />
          <stop offset="100%" stopColor={faceBot} />
        </radialGradient>
        {/* Glass glare */}
        <linearGradient id={g('glare')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Outer bezel ring */}
      <circle cx="20" cy="20" r="19" fill={`url(#${g('bezel')})`} />
      <circle cx="20" cy="20" r="19" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" />
      {/* Inner bezel notch */}
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      {/* Face */}
      <circle cx="20" cy="20" r="14.5" fill={`url(#${g('face')})`} stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />

      {/* Hour ticks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const r1 = 13.5, r2 = i % 3 === 0 ? 11 : 12.2;
        return (
          <line
            key={i}
            x1={20 + r1 * Math.sin(a)}
            y1={20 - r1 * Math.cos(a)}
            x2={20 + r2 * Math.sin(a)}
            y2={20 - r2 * Math.cos(a)}
            stroke={tick}
            strokeWidth={i % 3 === 0 ? 1.1 : 0.6}
            strokeLinecap="round"
          />
        );
      })}

      {/* Hands — fixed at ~10:10 for a clean look */}
      <line x1="20" y1="20" x2="14" y2="13.5" stroke={hand} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="20" y1="20" x2="27" y2="13" stroke={hand} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="20" cy="20" r="1.6" fill={hand} stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" />

      {/* Glass glare overlay */}
      <ellipse cx="16" cy="14" rx="11" ry="8" fill={`url(#${g('glare')})`} opacity="0.7" />
    </svg>
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

function SuitPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {SUITS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => !disabled && onChange(s.id)}
          disabled={disabled}
          className={`h-12 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            value === s.id
              ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg'
              : 'bg-white hover:brightness-95'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="text-lg font-black" style={{ color: value === s.id ? '#0a0a0a' : s.color }}>
            {s.symbol}
          </span>
          <span className="text-[11px] font-bold capitalize" style={{ color: value === s.id ? '#0a0a0a' : s.color }}>
            {s.name}
          </span>
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['red', 'black'].map((c) => {
        const sel = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => !disabled && onChange(c)}
            disabled={disabled}
            className={`h-12 rounded-lg flex items-center justify-center text-white font-black text-sm capitalize transition-all ${
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

export default function MutkaKing() {
  usePageTitle('Mutka King');
  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();

  // ── Per-lane state (Mutka King runs 4 parallel duration lanes: 30s/1m/5m/10m) ──
  // The active lane drives which round/stage/picker the user sees. `activeType`
  // holds the lane id (1..4) — kept as the field name since the backend still
  // carries the lane in `cardCountType`.
  const LANE_IDS = LANES.map((l) => l.id);
  const [activeType, setActiveType] = useState(1);

  // Map<laneId, ...> slices so socket events for different lanes don't clobber
  // each other.
  const [roundsByType, setRoundsByType] = useState({});         // round metadata per type
  const [phasesByType, setPhasesByType] = useState({});         // 'betting'|'locked'|'reveal'
  const [revealedByType, setRevealedByType] = useState({});     // last revealed cards per type
  const [lastResultByType, setLastResultByType] = useState({}); // most-recent reveal summary per type
  const [pendingSlipsByType, setPendingSlipsByType] = useState({}); // user slips placed this round, per type

  // Derived from active type
  const round = roundsByType[activeType] || null;
  const phase = phasesByType[activeType] || 'betting';
  const lastResult = lastResultByType[activeType] || null;
  const pendingSlips = pendingSlipsByType[activeType] || [];

  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const HISTORY_PAGE_SIZE = 10;
  const [myBets, setMyBets] = useState([]);
  const [historyTab, setHistoryTab] = useState('game'); // 'game' | 'bet'
  const [howToOpen, setHowToOpen] = useState(false); // "How to play" modal
  const [noticeIdx, setNoticeIdx] = useState(0); // rotating safety-notice index
  const [resultModal, setResultModal] = useState(null); // user-specific outcome
  const [lockRemaining, setLockRemaining] = useState(0);

  // Bet builder state
  const [betKind, setBetKind] = useState('cards');
  const [selected, setSelected] = useState([]);
  // Exactly one card is revealed per round, so a Cards bet picks 1 card.
  const pickTarget = 1;
  const [pickedSuit, setPickedSuit] = useState(null);
  const [pickedColor, setPickedColor] = useState(null);
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
  // Cycle the safety notice every few seconds.
  useEffect(() => {
    const t = setInterval(() => {
      setNoticeIdx((i) => (i + 1) % SAFETY_NOTICES.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);
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
      const res = await getMutkaKingHistory(page, HISTORY_PAGE_SIZE, type);
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
      const mine = await getMutkaKingMyBets(20, type);
      setMyBets(mine.data.data || []);
    } catch {}
  }, [user, activeType]);

  // Initial fetch + socket subscriptions
  useEffect(() => {
    const token = localStorage.getItem('token');
    socketService.connect(token);

    getMutkaKingState()
      .then((res) => {
        const rounds = res.data?.data?.rounds || {};
        for (const t of LANE_IDS) {
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

    const unsubState = socketService.onMutkaRoundState?.((r) => {
      if (r && r.cardCountType) {
        setRoundForType(r.cardCountType, r);
        setPhaseForType(r.cardCountType, r.status);
      }
    });
    const unsubOpen = socketService.onMutkaRoundOpen?.((r) => {
      const t = r?.cardCountType;
      if (!t) return;
      setRoundForType(t, r);
      setPhaseForType(t, 'betting');
      setRevealedForType(t, null);
      setPendingSlipsForType(t, []);
      if (t === activeTypeRef.current) {
        setSelected([]);
        setPickedSuit(null);
        setPickedColor(null);
      }
    });
    const unsubLock = socketService.onMutkaRoundLock?.((data) => {
      const t = data?.cardCountType;
      if (!t) return;
      setPhaseForType(t, 'locked');
      if (t === activeTypeRef.current) setSheetOpen(false);
    });
    const unsubResult = socketService.onMutkaRoundResult?.((data) => {
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
    const unsubSettled = socketService.onMutkaRoundSettled?.((data) => {
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
    currentMultiplier = MUTKA_MULTIPLIERS.cards;
    currentPickLabel = pickCount === 1 ? 'Card' : '—';
    isPickValid = pickCount === 1;
  } else if (betKind === 'suit') {
    currentMultiplier = MUTKA_MULTIPLIERS.suit;
    currentPickLabel = pickedSuit != null ? SUITS[pickedSuit].name : '—';
    isPickValid = pickedSuit != null;
  } else if (betKind === 'color') {
    currentMultiplier = MUTKA_MULTIPLIERS.color;
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
      if (prev.includes(id)) return [];
      // Single-card pick — selecting a new card replaces the previous one.
      sounds.tap?.();
      return [id];
    });
  };

  // Switching the lane tab switches which round the user is viewing/betting.
  const handlePickTarget = (n) => {
    if (!LANE_IDS.includes(n)) return;
    setActiveType(n);
  };

  const placeBet = async () => {
    if (!user) { toast.error('Please log in to play'); return; }
    if (isLocked) { toast.error('Betting is locked for this round'); return; }
    if (!isPickValid) {
      toast.error(
        betKind === 'cards' ? 'Pick a card' :
        betKind === 'suit' ? 'Pick a suit' : 'Pick a color'
      );
      return;
    }
    if (currentAmount < 1) { toast.error('Min bet is 1'); return; }
    if (currentAmount > 10000) { toast.error('Max bet is 10,000'); return; }

    const payload = { kind: betKind, amount: currentAmount, cardCountType: activeType };
    if (betKind === 'cards') payload.cards = [...selected];
    else if (betKind === 'suit')  payload.suit = pickedSuit;
    else if (betKind === 'color') payload.color = pickedColor;

    setSubmitting(true);
    sounds.click?.();
    try {
      const res = await placeMutkaKingBet(payload);
      const data = res.data?.data;
      const slip = {
        id: data.betId,
        kind: betKind,
        amount: currentAmount,
        multiplier: currentMultiplier,
        ...(betKind === 'cards' ? { cards: payload.cards } : {}),
        ...(betKind === 'suit'  ? { suit: pickedSuit } : {}),
        ...(betKind === 'color' ? { color: pickedColor } : {}),
      };
      setPendingSlipsForType(activeType, (prev) => [...prev, slip]);
      // Clear builder
      setSelected([]);
      setPickedSuit(null);
      setPickedColor(null);
      checkAuth?.();
      refreshMyBets(activeType); // show the bet in Bet History instantly
      toast.success(`Bet placed: ${currentAmount} Z (${LANE_LABEL[activeType]})`);
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

      {/* Balance — sits above the live stage so the player always sees their
          available funds, with quick access to deposit / withdraw. */}
      <div className="rounded-xl bg-dark-800/60 border border-dark-600/50 px-4 py-6 space-y-5">
        <div className="text-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Balance
          </div>
          <div className="text-3xl font-black text-white truncate mt-1">
            {formatCurrency(user?.balance || 0, false)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/wallet"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors text-sm font-bold"
          >
            <FiDownload className="w-4 h-4" />
            Deposit
          </Link>
          <Link
            to="/wallet/withdraw"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/30 transition-colors text-sm font-bold"
          >
            <FiArrowUpRight className="w-4 h-4" />
            Withdraw
          </Link>
        </div>
      </div>

      {/* Safety notice — rotating warnings against scams/fake platforms. */}
      <div className="rounded-xl border border-dark-600/50 bg-dark-800/60 px-2.5 py-1.5 flex items-center gap-2 overflow-hidden">
        <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-amber-500/20 text-amber-300">
          <FiVolume2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.p
              key={noticeIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="text-[11px] font-semibold text-amber-200 leading-snug line-clamp-2"
            >
              {SAFETY_NOTICES[noticeIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* Duration-lane tabs — clean cards: clock + duration + live status.
          Lifted out of the stage so the lane switcher sits above the pot. */}
      <div className="grid grid-cols-4 gap-2">
        {LANES.map(({ id: n, label: laneLabel }) => {
          const active = activeType === n;
          const tabPhase = phasesByType[n] || 'betting';
          const phaseLabel =
            tabPhase === 'locked' ? 'Locked' : tabPhase === 'reveal' ? 'Reveal' : 'Open';
          const phaseDot =
            tabPhase === 'locked'
              ? 'bg-amber-400'
              : tabPhase === 'reveal'
                ? 'bg-rose-400'
                : 'bg-emerald-400';
          return (
            <button
              key={n}
              type="button"
              onClick={() => handlePickTarget(n)}
              title={`${laneLabel} round · ${tabPhase}`}
              className={`group relative flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                active
                  ? 'border-accent/60 bg-accent/15 shadow-[0_6px_20px_-8px_rgba(34,197,94,0.6)] ring-1 ring-accent/40'
                  : 'border-dark-600/60 bg-dark-800/50 hover:border-accent/40 hover:bg-dark-700/50'
              }`}
            >
              <Clock3D size={30} active={active} idKey={n} />
              <span
                className={`text-base font-black leading-none tracking-wide ${
                  active ? 'text-white' : 'text-gray-200 group-hover:text-white'
                }`}
              >
                {laneLabel}
              </span>
              <span
                className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.15em] ${
                  active ? 'text-accent-100' : 'text-gray-500'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${phaseDot} shadow-[0_0_5px_currentColor]`} />
                {phaseLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stage block — clean dark card with a soft green accent edge and a
          subtle top glow, matching the lane tabs and the rest of the app. */}
      <div
        className="relative overflow-hidden rounded-2xl border border-accent/25 bg-dark-800/60"
        style={{
          boxShadow: '0 16px 40px -24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(34,197,94,0.04)',
        }}
      >
        {/* Soft green glow bleeding down from the top edge */}
        <div
          className="absolute inset-x-0 top-0 h-24 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.16) 0%, transparent 70%)' }}
        />

        <div className="relative p-4">
          {/* Header — clean sans title with a green accent + how-to-play. */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 shrink-0">
                <GiCardRandom className="w-5 h-5 text-accent" />
              </span>
              <div className="min-w-0">
                <h1 className="font-black text-base sm:text-lg leading-none truncate text-white tracking-tight">
                  Mutka <span className="text-accent">King</span>
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mt-0.5">Card draw</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHowToOpen(true)}
              className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full border border-accent/40 bg-accent/10 text-accent-300 hover:bg-accent/20 transition-colors text-[9px] font-bold uppercase tracking-wide"
            >
              <FiInfo className="w-3 h-3" />
              How to play
            </button>
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
            width: 34,
            height: 48,
            background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
          };
          const digitStyle = {
            fontSize: 26,
            lineHeight: 1,
            textShadow: `0 0 14px ${glow}`,
          };

          return (
            <div className="mt-3 mb-2 relative grid grid-cols-2 gap-2 items-stretch">
              {/* Left column — last 4 revealed cards for this lane (small) */}
              <div className="flex flex-col justify-end">
                <div className="grid grid-cols-4 gap-1.5 pb-1.5">
                  {Array.from({ length: 4 }).map((_, i) => {
                    // Reverse order: oldest of the last 4 on the left, newest on the right.
                    const cid = history[3 - i]?.cards?.[0];
                    if (cid == null) {
                      return <span key={i} className="aspect-[3/4] rounded-md bg-dark-700/40 border border-dark-600/40" />;
                    }
                    const { rank, suit } = decodeCard(cid);
                    return (
                      <span
                        key={i}
                        className="inline-flex flex-col items-center justify-center aspect-[3/4] rounded-md bg-white border border-gray-200 font-black text-[15px] leading-none shadow-sm"
                        style={{ color: suit.color }}
                        title={`${rank}${suit.symbol}`}
                      >
                        <span>{rank}</span>
                        <span className="text-[14px]">{suit.symbol}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Right column — countdown timer + period id */}
              <div className="relative rounded-2xl overflow-hidden flex flex-col justify-center">
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

                {/* Digit row — fills the width. On reveal totalSec is 0 so
                    this simply reads 00:00 (no RESULT text). */}
                <div className="relative flex items-center justify-end gap-1.5 sm:gap-2">
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
                </div>

                {/* Period id — directly under the countdown digits */}
                <p
                  className="relative text-right text-orange-50 font-mono font-black text-md sm:text-xl tabular-nums tracking-wide"
                  style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6), 0 0 12px rgba(232,167,106,0.45)' }}
                >
                  {formatPeriodId(round?.periodId)}
                </p>

              </div>
            </div>
          );
        })()}
          </div>
      </div>

      {/* Bet controls — Color, Suit and Cards are all shown together in one
          block (no tabs). Picking an option in any section becomes the active
          bet and clears the other sections, since one round reveals one card. */}
      {(() => {
        // Section header with the kind's multiplier badge.

        // Selecting in one section is exclusive — clear the others + set kind.
        const pickColor = (v) => { setSelected([]); setPickedSuit(null); setPickedColor(v); setBetKind('color'); };
        const pickSuit  = (v) => { setSelected([]); setPickedColor(null); setPickedSuit(v); setBetKind('suit'); };
        const pickCard  = (id) => { setPickedColor(null); setPickedSuit(null); setBetKind('cards'); toggleCard(id); };

        // All three pickers in one block. `onPicked` is fired after a pick so
        // mobile can scroll/focus the stake form.
        const renderPicker = (onPicked) => (
          <div className="p-1">
            {/* Suit */}
            <div className={`rounded-xl border p-2.5 transition-all ${betKind === 'suit' && pickedSuit != null ? 'border-transparent bg-accent/10' : 'border-dark-600/60 bg-dark-800/40'}`}>
              <SuitPicker
                value={betKind === 'suit' ? pickedSuit : null}
                onChange={(v) => { pickSuit(v); onPicked?.(); }}
                disabled={isLocked}
              />
            </div>

            {/* Cards */}
            <div className={`rounded-xl border p-2.5 transition-all ${betKind === 'cards' && selected.length > 0 ? 'border-transparent bg-accent/10' : 'border-dark-600/60 bg-dark-800/40'}`}>
              <CardPickerGrid
                selectedSet={new Set(betKind === 'cards' ? selected : [])}
                onToggle={(id) => { pickCard(id); onPicked?.(); }}
                allDisabled={isLocked}
              />
            </div>

            {/* Color */}
            <div className={`rounded-xl border p-2.5 transition-all ${betKind === 'color' && pickedColor != null ? 'border-transparent bg-accent/10' : 'border-dark-600/60 bg-dark-800/40'}`}>
              <ColorPicker
                value={betKind === 'color' ? pickedColor : null}
                onChange={(v) => { pickColor(v); onPicked?.(); }}
                disabled={isLocked}
              />
            </div>
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
            {/* Inline (tablet/desktop) — one block: all pickers + stake form. */}
            <div className="relative rounded-xl bg-dark-700/50 overflow-hidden hidden sm:block">
              {lockOverlay}
              {renderPicker()}
              {stakeForm}
            </div>

            {/* Mobile — one block of pickers inline; making a selection opens
                the bottom sheet to enter the stake amount. */}
            <div className="sm:hidden relative rounded-xl border border-accent/25 bg-gradient-to-b from-dark-700/60 to-dark-800/70 overflow-hidden">
              {lockOverlay}
              {renderPicker(() => !isLocked && setSheetOpen(true))}
            </div>

            {/* Pending slips — track this round's bets. */}
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

            {/* Mobile bottom-sheet — stake entry after a pick. */}
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
                          <h3 className="text-white font-semibold text-sm">Place a bet · {currentPickLabel}</h3>
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

      {/* History — tabbed: Game History (pattern table) + Bet History (your bets) */}
      <div className="rounded-xl bg-dark-700/50 overflow-hidden">
        {/* Tab switcher */}
        <div className="flex border-b border-dark-600/50">
          <button
            type="button"
            onClick={() => setHistoryTab('game')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              historyTab === 'game'
                ? 'text-white bg-dark-800/40 border-b-2 border-accent'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FiTrendingUp className={`w-4 h-4 ${historyTab === 'game' ? 'text-accent' : ''}`} />
            Game History
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab('bet')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              historyTab === 'bet'
                ? 'text-white bg-dark-800/40 border-b-2 border-gold-light'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FiAward className={`w-4 h-4 ${historyTab === 'bet' ? 'text-gold-light' : ''}`} />
            Bet History
          </button>
        </div>

        {historyTab === 'game' && (<>
        <div className="flex items-center justify-end px-4 py-2 border-b border-dark-600/50">
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
                  <th className="px-2 py-2 text-center font-semibold">Lane</th>
                  <th className="px-3 py-2 text-left font-semibold">Card</th>
                  <th className="px-2 py-2 text-center font-semibold">Suit</th>
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
                      <td className="px-2 py-2 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase">
                          {LANE_LABEL[h.cardCountType] || `${h.cardCountType}`}
                        </span>
                      </td>
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
        </>)}

        {historyTab === 'bet' && (<>
        <div className="flex items-center justify-end px-4 py-2 border-b border-dark-600/50">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{myBets.length} bets</span>
        </div>
        {myBets.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No bets yet.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-dark-600/40">
            {myBets.map((b) => {
              const slip = { kind: b.kind, ...(b.details || {}) };
              const laneLabel = LANE_LABEL[b.cardCountType] || '—';
              const kindChip = slipKindLabel(slip);
              const revealed = b.cards || [];
              return (
                <details key={b.betId} className="group">
                  {/* Collapsed summary row — period id + win amount */}
                  <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none hover:bg-dark-800/30">
                    <FiChevronRight className="w-3.5 h-3.5 text-gray-500 group-open:rotate-90 transition-transform shrink-0" />
                    <span className="font-mono text-[11px] text-accent shrink-0">{formatPeriodId(b.periodId)}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-accent/20 text-accent border border-accent/30 shrink-0">
                      {laneLabel}
                    </span>
                    <span className="ml-auto shrink-0 text-right">
                      {b.status === 'pending' ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 text-[10px] font-bold uppercase">Pending</span>
                      ) : b.isWin ? (
                        <span className="text-emerald-400 text-xs font-bold">+{formatCurrency(b.winAmount || 0)}</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] font-bold uppercase">Lost</span>
                      )}
                    </span>
                  </summary>

                  {/* Expanded detail */}
                  <div className="px-3 pb-3 pt-1 bg-dark-800/30 text-[11px] text-gray-300 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">Bet</span>
                      <span className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-dark-700 text-[9px] text-gray-300 uppercase font-bold">{kindChip}</span>
                        <SlipTarget slip={slip} />
                      </span>
                    </div>
                    <div className="flex justify-between gap-2"><span className="text-gray-500">Lane</span><span>{laneLabel}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-gray-500">Stake</span><span className="text-white font-semibold">{formatCurrency(b.amount)}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-gray-500">Multiplier</span><span className="text-gold-light font-bold">{b.multiplier}x</span></div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">Result card</span>
                      <span className="flex items-center gap-1">
                        {revealed.length === 0 ? <span className="text-gray-500">—</span> : revealed.map((cid, i) => {
                          const { rank, suit } = decodeCard(cid);
                          return (
                            <span key={i} className="inline-flex flex-col items-center justify-center w-6 h-8 rounded bg-white border border-gray-200 font-black text-[10px] leading-none" style={{ color: suit.color }}>
                              <span>{rank}</span><span className="text-[9px]">{suit.symbol}</span>
                            </span>
                          );
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Outcome</span>
                      <span>
                        {b.status === 'pending' ? <span className="text-yellow-300 font-bold">Pending</span>
                          : b.isWin ? <span className="text-emerald-400 font-bold">Won +{formatCurrency(b.winAmount || 0)}</span>
                          : <span className="text-red-300 font-bold">Lost</span>}
                      </span>
                    </div>
                    {b.createdAt && (
                      <div className="flex justify-between gap-2"><span className="text-gray-500">Placed</span><span className="text-gray-400">{new Date(b.createdAt).toLocaleString()}</span></div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
        </>)}
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
              Mutka King runs <b className="text-white">4 parallel lanes</b> — pick a duration tab (<b className="text-white">30s / 1m / 5m / 10m</b>) at the top of the stage. Each lane reveals <b className="text-white">one card</b> from a shuffled 52-card deck every round. Place bets before the round locks — winnings pay your stake × the multiplier on a hit.
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Bet types & payouts</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Color</p>
                  <p className="text-gold-light font-black">2x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Suit</p>
                  <p className="text-gold-light font-black">5x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Card</p>
                  <p className="text-gold-light font-black">15x</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-1"><b>Color</b> = red/black of the drawn card · <b>Suit</b> = its suit (♠♥♦♣) · <b>Card</b> = the exact card.</p>
            </div>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li>Each lane (30s / 1m / 5m / 10m) has its own period, round timer, and history.</li>
              <li>Min bet <b className="text-white">1</b>, max bet <b className="text-white">10,000</b> per slip.</li>
              <li>Place as many slips as you like per lane — they all settle when that lane's round reveals.</li>
              <li>Bets close when the countdown locks; the single card reveals shortly after.</li>
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

      {/* How-to-play modal — quick primer on betting + multipliers. */}
      <AnimatePresence>
        {howToOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setHowToOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-sm rounded-2xl border border-accent/30 bg-dark-800 shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600/50 bg-gradient-to-r from-accent/10 to-transparent">
                <div className="flex items-center gap-2">
                  <FiInfo className="w-4 h-4 text-accent" />
                  <h3 className="text-white font-bold text-sm">How to play</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setHowToOpen(false)}
                  className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center text-gray-300 hover:text-white"
                  aria-label="Close"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs text-gray-300">
                <p className="leading-relaxed">
                  Pick a duration lane (<b className="text-white">30s / 1m / 5m / 10m</b>). Each round, <b className="text-white">one card</b> is drawn from a 52-card deck. Bet before the round locks — a hit pays your stake <b className="text-white">× multiplier</b>.
                </p>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Bet types & payouts</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-dark-900/60 border border-dark-600/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-gray-400">Color</p>
                      <p className="text-gold-light font-black text-sm">{MUTKA_MULTIPLIERS.color}x</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">red / black</p>
                    </div>
                    <div className="rounded-lg bg-dark-900/60 border border-dark-600/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-gray-400">Suit</p>
                      <p className="text-gold-light font-black text-sm">{MUTKA_MULTIPLIERS.suit}x</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">♠♥♦♣</p>
                    </div>
                    <div className="rounded-lg bg-dark-900/60 border border-dark-600/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-gray-400">Card</p>
                      <p className="text-gold-light font-black text-sm">{MUTKA_MULTIPLIERS.cards}x</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">exact card</p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Example: bet <b className="text-white">100</b> on a suit and hit — you win <b className="text-emerald-400">{100 * MUTKA_MULTIPLIERS.suit}</b>. Place as many slips as you like per lane; they all settle when the card reveals.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
        title="Mutka King"
      />
    </div>
  );
}
