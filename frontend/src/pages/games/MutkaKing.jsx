import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiTrash2, FiPlay, FiEye, FiRotateCcw } from 'react-icons/fi';
import { GiCardJackHearts } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import { playMutkaKing, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import GameHistory from '../../components/GameHistory';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import PlayingCard, { decodeCard, SUITS, RANK_LABELS } from '../../components/PlayingCard';
import usePageTitle from '../../hooks/usePageTitle';

const CARD_MULTIPLIERS = { 1: 2, 2: 9, 3: 100, 4: 500 };
const PICK_LABELS = { 1: 'Single', 2: 'Dual', 3: 'Triple', 4: 'Four' };
const KIND_MULTIPLIERS = { rank: 3, suit: 2, color: 2 };

const BET_KINDS = [
  { id: 'cards', label: 'Cards' },
  { id: 'rank',  label: 'Rank' },
  { id: 'suit',  label: 'Suit' },
  { id: 'color', label: 'Color' },
];

// Rank bet covers every rank: A, 2-10, J, Q, K (indices 0-12)
const RANK_BET_INDICES = Array.from({ length: 13 }, (_, i) => i);

const QUICK_AMOUNTS = [10, 50, 100, 500];

const PHASES = {
  IDLE: 'idle',          // deck stacked, "Play" button
  CONFIG: 'config',      // 4 cards spread face-down, bet section visible
  SHUFFLING: 'shuffling',// 3-second face-down shuffle animation after Show
  REVEAL: 'reveal',      // server replied, cards flipping over
  DONE: 'done',          // result overlay shown, allow another round
};

const SHUFFLE_DURATION_MS = 3000;

// Per-card riffle motion: each card cycles through a small loop of x/y/rotate
// keyframes so the deck looks like a real shuffle. Patterns are intentionally
// asymmetric so cards visibly cross over and swap z-order rather than orbiting
// in unison.
const SHUFFLE_PATTERNS = [
  { x: [0, -56, 38, -22, 0], y: [0, -12, 16, -8, 0],  rotate: [0, -14, 10, -6, 0],  duration: 0.85, delay: 0.00 },
  { x: [0,  48, -30, 22, 0], y: [0,  14, -10, 12, 0], rotate: [0,  12, -16, 8, 0],  duration: 0.78, delay: 0.10 },
  { x: [0, -32, 50, -18, 0], y: [0,  10,  14, -8, 0], rotate: [0,  -8,  14, -10, 0], duration: 0.82, delay: 0.05 },
  { x: [0,  30, -42, 16, 0], y: [0, -14, -6,  10, 0], rotate: [0,  16,  -8,  12, 0], duration: 0.74, delay: 0.15 },
];

const SHUFFLE_PLACEHOLDER_IDS = [0, 13, 26, 39];

function ShuffleStage() {
  return (
    <div className="relative h-[200px] sm:h-[240px] flex items-center justify-center">
      <motion.div
        animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0.75, 0.35] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute h-40 w-40 rounded-full pointer-events-none blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(245,210,122,0.55), rgba(0,212,170,0.25) 55%, transparent 75%)',
        }}
      />

      <div className="relative w-[180px] h-[160px] flex items-center justify-center">
        {SHUFFLE_PLACEHOLDER_IDS.map((pid, i) => {
          const p = SHUFFLE_PATTERNS[i];
          return (
            <motion.div
              key={i}
              className="absolute"
              animate={{ x: p.x, y: p.y, rotate: p.rotate }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ willChange: 'transform' }}
            >
              <PlayingCard id={pid} faceUp={false} size="md" />
            </motion.div>
          );
        })}
      </div>

      <div className="absolute bottom-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-amber-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="text-amber-300 font-semibold">Shuffling</span>
        <motion.span
          className="text-amber-300 font-semibold"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          …
        </motion.span>
      </div>
    </div>
  );
}

function pickRandomFour() {
  const set = new Set();
  while (set.size < 4) set.add(Math.floor(Math.random() * 52));
  return [...set];
}

