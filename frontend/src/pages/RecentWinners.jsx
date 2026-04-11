import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight, FiArrowLeft } from 'react-icons/fi';
import { GiPodium, GiTrophy } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import { getRecentWinners } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';

const PAGE_SIZE = 20;

const PLATFORM_GRADIENTS = {
  phonepe: 'from-purple-500 to-purple-700',
  gpay: 'from-blue-500 to-green-500',
  paytm: 'from-sky-400 to-blue-600',
  fampay: 'from-yellow-400 to-orange-500',
  mobikwik: 'from-emerald-400 to-teal-600',
  amazonpay: 'from-yellow-400 to-amber-600',
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RecentWinners() {
  usePageTitle('Winners');
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getRecentWinners(PAGE_SIZE, page);
        if (cancelled) return;
        if (res.data.success) {
          setWinners(res.data.data || []);
          const p = res.data.pagination || {};
          setTotalPages(p.totalPages || 1);
          setTotal(p.total || 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [page]);

  const totalPayout = winners.reduce((s, w) => s + Number(w.amount || 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-accent transition-colors text-sm">
        <FiArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-700 via-dark-800 to-dark-900 border border-accent/20 p-6"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/5 border border-accent/30 flex items-center justify-center">
            <GiPodium className="w-8 h-8 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">All Winners</h1>
            <p className="text-gray-400 text-sm mt-1">Every payout, page by page</p>
          </div>
          <div className="flex gap-3">
            <div className="px-4 py-2 rounded-xl bg-dark-800/60 border border-dark-600">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Winners</div>
              <div className="text-white font-bold text-lg">{total.toLocaleString('en-IN')}</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-dark-800/60 border border-emerald-500/30">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Page Payout</div>
              <div className="text-emerald-400 font-bold text-lg">₹{totalPayout.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* List */}
      <div className="rounded-2xl bg-dark-700 border border-dark-600 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-3">Loading winners…</p>
          </div>
        ) : winners.length === 0 ? (
          <div className="p-12 text-center">
            <GiTrophy className="w-14 h-14 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No winners on this page</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-600">
            {winners.map((winner, index) => {
              const platform = (winner.platform || '').toLowerCase();
              const gradient = PLATFORM_GRADIENTS[platform] || 'from-accent to-accent/50';
              const initial = (winner.name?.[0] || 'W').toUpperCase();
              const rankOnPage = (page - 1) * PAGE_SIZE + index + 1;
              const ref = winner.data?.utr || winner.data?.txnId || '';
              return (
                <motion.div
                  key={winner.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="flex items-center gap-4 p-4 hover:bg-dark-800/40 transition-colors"
                >
                  <div className="text-xs font-mono text-gray-600 w-8 shrink-0 text-right">#{rankOnPage}</div>
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold shadow-lg shrink-0`}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold">{winner.name}</span>
                      {platform && (
                        <span className={`px-2 py-0.5 rounded bg-gradient-to-r ${gradient} text-white text-[10px] font-bold uppercase tracking-wide`}>
                          {platform}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span>{formatTimeAgo(winner.createdAt)}</span>
                      {ref && (
                        <>
                          <span>·</span>
                          <span className="font-mono truncate">Ref: {ref}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-400 text-lg leading-tight">
                      ₹{Number(winner.amount).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide">received</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-600 bg-dark-800/40">
            <div className="text-xs text-gray-500">
              Page <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiChevronLeft className="w-4 h-4" /> Prev
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
                  let p;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                        p === page
                          ? 'bg-accent text-dark-900'
                          : 'bg-dark-700 hover:bg-dark-600 text-gray-300 border border-dark-600'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RecentWinners;
