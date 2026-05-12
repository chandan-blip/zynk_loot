import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiTarget, FiRefreshCw, FiSend, FiCheckCircle, FiAlertCircle,
  FiExternalLink, FiClock, FiPlay, FiSave,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getPredictionSchedule,
  updatePredictionSchedule,
  testPredictionSlot,
  getPredictionLog,
  getPredictionSmmMaster,
  setPredictionSmmMaster,
} from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

const GAMES = [
  { id: 'shuffle_card', label: 'Shuffle Card', accent: 'from-amber-400/30 to-amber-700/20', dot: 'bg-amber-400' },
  { id: 'mutka_king',   label: 'Mutka King',   accent: 'from-orange-500/30 to-rose-700/20', dot: 'bg-orange-400' },
  { id: 'uno_king',     label: 'UNO King',     accent: 'from-red-500/30 to-blue-700/20',   dot: 'bg-rose-400' },
];

const CARD_COUNT_TYPES = [1, 2, 3, 4];
const TYPE_LABELS = { 1: 'Single', 2: 'Dual', 3: 'Triple', 4: 'Four' };

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

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-dark-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function NumberField({ label, value, onChange, min = 0, max = 99999, hint }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full bg-dark-900 border border-dark-600 rounded-md p-2 text-xs text-white focus:border-accent outline-none"
      />
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onChange, rows = 2, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-dark-900 border border-dark-600 rounded-md p-2 text-xs text-white focus:border-accent outline-none resize-y"
      />
    </div>
  );
}

