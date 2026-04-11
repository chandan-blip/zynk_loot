import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiPlay, FiRefreshCw, FiChevronDown, FiChevronRight, FiSend, FiClock, FiAlertCircle, FiCheckCircle, FiSave, FiEye, FiRotateCcw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getAdminDailyWinners,
  getAdminDailyWinnersByDraw,
  triggerDailyWinners,
  getDailyWinnersTemplate,
  saveDailyWinnersTemplate,
  previewDailyWinnersTemplate,
} from '../../services/api';

function CaptionTemplateEditor() {
  const [template, setTemplate] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getDailyWinnersTemplate();
      if (res.data.success) {
        setTemplate(res.data.data.template || '');
        setDefaultTemplate(res.data.data.defaultTemplate || '');
        setVariables(res.data.data.variables || []);
      }
    } catch (err) {
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDailyWinnersTemplate(template);
      toast.success('Template saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await previewDailyWinnersTemplate(template);
      if (res.data.success) {
        setPreview(res.data.data.caption);
      }
    } catch (err) {
      toast.error('Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleResetToDefault = () => {
    setTemplate(defaultTemplate);
    toast.success('Reset to default (not saved yet)');
  };

  const insertVariable = (name) => {
    const token = `{{${name}}}`;
    const ta = textareaRef.current;
    if (!ta) {
      setTemplate(t => t + token);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + token.length;
    }, 0);
  };

  if (loading) {
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
        <div className="text-gray-500">Loading template…</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-white">Telegram Caption Template</h2>
          <p className="text-xs text-gray-500 mt-1">
            HTML allowed (Telegram HTML parse mode). Max 1024 characters. Click a variable below to insert it.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1 px-3 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm rounded-lg border border-dark-600"
          >
            <FiRotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="flex items-center gap-1 px-3 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm rounded-lg border border-dark-600 disabled:opacity-50"
          >
            <FiEye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-2 bg-accent hover:bg-accent/90 text-dark-900 text-sm font-bold rounded-lg disabled:opacity-50"
          >
            <FiSave className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Variable chips */}
      <div>
        <div className="text-xs text-gray-500 uppercase mb-2">Available Variables</div>
        <div className="flex flex-wrap gap-2">
          {variables.map(v => (
            <button
              key={v.name}
              onClick={() => insertVariable(v.name)}
              title={v.description}
              className="px-2 py-1 bg-dark-700 hover:bg-accent/20 hover:border-accent border border-dark-600 rounded text-xs font-mono text-accent transition-colors"
            >
              {`{{${v.name}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <div>
        <textarea
          ref={textareaRef}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={8}
          maxLength={1024}
          className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-white font-mono text-sm focus:border-accent outline-none resize-y"
          placeholder="🎉 Today's Winners — Draw #{{periodId}}..."
        />
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>Tip: click variable chips to insert at cursor position</span>
          <span>{template.length} / 1024</span>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div>
          <div className="text-xs text-gray-500 uppercase mb-2">Preview (sample data)</div>
          <div
            className="bg-black/60 border border-dark-600 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      )}
    </div>
  );
}

function LogViewer({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!logs || logs.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic p-4">
        No logs yet. Click "Trigger Run" to generate winners and broadcast to Telegram.
      </div>
    );
  }

  const levelColor = {
    info: 'text-gray-300',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className="bg-black/60 rounded-lg p-4 font-mono text-xs max-h-96 overflow-y-auto border border-dark-600">
      {logs.map((l, i) => (
        <div key={i} className="flex gap-3 py-0.5">
          <span className="text-gray-600 shrink-0">
            {new Date(l.ts).toLocaleTimeString('en-US', { hour12: false })}
          </span>
          <span className={`shrink-0 uppercase font-bold ${levelColor[l.level] || 'text-gray-400'}`}>
            [{l.level}]
          </span>
          <span className={`${levelColor[l.level] || 'text-gray-300'} break-all`}>{l.msg}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function DrawRow({ group, onExpand, expanded, rows, loadingRows }) {
  const totalPayout = Number(group.total_payout || 0);
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg overflow-hidden">
      <button
        onClick={() => onExpand(group.draw_id)}
        className="w-full flex items-center justify-between p-4 hover:bg-dark-700 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <FiChevronDown className="w-5 h-5 text-accent" />
          ) : (
            <FiChevronRight className="w-5 h-5 text-gray-500" />
          )}
          <div>
            <div className="font-bold text-white">Draw #{group.period_id || group.draw_id}</div>
            <div className="text-xs text-gray-500">
              {group.generated_at && new Date(group.generated_at).toLocaleString()}
              {group.winning_number ? ` · winning: ${group.winning_number}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-gray-500">Winners</div>
            <div className="font-bold text-white">{group.winners_count}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Total Payout</div>
            <div className="font-bold text-emerald-400">
              ₹{totalPayout.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-dark-600 p-4 bg-dark-900/50">
          {loadingRows ? (
            <div className="text-gray-500 text-sm">Loading rows…</div>
          ) : !rows || rows.length === 0 ? (
            <div className="text-gray-500 text-sm">No rows.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-dark-600">
                    <th className="pb-2">#</th>
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Platform</th>
                    <th className="pb-2">Ref</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const data = r.json_data || {};
                    const txnRef = data.utr || data.txnId || data.refId || data.orderId || '—';
                    return (
                      <tr key={r.id} className="border-b border-dark-700/50">
                        <td className="py-2 text-gray-500">{i + 1}</td>
                        <td className="py-2 text-white font-medium">{r.name}</td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded bg-dark-600 text-xs uppercase font-bold text-accent">
                            {data.platform || '—'}
                          </span>
                        </td>
                        <td className="py-2 text-gray-400 font-mono text-xs">{txnRef}</td>
                        <td className="py-2 text-right text-emerald-400 font-bold">
                          ₹{Number(r.amount).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminDailyWinners() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [expandedDrawId, setExpandedDrawId] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [loadingDrawId, setLoadingDrawId] = useState(null);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await getAdminDailyWinners(30);
      if (res.data.success) {
        setGroups(res.data.data || []);
      }
    } catch (err) {
      toast.error('Failed to load daily winners');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    setLastResult(null);
    const toastId = toast.loading('Triggering daily winners service…');
    try {
      const res = await triggerDailyWinners();
      const result = res.data.result || {};
      setLastResult(result);
      if (res.data.success) {
        toast.success(
          `Broadcast sent · ${result.winnersCount} winners · ${result.durationMs}ms`,
          { id: toastId }
        );
        loadGroups();
      } else {
        toast.error(`Failed: ${res.data.message}`, { id: toastId });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      setLastResult(err.response?.data?.result || {
        logs: [{ ts: new Date().toISOString(), level: 'error', msg: errorMsg }],
      });
      toast.error(`Trigger failed: ${errorMsg}`, { id: toastId });
    } finally {
      setTriggering(false);
    }
  };

  const handleExpand = async (drawId) => {
    if (expandedDrawId === drawId) {
      setExpandedDrawId(null);
      return;
    }
    setExpandedDrawId(drawId);
    if (!expandedRows[drawId]) {
      setLoadingDrawId(drawId);
      try {
        const res = await getAdminDailyWinnersByDraw(drawId);
        if (res.data.success) {
          setExpandedRows(prev => ({ ...prev, [drawId]: res.data.data }));
        }
      } catch (err) {
        toast.error('Failed to load draw rows');
        console.error(err);
      } finally {
        setLoadingDrawId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Winners</h1>
          <p className="text-sm text-gray-500 mt-1">
            Synthetic display winners shown on /api/lottery/winners and broadcast to Telegram as a PNG card.
          </p>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={loadGroups}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg border border-dark-600 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleTrigger}
            disabled={triggering}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-dark-900 font-bold rounded-lg disabled:opacity-50"
          >
            <FiPlay className={`w-4 h-4 ${triggering ? 'animate-pulse' : ''}`} />
            {triggering ? 'Running…' : 'Trigger Run'}
          </motion.button>
        </div>
      </div>

      {/* Caption template editor */}
      <CaptionTemplateEditor />

      {/* Last run summary */}
      {lastResult && (
        <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            {lastResult.success ? (
              <FiCheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <FiAlertCircle className="w-5 h-5 text-red-400" />
            )}
            <h2 className="font-bold text-white">
              Last Run {lastResult.success ? '— Success' : '— Failed'}
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 uppercase">Draw</div>
              <div className="text-white font-bold">{lastResult.periodId || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Winners</div>
              <div className="text-white font-bold">{lastResult.winnersCount ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                <FiClock className="w-3 h-3" /> Duration
              </div>
              <div className="text-white font-bold">{lastResult.durationMs ?? 0}ms</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                <FiSend className="w-3 h-3" /> Telegram
              </div>
              <div className="text-white font-bold">
                {lastResult.telegram?.skipped
                  ? 'Skipped'
                  : lastResult.telegram
                  ? 'Sent'
                  : lastResult.success
                  ? 'OK'
                  : 'Failed'}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase mb-2">Execution Logs</div>
            <LogViewer logs={lastResult.logs} />
          </div>
        </div>
      )}

      {/* Past runs list */}
      <div>
        <h2 className="font-bold text-white mb-3">Past Runs</h2>
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-gray-500 bg-dark-800 border border-dark-600 rounded-lg p-8 text-center">
            No daily winner runs yet. Trigger one to populate.
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(g => (
              <DrawRow
                key={g.draw_id}
                group={g}
                expanded={expandedDrawId === g.draw_id}
                rows={expandedRows[g.draw_id]}
                loadingRows={loadingDrawId === g.draw_id}
                onExpand={handleExpand}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDailyWinners;