// Idle-state "live preview" — fans out four random cards, breathes, wobbles,
// and re-deals every few seconds with synchronised flip + sparkle particles
// so the stage feels alive before the player presses Play.
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

  // Deterministic pseudo-random sparkle layout so they don't reshuffle each render
  const sparkles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      id: i,
      top: 14 + (i * 47) % 72,
      left: 6 + (i * 67) % 88,
      size: 6 + (i % 4) * 2,
      delay: (i * 0.37) % 2.4,
      duration: 2 + (i % 3) * 0.6,
      color: i % 3 === 0 ? '#f5d27a' : i % 3 === 1 ? '#00d4aa' : '#ffffff',
    })),
    []
  );

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Pulsing two-tone radial spotlight */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-40 sm:h-56 blur-3xl rounded-full pointer-events-none"
        style={{
          background: 
            'radial-gradient(closest-side, rgba(245,210,122,0.55), rgba(0,212,170,0.28) 55%, transparent 75%)',
        }}
      />

      {/* Slow rotating light streaks */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(245,210,122,0.10) 30deg, transparent 60deg, transparent 180deg, rgba(0,212,170,0.10) 210deg, transparent 240deg)',
          maskImage: 'radial-gradient(closest-side, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(closest-side, black 30%, transparent 75%)',
        }}
      />

      {/* Sparkle particles */}
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
          animate={{
            opacity: [0, 1, 0],
            scale: [0.4, 1.3, 0.4],
            y: [0, -14, -22],
            rotate: [0, 90, 180],
          }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            delay: s.delay,
            ease: 'easeOut',
          }}
        >
          ✦
        </motion.span>
      ))}

      {/* Cards */}
      <div className="relative flex items-center justify-center gap-2 sm:gap-3 z-[1]">
        {cards.map((id, idx) => {
          const rot = (idx - 1.5) * 7; // wider fan: -10.5°, -3.5°, +3.5°, +10.5°
          return (
            <motion.div
              key={idx}
              initial={{ y: 0, rotate: rot }}
              animate={{ y: [0, -10, 0], rotate: rot }}
              transition={{
                duration: 3.5 + idx * 0.3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                willChange: 'transform',
                transformOrigin: '50% 60%',
              }}
            >
              <PlayingCard id={id} faceUp={faceUp} size="md" delay={idx * 0.12} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function CardChip({ id, selected, disabled, onClick }) {
  const { rank, suit } = decodeCard(id);
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={!disabled && !selected ? { y: -2 } : undefined}
      whileTap={!disabled ? { scale: 0.92 } : undefined}
      animate={{ scale: selected ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className={`relative aspect-[5/7] rounded-[5px] overflow-hidden transition-[filter] ${
        disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:brightness-[1.05]'
      }`}
      style={{
        background: selected
          ? `linear-gradient(160deg, ${suit.color === '#c41e3a' ? '#fff5f7' : '#f0fdf9'} 0%, #ffffff 100%)`
          : 'linear-gradient(160deg, #ffffff 0%, #eef0f4 100%)',
        boxShadow: selected
          ? `0 0 0 2px #00d4aa, 0 0 14px rgba(0,212,170,0.6), 0 4px 10px rgba(0,0,0,0.45)`
          : 'inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.55)',
      }}
    >
      {/* Big bold center suit — the primary visual at tiny sizes */}
      <span
        className="absolute inset-0 flex items-center justify-center font-black leading-none pointer-events-none"
        style={{
          color: suit.color,
          fontSize: 'clamp(16px, 3.2vw, 24px)',
          textShadow: '0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        {suit.symbol}
      </span>

      {/* Rank in top-left corner — bigger, serif, clearly readable */}
      <span
        className="absolute top-[6%] left-[10%] font-black leading-none pointer-events-none"
        style={{
          color: suit.color,
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(10px, 2vw, 14px)',
        }}
      >
        {rank}
      </span>

      {/* Rank in bottom-right corner (rotated) */}
      <span
        className="absolute bottom-[6%] right-[10%] font-black leading-none pointer-events-none"
        style={{
          color: suit.color,
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(10px, 2vw, 14px)',
          transform: 'rotate(180deg)',
        }}
      >
        {rank}
      </span>

      {/* Selected check pip */}
      {selected && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-dark-900 flex items-center justify-center text-[11px] font-black leading-none shadow-lg ring-2 ring-dark-700">
          ✓
        </span>
      )}
    </motion.button>
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
  if (slip.kind === 'rank') {
    return (
      <span
        className="inline-flex items-center justify-center px-2 h-9 rounded bg-white border border-gray-300 font-bold text-xs text-gray-900"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
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
      <span
        className={`inline-flex items-center px-3 h-9 rounded border font-bold text-xs capitalize ${
          isRed ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-gray-700/40 border-gray-500/40 text-gray-200'
        }`}
      >
        {slip.color}
      </span>
    );
  }
  return null;
}

function slipKindLabel(slip) {
  if (slip.kind === 'cards') return PICK_LABELS[slip.cards.length];
  if (slip.kind === 'rank') return 'Rank';
  if (slip.kind === 'suit') return 'Suit';
  if (slip.kind === 'color') return 'Color';
  return slip.kind;
}

function CardLabel({ id }) {
  const { rank, suit } = decodeCard(id);
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-9 rounded bg-white border border-gray-300 font-bold text-xs leading-none"
      style={{ color: suit.color }}
      title={`${rank} ${suit.name}`}
    >
      <span className="flex flex-col items-center gap-0.5">
        <span>{rank}</span>
        <span className="text-[11px]">{suit.symbol}</span>
      </span>
    </span>
  );
}

// Shared "card-style" chip face used by Number, Suit, Color pickers — keeps
// the same paper/shadow vibe as CardChip so all four bet-kind pickers match.
function ChipShell({ selected, onClick, children, faceStyle, className = '' }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={!selected ? { y: -2 } : undefined}
      whileTap={{ scale: 0.94 }}
      animate={{ scale: selected ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className={`relative aspect-[5/7] rounded-[5px] overflow-hidden transition-[filter] hover:brightness-[1.05] ${className}`}
      style={{
        ...(faceStyle || {}),
        boxShadow: selected
          ? '0 0 0 2px #00d4aa, 0 0 14px rgba(0,212,170,0.6), 0 4px 10px rgba(0,0,0,0.45)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.55)',
      }}
    >
      {children}
      {selected && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-dark-900 flex items-center justify-center text-[11px] font-black leading-none shadow-lg ring-2 ring-dark-700">
          ✓
        </span>
      )}
    </motion.button>
  );
}

function NumberChip({ rank, selected, onClick }) {
  const label = RANK_LABELS[rank];
  return (
    <ChipShell
      selected={selected}
      onClick={onClick}
      faceStyle={{ background: 'linear-gradient(160deg, #ffffff 0%, #eef0f4 100%)' }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-black leading-none text-gray-900 pointer-events-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 'clamp(18px, 3.6vw, 28px)' }}
      >
        {label}
      </span>
      <span
        className="absolute top-[6%] left-[10%] font-black leading-none text-gray-900 pointer-events-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 'clamp(9px, 1.8vw, 12px)' }}
      >
        {label}
      </span>
      <span
        className="absolute bottom-[6%] right-[10%] font-black leading-none text-gray-900 pointer-events-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 'clamp(9px, 1.8vw, 12px)', transform: 'rotate(180deg)' }}
      >
        {label}
      </span>
    </ChipShell>
  );
}

function SuitChip({ suitId, selected, onClick }) {
  const s = SUITS[suitId];
  return (
    <ChipShell
      selected={selected}
      onClick={onClick}
      faceStyle={{ background: 'linear-gradient(160deg, #ffffff 0%, #eef0f4 100%)' }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-black leading-none pointer-events-none"
        style={{ color: s.color, fontSize: 'clamp(28px, 6vw, 48px)', textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}
      >
        {s.symbol}
      </span>
      <span
        className="absolute top-[6%] left-[10%] font-black leading-none pointer-events-none"
        style={{ color: s.color, fontSize: 'clamp(11px, 2vw, 14px)' }}
      >
        {s.symbol}
      </span>
      <span
        className="absolute bottom-[6%] right-[10%] font-black leading-none pointer-events-none"
        style={{ color: s.color, fontSize: 'clamp(11px, 2vw, 14px)', transform: 'rotate(180deg)' }}
      >
        {s.symbol}
      </span>
    </ChipShell>
  );
}

function ColorChip({ color, selected, onClick }) {
  const isRed = color === 'red';
  const faceStyle = {
    background: isRed
      ? 'linear-gradient(160deg, #ef4444 0%, #991b1b 100%)'
      : 'linear-gradient(160deg, #1f2937 0%, #030712 100%)',
  };
  return (
    <ChipShell
      selected={selected}
      onClick={onClick}
      faceStyle={faceStyle}
    >
      {/* Pure colored face — no symbol, no text. */}
    </ChipShell>
  );
}

export default function MutkaKing() {
  usePageTitle('Mutka King');

  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();

  const [phase, setPhase] = useState(PHASES.IDLE);
  const [betKind, setBetKind] = useState('cards');
  const [selected, setSelected] = useState([]);     // for 'cards' kind
  const [pickedRank, setPickedRank] = useState(null);  // 1..9 for 2..10
  const [pickedSuit, setPickedSuit] = useState(null);  // 0..3
  const [pickedColor, setPickedColor] = useState(null); // 'red' | 'black'
  const [amount, setAmount] = useState('10');
  const [slips, setSlips] = useState([]);           // queued bets for next show
  const [revealed, setRevealed] = useState([]);     // cards returned from server
  const [revealResults, setRevealResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Stable face-down "deck" card placeholders for the spread
  const placeholderIds = useMemo(() => [0, 13, 26, 39], []);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getGameStats();
      const s = (res.data.data || []).find(x => x.game_type === 'mutka_king');
      setStats(s || null);
    } catch {}
  }, [user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const totalWager = useMemo(
    () => slips.reduce((s, b) => s + Number(b.amount || 0), 0),
    [slips]
  );

  // Only 'cards' slips lock specific cards. Rank/suit/color slips don't.
  const allSelectedAcrossSlips = useMemo(() => {
    const set = new Set();
    slips.forEach((b) => {
      if (b.kind === 'cards') b.cards.forEach((c) => set.add(c));
    });
    return set;
  }, [slips]);

  // Per-kind: current target & multiplier the player is staging
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

  const startRound = () => {
    sounds.click?.();
    setPhase(PHASES.CONFIG);
  };

  const toggleCard = (id) => {
    if (phase !== PHASES.CONFIG) return;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.error('Max 4 cards per bet');
        return prev;
      }
      sounds.tap?.();
      return [...prev, id];
    });
  };

  const switchKind = (k) => {
    setBetKind(k);
    sounds.tap?.();
  };

  const addSlip = () => {
    if (phase !== PHASES.CONFIG) return;
    if (!isPickValid) {
      toast.error(
        betKind === 'cards' ? 'Pick at least 1 card' :
        betKind === 'rank' ? 'Pick a number 2–10' :
        betKind === 'suit' ? 'Pick a suit' : 'Pick a color'
      );
      return;
    }
    if (currentAmount < 1) { toast.error('Min bet is 1'); return; }
    if (currentAmount > 10000) { toast.error('Max bet is 10,000'); return; }
    if (slips.length >= 20) { toast.error('Max 20 bets per round'); return; }

    const slip = {
      id: Date.now() + Math.random(),
      kind: betKind,
      amount: Math.floor(currentAmount * 100) / 100,
      multiplier: currentMultiplier,
    };
    if (betKind === 'cards') {
      slip.cards = [...selected].sort((a, b) => a - b);
    } else if (betKind === 'rank') {
      slip.rank = pickedRank;
    } else if (betKind === 'suit') {
      slip.suit = pickedSuit;
    } else if (betKind === 'color') {
      slip.color = pickedColor;
    }

    setSlips((prev) => [...prev, slip]);
    setSelected([]);
    setPickedRank(null);
    setPickedSuit(null);
    setPickedColor(null);
    sounds.click?.();
  };

  const removeSlip = (id) => {
    setSlips((prev) => prev.filter((b) => b.id !== id));
  };

  const clearSlips = () => {
    setSlips([]);
    setSelected([]);
    setPickedRank(null);
    setPickedSuit(null);
    setPickedColor(null);
  };

  const handleShow = async () => {
    if (slips.length === 0) { toast.error('Place at least one bet'); return; }
    if (!user) { toast.error('Please log in to play'); return; }

    setSubmitting(true);
    sounds.click?.();
    setPhase(PHASES.SHUFFLING);
    sounds.cardShuffle?.(SHUFFLE_DURATION_MS / 1000);

    // Run the shuffle animation in parallel with the API call so the player
    // always sees the full 3s of shuffle, even if the server responds instantly.
    const shuffleDelay = new Promise((r) => setTimeout(r, SHUFFLE_DURATION_MS));

    try {
      const apiCall = playMutkaKing(slips.map((s) => {
        const base = { kind: s.kind, amount: s.amount };
        if (s.kind === 'cards') return { ...base, cards: s.cards };
        if (s.kind === 'rank')  return { ...base, rank: s.rank };
        if (s.kind === 'suit')  return { ...base, suit: s.suit };
        if (s.kind === 'color') return { ...base, color: s.color };
        return base;
      }));
      const [res] = await Promise.all([apiCall, shuffleDelay]);
      const data = res.data.data;

      setRevealed(data.revealedCards);
      setRevealResults(data);
      setPhase(PHASES.REVEAL);
      sounds.flip?.();

      // Wait for the spread + flip animation to land before showing the overlay
      setTimeout(() => {
        setShowResult(true);
        setPhase(PHASES.DONE);
        checkAuth();
        loadStats();
        setHistoryKey((k) => k + 1);
      }, 1400);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
      setPhase(PHASES.CONFIG);
    } finally {
      setSubmitting(false);
    }
  };

  const newRound = () => {
    setSelected([]);
    setPickedRank(null);
    setPickedSuit(null);
    setPickedColor(null);
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
        result: revealResults.revealedCards.map((id) => {
          const c = decodeCard(id);
          return `${c.rank}${c.suit.symbol}`;
        }).join(' '),
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
        title="Mutka King"
      />

      <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
        <FiArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Games</span>
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
        {/* Sidebar: Stats + History */}
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
            gameType="mutka_king"
            title="Recent Rounds"
            refreshKey={historyKey}
            renderItem={(bet) => {
              const details = typeof bet.details === 'string'
                ? JSON.parse(bet.details)
                : bet.details;
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
                          const c = decodeCard(cid);
                          return (
                            <span key={i} style={{ color: c.suit.color }} className="font-bold">
                              {c.rank}{c.suit.symbol}
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

        {/* Main: Game */}
        <div className="md:order-2 order-1 space-y-4">
          <div
            className="relative rounded-xl border border-white/5 p-3 sm:p-6 space-y-4 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GiCardJackHearts className="w-5 h-5 text-amber-400" />
                <h1 className="text-lg sm:text-xl font-bold text-white">Mutka King</h1>
              </div>
              <span className="text-[11px] text-gray-500">
                {phase === PHASES.CONFIG
                  ? `${pickCount} / 4 picked${pickCount > 0 ? ` · ${currentPickLabel} · ` : ''}`
                  : '4 cards drawn · pick 1–4 to match'}
                {phase === PHASES.CONFIG && pickCount > 0 && (
                  <span className="text-accent">{currentMultiplier}x</span>
                )}
              </span>
            </div>

            {/* Stage — swaps content by phase */}
            {phase === PHASES.IDLE && (
              <div className="relative">
                {/* Soft accent glow behind the cards */}
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-32 pointer-events-none blur-3xl opacity-50"
                  style={{ background: 'radial-gradient(closest-side, rgba(245,158,11,0.25), transparent)' }}
                />

                <div className="relative h-[200px] sm:h-[240px] flex items-center justify-center">
                  <DemoShowcase />
                </div>

                {/* Inviting tagline + multiplier hint */}
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

                {/* Picker — swaps by bet kind */}
                {betKind === 'cards' && (
                  <div className="space-y-1.5">
                    {SUITS.map((suit) => (
                      <div key={suit.id} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                        {RANK_LABELS.map((_, rankIdx) => {
                          const cardId = suit.id * 13 + rankIdx;
                          const isSelected = selected.includes(cardId);
                          const lockedByOtherSlip = allSelectedAcrossSlips.has(cardId);
                          return (
                            <CardChip
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
                  </div>
                )}

                {betKind === 'rank' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards has this rank.</p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {RANK_BET_INDICES.map((r) => (
                        <NumberChip
                          key={r}
                          rank={r}
                          selected={pickedRank === r}
                          onClick={() => { setPickedRank(pickedRank === r ? null : r); sounds.tap?.(); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {betKind === 'suit' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards has this suit.</p>
                    <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
                      {SUITS.map((suit) => (
                        <SuitChip
                          key={suit.id}
                          suitId={suit.id}
                          selected={pickedSuit === suit.id}
                          onClick={() => { setPickedSuit(pickedSuit === suit.id ? null : suit.id); sounds.tap?.(); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {betKind === 'color' && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-2">Wins if any of the 4 dealt cards is this color.</p>
                    <div className="grid grid-cols-2 gap-2 max-w-[224px] mx-auto">
                      {['red', 'black'].map((c) => (
                        <ColorChip
                          key={c}
                          color={c}
                          selected={pickedColor === c}
                          onClick={() => { setPickedColor(pickedColor === c ? null : c); sounds.tap?.(); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Bet amount */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Bet amount</label>
                    <span className="text-[11px] text-gray-500">
                      Win up to {formatCurrency(projectedWin)}
                    </span>
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
                    Add bet {isPickValid && `(${currentPickLabel} · ${currentMultiplier}x)`}
                  </button>
                </div>

                {/* Slip list */}
                {slips.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-300">
                        Your bets ({slips.length})
                      </p>
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
                        <li
                          key={b.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-dark-800/60 border border-white/5"
                        >
                          <div className="flex-1 min-w-0">
                            <SlipTarget slip={b} />
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400">
                              {slipKindLabel(b)} · <span className="text-accent">{b.multiplier}x</span>
                            </p>
                            <p className="text-sm font-bold text-white">
                              {formatCurrency(b.amount)}
                            </p>
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

            {phase === PHASES.SHUFFLING && <ShuffleStage />}

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
                        transition={{
                          delay: idx * 0.12,
                          duration: 0.55,
                          type: 'spring',
                          stiffness: 180,
                          damping: 22,
                        }}
                      >
                        <PlayingCard
                          id={cardId}
                          faceUp={true}
                          size="md"
                          delay={idx * 0.18}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action row */}
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
              {phase === PHASES.SHUFFLING && (
                <button
                  type="button"
                  disabled
                  className="btn-premium px-6 py-2.5 text-sm flex items-center gap-2 opacity-60 cursor-not-allowed"
                >
                  <FiEye className="w-4 h-4" /> Shuffling…
                </button>
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

          {/* Multiplier guide — every bet ordered by payout */}
          {(() => {
            const tiles = [
              { label: 'Color',  value: KIND_MULTIPLIERS.color, active: betKind === 'color' },
              { label: 'Suit',   value: KIND_MULTIPLIERS.suit,  active: betKind === 'suit' },
              { label: 'Single', value: CARD_MULTIPLIERS[1],    active: betKind === 'cards' && pickCount === 1 },
              { label: 'Rank',   value: KIND_MULTIPLIERS.rank,  active: betKind === 'rank' },
              { label: 'Dual',   value: CARD_MULTIPLIERS[2],    active: betKind === 'cards' && pickCount === 2 },
              { label: 'Triple', value: CARD_MULTIPLIERS[3],    active: betKind === 'cards' && pickCount === 3 },
              { label: 'Four',   value: CARD_MULTIPLIERS[4],    active: betKind === 'cards' && pickCount === 4 },
            ];
            return (
              <div className="rounded-xl bg-dark-700/40 border border-white/5 p-3">
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
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

          {/* Per-slip results — once revealed */}
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
                      b.isWin
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <SlipTarget slip={b} />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-gray-400">
                        {formatCurrency(b.amount)} · {b.multiplier}x
                      </p>
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
