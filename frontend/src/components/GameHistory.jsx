import { useState, useEffect, useRef } from 'react';
import { FiClock, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { getGameHistory } from '../services/api';

const PER_PAGE = 5;

function GameHistory({ gameType, title, renderItem, refreshKey }) {
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const containerRef = useRef(null);

  const loadHistory = async (p = page) => {
    setLoading(true);
    try {
      const res = await getGameHistory(p, PER_PAGE, gameType);
      const data = res.data.data;
      setHistory(data?.bets || []);
      setTotalPages(data?.totalPages || 1);
    } catch (err) {
      // Silently fail
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  useEffect(() => { loadHistory(page); }, [page]);

  // Reset to page 1 on refresh (after a new game)
  useEffect(() => {
    if (refreshKey > 0) {
      setPage(1);
      loadHistory(1);
    }
  }, [refreshKey]);

  const handlePrev = () => { if (page > 1) setPage(p => p - 1); };
  const handleNext = () => { if (page < totalPages) setPage(p => p + 1); };

  if (history.length === 0 && !loading && !initialLoad) return null;

  return (
    <div ref={containerRef} className="rounded-xl bg-dark-700/30 border border-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiClock className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-600 mr-1">{page}/{totalPages}</span>
            <button
              onClick={handlePrev}
              disabled={page <= 1 || loading}
              className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <FiChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleNext}
              disabled={page >= totalPages || loading}
              className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Keep old data visible with opacity fade while loading — no layout shift */}
      <div className={`divide-y divide-white/5 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
        {history.map((bet) => renderItem(bet))}
      </div>
    </div>
  );
}

export default GameHistory;
