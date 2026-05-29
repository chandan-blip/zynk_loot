import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiCrosshair, FiRefreshCw, FiCheck, FiClock, FiAlertTriangle, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import PlayingCard, { decodeCard } from '../../components/PlayingCard';
import UnoCard from '../../components/UnoCard';
import { getCustomPredictionRound, lockCustomPrediction } from '../../services/api';

const GAMES = [
  { id: 'shuffle_card', label: 'Shuffle Card', deck: 52, uno: false },
  { id: 'mutka_king',   label: 'Mutka King',   deck: 52, uno: false },
  { id: 'uno_king',     label: 'UNO King',     deck: 54, uno: true },
];
// Every game now runs 4 DURATION lanes (the `type` 1..4 is a lane id, not a
// card count) and reveals exactly ONE card per round.
const TYPES = [1, 2, 3, 4];
const LANE_LABELS = { 1: '30s', 2: '1m', 3: '5m', 4: '10m' };
const requiredCountFor = () => 1;

// Per-game stage theme so the right-hand preview matches the live game look.
const THEMES = {
  shuffle_card: { border: 'linear-gradient(135deg,#b8860b,#f5d27a)', felt: 'radial-gradient(circle at 50% 25%, #0e3a2a, #082017)', corner: '♠', accent: '#f5d27a' },
  mutka_king:   { border: 'linear-gradient(135deg,#5c2a16,#e8a76a)', felt: 'radial-gradient(circle at 50% 25%, #4a1715, #1a0807)', corner: '❖', accent: '#e8a76a' },
  uno_king:     { border: 'conic-gradient(from 0deg,#dc2626,#f5c518,#16a34a,#2563eb,#dc2626)', felt: 'radial-gradient(circle at 50% 25%, #0a0a1a, #02020a)', corner: '★', accent: '#f5c518' },
};

// Placeholder face-down ids used to fill empty preview slots.
const STD_PLACEHOLDERS = [0, 13, 26, 39];
const UNO_PLACEHOLDERS = [0, 13, 26, 52];

const formatPeriod = (pid) => {
  if (!pid) return '—';
  const s = String(pid);
  return /^\d{8}/.test(s) ? s.slice(8) : s;
};

