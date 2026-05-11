import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiTarget, FiRefreshCw, FiSend, FiCheckCircle, FiAlertCircle, FiExternalLink, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getPredictionConfigs,
  updatePredictionConfig,
  getPredictionLog,
  getPredictionSmmMaster,
  setPredictionSmmMaster,
  getPredictionHypeMaster,
  setPredictionHypeMaster,
} from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

const GAMES = [
  { id: 'shuffle_card', label: 'Shuffle Card', accent: 'from-amber-400/30 to-amber-700/20', dot: 'bg-amber-400' },
  { id: 'mutka_king',   label: 'Mutka King',   accent: 'from-orange-500/30 to-rose-700/20', dot: 'bg-orange-400' },
  { id: 'uno_king',     label: 'UNO King',     accent: 'from-red-500/30 to-blue-700/20',   dot: 'bg-rose-400' },
];

const CARD_COUNT_TYPES = [1, 2, 3, 4];

const TYPE_LABELS = { 1: 'Single', 2: 'Dual', 3: 'Triple', 4: 'Four' };

const DEFAULT_TG_MESSAGE = '💰 Bet now before the round locks!';

// Map raw card ids to human-readable labels for the log display.
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const UNO_COLOR_LABELS = ['R', 'Y', 'G', 'B'];
const UNO_RANK_LABELS = ['0','1','2','3','4','5','6','7','8','9','Sk','Rv','+2'];

function formatCard(game, id) {
  if (game === 'uno_king') {
    if (id >= 52) return id === 53 ? '+4' : '★';
    const col = UNO_COLOR_LABELS[Math.floor(id / 13)] || '?';
    const rank = UNO_RANK_LABELS[id % 13] || '?';
    return `${col}${rank}`;
  }
  return `${RANK_LABELS[id % 13]}${SUIT_SYMBOLS[Math.floor(id / 13)]}`;
}

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-center gap-2 group"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-dark-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
      {label && <span className="text-xs text-gray-300 group-hover:text-white">{label}</span>}
    </button>
  );
}