function PickEditor({ pick, onChange, index }) {
  const game = GAMES.find((g) => g.id === pick.game);
  return (
    <div className={`rounded-md border border-dark-700 bg-dark-900/70 p-2 space-y-1.5 bg-gradient-to-br ${game?.accent || ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Pick #{index + 1}</span>
        <span className={`w-2 h-2 rounded-full ${game?.dot || 'bg-gray-500'}`} />
      </div>
      <div className="flex gap-1.5">
        <select
          value={pick.game}
          onChange={(e) => onChange({ ...pick, game: e.target.value })}
          className="flex-1 bg-dark-900 border border-dark-600 rounded p-1.5 text-xs text-white outline-none focus:border-accent"
        >
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        <select
          value={pick.cardCountType}
          onChange={(e) => onChange({ ...pick, cardCountType: parseInt(e.target.value, 10) })}
          className="w-20 bg-dark-900 border border-dark-600 rounded p-1.5 text-xs text-white outline-none focus:border-accent"
        >
          {CARD_COUNT_TYPES.map((t) => (
            <option key={t} value={t}>{t}c · {TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <textarea
        value={pick.message || ''}
        onChange={(e) => onChange({ ...pick, message: e.target.value })}
        placeholder="Per-pick caption (optional, appended after the cards)…"
        rows={2}
        className="w-full bg-dark-900 border border-dark-600 rounded p-1.5 text-[11px] text-white focus:border-accent outline-none resize-y"
      />
    </div>
  );
}

function SlotEditor({ slot, slotIndex, onChange, onTest, testing }) {
  return (
    <div className={`rounded-xl border border-dark-600 bg-dark-800/60 p-3 space-y-2.5 ${slot.enabled ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={slot.hour}
            min={0}
            max={23}
            onChange={(e) => onChange({ ...slot, hour: parseInt(e.target.value, 10) })}
            className="w-14 bg-dark-900 border border-dark-600 rounded-md p-1.5 text-sm text-white text-center font-bold focus:border-accent outline-none"
          />
          <span className="text-gray-400 text-sm font-mono">:00</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Slot {slotIndex + 1}</span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle checked={!!slot.enabled} onChange={(v) => onChange({ ...slot, enabled: v })} />
          <button
            type="button"
            onClick={() => onTest(slotIndex)}
            disabled={testing}
            title="Run this slot right now"
            className="flex items-center gap-1 px-2 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent text-[11px] font-bold border border-accent/40 disabled:opacity-50"
          >
            <FiPlay className="w-3 h-3" /> Test
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {slot.picks.map((p, i) => (
          <PickEditor
            key={i}
            pick={p}
            index={i}
            onChange={(np) => {
              const picks = slot.picks.slice();
              picks[i] = np;
              onChange({ ...slot, picks });
            }}
          />
        ))}
      </div>
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

      <div className="sm:hidden divide-y divide-dark-600/40 max-h-[28rem] overflow-y-auto">
        {entries.length === 0 && (
          <div className="px-3 py-6 text-center text-gray-500 italic text-xs">No predictions pushed yet.</div>
        )}
        {entries.map((e) => {
          const game = GAMES.find((g) => g.id === e.game);
          return (
            <div key={e.id} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-gray-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleTimeString()}</span>
                <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase shrink-0">{e.cardCountType}c</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white text-xs font-semibold truncate">{game?.label || e.game}</span>
                <span className="text-accent font-mono text-[10px] truncate ml-2">{e.periodId}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(e.predictedCards || []).map((cid, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-dark-700 text-[10px] font-mono text-gray-200">{formatCard(e.game, cid)}</span>
                ))}
              </div>
              <div>
                {e.telegramPushed ? (
                  <a href={e.telegramPostUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold">
                    <FiCheckCircle className="w-3.5 h-3.5" /> Sent {e.telegramPostUrl && <FiExternalLink className="w-3 h-3" />}
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
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleTimeString()}</td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{game?.label || e.game}</td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-black uppercase">{e.cardCountType}c</span>
                  </td>
                  <td className="px-3 py-2 text-accent font-mono whitespace-nowrap">{e.periodId}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(e.predictedCards || []).map((cid, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-dark-700 text-[10px] font-mono text-gray-200">{formatCard(e.game, cid)}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {e.telegramPushed ? (
                      <a href={e.telegramPostUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold">
                        <FiCheckCircle className="w-3.5 h-3.5" /> Sent {e.telegramPostUrl && <FiExternalLink className="w-3 h-3" />}
                      </a>
                    ) : e.telegramError ? (
                      <span title={e.telegramError} className="inline-flex items-center gap-1 text-red-400 text-[11px] font-bold">
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

  const [schedule, setSchedule] = useState(null);
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSlot, setTestingSlot] = useState(null);

  const [log, setLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const [smmMasterEnabled, setSmmMasterEnabled] = useState(true);
  const [smmMasterSaving, setSmmMasterSaving] = useState(false);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPredictionSchedule();
      const cfg = res.data?.data?.config;
      if (cfg) {
        setSchedule(cfg);
        setOriginal(JSON.stringify(cfg));
      }
    } catch (err) {
      toast.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSmmMaster = useCallback(async () => {
    try {
      const res = await getPredictionSmmMaster();
      setSmmMasterEnabled(!!res.data?.data?.enabled);
    } catch (_) {}
  }, []);

  const loadLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const res = await getPredictionLog(null, null, 50);
      setLog(res.data?.data || []);
    } catch (_) {} finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
    loadSmmMaster();
    loadLog();
    const t = setInterval(loadLog, 15_000);
    return () => clearInterval(t);
  }, [loadSchedule, loadSmmMaster, loadLog]);

  const toggleSmmMaster = async () => {
    const next = !smmMasterEnabled;
    setSmmMasterSaving(true);
    setSmmMasterEnabled(next);
    try {
      const res = await setPredictionSmmMaster(next);
      setSmmMasterEnabled(!!res.data?.data?.enabled);
      toast.success(`SMM master ${next ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setSmmMasterEnabled(!next);
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSmmMasterSaving(false);
    }
  };

  const dirty = useMemo(() => schedule && original !== JSON.stringify(schedule), [schedule, original]);

  const updateField = (patch) => setSchedule((s) => ({ ...s, ...patch }));

  const updateSlot = (index, slot) => {
    setSchedule((s) => {
      const slots = s.slots.slice();
      slots[index] = slot;
      return { ...s, slots };
    });
  };

  const save = async () => {
    if (!schedule) return;
    setSaving(true);
    try {
      const res = await updatePredictionSchedule(schedule);
      const saved = res.data?.data?.config;
      if (saved) {
        setSchedule(saved);
        setOriginal(JSON.stringify(saved));
      }
      toast.success('Schedule saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const testSlot = async (slotIndex) => {
    setTestingSlot(slotIndex);
    try {
      await testPredictionSlot(slotIndex);
      toast.success(`Slot ${slotIndex + 1} queued — check Telegram & Recent Pushes`);
      setTimeout(loadLog, 2000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally {
      setTestingSlot(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <FiTarget className="w-5 h-5 sm:w-6 sm:h-6 text-accent shrink-0" /> Prediction Module
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Daily Telegram broadcast schedule. 7 time slots per day; each slot sends a get-ready notice,
            3 predictions, a trailer, then a batch of payment screenshots 30 minutes later.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 mt-2">
            <span>Schedule: <b className={schedule?.enabled ? 'text-emerald-400' : 'text-gray-500'}>{schedule?.enabled ? 'ON' : 'OFF'}</b></span>
            <span className="text-gray-700">·</span>
            <span>SMM: <b className={smmMasterEnabled ? 'text-emerald-400' : 'text-gray-500'}>{smmMasterEnabled ? 'ON' : 'OFF'}</b></span>
            <span className="hidden sm:inline text-gray-700">·</span>
            <span className="hidden sm:inline">Channel: <code className="text-gray-400">TELEGRAM_WINNERS_CHANNEL_ID</code></span>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={loadSchedule}
          disabled={loading}
          className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm rounded-lg border border-dark-600 disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden xs:inline sm:inline">Reload</span>
        </motion.button>
      </div>

      {/* Master switches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-600 bg-dark-800/50">
          <div className="min-w-0 flex-1">
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${schedule?.enabled ? 'bg-emerald-400 shadow-[0_0_6px_currentColor]' : 'bg-gray-500'}`} />
              <span className="truncate">Schedule Master Switch</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              When OFF, none of the 7 daily slots will fire. Other Telegram traffic is unaffected.
            </p>
          </div>
          <Toggle
            checked={!!schedule?.enabled}
            disabled={!schedule}
            onChange={(v) => updateField({ enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-600 bg-dark-800/50">
          <div className="min-w-0 flex-1">
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${smmMasterEnabled ? 'bg-emerald-400 shadow-[0_0_6px_currentColor]' : 'bg-gray-500'}`} />
              <span className="truncate">SMM Master Switch</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              When OFF, predictions still post but <b>no SMM orders</b> (views/reactions) are placed.
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
      </div>

      {/* Global timing & messages */}
      {schedule && (
        <div className="rounded-xl border border-dark-600 bg-dark-800/50 p-4 space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <FiSend className="w-4 h-4 text-accent" /> Global Slot Behavior
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="Get-Ready Message (HTML allowed)"
              value={schedule.getReadyMessage}
              onChange={(v) => updateField({ getReadyMessage: v })}
              rows={2}
              placeholder="🔔 Get ready — prediction drops in a moment."
            />
            <TextField
              label="Trailer Message (sent after the last payment screenshot)"
              value={schedule.trailerMessage}
              onChange={(v) => updateField({ trailerMessage: v })}
              rows={2}
              placeholder="💰 Don't miss the next round!"
            />
            <NumberField
              label="Get-Ready Lead (seconds)"
              value={schedule.getReadyLeadSeconds}
              onChange={(v) => updateField({ getReadyLeadSeconds: v })}
              min={0} max={3600}
              hint="Wait this long between the get-ready text and the first prediction."
            />
            <NumberField
              label="Extra Buffer Between Predictions (seconds)"
              value={schedule.predictionSpacingSeconds}
              onChange={(v) => updateField({ predictionSpacingSeconds: v })}
              min={0} max={600}
              hint="After a prediction's round completes, wait this long before sending the next prediction. Each pick already waits for its locked game round to finish first."
            />
            <NumberField
              label="Trailer Delay (seconds)"
              value={schedule.trailerDelaySeconds}
              onChange={(v) => updateField({ trailerDelaySeconds: v })}
              min={0} max={600}
              hint="Wait this long after the final payment screenshot before posting the trailer message. Default 5s."
            />
            <NumberField
              label="Winners Screenshots Delay (seconds)"
              value={schedule.winnersDelaySeconds}
              onChange={(v) => updateField({ winnersDelaySeconds: v })}
              min={0} max={21600}
              hint="Default 1800 = 30 min after the prediction batch."
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Winners Min Count"
                value={schedule.winnersMinCount}
                onChange={(v) => updateField({ winnersMinCount: v })}
                min={1} max={50}
              />
              <NumberField
                label="Winners Max Count"
                value={schedule.winnersMaxCount}
                onChange={(v) => updateField({ winnersMaxCount: v })}
                min={1} max={100}
              />
            </div>
          </div>
        </div>
      )}

      {/* Slot grid */}
      {schedule && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-white text-sm uppercase tracking-wider">Daily Time Slots</h2>
            <span className="text-[11px] text-gray-500">{schedule.slots.filter((s) => s.enabled).length} of 7 enabled</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {schedule.slots.map((s, i) => (
              <SlotEditor
                key={i}
                slot={s}
                slotIndex={i}
                onChange={(slot) => updateSlot(i, slot)}
                onTest={testSlot}
                testing={testingSlot === i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Save bar */}
      {schedule && (
        <div className="sticky bottom-2 z-10 flex justify-end">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border shadow-lg transition-all ${
              dirty
                ? 'bg-accent text-dark-900 border-accent/60 hover:brightness-110'
                : 'bg-dark-700 text-gray-500 border-dark-600 cursor-not-allowed'
            }`}
          >
            <FiSave className="w-4 h-4" />
            {saving ? 'Saving…' : dirty ? 'Save Schedule' : 'Saved'}
          </button>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl bg-dark-800/60 border border-dark-600 p-4 text-xs text-gray-400 leading-relaxed">
        <div className="flex items-center gap-2 mb-2">
          <FiSend className="w-4 h-4 text-accent" />
          <h3 className="text-white font-bold text-sm">How the schedule works</h3>
        </div>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>Each of the 7 time slots fires at its configured hour (server timezone).</li>
          <li>When a slot fires, the get-ready text posts first.</li>
          <li>After <code className="text-gray-300">getReadyLeadSeconds</code>, the 3 picks post one after another, each with the per-pick caption, spaced <code className="text-gray-300">predictionSpacingSeconds</code> apart.</li>
          <li><code className="text-gray-300">winnersDelaySeconds</code> after the last prediction (default 30 min), 10–15 payment screenshots are pushed (synthetic winners), and rows land in <code>daily_winners</code> so the social-proof feed shows them too.</li>
          <li>The trailer text posts last — right after the final payment screenshot.</li>
          <li>Use the per-slot <b>Test</b> button to run a slot immediately, regardless of the clock.</li>
        </ol>
      </div>

      <PredictionLog entries={log} loading={loadingLog} onRefresh={loadLog} />
    </div>
  );
}

export default AdminPrediction;
