import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiRefreshCw,
  FiTrash2,
  FiExternalLink,
  FiSearch,
  FiClock,
  FiCheck,
  FiAlertTriangle,
  FiPlay,
  FiList,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getAdminSmmQueue,
  getAdminSmmQueueStats,
  retryAdminSmmQueueRow,
  deleteAdminSmmQueueRow,
  clearDoneAdminSmmQueue,
  getSmmWebhookMaster,
  setSmmWebhookMaster,
  getSmmWebhookConfig,
  saveSmmWebhookConfig,
} from '../../services/api';

const STATUS_META = {
  pending:    { label: 'Pending',    bg: 'bg-yellow-500/15',  fg: 'text-yellow-300',  border: 'border-yellow-500/30',  Icon: FiClock },
  processing: { label: 'Processing', bg: 'bg-blue-500/15',    fg: 'text-blue-300',    border: 'border-blue-500/30',    Icon: FiPlay },
  done:       { label: 'Done',       bg: 'bg-emerald-500/15', fg: 'text-emerald-300', border: 'border-emerald-500/30', Icon: FiCheck },
  failed:     { label: 'Failed',     bg: 'bg-red-500/15',     fg: 'text-red-300',     border: 'border-red-500/30',     Icon: FiAlertTriangle },
};

// Derive a human "source" tag from the queue row's context_label so webhook
// orders (and the app's own posts) are distinguishable in the log.
function sourceMeta(ctx) {
  const c = String(ctx || '');
  if (c.startsWith('webhook')) return { label: 'Webhook',    cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
  if (c.startsWith('pred'))    return { label: 'Prediction', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
  if (c.startsWith('winners')) return { label: 'Winners',    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  return { label: 'Other', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/30' };
}

function StatCard({ label, value, tone, Icon }) {
  return (
    <div className={`p-4 rounded-xl bg-dark-800 border ${tone.border}`}>
      <div className={`w-10 h-10 rounded-lg ${tone.bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-5 h-5 ${tone.fg}`} />
      </div>
      <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone.fg}`}>{Number(value || 0).toLocaleString()}</p>
    </div>
  );
}

function formatDateTime(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function truncate(s, n = 60) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function AdminSmmQueue() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ pending: 0, processing: 0, done: 0, failed: 0, placed24h: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [contextSearch, setContextSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookCfg, setWebhookCfg] = useState({
    viewsEnabled: true, viewsQuantity: 1000,
    reactionsEnabled: true, reactionsQuantity: 100,
  });
  const [webhookCfgSaving, setWebhookCfgSaving] = useState(false);

  const fetchRows = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await getAdminSmmQueue({
        page: opts.page ?? page,
        limit: 50,
        status: opts.status ?? status,
        context: opts.context ?? contextSearch,
      });
      const d = res.data.data || {};
      setRows(d.rows || []);
      setTotalPages(d.totalPages || 1);
      setTotal(d.total || 0);
      setPage(d.page || 1);
    } catch (err) {
      toast.error('Failed to load SMM queue');
    } finally {
      setLoading(false);
    }
  }, [page, status, contextSearch]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await getAdminSmmQueueStats();
      setStats(res.data.data || stats);
    } catch (_) { /* swallow */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWebhookMaster = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([getSmmWebhookMaster(), getSmmWebhookConfig()]);
      setWebhookEnabled(!!m.data?.data?.enabled);
      if (c.data?.data?.config) setWebhookCfg((prev) => ({ ...prev, ...c.data.data.config }));
    } catch (_) { /* swallow */ }
  }, []);

  // Initial + periodic refresh — queue moves fast, so poll every 5s while
  // page is open.
  useEffect(() => {
    fetchRows({ page: 1 });
    fetchStats();
    fetchWebhookMaster();
    const t = setInterval(() => {
      fetchRows();
      fetchStats();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWebhookMaster = async () => {
    const next = !webhookEnabled;
    setWebhookSaving(true);
    setWebhookEnabled(next);
    try {
      const res = await setSmmWebhookMaster(next);
      setWebhookEnabled(!!res.data?.data?.enabled);
      toast.success(`Webhook SMM ${next ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setWebhookEnabled(!next);
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setWebhookSaving(false);
    }
  };

  const saveWebhookCfg = async () => {
    setWebhookCfgSaving(true);
    try {
      const res = await saveSmmWebhookConfig(webhookCfg);
      if (res.data?.data?.config) setWebhookCfg(res.data.data.config);
      toast.success('Webhook views/reactions saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setWebhookCfgSaving(false);
    }
  };

  const handleFilterChange = (newStatus) => {
    setStatus(newStatus);
    fetchRows({ status: newStatus, page: 1 });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchRows({ context: contextSearch, page: 1 });
  };

  const handleRetry = async (id) => {
    setBusy(id);
    try {
      await retryAdminSmmQueueRow(id);
      toast.success(`Row #${id} queued for retry`);
      fetchRows();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete row #${id}?`)) return;
    setBusy(id);
    try {
      await deleteAdminSmmQueueRow(id);
      toast.success(`Row #${id} deleted`);
      fetchRows();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const handleClearDone = async () => {
    if (!window.confirm('Delete all done + failed rows?')) return;
    try {
      const res = await clearDoneAdminSmmQueue();
      toast.success(`Cleared ${res.data.data?.deleted || 0} rows`);
      fetchRows();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Clear failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">SMM Queue</h1>
          <p className="text-gray-500 text-sm">
            Async order pipeline — worker drains pending rows every 10–20s.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { fetchRows(); fetchStats(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm transition-colors border border-dark-500"
          >
            <FiRefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleClearDone}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm transition-colors border border-red-500/30"
          >
            <FiTrash2 className="w-4 h-4" />
            Clear done/failed
          </button>
        </div>
      </div>

      {/* Webhook SMM master switch — gates orders on posts made directly on
          the channel (detected via the Telegram webhook), independent of the
          app's own auto-posts. */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-600 bg-dark-800/50">
        <div className="min-w-0 flex-1">
          <div className="text-white font-bold text-sm flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${webhookEnabled ? 'bg-emerald-400 shadow-[0_0_6px_currentColor]' : 'bg-gray-500'}`} />
            <span className="truncate">Webhook SMM Master Switch</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            When ON, posts made directly on the channel (not sent from this app) get <b>views/reactions</b> orders automatically. When OFF, only the app's own posts are ordered.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleWebhookMaster}
          disabled={webhookSaving}
          className={`shrink-0 relative inline-flex h-6 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
            webhookEnabled ? 'bg-emerald-500' : 'bg-dark-600'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              webhookEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Webhook views/reactions config — applies to webhook posts only.
          Service IDs + API credentials come from the global SMM panel config. */}
      <div className={`rounded-xl border border-dark-600 bg-dark-800/50 p-3 space-y-3 transition-opacity ${webhookEnabled ? '' : 'opacity-60'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-white font-bold text-sm">Webhook Views &amp; Reactions</div>
          <button
            type="button"
            onClick={saveWebhookCfg}
            disabled={webhookCfgSaving}
            className="px-3 py-1.5 rounded-lg bg-accent text-dark-900 text-xs font-bold disabled:opacity-50 hover:opacity-90"
          >
            {webhookCfgSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: 'Views', enKey: 'viewsEnabled', qtyKey: 'viewsQuantity' },
            { key: 'Reactions', enKey: 'reactionsEnabled', qtyKey: 'reactionsQuantity' },
          ].map(({ key, enKey, qtyKey }) => (
            <div key={key} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dark-600 bg-dark-900/40">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWebhookCfg((c) => ({ ...c, [enKey]: !c[enKey] }))}
                  className={`shrink-0 relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${
                    webhookCfg[enKey] ? 'bg-emerald-500' : 'bg-dark-600'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    webhookCfg[enKey] ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-gray-200 font-semibold">{key}</span>
              </div>
              <input
                type="number"
                min="0"
                value={webhookCfg[qtyKey]}
                onChange={(e) => setWebhookCfg((c) => ({ ...c, [qtyKey]: e.target.value }))}
                disabled={!webhookCfg[enKey]}
                className="input-premium w-24 text-sm py-1.5 px-2 text-right disabled:opacity-40"
                placeholder="qty"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 leading-snug">
          Quantity = units ordered per detected post. Service IDs and API key come from the global SMM panel settings.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <StatCard label="Pending"    value={stats.pending}    tone={STATUS_META.pending}    Icon={FiClock} />
        <StatCard label="Processing" value={stats.processing} tone={STATUS_META.processing} Icon={FiPlay} />
        <StatCard label="Done"       value={stats.done}       tone={STATUS_META.done}       Icon={FiCheck} />
        <StatCard label="Failed"     value={stats.failed}     tone={STATUS_META.failed}     Icon={FiAlertTriangle} />
        <StatCard label="Placed 24h" value={stats.placed24h}
          tone={{ bg: 'bg-accent/15', fg: 'text-accent', border: 'border-accent/30' }} Icon={FiList} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center bg-dark-800 border border-dark-600 rounded-xl p-3">
        <div className="flex gap-1 p-1 rounded-lg bg-dark-700 overflow-x-auto">
          {[
            { value: '',           label: 'All' },
            { value: 'pending',    label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'done',       label: 'Done' },
            { value: 'failed',     label: 'Failed' },
          ].map((opt) => (
            <button
              key={opt.value || 'all'}
              onClick={() => handleFilterChange(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                status === opt.value
                  ? 'bg-accent text-dark-900'
                  : 'text-gray-400 hover:text-white hover:bg-dark-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={contextSearch}
              onChange={(e) => setContextSearch(e.target.value)}
              placeholder="Filter by context (e.g. hype, winners-screenshot)"
              className="input-premium w-full text-sm py-2 pl-9 pr-3"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm transition-colors border border-dark-500"
          >
            Search
          </button>
        </form>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {total.toLocaleString()} rows
        </span>
      </div>

      {/* Table */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Context</th>
                <th className="px-4 py-3">Post</th>
                <th className="px-4 py-3 text-right">Attempts</th>
                <th className="px-4 py-3 text-right">Placed</th>
                <th className="px-4 py-3">Order IDs</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Processed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="inline-block w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-gray-500">
                    No rows match your filter.
                  </td>
                </tr>
              ) : rows.map((r, i) => {
                const meta = STATUS_META[r.status] || STATUS_META.pending;
                const Icon = meta.Icon;
                return (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className="border-b border-dark-700/60 hover:bg-dark-700/30"
                  >
                    <td className="px-4 py-3 text-gray-300 font-mono">#{r.id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${meta.bg} ${meta.fg} ${meta.border}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const s = sourceMeta(r.context_label);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.cls}`}>
                              {s.label}
                            </span>
                            <span className="text-gray-400 font-mono text-[11px]">{r.context_label}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {r.post_url ? (
                        <a
                          href={r.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                          title={r.post_url}
                        >
                          {truncate(r.post_url, 45)}
                          <FiExternalLink className="w-3 h-3" />
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{r.attempts}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={r.placed > 0 ? 'text-emerald-400 font-semibold' : 'text-gray-500'}>
                        {r.placed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400 font-mono">
                      {r.views_order_id && <div>views: {r.views_order_id}</div>}
                      {r.reactions_order_id && <div>react: {r.reactions_order_id}</div>}
                      {!r.views_order_id && !r.reactions_order_id && '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(r.processed_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {(r.status === 'failed' || r.status === 'done') && (
                          <button
                            onClick={() => handleRetry(r.id)}
                            disabled={busy === r.id}
                            className="p-1.5 rounded text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                            title="Retry"
                          >
                            <FiRefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={busy === r.id}
                          className="p-1.5 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Inline error display (last error per row, expandable section) */}
        {rows.some(r => r.last_error) && (
          <details className="border-t border-dark-600 p-3 text-xs text-gray-400">
            <summary className="cursor-pointer text-gray-300 font-semibold">
              Last errors on this page ({rows.filter(r => r.last_error).length})
            </summary>
            <div className="mt-2 space-y-1 font-mono">
              {rows.filter(r => r.last_error).map(r => (
                <div key={r.id} className="text-red-400">
                  <span className="text-gray-500">#{r.id}</span> {r.last_error}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-dark-600">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchRows({ page: Math.max(1, page - 1) })}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-dark-700 text-gray-300 disabled:opacity-40 hover:bg-dark-600"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchRows({ page: Math.min(totalPages, page + 1) })}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-dark-700 text-gray-300 disabled:opacity-40 hover:bg-dark-600"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSmmQueue;