function PredictionTile({ config, onUpdate }) {
  const game = GAMES.find((g) => g.id === config.game);
  const [enabled, setEnabled] = useState(config.enabled);
  const [telegramEnabled, setTelegramEnabled] = useState(config.telegramEnabled);
  const [message, setMessage] = useState(config.telegramMessage || '');
  const [saving, setSaving] = useState(false);
  const dirty =
    enabled !== config.enabled ||
    telegramEnabled !== config.telegramEnabled ||
    (message || '') !== (config.telegramMessage || '');

  const save = async (overrides = {}) => {
    setSaving(true);
    try {
      const payload = {
        game: config.game,
        cardCountType: config.cardCountType,
        enabled,
        telegramEnabled,
        telegramMessage: message,
        ...overrides,
      };
      const res = await updatePredictionConfig(payload);
      onUpdate(res.data.data);
      toast.success(`${game.label} ${config.cardCountType}c saved`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-dark-600 p-3 bg-gradient-to-br ${game.accent}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${game.dot}`} />
          <h3 className="text-white font-bold text-sm truncate">
            {game.label}
          </h3>
        </div>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-accent/25 text-accent border border-accent/40 shrink-0 whitespace-nowrap">
          {config.cardCountType}c · {TYPE_LABELS[config.cardCountType]}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between bg-dark-900/60 rounded-md px-3 py-2 border border-dark-700">
          <span className="text-[11px] text-gray-300">Prediction enabled</span>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>
        <div className="flex items-center justify-between bg-dark-900/60 rounded-md px-3 py-2 border border-dark-700">
          <span className="text-[11px] text-gray-300">Push to Telegram</span>
          <Toggle checked={telegramEnabled} onChange={setTelegramEnabled} disabled={!enabled} />
        </div>
      </div>

      {telegramEnabled && (
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Telegram Message (appended after period + cards)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={DEFAULT_TG_MESSAGE}
            rows={2}
            className="w-full bg-dark-900 border border-dark-600 rounded-md p-2 text-xs text-white focus:border-accent outline-none resize-y"
          />
        </div>
      )}

      <button
        onClick={() => save()}
        disabled={saving || !dirty}
        className={`w-full py-1.5 rounded-md font-bold text-xs uppercase tracking-wide transition-all ${
          dirty
            ? 'bg-accent hover:brightness-110 text-dark-900'
            : 'bg-dark-700 text-gray-500 cursor-not-allowed'
        }`}
      >
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </button>
    </div>
  );
}

function PredictionLog({ entries, loading, onRefresh }) {
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-dark-600">
        <div className="flex items-center gap-2 min-w-0">
          <FiClock className="w-4 h-4 text-accent shrink-0" />
          <h3 className="text-white font-bold text-sm truncate">Recent Pushes</h3>
        </div>
        <button
          onClick={onRefresh}
          className="shrink-0 text-gray-400 hover:text-white transition-colors text-xs flex items-center gap-1"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Mobile card list (visible <sm) */}
      <div className="sm:hidden divide-y divide-dark-600/40 max-h-[28rem] overflow-y-auto">
        {entries.length === 0 && (
          <div className="px-3 py-6 text-center text-gray-500 italic text-xs">No predictions pushed yet.</div>
        )}
        {entries.map((e) => {
          const game = GAMES.find((g) => g.id === e.game);
          return (
            <div key={e.id} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-gray-400 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleTimeString()}
                </span>
                <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase shrink-0">
                  {e.cardCountType}c
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white text-xs font-semibold truncate">{game?.label || e.game}</span>
                <span className="text-accent font-mono text-[10px] truncate ml-2">{e.periodId}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(e.predictedCards || []).map((cid, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-dark-700 text-[10px] font-mono text-gray-200">
                    {formatCard(e.game, cid)}
                  </span>
                ))}
              </div>
              <div>
                {e.telegramPushed ? (
                  <a
                    href={e.telegramPostUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold"
                  >
                    <FiCheckCircle className="w-3.5 h-3.5" /> Sent
                    {e.telegramPostUrl && <FiExternalLink className="w-3 h-3" />}
                  </a>
                ) : e.telegramError ? (
                  <span title={e.telegramError} className="inline-flex items-center gap-1 text-red-400 text-[11px] font-bold">
                    <FiAlertCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                ) : (
                  <span className="text-gray-500 text-[11px]">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop / tablet table (visible ≥sm) */}
      <div className="hidden sm:block overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-dark-700/50 text-gray-400 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">Game</th>
              <th className="px-2 py-2 text-center font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Period</th>
              <th className="px-3 py-2 text-left font-semibold">Cards</th>
              <th className="px-3 py-2 text-center font-semibold">Telegram</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-600/40">
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500 italic">No predictions pushed yet.</td></tr>
            )}
            {entries.map((e) => {
              const game = GAMES.find((g) => g.id === e.game);
              return (
                <tr key={e.id} className="hover:bg-dark-700/30">
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{game?.label || e.game}</td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase">
                      {e.cardCountType}c
                    </span>
                  </td>
                  <td className="px-3 py-2 text-accent font-mono whitespace-nowrap">{e.periodId}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(e.predictedCards || []).map((cid, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-dark-700 text-[10px] font-mono text-gray-200"
                        >
                          {formatCard(e.game, cid)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {e.telegramPushed ? (
                      <a
                        href={e.telegramPostUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold"
                      >
                        <FiCheckCircle className="w-3.5 h-3.5" />
                        Sent
                        {e.telegramPostUrl && <FiExternalLink className="w-3 h-3" />}
                      </a>
                    ) : e.telegramError ? (
                      <span
                        title={e.telegramError}
                        className="inline-flex items-center gap-1 text-red-400 text-[11px] font-bold"
                      >
                        <FiAlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    ) : (
                      <span className="text-gray-500 text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminPrediction() {
  usePageTitle('Prediction');
  const [configs, setConfigs] = useState([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [log, setLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [smmMasterEnabled, setSmmMasterEnabled] = useState(true);
  const [smmMasterSaving, setSmmMasterSaving] = useState(false);
  const [hypeMasterEnabled, setHypeMasterEnabled] = useState(true);
  const [hypeMasterSaving, setHypeMasterSaving] = useState(false);

  const loadSmmMaster = useCallback(async () => {
    try {
      const res = await getPredictionSmmMaster();
      setSmmMasterEnabled(!!res.data?.data?.enabled);
    } catch (_) {}
  }, []);

  const loadHypeMaster = useCallback(async () => {
    try {
      const res = await getPredictionHypeMaster();
      setHypeMasterEnabled(!!res.data?.data?.enabled);
    } catch (_) {}
  }, []);

  const toggleSmmMaster = async () => {
    const next = !smmMasterEnabled;
    setSmmMasterSaving(true);
    setSmmMasterEnabled(next); // optimistic
    try {
      const res = await setPredictionSmmMaster(next);
      setSmmMasterEnabled(!!res.data?.data?.enabled);
      toast.success(`SMM master ${next ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setSmmMasterEnabled(!next); // revert
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSmmMasterSaving(false);
    }
  };

  const toggleHypeMaster = async () => {
    const next = !hypeMasterEnabled;
    setHypeMasterSaving(true);
    setHypeMasterEnabled(next);
    try {
      const res = await setPredictionHypeMaster(next);
      setHypeMasterEnabled(!!res.data?.data?.enabled);
      toast.success(`Hype follow-up ${next ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setHypeMasterEnabled(!next);
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setHypeMasterSaving(false);
    }
  };

  const loadConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const res = await getPredictionConfigs();
      setConfigs(res.data?.data?.configs || []);
    } catch (err) {
      toast.error('Failed to load prediction configs');
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  const loadLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const res = await getPredictionLog(null, null, 50);
      setLog(res.data?.data || []);
    } catch (err) {
      // silent
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
    loadLog();
    loadSmmMaster();
    loadHypeMaster();
    // Refresh the log every 15s so new pushes appear without manual refresh.
    const t = setInterval(loadLog, 15_000);
    return () => clearInterval(t);
  }, [loadConfigs, loadLog, loadSmmMaster, loadHypeMaster]);

  const onTileUpdate = (updated) => {
    setConfigs((prev) =>
      prev.map((c) =>
        c.game === updated.game && c.cardCountType === updated.cardCountType ? { ...c, ...updated } : c
      )
    );
  };

  const grouped = useMemo(() => {
    const out = {};
    for (const g of GAMES) out[g.id] = [];
    for (const c of configs) {
      if (out[c.game]) out[c.game].push(c);
    }
    for (const g of GAMES) out[g.id].sort((a, b) => a.cardCountType - b.cardCountType);
    return out;
  }, [configs]);

  const enabledCount = configs.filter((c) => c.enabled).length;
  const tgCount = configs.filter((c) => c.telegramEnabled && c.enabled).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <FiTarget className="w-5 h-5 sm:w-6 sm:h-6 text-accent shrink-0" /> Prediction Module
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Pre-roll the next round's cards and push them to Telegram 5s after the round opens.
            Toggle per <b>(game, card-count type)</b>. Subscribers get the result during the betting window.
          </p>
          {/* Status pills — wrap nicely on narrow screens */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 mt-2">
            <span>Active: <b className="text-accent">{enabledCount}</b> / 12</span>
            <span className="text-gray-700">·</span>
            <span>Telegram: <b className="text-emerald-400">{tgCount}</b></span>
            <span className="text-gray-700">·</span>
            <span>SMM: <b className={smmMasterEnabled ? 'text-emerald-400' : 'text-gray-500'}>{smmMasterEnabled ? 'ON' : 'OFF'}</b></span>
            <span className="text-gray-700">·</span>
            <span>Hype: <b className={hypeMasterEnabled ? 'text-emerald-400' : 'text-gray-500'}>{hypeMasterEnabled ? 'ON' : 'OFF'}</b></span>
            <span className="hidden sm:inline text-gray-700">·</span>
            <span className="hidden sm:inline">Channel: <code className="text-gray-400">TELEGRAM_WINNERS_CHANNEL_ID</code></span>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={loadConfigs}
          disabled={loadingConfigs}
          className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm rounded-lg border border-dark-600 disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loadingConfigs ? 'animate-spin' : ''}`} />
          <span className="hidden xs:inline sm:inline">Reload</span>
        </motion.button>
      </div>

      {/* Master switches — gate SMM orders and the hype follow-up sequence
          across every prediction Telegram push. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-600 bg-dark-800/50">
          <div className="min-w-0 flex-1">
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${smmMasterEnabled ? 'bg-emerald-400 shadow-[0_0_6px_currentColor]' : 'bg-gray-500'}`} />
              <span className="truncate">SMM Master Switch</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              When OFF, predictions still post to Telegram but <b>no SMM orders</b> (views/reactions) are placed.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSmmMaster}
            disabled={smmMasterSaving}
            className={`shrink-0 relative inline-flex h-6 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              smmMasterEnabled ? 'bg-emerald-500' : 'bg-dark-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                smmMasterEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-600 bg-dark-800/50">
          <div className="min-w-0 flex-1">
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${hypeMasterEnabled ? 'bg-emerald-400 shadow-[0_0_6px_currentColor]' : 'bg-gray-500'}`} />
              <span className="truncate">Hype GIF Follow-up</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              When ON, sends a <b>GO-GO-GO</b> GIF + message at <b>+5s</b> and <b>+10s</b> after each prediction.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleHypeMaster}
            disabled={hypeMasterSaving}
            className={`shrink-0 relative inline-flex h-6 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              hypeMasterEnabled ? 'bg-emerald-500' : 'bg-dark-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                hypeMasterEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Per-game columns of 4 tiles each — stacked on phones, 2-up on tablets,
          full 3-col layout on lg+. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GAMES.map((g) => (
          <div key={g.id} className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 px-1">
              <span className={`w-2.5 h-2.5 rounded-full ${g.dot} shadow-[0_0_8px_currentColor]`} />
              <h2 className="font-bold text-white text-sm uppercase tracking-wider">{g.label}</h2>
            </div>
            <div className="space-y-3">
              {grouped[g.id].length === 0 && loadingConfigs ? (
                <div className="text-gray-500 text-xs italic">Loading…</div>
              ) : (
                grouped[g.id].map((c) => (
                  <PredictionTile
                    key={`${c.game}-${c.cardCountType}`}
                    config={c}
                    onUpdate={onTileUpdate}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="rounded-xl bg-dark-800/60 border border-dark-600 p-4 text-xs text-gray-400 leading-relaxed">
        <div className="flex items-center gap-2 mb-2">
          <FiSend className="w-4 h-4 text-accent" />
          <h3 className="text-white font-bold text-sm">How predictions work</h3>
        </div>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>
            When a round opens AND <b>Prediction enabled</b> is on for that (game, type), the server pre-rolls
            the round's cards immediately (cryptographically random — same logic the live game would use).
          </li>
          <li>
            The pre-rolled cards are stashed in memory and used as the round's actual reveal at the 60s mark.
          </li>
          <li>
            If <b>Push to Telegram</b> is also on, a message is sent to the configured channel
            <code className="mx-1 text-gray-300">{`5s`}</code>
            after the round opens — telegram subscribers see the result while betting is still open
            (45 seconds remaining).
          </li>
          <li>
            The default broadcast template is:{' '}
            <code className="text-gray-300">
              🎯 Prediction: &lt;Game&gt; · Type-N • Period: &lt;periodId&gt; • Cards: &lt;cards&gt;
            </code>
            . Your textarea is appended after that.
          </li>
        </ol>
      </div>

      {/* Recent log */}
      <PredictionLog entries={log} loading={loadingLog} onRefresh={loadLog} />
    </div>
  );
}

export default AdminPrediction;
