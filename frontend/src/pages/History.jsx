import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiChevronDown, FiChevronLeft, FiChevronRight, FiCheckCircle, FiFilter } from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import { getDrawHistory } from '../services/api';
import PageHeader from '../components/PageHeader';

const PAGE_SIZE = 10;

function History() {
  const [draws, setDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const filterOptions = ['All', 'Completed'];

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await getDrawHistory(page, PAGE_SIZE);
        setDraws(response.data.data || []);
        const p = response.data.pagination || {};
        setTotalPages(p.totalPages || 1);
      } catch (error) {
        console.error('Failed to fetch draw history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [page]);

  // The backend already returns only completed draws, so the filter is purely
  // a UX affordance; both options resolve to the same dataset for now.
  const filteredDraws = filter === 'Completed'
    ? draws.filter((item) => item.status === 'completed')
    : draws;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-3">
      <PageHeader icon={FiClock} title="Draw History" description="Past draws and results">
        {/* Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilter(!showFilter)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-dark-700/50 border border-dark-400/50 text-white hover:bg-dark-700 transition-colors w-full sm:w-auto justify-between sm:justify-start"
          >
            <FiFilter className="w-4 h-4" />
            <span className="text-sm font-medium">{filter}</span>
            <FiChevronDown className={`w-4 h-4 transition-transform ${showFilter ? 'rotate-180' : ''}`} />
          </button>
          {showFilter && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 mt-2 w-full sm:w-40 rounded-lg bg-dark-800 border border-dark-400/50 shadow-xl z-10 overflow-hidden"
            >
              {filterOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setFilter(opt); setShowFilter(false); }}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-dark-700 transition-colors ${
                    filter === opt ? 'text-accent bg-accent/10' : 'text-gray-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </PageHeader>

      {/* History List */}
      <div className="bg-dark-800/50 rounded-lg border border-dark-400/30 overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-dark-700/30 border-b border-dark-400/30 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="col-span-3">Period</div>
          <div className="col-span-3">Date</div>
          <div className="col-span-3 text-center">Winning Number</div>
          <div className="col-span-3 text-right">Pool</div>
        </div>

        {/* List */}
        <AnimatePresence>
          {filteredDraws.length === 0 ? (
            <div className="p-12 text-center">
              <FiClock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No draw history found</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-400/20">
              {filteredDraws.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-4 px-3 sm:px-6 py-4 hover:bg-dark-700/30 transition-colors md:items-center"
                >
                  {/* Top row (mobile): Period + Date */}
                  <div className="flex items-center justify-between md:contents">
                    {/* Period */}
                    <div className="md:col-span-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-dark-700/50 flex items-center justify-center border border-dark-400/30">
                          <GiTrophy className="w-4 h-4 text-accent" />
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-white">
                          #{item.period_id || item.id}
                        </p>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="md:col-span-3">
                      <p className="text-white text-xs sm:text-sm">{formatDate(item.draw_date)}</p>
                      <p className="text-xs text-gray-500 text-right md:text-left">
                        {item.status === 'completed' ? 'Completed' : item.status}
                      </p>
                    </div>
                  </div>

                  {/* Bottom row (mobile): Winning Number + Pool */}
                  <div className="flex items-center justify-between md:contents">
                    {/* Winning Number */}
                    <div className="md:col-span-3 md:text-center">
                      <div className="inline-flex items-center gap-1">
                        {item.winning_number.split('').map((digit, idx) => (
                          <span
                            key={idx}
                            className="w-6 h-7 sm:w-7 sm:h-8 rounded bg-accent/20 text-accent font-mono font-bold text-sm sm:text-base flex items-center justify-center"
                          >
                            {digit}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Pool */}
                    <div className="md:col-span-3 md:text-right">
                      <div className="flex items-center justify-end gap-1">
                        <GiTwoCoins className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-accent font-bold text-sm sm:text-base">
                          {parseFloat(item.total_pool || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-t border-dark-400/30 bg-dark-800/40">
            <div className="text-xs text-gray-500 text-center sm:text-left">
              Page <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                aria-label="Previous page"
              >
                <FiChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Prev</span>
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let p;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-sm font-bold transition-colors shrink-0 ${
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
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span> <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default History;