function AdminCustomPrediction() {
  usePageTitle('Custom Prediction');

  const [game, setGame] = useState('shuffle_card');
  const [type, setType] = useState(1);
  const [selected, setSelected] = useState([]); // ordered card ids
  const [roundInfo, setRoundInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [now, setNow] = useState(Date.now());

  const gameMeta = GAMES.find((g) => g.id === game) || GAMES[0];
  const isUno = gameMeta.uno;
  const requiredCount = requiredCountFor();
  const theme = THEMES[game];

  // Reset the pick whenever the deck (game) or the required count (type) changes.
  useEffect(() => { setSelected([]); }, [game, type]);

  // Tick every second so the round countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadRound = useCallback(async () => {
    try {
      const res = await getCustomPredictionRound(game, type);
      setRoundInfo(res.data?.data || null);
    } catch (_) {
      setRoundInfo(null);
    }
  }, [game, type]);

  // Poll the target round for the selected game/type.
  useEffect(() => {
    loadRound();
    const t = setInterval(loadRound, 3000);
    return () => clearInterval(t);
  }, [loadRound]);

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length < requiredCount) return [...prev, id];
      // Full — roll: drop the oldest pick and append the new one.
      return [...prev.slice(1), id];
    });
  };

  const complete = selected.length === requiredCount;
  const secondsLeft = roundInfo?.completeAt
    ? Math.max(0, Math.round((new Date(roundInfo.completeAt).getTime() - now) / 1000))
    : null;

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      const res = await lockCustomPrediction(game, type, selected);
      const data = res.data?.data || res.data;
      toast.success(`Locked into period ${formatPeriod(data.periodId)}`);
      setLastResult({ game, type, ...data });
      setSelected([]);
      loadRound();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to lock prediction');
    } finally {
      setSubmitting(false);
    }
  };

  const cardLabel = (id) => labelFor(game, id);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <FiCrosshair className="text-accent" /> Custom Prediction
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Hand-pick the exact cards a round will reveal. The pick is locked into the next
            open betting round for the selected game &amp; type — silently, with no Telegram post.
          </p>
        </div>
        <button
          onClick={loadRound}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-dark-800 border border-dark-600 text-xs text-gray-300 hover:text-white"
        >
          <FiRefreshCw className="w-4 h-4" /> Refresh round
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── LEFT: controls + picker ──────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Game selector */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Game</label>
            <div className="grid grid-cols-3 gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGame(g.id)}
                  className={`px-2 py-2 rounded-lg text-xs font-bold border transition-all ${
                    game === g.id
                      ? 'bg-accent text-dark-900 border-accent'
                      : 'bg-dark-900 text-gray-300 border-dark-600 hover:border-accent/50'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* Duration-lane selector */}
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-4 mb-2">
              Duration lane
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-2 py-2 rounded-lg text-xs font-bold border transition-all ${
                    type === t
                      ? 'bg-accent text-dark-900 border-accent'
                      : 'bg-dark-900 text-gray-300 border-dark-600 hover:border-accent/50'
                  }`}
                >
                  {LANE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Target round status */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Target round</span>
              {roundInfo?.available ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase">Betting open</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase">
                  {roundInfo?.status || 'no round'}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-mono text-gray-300">Period {formatPeriod(roundInfo?.periodId)}</span>
              {secondsLeft != null && (
                <span className="flex items-center gap-1 text-gray-400 text-xs">
                  <FiClock className="w-3.5 h-3.5" /> {secondsLeft}s to reveal
                </span>
              )}
            </div>
            {!roundInfo?.available && (
              <p className="mt-2 text-[11px] text-amber-300/80 flex items-center gap-1">
                <FiAlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Round is locking/closed — submit will wait briefly for the next betting round.
              </p>
            )}
          </div>

          {/* Card picker */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Pick exactly {requiredCount} card{requiredCount > 1 ? 's' : ''}
              </span>
              <span className={`text-xs font-black ${complete ? 'text-emerald-400' : 'text-gray-400'}`}>
                {selected.length} / {requiredCount}
              </span>
            </div>

            {isUno ? (
              <div className="space-y-1.5">
                <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                  {Array.from({ length: 52 }).map((_, id) => (
                    <UnoCard
                      key={id}
                      id={id}
                      faceUp
                      size="fill"
                      selected={selected.includes(id)}
                      onClick={() => toggle(id)}
                    />
                  ))}
                </div>
                <div className="grid gap-1 sm:gap-1.5 grid-cols-2 max-w-[24%]">
                  {[52, 53].map((id) => (
                    <UnoCard
                      key={id}
                      id={id}
                      faceUp
                      size="fill"
                      selected={selected.includes(id)}
                      onClick={() => toggle(id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                {Array.from({ length: 52 }).map((_, id) => {
                  const sel = selected.includes(id);
                  const { rank, suit } = decodeCard(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      className={`relative aspect-[5/7] rounded-md flex flex-col items-center justify-center text-[10px] sm:text-[11px] font-black transition-all ${
                        sel ? 'bg-accent text-dark-900 ring-2 ring-accent shadow-lg' : 'bg-white hover:brightness-95'
                      }`}
                      style={!sel ? { color: suit.color } : undefined}
                      title={`${rank}${suit.symbol}`}
                    >
                      <span>{rank}</span>
                      <span className="text-[9px] sm:text-[10px] leading-none">{suit.symbol}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setSelected([])}
                disabled={!selected.length}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-xs text-gray-300 hover:text-white disabled:opacity-40"
              >
                <FiTrash2 className="w-3.5 h-3.5" /> Clear
              </button>
              <button
                onClick={submit}
                disabled={!complete || submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-dark-900 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95"
              >
                <FiCheck className="w-4 h-4" />
                {submitting ? 'Locking…' : complete ? 'Lock these cards' : `Pick ${requiredCount - selected.length} more`}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: live preview ──────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Result preview</span>
              <span className="text-xs font-bold" style={{ color: theme.accent }}>
                {gameMeta.label} · {LANE_LABELS[type]}
              </span>
            </div>

            {/* Themed stage mirroring the user reveal */}
            <div
              className="relative rounded-2xl p-[3px]"
              style={{ background: theme.border }}
            >
              <div
                className="relative rounded-2xl px-4 py-8 flex items-center justify-center gap-3 overflow-hidden min-h-[180px]"
                style={{ background: theme.felt }}
              >
                {['10%', '90%'].map((x) =>
                  ['12%', '88%'].map((y) => (
                    <span
                      key={`${x}-${y}`}
                      className="absolute text-2xl select-none pointer-events-none"
                      style={{ left: x, top: y, transform: 'translate(-50%,-50%)', color: theme.accent, opacity: 0.3 }}
                    >
                      {theme.corner}
                    </span>
                  ))
                )}
                {Array.from({ length: requiredCount }).map((_, i) => {
                  const id = selected[i];
                  const filled = id != null;
                  const placeholder = (isUno ? UNO_PLACEHOLDERS : STD_PLACEHOLDERS)[i] ?? 0;
                  return (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      {isUno ? (
                        <UnoCard id={filled ? id : placeholder} faceUp={filled} size="md" />
                      ) : (
                        <PlayingCard id={filled ? id : placeholder} faceUp={filled} size="md" />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Selected summary */}
            <div className="mt-3 flex items-center gap-2 flex-wrap min-h-[24px]">
              {selected.length === 0 ? (
                <span className="text-xs text-gray-500">No cards picked yet.</span>
              ) : (
                selected.map((id) => (
                  <span
                    key={id}
                    className="px-2 py-0.5 rounded-md bg-dark-900 border border-dark-600 text-xs font-bold text-white"
                  >
                    {cardLabel(id)}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Last locked result */}
          {lastResult && (
            <div className="bg-dark-800 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase">Locked</span>
                <span className="font-mono text-gray-300 text-xs">Period {formatPeriod(lastResult.periodId)}</span>
              </div>
              <p className="text-xs text-gray-400">
                {(GAMES.find((g) => g.id === lastResult.game) || {}).label} · {LANE_LABELS[lastResult.type]} —
                card <span className="text-white font-bold">{(lastResult.cards || []).map((id) => labelFor(lastResult.game, id)).join('  ')}</span> will reveal when this round completes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Short human label for a card id, per game.
function labelFor(game, id) {
  if (game === 'uno_king') {
    const COLORS = ['Red', 'Yellow', 'Green', 'Blue'];
    const RANKS = ['0','1','2','3','4','5','6','7','8','9','Skip','Reverse','+2'];
    if (id >= 52) return id === 53 ? 'Wild +4' : 'Wild';
    return `${COLORS[Math.floor(id / 13)]} ${RANKS[id % 13]}`;
  }
  const { rank, suit } = decodeCard(id);
  return `${rank}${suit.symbol}`;
}

export default AdminCustomPrediction;
