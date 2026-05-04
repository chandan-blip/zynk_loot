import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiTrash2, FiPlay, FiEye, FiRotateCcw } from 'react-icons/fi';
import { GiCardJoker } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import { playUnoKing, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import GameHistory from '../../components/GameHistory';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import UnoCard, { decodeUnoCard, UNO_COLORS } from '../../components/UnoCard';
import usePageTitle from '../../hooks/usePageTitle';

const CARD_MULTIPLIERS = { 1: 2, 2: 9, 3: 100, 4: 500 };
const PICK_LABELS = { 1: 'Single', 2: 'Dual', 3: 'Triple', 4: 'Four' };
const KIND_MULTIPLIERS = { color: 1.3, number: 3, action: 3, wild: 6 };

const BET_KINDS = [
  { id: 'cards',  label: 'Cards' },
  { id: 'color',  label: 'Color' },
  { id: 'number', label: 'Number' },
  { id: 'action', label: 'Action' },
  { id: 'wild',   label: 'Wild' },
];

const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ACTIONS = [
  { id: 'skip',     label: 'Skip',    rankIdx: 10 },
  { id: 'reverse',  label: 'Reverse', rankIdx: 11 },
  { id: 'draw_two', label: 'Draw 2',  rankIdx: 12 },
];

const QUICK_AMOUNTS = [10, 50, 100, 500];

const PHASES = {
  IDLE: 'idle',
  CONFIG: 'config',
  REVEAL: 'reveal',
  DONE: 'done',
};

function pickRandomFour() {
  const set = new Set();
  while (set.size < 4) set.add(Math.floor(Math.random() * 54));
  return [...set];
}

// Live preview — same vibe as Mutka King's DemoShowcase, but UNO cards.
function DemoShowcase() {
  const [cards, setCards] = useState(() => pickRandomFour());
  const [faceUp, setFaceUp] = useState(true);

  useEffect(() => {
    let flipTimer;
    const cycle = setInterval(() => {
      setFaceUp(false);
      flipTimer = setTimeout(() => {
        setCards(pickRandomFour());
        setFaceUp(true);
      }, 750);
    }, 4500);
    return () => {
      clearInterval(cycle);
      if (flipTimer) clearTimeout(flipTimer);
    };
  }, []);

  const sparkles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      id: i,
      top: 14 + (i * 47) % 72,
      left: 6 + (i * 67) % 88,
      size: 6 + (i % 4) * 2,
      delay: (i * 0.37) % 2.4,
      duration: 2 + (i % 3) * 0.6,
      color: i % 4 === 0 ? '#fca5a5' : i % 4 === 1 ? '#fde047' : i % 4 === 2 ? '#86efac' : '#93c5fd',
    })),
    []
  );

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-40 sm:h-56 blur-3xl rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(closest-side, rgba(220,38,38,0.45), rgba(37,99,235,0.30) 55%, transparent 75%)',
        }}
      />
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(220,38,38,0.10) 30deg, transparent 60deg, rgba(234,179,8,0.10) 120deg, transparent 150deg, rgba(22,163,74,0.10) 210deg, transparent 240deg, rgba(37,99,235,0.10) 300deg, transparent 330deg)',
          maskImage: 'radial-gradient(closest-side, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(closest-side, black 30%, transparent 75%)',
        }}
      />
      {sparkles.map((s) => (
        <motion.span
          key={s.id}
          className="absolute pointer-events-none font-bold leading-none select-none"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            fontSize: s.size,
            color: s.color,
            textShadow: `0 0 6px ${s.color}`,
          }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.3, 0.4], y: [0, -14, -22], rotate: [0, 90, 180] }}
          transition={{ duration: s.duration, repeat: Infinity, delay: s.delay, ease: 'easeOut' }}
        >
          ✦
        </motion.span>
      ))}

      <div className="relative flex items-center justify-center gap-2 sm:gap-3 z-[1]">
        {cards.map((id, idx) => {
          const rot = (idx - 1.5) * 7;
          return (
            <motion.div
              key={idx}
              initial={{ y: 0, rotate: rot }}
              animate={{ y: [0, -10, 0], rotate: rot }}
              transition={{ duration: 3.5 + idx * 0.3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ willChange: 'transform', transformOrigin: '50% 60%' }}
            >
              <UnoCard id={id} faceUp={faceUp} size="md" delay={idx * 0.12} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pickers — every chip is a real UNO sprite card with selection ring ──

// Wraps an UnoCard with hover/scale animations + accent ring + check pip.
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

// myColor → "0" card id of that color (used as the representative for Color bets)
function colorRepCardId(myColor) { return myColor * 13; /* myRank=0 */ }
// red number n
function redNumberCardId(num)    { return num; /* red color (0), rank=num for 1-9 or 0 */ }
// red action card
function redActionCardId(rankIdx) { return rankIdx; /* red color (0), rank 10/11/12 */ }

// ── Slip rendering helpers ───────────────────────────────────────────────

// Mini UNO card preview used inside slip lists ("Your bets") and round-results
// rows. Renders the actual sprite at xs size so the slip shows the true card art.
function CardLabel({ id }) {
  return (
    <div className="inline-block align-middle">
      <UnoCard id={id} faceUp={true} size="xs" />
    </div>
  );
}

function SlipTarget({ slip }) {
  if (slip.kind === 'cards') {
    return (
      <div className="flex flex-wrap gap-1">
        {slip.cards.map((cid) => <CardLabel key={cid} id={cid} />)}
      </div>
    );
  }
  if (slip.kind === 'color') {
    const c = UNO_COLORS.find((x) => x.name === slip.color);
    return (
      <span
        className="inline-flex items-center px-3 h-9 rounded text-white font-bold text-xs capitalize"
        style={{ background: `linear-gradient(160deg, ${c.main}, ${c.dark})` }}
      >
        {slip.color}
      </span>
    );
  }
  if (slip.kind === 'number') {
    return (
      <span className="inline-flex items-center justify-center px-3 h-9 rounded bg-white border border-gray-300 font-bold text-xs text-gray-900 italic">
        Number {slip.number}
      </span>
    );
  }
  if (slip.kind === 'action') {
    const a = ACTIONS.find((x) => x.id === slip.action);
    return (
      <span className="inline-flex items-center px-3 h-9 rounded bg-white border border-gray-300 font-bold text-xs text-gray-900">
        {a?.label || slip.action}
      </span>
    );
  }
  if (slip.kind === 'wild') {
    return (
      <span
        className="inline-flex items-center px-3 h-9 rounded text-white font-bold text-xs"
        style={{ background: 'linear-gradient(160deg, #1f2937, #030712)' }}
      >
        Any Wild
      </span>
    );
  }
  return null;
}

function slipKindLabel(slip) {
  if (slip.kind === 'cards') return PICK_LABELS[slip.cards.length];
  if (slip.kind === 'color') return 'Color';
  if (slip.kind === 'number') return 'Number';
  if (slip.kind === 'action') return 'Action';
  if (slip.kind === 'wild') return 'Wild';
  return slip.kind;
}

// ── Main page ────────────────────────────────────────────────────────────

export default function UnoKing() {
  usePageTitle('UNO King');

  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();

  const [phase, setPhase] = useState(PHASES.IDLE);
  const [betKind, setBetKind] = useState('cards');
  const [selected, setSelected] = useState([]);
  const [pickedColor, setPickedColor] = useState(null);
  const [pickedNumber, setPickedNumber] = useState(null);
  const [pickedAction, setPickedAction] = useState(null);
  const [pickedWild, setPickedWild] = useState(false);
  const [amount, setAmount] = useState('10');
  const [slips, setSlips] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [revealResults, setRevealResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const placeholderIds = useMemo(() => [0, 13, 26, 52], []);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getGameStats();
      const s = (res.data.data || []).find((x) => x.game_type === 'uno_king');
      setStats(s || null);
    } catch {}
  }, [user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const totalWager = useMemo(
    () => slips.reduce((s, b) => s + Number(b.amount || 0), 0),
    [slips]
  );

  const allSelectedAcrossSlips = useMemo(() => {
    const set = new Set();
    slips.forEach((b) => {
      if (b.kind === 'cards') b.cards.forEach((c) => set.add(c));
    });
    return set;
  }, [slips]);

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
    currentPickLabel = pickedNumber != null ? `#${pickedNumber}` : '—';
    isPickValid = pickedNumber != null;
  } else if (betKind === 'action') {
    currentMultiplier = KIND_MULTIPLIERS.action;
    currentPickLabel = pickedAction || '—';
    isPickValid = pickedAction != null;
  } else if (betKind === 'wild') {
    currentMultiplier = KIND_MULTIPLIERS.wild;
    currentPickLabel = pickedWild ? 'Any Wild' : '—';
    isPickValid = pickedWild;
  }
  const projectedWin = currentMultiplier * currentAmount;

  const startRound = () => { sounds.click?.(); setPhase(PHASES.CONFIG); };

  const toggleCard = (id) => {
    if (phase !== PHASES.CONFIG) return;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.error('Max 4 cards per slip');
        return prev;
      }
      sounds.tap?.();
      return [...prev, id];
    });
  };

  const switchKind = (k) => { setBetKind(k); sounds.tap?.(); };

  const addSlip = () => {
    if (phase !== PHASES.CONFIG) return;
    if (!isPickValid) {
      toast.error(
        betKind === 'cards' ? 'Pick at least 1 card' :
        betKind === 'color' ? 'Pick a color' :
        betKind === 'number' ? 'Pick a number' :
        betKind === 'action' ? 'Pick an action' : 'Toggle the Wild bet'
      );
      return;
    }
    if (currentAmount < 1) { toast.error('Min bet is 1'); return; }
    if (currentAmount > 10000) { toast.error('Max bet is 10,000'); return; }
    if (slips.length >= 20) { toast.error('Max 20 slips per round'); return; }

    const slip = {
      id: Date.now() + Math.random(),
      kind: betKind,
      amount: Math.floor(currentAmount * 100) / 100,
      multiplier: currentMultiplier,
    };
    if (betKind === 'cards')  slip.cards  = [...selected].sort((a, b) => a - b);
    if (betKind === 'color')  slip.color  = pickedColor;
    if (betKind === 'number') slip.number = pickedNumber;
    if (betKind === 'action') slip.action = pickedAction;
    // wild has no extra field

    setSlips((prev) => [...prev, slip]);
    setSelected([]);
    setPickedColor(null);
    setPickedNumber(null);
    setPickedAction(null);
    setPickedWild(false);
    sounds.click?.();
  };

  const removeSlip = (id) => setSlips((prev) => prev.filter((b) => b.id !== id));

  const clearSlips = () => {
    setSlips([]);
    setSelected([]);
    setPickedColor(null);
    setPickedNumber(null);
    setPickedAction(null);
    setPickedWild(false);
  };

  const handleShow = async () => {
    if (slips.length === 0) { toast.error('Place at least one bet'); return; }
    if (!user) { toast.error('Please log in to play'); return; }

    setSubmitting(true);
    sounds.click?.();
    try {
      const res = await playUnoKing(slips.map((s) => {
        const base = { kind: s.kind, amount: s.amount };
        if (s.kind === 'cards')  return { ...base, cards: s.cards };
        if (s.kind === 'color')  return { ...base, color: s.color };
        if (s.kind === 'number') return { ...base, number: s.number };
        if (s.kind === 'action') return { ...base, action: s.action };
        return base;
      }));
      const data = res.data.data;
      setRevealed(data.revealedCards);
      setRevealResults(data);
      setPhase(PHASES.REVEAL);

      setTimeout(() => {
        setShowResult(true);
        setPhase(PHASES.DONE);
        checkAuth();
        loadStats();
        setHistoryKey((k) => k + 1);
      }, 1700);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
    } finally {
      setSubmitting(false);
    }
  };

  const newRound = () => {
    setSelected([]);
    setPickedColor(null);
    setPickedNumber(null);
    setPickedAction(null);
    setPickedWild(false);
    setSlips([]);
    setRevealed([]);
    setRevealResults(null);
    setShowResult(false);
    setPhase(PHASES.IDLE);
  };

  const closeResult = useCallback(() => setShowResult(false), []);

  const overlayResult = revealResults
    ? {
        isWin: revealResults.isWin,
        betAmount: revealResults.totalWager,
        winAmount: revealResults.totalWin,
        multiplier: revealResults.totalWager > 0
          ? Math.round((revealResults.totalWin / revealResults.totalWager) * 100) / 100
          : 0,
        result: revealResults.revealedCards.map((id) => decodeUnoCard(id).label).join(' '),
      }
    : null;

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats
    ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2)
    : '0.00';

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={overlayResult}
        show={showResult && phase === PHASES.DONE}
        onClose={closeResult}
        title="UNO King"
      />

      <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
        <FiArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Games</span>
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
        {/* Sidebar */}
        <div className="md:order-1 order-2 space-y-4">
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Total Bets</p>
                <p className="text-sm font-bold text-white">{stats.total_bets}</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Win Rate</p>
                <p className="text-sm font-bold text-accent">{winRate}%</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Net</p>
                <p className={`text-sm font-bold ${parseFloat(netProfit) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {parseFloat(netProfit) >= 0 ? '+' : ''}{netProfit}
                </p>
              </div>
            </div>
          )}

          <GameLiveFeed />
          <GameHistory
            gameType="uno_king"
            title="Recent Rounds"
            refreshKey={historyKey}
            renderItem={(bet) => {
              const details = typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details;
              const slipCount = details?.bets?.length || 0;
              const revealed = details?.revealedCards || [];
              return (
                <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      bet.is_win ? 'bg-accent/20 text-accent' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {bet.is_win ? 'W' : 'L'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        {slipCount} slip{slipCount === 1 ? '' : 's'} · {formatCurrency(parseFloat(bet.bet_amount))}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                        {revealed.slice(0, 4).map((cid, i) => {
                          const c = decodeUnoCard(cid);
                          const color = c.isWild ? '#ffffff' : c.color.main;
                          return (
                            <span key={i} style={{ color }} className="font-bold">
                              {c.isWild ? (cid === 53 ? '+4' : 'W') : c.label}
                            </span>
                          );
                        })}
                        <span className="text-gray-600">·</span>
                        <span>{new Date(bet.created_at).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${bet.is_win ? 'text-accent' : 'text-red-400'}`}>
                    {bet.is_win ? `+${formatCurrency(parseFloat(bet.win_amount))}` : `-${formatCurrency(parseFloat(bet.bet_amount))}`}
                  </span>
                </div>
              );
            }}
          />
        </div>

        {/* Main */}
        <div className="md:order-2 order-1 space-y-4">
          <div
            className="relative rounded-xl border border-white/5 p-3 sm:p-6 space-y-4 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GiCardJoker className="w-5 h-5 text-amber-300" />
                <h1 className="text-lg sm:text-xl font-bold text-white">UNO King</h1>
              </div>
              <span className="text-[11px] text-gray-500">
                {phase === PHASES.CONFIG ? (
                  <>
                    {currentPickLabel}
                    {isPickValid && <span className="text-accent ml-1.5">{currentMultiplier}x</span>}
                  </>
                ) : '4 cards drawn from a 54-card UNO deck'}
              </span>
            </div>

            {phase === PHASES.IDLE && (
              <div className="relative">
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-32 pointer-events-none blur-3xl opacity-50"
                  style={{ background: 'radial-gradient(closest-side, rgba(220,38,38,0.25), transparent)' }}
                />
                <div className="relative h-[200px] sm:h-[240px] flex items-center justify-center">
                  <DemoShowcase />
                </div>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-amber-300 font-semibold">Live preview</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-400">Press Play to begin</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-300 text-center">
                    Pick <span className="text-white font-semibold">1–4</span> cards · Match the deal · Win up to{' '}
                    <span className="text-amber-300 font-bold">500x</span>
                  </p>
                </div>
              </div>
            )}

            {phase === PHASES.CONFIG && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Bet kind tabs */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-dark-900/60 border border-white/5">
                  {BET_KINDS.map((k) => {
                    const active = betKind === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => switchKind(k.id)}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-accent/20 text-accent border border-accent/40'
                            : 'text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        {k.label}
                      </button>
                    );
                  })}
                </div>

                {/* Pickers — swap by kind. Every chip is a real UNO sprite card. */}
                {betKind === 'cards' && (
                  <div className="space-y-1.5">
                    {UNO_COLORS.map((color) => (
                      <div key={color.id} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                        {Array.from({ length: 13 }).map((_, rankIdx) => {
                          const cardId = color.id * 13 + rankIdx;
                          const isSelected = selected.includes(cardId);
                          const lockedByOtherSlip = allSelectedAcrossSlips.has(cardId);
                          return (
                            <UnoCardChip
                              key={cardId}
                              id={cardId}
                              selected={isSelected}
                              disabled={lockedByOtherSlip}
                              onClick={() => toggleCard(cardId)}
                            />
                          );
                        })}
                      </div>
                    ))}
                    <div className="grid gap-1 max-w-[26%]" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                      {[52, 53].map((cardId) => {
                        const isSelected = selected.includes(cardId);
                        const lockedByOtherSlip = allSelectedAcrossSlips.has(cardId);
                        return (
                          <UnoCardChip
                            key={cardId}
                            id={cardId}
                            selected={isSelected}
                            disabled={lockedByOtherSlip}
                            onClick={() => toggleCard(cardId)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {betKind === 'color' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards is this color.</p>
                    <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
                      {UNO_COLORS.map((c) => (
                        <UnoCardChip
                          key={c.id}
                          id={colorRepCardId(c.id)}
                          selected={pickedColor === c.name}
                          onClick={() => { setPickedColor(pickedColor === c.name ? null : c.name); sounds.tap?.(); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {betKind === 'number' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards has this number.</p>
                    <div className="grid grid-cols-5 gap-1.5 max-w-md mx-auto">
                      {NUMBERS.map((n) => (
                        <UnoCardChip
                          key={n}
                          id={redNumberCardId(n)}
                          selected={pickedNumber === n}
                          onClick={() => { setPickedNumber(pickedNumber === n ? null : n); sounds.tap?.(); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {betKind === 'action' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards is this action.</p>
                    <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                      {ACTIONS.map((a) => (
                        <UnoCardChip
                          key={a.id}
                          id={redActionCardId(a.rankIdx)}
                          selected={pickedAction === a.id}
                          onClick={() => { setPickedAction(pickedAction === a.id ? null : a.id); sounds.tap?.(); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {betKind === 'wild' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards is a Wild or Wild +4.</p>
                    <div className="grid grid-cols-2 gap-2 max-w-[224px] mx-auto">
                      <UnoCardChip
                        id={52}
                        selected={pickedWild}
                        onClick={() => { setPickedWild((v) => !v); sounds.tap?.(); }}
                      />
                      <UnoCardChip
                        id={53}
                        selected={pickedWild}
                        onClick={() => { setPickedWild((v) => !v); sounds.tap?.(); }}
                      />
                    </div>
                  </div>
                )}

                {/* Bet amount */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Bet amount</label>
                    <span className="text-[11px] text-gray-500">Win up to {formatCurrency(projectedWin)}</span>
                  </div>
                  <BetStepper amount={amount} setAmount={setAmount} disabled={submitting} step={5} min={1} max={10000} />
                  <div className="flex items-center gap-2">
                    {QUICK_AMOUNTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setAmount(String(q))}
                        className="px-3 py-1.5 rounded-md bg-dark-800/60 border border-white/5 text-xs text-gray-300 hover:text-white hover:border-accent/40"
                      >
                        {formatCurrency(q)}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addSlip}
                    disabled={!isPickValid || currentAmount < 1}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent/15 border border-accent/30 text-accent font-semibold hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FiPlus className="w-4 h-4" />
                    Add slip {isPickValid && `(${currentPickLabel} · ${currentMultiplier}x)`}
                  </button>
                </div>

                {/* Slip list */}
                {slips.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-300">Your bets ({slips.length})</p>
                      <button
                        type="button"
                        onClick={clearSlips}
                        className="text-[11px] text-gray-500 hover:text-red-400"
                      >
                        Clear all
                      </button>
                    </div>
                    <ul className="space-y-1.5">
                      {slips.map((b) => (
                        <li key={b.id} className="flex items-center gap-2 p-2 rounded-lg bg-dark-800/60 border border-white/5">
                          <div className="flex-1 min-w-0">
                            <SlipTarget slip={b} />
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400">
                              {slipKindLabel(b)} · <span className="text-accent">{b.multiplier}x</span>
                            </p>
                            <p className="text-sm font-bold text-white">{formatCurrency(b.amount)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSlip(b.id)}
                            className="p-1.5 text-gray-500 hover:text-red-400"
                            aria-label="Remove slip"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-gray-400">Total wager</span>
                      <span className="text-sm font-bold text-white">{formatCurrency(totalWager)}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {(phase === PHASES.REVEAL || phase === PHASES.DONE) && (
              <div className="relative h-[200px] sm:h-[240px] flex items-center justify-center">
                <div className="flex items-center justify-center gap-2 sm:gap-4">
                  {placeholderIds.map((pid, idx) => {
                    const cardId = revealed[idx] != null ? revealed[idx] : pid;
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.12, duration: 0.55, type: 'spring', stiffness: 180, damping: 22 }}
                      >
                        <UnoCard id={cardId} faceUp={true} size="md" delay={idx * 0.18} />
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-center">
              {phase === PHASES.IDLE && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startRound}
                  className="btn-premium px-6 py-2.5 text-sm flex items-center gap-2"
                >
                  <FiPlay className="w-4 h-4" /> Play
                </motion.button>
              )}
              {phase === PHASES.CONFIG && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleShow}
                  disabled={submitting || slips.length === 0}
                  className="btn-premium px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <FiEye className="w-4 h-4" />
                  {submitting ? 'Showing…' : `Show — ${formatCurrency(totalWager)}`}
                </motion.button>
              )}
              {(phase === PHASES.REVEAL || phase === PHASES.DONE) && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={newRound}
                  disabled={phase === PHASES.REVEAL}
                  className="btn-premium px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <FiRotateCcw className="w-4 h-4" /> New Round
                </motion.button>
              )}
            </div>
          </div>

          {/* Multiplier guide — single block, ascending */}
          {(() => {
            const tiles = [
              { label: 'Color',  value: KIND_MULTIPLIERS.color,  active: betKind === 'color' },
              { label: 'Single', value: CARD_MULTIPLIERS[1],     active: betKind === 'cards' && pickCount === 1 },
              { label: 'Number', value: KIND_MULTIPLIERS.number, active: betKind === 'number' },
              { label: 'Action', value: KIND_MULTIPLIERS.action, active: betKind === 'action' },
              { label: 'Wild',   value: KIND_MULTIPLIERS.wild,   active: betKind === 'wild' },
              { label: 'Dual',   value: CARD_MULTIPLIERS[2],     active: betKind === 'cards' && pickCount === 2 },
              { label: 'Triple', value: CARD_MULTIPLIERS[3],     active: betKind === 'cards' && pickCount === 3 },
              { label: 'Four',   value: CARD_MULTIPLIERS[4],     active: betKind === 'cards' && pickCount === 4 },
            ];
            return (
              <div className="rounded-xl bg-dark-700/40 border border-white/5 p-3">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {tiles.map((t) => (
                    <div
                      key={t.label}
                      className={`rounded-lg px-2 py-2 text-center border transition-colors ${
                        t.active
                          ? 'bg-accent/20 border-accent/40 text-accent'
                          : 'bg-dark-800/50 border-dark-600/50 text-gray-300'
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wider opacity-70">{t.label}</p>
                      <p className="text-sm sm:text-base font-bold">{t.value}x</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {(phase === PHASES.REVEAL || phase === PHASES.DONE) && revealResults && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-xl bg-dark-700/40 border border-white/5 p-4"
            >
              <p className="text-sm font-semibold text-white mb-3">Round results</p>
              <ul className="space-y-2">
                {revealResults.bets.map((b, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded-lg border ${
                      b.isWin ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <SlipTarget slip={b} />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-gray-400">{formatCurrency(b.amount)} · {b.multiplier}x</p>
                      <p className={`text-sm font-bold ${b.isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {b.isWin ? `+${formatCurrency(b.winAmount)}` : 'Lost'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs text-gray-400">Net</span>
                <span className={`text-base font-bold ${revealResults.totalWin > revealResults.totalWager ? 'text-emerald-400' : 'text-red-400'}`}>
                  {revealResults.totalWin >= revealResults.totalWager ? '+' : ''}
                  {formatCurrency(revealResults.totalWin - revealResults.totalWager)}
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
