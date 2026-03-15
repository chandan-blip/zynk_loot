import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiChevronDown, FiCheckCircle, FiFilter } from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import { getDrawHistory } from '../services/api';
import PageHeader from '../components/PageHeader';

function History() {
  const [draws, setDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showFilter, setShowFilter] = useState(false);

  const filterOptions = ['All', 'Completed'];

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await getDrawHistory(50);
        setDraws(response.data.data || []);
      } catch (error) {
        console.error('Failed to fetch draw history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const filteredDraws = draws.filter((item) => {
    if (filter === 'Completed') return item.status === 'completed';
    return true;
  });

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
                  className="grid grid-cols-12 gap-2 md:gap-4 px-3 sm:px-6 py-4 hover:bg-dark-700/30 transition-colors items-center"
                >
                  {/* Period */}
                  <div className="col-span-4 md:col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-dark-700/50 flex items-center justify-center border border-dark-400/30">
                        <GiTrophy className="w-4 h-4 text-accent" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-white">
                          #{item.period_id || item.id}
                        </p>
                        <p className="text-xs text-gray-500 md:hidden">{formatDate(item.draw_date)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Date - Desktop only */}
                  <div className="hidden md:block md:col-span-3">
                    <p className="text-white text-sm">{formatDate(item.draw_date)}</p>
                    <p className="text-xs text-gray-500">
                      {item.status === 'completed' ? 'Completed' : item.status}
                    </p>
                  </div>

                  {/* Winning Number */}
                  <div className="col-span-4 md:col-span-3 text-center">
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
                  <div className="col-span-4 md:col-span-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <GiTwoCoins className="w-4 h-4 text-accent" />
                      <span className="text-accent font-bold text-sm sm:text-base">
                        {parseFloat(item.total_pool || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default History;
