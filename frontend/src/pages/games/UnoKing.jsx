import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiTrendingUp, FiAward, FiX, FiChevronLeft, FiChevronRight, FiInfo, FiDownload, FiArrowUpRight, FiVolume2 } from 'react-icons/fi';
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

// UNO King runs 4 parallel DURATION lanes. Each round reveals ONE card from a
// 54-card UNO deck. The lane id (1..4) is carried in the legacy `cardCountType`.
const LANES = [
  { id: 1, label: '30s' },
  { id: 2, label: '1m' },
  { id: 3, label: '5m' },
  { id: 4, label: '10m' },
];
const LANE_LABEL = { 1: '30s', 2: '1m', 3: '5m', 4: '10m' };

// Flat multipliers — one card decides everything.
const UNO_MULTIPLIERS = { cards: 15, color: 2, action: 5, wild: 50 };

const ACTIONS = [
  { id: 'skip',     label: 'Skip',    rankIdx: 10 },
  { id: 'reverse',  label: 'Reverse', rankIdx: 11 },
  { id: 'draw_two', label: '+2',      rankIdx: 12 },
];

const QUICK_AMOUNTS = [10, 50, 100, 500];

// Rotating safety notices shown in the announcement banner under the balance.
const SAFETY_NOTICES = [
  'Always play only on our real and official website — lootmarket.store. Any other site or app using our name is fake.',
  "Don't trust any other platform, group, or person claiming to be us — we operate only through lootmarket.store.",
  "Never pay or scan any QR code shared on Telegram, WhatsApp, or DM — these are scams and your money will be lost.",
  'We never ask for payments outside the official site. All deposits and withdrawals happen only inside your wallet here.',
  'Beware of fake agents, cloned websites, and impersonators. When in doubt, type lootmarket.store directly in your browser.',
];

function formatPeriodId(periodId) {
  if (!periodId) return '—';
  return String(periodId);
}

// Real UNO card art used in slips, history and last-revealed. `w` sets the
// pixel width since these contexts want a fixed small card.
function UnoMiniCard({ id, w = 34 }) {
  return (
    <span className="inline-block shrink-0" style={{ width: w }}>
      <UnoCard id={id} faceUp size="fill" />
    </span>
  );
}

function SlipTarget({ slip }) {
  if (slip.kind === 'cards') {
    return (
      <div className="flex flex-wrap gap-0.5">
        {slip.cards.map((cid) => <UnoMiniCard key={cid} id={cid} w={28} />)}
      </div>
    );
  }
  if (slip.kind === 'color') {
    const col = UNO_COLORS.find((c) => c.name === slip.color);
    return (
      <span
        className="inline-flex items-center px-2 h-6 rounded border font-bold text-[10px] capitalize text-white"
        style={{ background: col ? `${col.main}30` : undefined, borderColor: col ? `${col.main}80` : undefined, color: col?.main }}
      >
        {slip.color}
      </span>
    );
  }
  if (slip.kind === 'action') {
    const a = ACTIONS.find((x) => x.id === slip.action);
    return (
      <span className="inline-flex items-center px-2 h-6 rounded border border-slate-500/40 bg-slate-700/50 text-slate-100 font-bold text-[10px]">
        {a?.label || slip.action}
      </span>
    );
  }
  if (slip.kind === 'wild') {
    return (
      <span
        className="inline-flex items-center px-2 h-6 rounded border border-white/20 text-white font-bold text-[10px]"
        style={{ background: 'linear-gradient(135deg,#dc2626,#f5c518 40%,#16a34a 70%,#2563eb)' }}
      >
        Wild
      </span>
    );
  }
  return null;
}

function slipKindLabel(slip) {
  if (slip.kind === 'cards')  return 'Card';
  if (slip.kind === 'color')  return 'Color';
  if (slip.kind === 'action') return 'Action';
  if (slip.kind === 'wild')   return 'Wild';
  return slip.kind;
}

