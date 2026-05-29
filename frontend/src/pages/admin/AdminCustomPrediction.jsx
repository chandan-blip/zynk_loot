import { useState, useEffect, useCallback } from 'react';
import { FiCrosshair, FiRefreshCw, FiCheck, FiClock, FiAlertTriangle, FiTrash2, FiUsers } from 'react-icons/fi';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import { decodeCard } from '../../components/PlayingCard';
import UnoCard from '../../components/UnoCard';
import { getCustomPredictionRound, getCustomPredictionBets, lockCustomPrediction } from '../../services/api';
import { formatAmount } from '../../utils/formatAmount';

// Compact ₹ amount for tight spaces (card badges): 1234 → "₹1.2k", 0 → "₹0".
const fmtCompact = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000) return `₹${Math.round(v / 1000)}k`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
};

// Heat class for a per-card exposure badge — green = nothing paid out if this
// card wins (safe to pick), warmer = more money riding on it.
const exposureHeat = (val, max) => {
  if (!val) return 'bg-emerald-500/85 text-dark-900';
  const r = max > 0 ? val / max : 0;
  if (r > 0.66) return 'bg-red-500/90 text-white';
  if (r > 0.33) return 'bg-orange-500/90 text-white';
  return 'bg-amber-400/90 text-dark-900';
};

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

const formatPeriod = (pid) => {
  if (!pid) return '—';
  const s = String(pid);
  return /^\d{8}/.test(s) ? s.slice(8) : s;
};

function AdminCustomPrediction() {
  usePageTitle('Custom Prediction');

  const [game, setGame] = useState('mutka_king');
  const [type, setType] = useState(2); // 1m lane
  const [selected, setSelected] = useState([]); // ordered card ids
  const [roundInfo, setRoundInfo] = useState(null);
  const [liveBets, setLiveBets] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const gameMeta = GAMES.find((g) => g.id === game) || GAMES[0];
  const isUno = gameMeta.uno;
  const requiredCount = requiredCountFor();

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

  const loadBets = useCallback(async () => {
    try {
      const res = await getCustomPredictionBets(game, type);
      setLiveBets(res.data?.data || null);
    } catch (_) {
      setLiveBets(null);
    }
  }, [game, type]);

  // Reset the live-bets panel when the target round changes so we never show
  // one lane's bets against another lane's grid.
  useEffect(() => { setLiveBets(null); }, [game, type]);

  // Poll the target round + its live bets for the selected game/type.
  useEffect(() => {
    loadRound();
    loadBets();
    const t = setInterval(() => { loadRound(); loadBets(); }, 3000);
    return () => clearInterval(t);
  }, [loadRound, loadBets]);

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

  // Per-card payout exposure for the current round, indexed by card id.
  const exposure = liveBets?.exposure || [];
  const maxExposure = exposure.length ? Math.max(...exposure) : 0;
  const hasBets = (liveBets?.betCount || 0) > 0;

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      const res = await lockCustomPrediction(game, type, selected);
      const data = res.data?.data || res.data;
      toast.success(`Locked into period ${formatPeriod(data.periodId)}`);
      setSelected([]);
      loadRound();
      loadBets();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to lock prediction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <FiCrosshair className="text-accent" /> Custom Prediction
          </h1>
        </div>
        <button
          onClick={() => { loadRound(); loadBets(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-dark-800 border border-dark-600 text-xs text-gray-300 hover:text-white"
        >
          <FiRefreshCw className="w-4 h-4" /> Refresh round
        </button>
      </div>

      <div className="space-y-4 max-w-2xl">
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

          {hasBets && (
            <p className="mb-3 text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
              <span>Badge = Z paid out if that card wins.</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/85" /> safe
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500/90" /> high payout
              </span>
            </p>
          )}

          {isUno ? (
            <div className="space-y-1.5">
              <div className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                {Array.from({ length: 52 }).map((_, id) => (
                  <div key={id} className="relative">
                    <UnoCard
                      id={id}
                      faceUp
                      size="fill"
                      selected={selected.includes(id)}
                      onClick={() => toggle(id)}
                    />
                    {hasBets && (
                      <span className={`pointer-events-none absolute bottom-0 inset-x-0 text-center text-[8px] sm:text-[9px] font-black leading-tight rounded-b ${exposureHeat(exposure[id], maxExposure)}`}>
                        {fmtCompact(exposure[id])}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid gap-1 sm:gap-1.5 grid-cols-2 max-w-[24%]">
                {[52, 53].map((id) => (
                  <div key={id} className="relative">
                    <UnoCard
                      id={id}
                      faceUp
                      size="fill"
                      selected={selected.includes(id)}
                      onClick={() => toggle(id)}
                    />
                    {hasBets && (
                      <span className={`pointer-events-none absolute bottom-0 inset-x-0 text-center text-[8px] sm:text-[9px] font-black leading-tight rounded-b ${exposureHeat(exposure[id], maxExposure)}`}>
                        {fmtCompact(exposure[id])}
                      </span>
                    )}
                  </div>
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
                    {hasBets && (
                      <span className={`pointer-events-none absolute bottom-0 inset-x-0 text-center text-[8px] sm:text-[9px] font-black leading-tight rounded-b ${exposureHeat(exposure[id], maxExposure)}`}>
                        {fmtCompact(exposure[id])}
                      </span>
                    )}
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

        {/* Live bets on the targeted round */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <FiUsers className="w-3.5 h-3.5" /> Live bets
            </span>
            <span className="text-xs text-gray-400">
              <span className="font-black text-white">{liveBets?.playerCount || 0}</span> players ·{' '}
              <span className="font-black text-white">{liveBets?.betCount || 0}</span> bets ·{' '}
              <span className="font-black text-accent">{formatAmount(liveBets?.totalStaked)}</span> staked
            </span>
          </div>

          {hasBets ? (
            <div className="max-h-72 overflow-y-auto -mx-1">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                  <tr className="text-left">
                    <th className="px-1 py-1 font-bold">User</th>
                    <th className="px-1 py-1 font-bold">Pick</th>
                    <th className="px-1 py-1 font-bold text-right">Stake</th>
                    <th className="px-1 py-1 font-bold text-right">Pays</th>
                  </tr>
                </thead>
                <tbody>
                  {liveBets.bets.map((b) => (
                    <tr key={b.betId} className="border-t border-dark-700">
                      <td className="px-1 py-1.5 text-gray-200 font-medium truncate max-w-[120px]">{b.username}</td>
                      <td className="px-1 py-1.5">
                        <span className="text-gray-300">{b.label}</span>
                        <span className="ml-1 text-[10px] text-gray-500">({b.kind})</span>
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono text-gray-300">{formatAmount(b.amount)}</td>
                      <td className="px-1 py-1.5 text-right font-mono text-amber-300">{formatAmount(b.potentialWin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-500 py-2">
              {liveBets?.available === false && liveBets?.reason
                ? 'No betting round open right now.'
                : 'No live bets on this round yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminCustomPrediction;
