import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiAward, FiTrendingUp, FiDollarSign, FiUsers } from 'react-icons/fi';
import { GiTrophy } from 'react-icons/gi';
import toast from 'react-hot-toast';
import CountUp from 'react-countup';
import { getAdminWinners } from '../../services/api';

function AdminWinners() {
  const [winners, setWinners] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    fetchWinners();
  }, [page]);

  const fetchWinners = async () => {
    setLoading(true);
    try {
      const response = await getAdminWinners(page, 20);
      setWinners(response.data.data.winners);
      setStats(response.data.data.stats);
      setPagination(response.data.data.pagination);
    } catch (error) {
      toast.error('Failed to load winners');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredWinners = winners.filter(winner =>
    winner.username.toLowerCase().includes(search.toLowerCase()) ||
    winner.number.includes(search) ||
    winner.period_id?.includes(search)
  );

  const getMatchBadgeColor = (digits) => {
    if (digits === 7) return 'bg-gold/20 text-gold-light border-gold/30'; // Exact match - 40%
    if (digits === 6) return 'bg-purple/20 text-purple-light border-purple/30'; // Near match - share 10%
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Winners Management</h1>
        <p className="text-gray-500">View all lottery winners and prize distributions</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Winners', value: stats.totalWinners, icon: FiUsers, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Total Prizes Paid', value: stats.totalPrizesPaid, icon: FiDollarSign, color: 'text-accent', bg: 'bg-accent/10', suffix: ' Z' },
            { label: 'Jackpot Winners', value: stats.jackpotWinners, icon: GiTrophy, color: 'text-gold-light', bg: 'bg-gold/10' },
            { label: 'Biggest Prize', value: stats.biggestPrize, icon: FiTrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', suffix: ' Z' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-dark-800 border border-dark-600 rounded-xl p-5"
            >
              <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold text-white">
                <CountUp end={stat.value} duration={2} separator="," suffix={stat.suffix || ''} />
              </div>
              <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username, number, or period..."
          className="input-premium w-full pl-12"
        />
      </div>

      {/* Winners Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredWinners.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="bg-dark-700">
                <tr>
                  <th>Winner</th>
                  <th className="hidden sm:table-cell">Number</th>
                  <th className="text-center">Matched</th>
                  <th className="hidden lg:table-cell">Winning</th>
                  <th className="text-right">Prize</th>
                  <th className="hidden md:table-cell">Period</th>
                  <th className="hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-400">
                {filteredWinners.map((winner, i) => (
                  <motion.tr
                    key={winner.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className={`hover:bg-dark-700 transition-colors ${winner.matching_digits === 7 ? 'bg-gold/5' : ''}`}
                  >
                    <td>
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                          winner.matching_digits === 7 ? 'bg-gold/20 text-gold-light' : 'bg-accent text-dark-900'
                        }`}>
                          {winner.matching_digits === 7 ? (
                            <GiTrophy className="w-4 h-4 lg:w-5 lg:h-5" />
                          ) : (
                            winner.username[0].toUpperCase()
                          )}
                        </div>
                        <div>
                          <span className="font-medium text-white text-sm lg:text-base">{winner.username}</span>
                          {winner.matching_digits === 7 && (
                            <span className="ml-1 lg:ml-2 px-1.5 py-0.5 rounded-full bg-gold/20 text-gold-light text-[10px] font-bold">
                              JACKPOT
                            </span>
                          )}
                          <p className="text-xs text-gray-500 hidden sm:block">{winner.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="font-mono text-white bg-dark-700 px-2 py-1 rounded-lg text-xs lg:text-sm">
                        {winner.number.split('').join(' ')}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={`px-2 py-1 rounded-full border text-xs lg:text-sm font-semibold ${getMatchBadgeColor(winner.matching_digits)}`}>
                        {winner.matching_digits}/7
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      <span className="font-mono text-gray-400 text-sm">
                        {winner.winning_number?.split('').join(' ') || '-'}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className={`font-bold text-sm lg:text-base ${winner.matching_digits === 7 ? 'text-gold-light' : 'text-accent'}`}>
                        +{parseFloat(winner.prize_amount).toLocaleString()} Z
                      </span>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="text-gray-400 text-xs lg:text-sm">#{winner.period_id}</span>
                    </td>
                    <td className="text-gray-400 text-xs lg:text-sm hidden sm:table-cell">
                      {formatDate(winner.created_at)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <GiTrophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Winners Yet</h3>
            <p className="text-gray-500">Winners will appear here after draws are completed</p>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-dark-400">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg font-semibold bg-dark-700 text-gray-400 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
              let pageNum;
              if (pagination.pages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= pagination.pages - 2) {
                pageNum = pagination.pages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                    page === pageNum
                      ? 'bg-accent text-dark-900'
                      : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
              className="px-4 py-2 rounded-lg font-semibold bg-dark-700 text-gray-400 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminWinners;