// A small 3D metallic clock — brushed-steel bezel with green accent hands.
function Clock3D({ size = 26, active = false, idKey = '' }) {
  const g = (s) => `ukclock-${idKey}-${s}`;
  const faceTop = active ? '#1d2b3a' : '#16232e';
  const faceBot = '#0a1118';
  const hand = active ? '#93c5fd' : '#3b82f6';
  const tick = active ? 'rgba(147,197,253,0.7)' : 'rgba(59,130,246,0.6)';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]">
      <defs>
        <linearGradient id={g('bezel')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="28%" stopColor="#94a3b8" />
          <stop offset="55%" stopColor="#475569" />
          <stop offset="80%" stopColor="#243544" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <radialGradient id={g('face')} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor={faceTop} />
          <stop offset="100%" stopColor={faceBot} />
        </radialGradient>
        <linearGradient id={g('glare')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${g('bezel')})`} />
      <circle cx="20" cy="20" r="19" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      <circle cx="20" cy="20" r="14.5" fill={`url(#${g('face')})`} stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />
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
      <line x1="20" y1="20" x2="14" y2="13.5" stroke={hand} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="20" y1="20" x2="27" y2="13" stroke={hand} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="20" cy="20" r="1.6" fill={hand} stroke="rgba(0,0,0,0.4)" strokeWidth="0.4" />
      <ellipse cx="16" cy="14" rx="11" ry="8" fill={`url(#${g('glare')})`} opacity="0.7" />
    </svg>
  );
}

// 54-card UNO grid (0-53) using real card art. Single-select exact-card pick.
function UnoCardPickerGrid({ selectedSet, onToggle, allDisabled }) {
  return (
    <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(9, minmax(0, 1fr))' }}>
      {Array.from({ length: 54 }).map((_, id) => {
        const sel = selectedSet.has(id);
        const c = decodeUnoCard(id);
        return (
          <UnoCard
            key={id}
            id={id}
            faceUp
            size="fill"
            selected={sel}
            dimmed={allDisabled}
            onClick={() => !allDisabled && onToggle(id)}
            className={`transition-transform ${allDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'} ${sel ? 'scale-105' : ''}`}
          />
        );
      })}
    </div>
  );
}

function UnoColorPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {UNO_COLORS.map((c) => {
        const sel = value === c.name;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => !disabled && onChange(c.name)}
            disabled={disabled}
            className={`h-12 rounded-lg flex items-center justify-center text-sm font-black capitalize transition-all border ${
              sel ? 'ring-2 ring-white border-white shadow-lg' : 'border-white/20 hover:brightness-110'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ background: c.main, color: c.id === 1 ? '#1a1208' : '#ffffff' }}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

function UnoActionPicker({ value, onChange, disabled }) {
  // Each action shows a representative real card (the red one) — the bet wins
  // on that action in ANY color.
  return (
    <div className="grid grid-cols-3 gap-2">
      {ACTIONS.map((a) => {
        const sel = value === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => !disabled && onChange(a.id)}
            disabled={disabled}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
              sel ? 'border-transparent bg-accent/15 ring-1 ring-accent/50' : 'border-dark-600/60 bg-dark-800/40 hover:bg-dark-700/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="w-[42px]"><UnoCard id={a.rankIdx} faceUp size="fill" selected={sel} /></span>
            <span className="text-[11px] font-bold text-white">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function UnoWildPicker({ value, onChange, disabled }) {
  // Shows both real wild cards — the bet wins if the drawn card is any wild.
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-3 p-2 rounded-lg border transition-all ${
        value ? 'border-transparent bg-accent/15 ring-1 ring-accent/50' : 'border-dark-600/60 bg-dark-800/40 hover:bg-dark-700/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="w-[42px]"><UnoCard id={52} faceUp size="fill" selected={value} /></span>
      <span className="w-[42px]"><UnoCard id={53} faceUp size="fill" selected={value} /></span>
      <span className="text-sm font-black uppercase tracking-wide text-white">Wild</span>
    </button>
  );
}

export default function UnoKing() {
  usePageTitle('UNO King');
  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();

  // ── Per-lane state (UNO King runs 4 parallel duration lanes: 30s/1m/5m/10m) ──
  const LANE_IDS = LANES.map((l) => l.id);
  const [activeType, setActiveType] = useState(1);

  const [roundsByType, setRoundsByType] = useState({});
  const [phasesByType, setPhasesByType] = useState({});
  const [revealedByType, setRevealedByType] = useState({});
  const [lastResultByType, setLastResultByType] = useState({});
  const [pendingSlipsByType, setPendingSlipsByType] = useState({});

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
  const [howToOpen, setHowToOpen] = useState(false);
  const [noticeIdx, setNoticeIdx] = useState(0);
  const [resultModal, setResultModal] = useState(null);
  const [lockRemaining, setLockRemaining] = useState(0);

  // Bet builder state
  const [betKind, setBetKind] = useState('cards');
  const [selected, setSelected] = useState([]);
  const [pickedColor, setPickedColor] = useState(null);
  const [pickedAction, setPickedAction] = useState(null);
  const [pickedWild, setPickedWild] = useState(false);
  const [amount, setAmount] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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
  useEffect(() => {
    const t = setInterval(() => {
      setNoticeIdx((i) => (i + 1) % SAFETY_NOTICES.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);
  const activeTypeRef = useRef(1);
  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  const lastBeepSecRef = useRef(null);

  const clearBuilder = () => {
    setSelected([]);
    setPickedColor(null);
    setPickedAction(null);
    setPickedWild(false);
  };

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

  useEffect(() => {
    const token = localStorage.getItem('token');
    socketService.connect(token);

    getUnoKingState()
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
      if (t === activeTypeRef.current) clearBuilder();
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

  useEffect(() => {
    setHistoryPage(1);
    loadHistoryPage(1, activeType);
    refreshMyBets(activeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  useEffect(() => {
    const tick = () => {
      if (!round) return;
      const now = Date.now();
      const lockMs = new Date(round.lockedAt).getTime();
      const completeMs = new Date(round.completeAt).getTime();
      const remaining = Math.max(0, completeMs - now);
      setLockRemaining(remaining);
      if (phase === 'betting' && now >= lockMs) setPhaseForType(activeType, 'locked');

      const wholeSec = Math.ceil(remaining / 1000);
      if (remaining > 0 && wholeSec <= 5) {
        if (lastBeepSecRef.current !== wholeSec) {
          lastBeepSecRef.current = wholeSec;
          if (wholeSec === 1) sounds.countdownGo?.();
          else sounds.countdownTick?.(6 - wholeSec);
        }
      } else if (wholeSec > 5) {
        lastBeepSecRef.current = null;
      }
    };
    tick();
    tickRef.current = setInterval(tick, 200);
    return () => clearInterval(tickRef.current);
  }, [round, phase]);

  const isLocked = phase !== 'betting' || !round;

  const currentAmount = parseFloat(amount) || 0;
  let currentMultiplier = 0;
  let currentPickLabel = '—';
  let isPickValid = false;
  if (betKind === 'cards') {
    currentMultiplier = UNO_MULTIPLIERS.cards;
    if (selected.length === 1) {
      const c = decodeUnoCard(selected[0]);
      currentPickLabel = c.isWild ? c.label : `${c.color.label} ${c.label}`;
    }
    isPickValid = selected.length === 1;
  } else if (betKind === 'color') {
    currentMultiplier = UNO_MULTIPLIERS.color;
    currentPickLabel = pickedColor ? (UNO_COLORS.find((c) => c.name === pickedColor)?.label || pickedColor) : '—';
    isPickValid = pickedColor != null;
  } else if (betKind === 'action') {
    currentMultiplier = UNO_MULTIPLIERS.action;
    currentPickLabel = pickedAction ? (ACTIONS.find((a) => a.id === pickedAction)?.label || pickedAction) : '—';
    isPickValid = pickedAction != null;
  } else if (betKind === 'wild') {
    currentMultiplier = UNO_MULTIPLIERS.wild;
    currentPickLabel = pickedWild ? 'Wild' : '—';
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
      if (prev.includes(id)) return [];
      sounds.tap?.();
      return [id];
    });
  };

  const handlePickTarget = (n) => {
    if (!LANE_IDS.includes(n)) return;
    setActiveType(n);
  };

  // Exclusive section selection — picking in one section clears the others.
  const pickCard   = (id)  => { setPickedColor(null); setPickedAction(null); setPickedWild(false); setBetKind('cards'); toggleCard(id); };
  const pickColor  = (v)   => { setSelected([]); setPickedAction(null); setPickedWild(false); setPickedColor(v); setBetKind('color'); };
  const pickAction = (v)   => { setSelected([]); setPickedColor(null); setPickedWild(false); setPickedAction(v); setBetKind('action'); };
  const pickWild   = (v)   => { setSelected([]); setPickedColor(null); setPickedAction(null); setPickedWild(v); setBetKind('wild'); };

  const placeBet = async () => {
    if (!user) { toast.error('Please log in to play'); return; }
    if (isLocked) { toast.error('Betting is locked for this round'); return; }
    if (!isPickValid) {
      toast.error(
        betKind === 'cards' ? 'Pick a card' :
        betKind === 'color' ? 'Pick a color' :
        betKind === 'action' ? 'Pick an action' : 'Tap Wild to bet'
      );
      return;
    }
    if (currentAmount < 1) { toast.error('Min bet is 1'); return; }
    if (currentAmount > 10000) { toast.error('Max bet is 10,000'); return; }

    const payload = { kind: betKind, amount: currentAmount, cardCountType: activeType };
    if (betKind === 'cards') payload.cards = [...selected];
    else if (betKind === 'color')  payload.color = pickedColor;
    else if (betKind === 'action') payload.action = pickedAction;

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
        ...(betKind === 'cards'  ? { cards: payload.cards } : {}),
        ...(betKind === 'color'  ? { color: pickedColor } : {}),
        ...(betKind === 'action' ? { action: pickedAction } : {}),
      };
      setPendingSlipsForType(activeType, (prev) => [...prev, slip]);
      clearBuilder();
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

  const closeResultModal = () => setResultModal(null);

  const lockSecs = Math.ceil(lockRemaining / 1000);
  const lockPhaseSec = Math.max(0, Math.min(10, lockSecs));

  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <FiArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Games</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
       <div className="space-y-3 min-w-0 md:order-2">

      {/* Balance */}
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

      {/* Safety notice */}
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

      {/* Duration-lane tabs */}
      <div className="grid grid-cols-4 gap-2">
        {LANES.map(({ id: n, label: laneLabel }) => {
          const active = activeType === n;
          const tabPhase = phasesByType[n] || 'betting';
          const phaseLabel = tabPhase === 'locked' ? 'Locked' : tabPhase === 'reveal' ? 'Reveal' : 'Open';
          const phaseDot = tabPhase === 'locked' ? 'bg-amber-400' : tabPhase === 'reveal' ? 'bg-rose-400' : 'bg-emerald-400';
          return (
            <button
              key={n}
              type="button"
              onClick={() => handlePickTarget(n)}
              title={`${laneLabel} round · ${tabPhase}`}
              className={`group relative flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                active
                  ? 'border-blue-500/60 bg-blue-500/15 shadow-[0_6px_20px_-8px_rgba(37,99,235,0.6)] ring-1 ring-blue-500/40'
                  : 'border-dark-600/60 bg-dark-800/50 hover:border-blue-500/40 hover:bg-dark-700/50'
              }`}
            >
              <Clock3D size={30} active={active} idKey={n} />
              <span className={`text-base font-black leading-none tracking-wide ${active ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
                {laneLabel}
              </span>
              <span className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.15em] ${active ? 'text-blue-200' : 'text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${phaseDot} shadow-[0_0_5px_currentColor]`} />
                {phaseLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stage block */}
      <div
        className="relative overflow-hidden rounded-2xl border border-blue-500/25 bg-dark-800/60"
        style={{ boxShadow: '0 16px 40px -24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(34,197,94,0.04)' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-24 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.18) 0%, transparent 70%)' }}
        />
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 shrink-0">
                <GiCardJoker className="w-5 h-5 text-blue-400" />
              </span>
              <div className="min-w-0">
                <h1 className="font-black text-base sm:text-lg leading-none truncate text-white tracking-tight">
                  UNO <span className="text-blue-400">King</span>
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mt-0.5">Card draw</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHowToOpen(true)}
              className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors text-[9px] font-bold uppercase tracking-wide"
            >
              <FiInfo className="w-3 h-3" />
              How to play
            </button>
          </div>

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
          if (isLockPhase) { ringFrom = '#f59e0b'; ringTo = '#fbbf24'; glow = 'rgba(245, 158, 11, 0.55)'; }
          else if (isReveal) { ringFrom = '#8b5cf6'; ringTo = '#a78bfa'; glow = 'rgba(139, 92, 246, 0.45)'; }
          else if (urgent) { ringFrom = '#ef4444'; ringTo = '#f87171'; glow = 'rgba(239, 68, 68, 0.6)'; }

          const tileStyle = {
            width: 34,
            height: 48,
            background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
          };
          const digitStyle = { fontSize: 26, lineHeight: 1, textShadow: `0 0 14px ${glow}` };

          return (
            <div className="mt-3 mb-2 relative grid grid-cols-2 gap-2 items-stretch">
              {/* Left column — last 4 revealed cards for this lane */}
              <div className="flex flex-col justify-end">
                <div className="grid grid-cols-4 gap-1.5 pb-1.5">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const cid = history[3 - i]?.cards?.[0];
                    if (cid == null) {
                      return <span key={i} className="aspect-[5/7] rounded-md bg-dark-700/40 border border-dark-600/40" />;
                    }
                    return <UnoCard key={i} id={cid} faceUp size="fill" />;
                  })}
                </div>
              </div>

              {/* Right column — countdown timer + period id */}
              <div className="relative rounded-2xl overflow-hidden flex flex-col justify-center">
                {urgent && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    animate={{ opacity: [0.25, 0.55, 0.25] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ background: `radial-gradient(circle at 50% 50%, ${ringFrom}33 0%, transparent 70%)` }}
                  />
                )}
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
                        <span className="absolute left-0 right-0 top-1/2 h-px pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)' }} />
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

      {/* Bet controls — Card / Color / Action / Wild in one block. */}
      {(() => {
        const renderPicker = (onPicked) => (
          <div className="p-1 space-y-1">
            {/* Color */}
            <div className={`rounded-xl border p-2.5 transition-all ${betKind === 'color' && pickedColor != null ? 'border-transparent bg-accent/10' : 'border-dark-600/60 bg-dark-800/40'}`}>
              <UnoColorPicker value={betKind === 'color' ? pickedColor : null} onChange={(v) => { pickColor(v); onPicked?.(); }} disabled={isLocked} />
            </div>

            {/* Card (exact) */}
            <div className={`rounded-xl border p-2.5 transition-all ${betKind === 'cards' && selected.length > 0 ? 'border-transparent bg-accent/10' : 'border-dark-600/60 bg-dark-800/40'}`}>
              <UnoCardPickerGrid
                selectedSet={new Set(betKind === 'cards' ? selected : [])}
                onToggle={(id) => { pickCard(id); onPicked?.(); }}
                allDisabled={isLocked}
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
                <p className="text-gray-300 text-xs mt-2">Card revealing in {lockPhaseSec}s</p>
              </motion.div>
            )}
          </AnimatePresence>
        );

        return (
          <>
            <div className="relative rounded-xl bg-dark-700/50 overflow-hidden hidden sm:block">
              {lockOverlay}
              {renderPicker()}
              {stakeForm}
            </div>

            <div className="sm:hidden relative rounded-xl border border-accent/25 bg-gradient-to-b from-dark-700/60 to-dark-800/70 overflow-hidden">
              {lockOverlay}
              {renderPicker(() => !isLocked && setSheetOpen(true))}
            </div>

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

            <AnimatePresence>
              {sheetOpen && (
                <motion.div
                  className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                    className="relative bg-dark-800 rounded-t-2xl border-t border-dark-600/60 max-h-[88vh] flex flex-col"
                  >
                    <div className="px-4 pt-2 pb-1 flex flex-col items-center">
                      <div className="w-10 h-1 rounded-full bg-dark-500 mb-2" />
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <GiCardJoker className="w-4 h-4 text-amber-300" />
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

       {/* Left column on md+ (history + your bets) */}
       <div className="space-y-3 min-w-0 md:order-1">

      <div className="rounded-xl bg-dark-700/50 overflow-hidden">
        <div className="flex border-b border-dark-600/50">
          <button
            type="button"
            onClick={() => setHistoryTab('game')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              historyTab === 'game' ? 'text-white bg-dark-800/40 border-b-2 border-accent' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FiTrendingUp className={`w-4 h-4 ${historyTab === 'game' ? 'text-accent' : ''}`} />
            Game History
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab('bet')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              historyTab === 'bet' ? 'text-white bg-dark-800/40 border-b-2 border-gold-light' : 'text-gray-400 hover:text-gray-200'
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
                  <th className="px-2 py-2 text-center font-semibold">Color</th>
                  <th className="px-2 py-2 text-center font-semibold">Wild?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/40">
                {history.map((h) => {
                  const cid = (h.cards || [])[0];
                  const c = cid != null ? decodeUnoCard(cid) : null;
                  return (
                    <tr key={h.roundId} className="hover:bg-dark-800/30">
                      <td className="px-3 py-2 text-accent font-mono">{formatPeriodId(h.periodId)}</td>
                      <td className="px-2 py-2 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase">
                          {LANE_LABEL[h.cardCountType] || `${h.cardCountType}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {c ? <UnoMiniCard id={cid} w={28} /> : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {c && !c.isWild ? (
                          <span className="inline-block w-4 h-4 rounded" style={{ background: c.color.main }} title={c.color.label} />
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            c?.isWild ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700/60 text-gray-200'
                          }`}
                        >
                          {c?.isWild ? 'YES' : 'NO'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
                    <span className="font-mono text-[11px] text-blue-400 shrink-0">{formatPeriodId(b.periodId)}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
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
                        {revealed.length === 0 ? <span className="text-gray-500">—</span> : revealed.map((cid) => <UnoMiniCard key={cid} id={cid} w={26} />)}
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

      {/* Rules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl bg-dark-700/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600/50">
            <FiAward className="w-4 h-4 text-amber-300" />
            <h3 className="text-white font-semibold text-sm">Game Rules & Payouts</h3>
          </div>
          <div className="p-4 space-y-3 text-xs text-gray-300">
            <p className="text-gray-400 leading-relaxed">
              UNO King runs <b className="text-white">4 parallel lanes</b> — pick a duration tab (<b className="text-white">30s / 1m / 5m / 10m</b>). Each lane reveals <b className="text-white">one card</b> from a 54-card UNO deck every round. Place bets before the round locks — winnings pay your stake × the multiplier on a hit.
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Bet types & payouts</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Color</p>
                  <p className="text-gold-light font-black">{UNO_MULTIPLIERS.color}x</p>
                </div>
                <div className="rounded-lg bg-dark-800/60 border border-dark-600/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-400">Card</p>
                  <p className="text-gold-light font-black">{UNO_MULTIPLIERS.cards}x</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-1"><b>Color</b> = red/yellow/green/blue of the drawn card · <b>Card</b> = the exact card.</p>
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

      {/* FAQ */}
      <div className="rounded-xl bg-dark-700/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600/50">
          <FiAward className="w-4 h-4 text-gold-light" />
          <h3 className="text-white font-semibold text-sm">FAQ</h3>
        </div>
        <div className="divide-y divide-dark-600/40">
          {[
            { q: 'Are the games provably fair?', a: 'Outcomes are generated server-side using cryptographic randomness. Round seeds and results are stored so any draw can be audited.' },
            { q: 'Can I cancel a placed bet?', a: 'No — once a slip is submitted it is locked into the round. Double-check your stake and selection before placing.' },
            { q: 'How fast are winnings credited?', a: 'Wins are credited to your wallet automatically the moment the round settles. The balance widget updates in real-time over the socket.' },
            { q: 'What are the global stake limits?', a: 'Min 1 and max 10,000 per slip on most games. Some games use their own ticket pricing — check that game for specifics.' },
            { q: 'Can I play multiple games at once?', a: 'Yes. Each game runs on its own round/timer and your wallet is shared, so you can keep slips active across several games simultaneously.' },
            { q: 'Where can I see my history?', a: 'Every game page has a Bet History tab with your recent outcomes. Your full transaction log is on the Profile page.' },
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

      {/* How-to-play modal */}
      <AnimatePresence>
        {howToOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setHowToOpen(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-sm rounded-2xl border border-blue-500/30 bg-dark-800 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600/50 bg-gradient-to-r from-blue-500/10 to-transparent">
                <div className="flex items-center gap-2">
                  <FiInfo className="w-4 h-4 text-blue-400" />
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
                  Pick a duration lane (<b className="text-white">30s / 1m / 5m / 10m</b>). Each round, <b className="text-white">one UNO card</b> is drawn. Bet before the round locks — a hit pays your stake <b className="text-white">× multiplier</b>.
                </p>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Bet types & payouts</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-dark-900/60 border border-dark-600/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-gray-400">Color</p>
                      <p className="text-gold-light font-black text-sm">{UNO_MULTIPLIERS.color}x</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">red/yellow/green/blue</p>
                    </div>
                    <div className="rounded-lg bg-dark-900/60 border border-dark-600/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-gray-400">Card</p>
                      <p className="text-gold-light font-black text-sm">{UNO_MULTIPLIERS.cards}x</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">exact card</p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Example: bet <b className="text-white">100</b> on a color and hit — you win <b className="text-emerald-400">{100 * UNO_MULTIPLIERS.color}</b>. Place as many slips as you like per lane; they all settle when the card reveals.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Win/Loss overlay */}
      <GameResultOverlay
        result={resultModal ? {
          isWin: resultModal.isWin,
          betAmount: resultModal.totalBet || 0,
          winAmount: resultModal.totalWin || 0,
          multiplier: (resultModal.totalBet || 0) > 0
            ? Math.round((resultModal.totalWin / resultModal.totalBet) * 100) / 100
            : 0,
          result: (resultModal.cards || []).map((id) => {
            const c = decodeUnoCard(id);
            return c.isWild ? c.label : `${c.color.label} ${c.label}`;
          }).join(' '),
        } : null}
        show={!!resultModal}
        onClose={closeResultModal}
        title="UNO King"
      />
    </div>
  );
}
