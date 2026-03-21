import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlay, FiZap, FiEye, FiClock, FiEdit2, FiCheck, FiX } from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import {
  getAdminDraws,
  triggerNewDraw,
  triggerCompleteDraw,
  revealNextDigit,
  setWinningNumber,
  getDrawWinners
} from '../../services/api';

function AdminDraws() {
  const [draws, setDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [triggering, setTriggering] = useState(null);
  const [editingNumber, setEditingNumber] = useState(null);
  const [newNumber, setNewNumber] = useState('');
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [winners, setWinners] = useState([]);
  const [loadingWinners, setLoadingWinners] = useState(false);

  useEffect(() => {
    fetchDraws();
  }, [page]);

  const fetchDraws = async () => {
    setLoading(true);
    try {
      const response = await getAdminDraws(page, 20);
      setDraws(response.data.data.draws);
      setPagination(response.data.data.pagination);
    } catch (error) {
      toast.error('Failed to load draws');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerNew = async () => {
    setTriggering('new');
    try {
      const response = await triggerNewDraw();
      if (response.data.success) {
        toast.success(`New draw created! Period: ${response.data.data.periodId}`);
        fetchDraws();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create draw');
    } finally {
      setTriggering(null);
    }
  };

  const handleTriggerComplete = async () => {
    setTriggering('complete');
    try {
      const response = await triggerCompleteDraw();
      if (response.data.success) {
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#00d4aa', '#22c55e', '#fbbf24'],
        });
        toast.success('Draw completed!');
        fetchDraws();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete draw');
    } finally {
      setTriggering(null);
    }
  };

  const handleRevealNext = async () => {
    setTriggering('reveal');
    try {
      const response = await revealNextDigit();
      if (response.data.success) {
        toast.success(response.data.message);
        fetchDraws();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reveal digit');
    } finally {
      setTriggering(null);
    }
  };

  const handleSetNumber = async () => {
    if (!/^\d{7}$/.test(newNumber)) {
      toast.error('Number must be exactly 7 digits');
      return;
    }

    try {
      const response = await setWinningNumber(newNumber);
      if (response.data.success) {
        toast.success('Winning number updated!');
        setEditingNumber(null);
        setNewNumber('');
        fetchDraws();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update number');
    }
  };

  const handleViewWinners = async (draw) => {
    setSelectedDraw(draw);
    setLoadingWinners(true);
    try {
      const response = await getDrawWinners(draw.period_id);
      setWinners(response.data.data || []);
    } catch (error) {
      toast.error('Failed to load winners');
      setWinners([]);
    } finally {
      setLoadingWinners(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      case 'revealing':
        return 'bg-accent/20 text-accent';
      case 'active':
        return 'bg-blue-500/20 text-blue-400';
      default:
        return 'bg-yellow-500/20 text-yellow-400';
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">Draw Management</h1>
          <p className="text-gray-500 text-sm lg:text-base">Create and manage lottery draws</p>
        </div>
        <div className="flex gap-2 lg:gap-3 flex-wrap w-full lg:w-auto">
          <motion.button
            onClick={handleTriggerNew}
            disabled={triggering === 'new'}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg font-semibold text-sm lg:text-base bg-accent text-dark-900 hover:bg-accent/90 transition-all disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {triggering === 'new' ? (
              <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FiZap className="w-4 h-4 lg:w-5 lg:h-5" />
            )}
            <span>New</span>
          </motion.button>
          <motion.button
            onClick={handleRevealNext}
            disabled={triggering === 'reveal'}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg font-semibold text-sm lg:text-base bg-purple-500 text-white hover:bg-purple-600 transition-all disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {triggering === 'reveal' ? (
              <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <FiEye className="w-4 h-4 lg:w-5 lg:h-5" />
            )}
            <span>Reveal</span>
          </motion.button>
          <motion.button
            onClick={handleTriggerComplete}
            disabled={triggering === 'complete'}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg font-semibold text-sm lg:text-base bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {triggering === 'complete' ? (
              <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <FiPlay className="w-4 h-4 lg:w-5 lg:h-5" />
            )}
            <span>Complete</span>
          </motion.button>
        </div>
      </div>

      {/* Set Number (for testing) */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiEdit2 className="w-4 h-4" />
            <span className="text-sm font-medium">Set Winning Number (Testing)</span>
          </div>
          <div className="flex gap-2 flex-1">
            <input
              type="text"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
              placeholder="Enter 7-digit number"
              className="flex-1 max-w-xs px-4 py-2 rounded-lg bg-dark-700 border border-dark-500 text-white placeholder-gray-500 focus:border-accent focus:outline-none font-mono"
            />
            <motion.button
              onClick={handleSetNumber}
              disabled={newNumber.length !== 7}
              className="px-4 py-2 rounded-lg font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Set Number
            </motion.button>
          </div>
        </div>
      </div>

      {/* Draws List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : draws.length === 0 ? (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-12 text-center">
          <GiTrophy className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold text-gray-400">No draws yet</h3>
          <p className="text-gray-500 mt-2">Create your first draw to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {draws.map((draw, i) => (
            <motion.div
              key={draw.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-dark-800 border border-dark-600 rounded-xl p-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Info */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center border border-accent/20">
                    <GiTrophy className="w-7 h-7 text-accent" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white">#{draw.period_id}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(draw.status)}`}>
                        {draw.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <FiClock className="w-3 h-3" />
                      {formatDate(draw.created_at)}
                    </p>
                  </div>
                </div>

                {/* Winning Number */}
                <div className="flex items-center gap-1 flex-wrap">
                  {(draw.winning_number || '???????').split('').map((digit, idx) => (
                    <div
                      key={idx}
                      className={`w-7 h-9 sm:w-8 sm:h-10 rounded flex items-center justify-center font-mono font-bold text-sm sm:text-base ${
                        draw.status === 'completed'
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : idx < (draw.revealed_digits || 0)
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'bg-dark-700 text-gray-500 border border-dark-500'
                      }`}
                    >
                      {draw.status === 'completed' ? digit : idx < (draw.revealed_digits || 0) ? digit : '?'}
                    </div>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-gray-500 text-xs">
                      <GiTwoCoins className="text-accent" />
                      <span>Pool</span>
                    </div>
                    <div className="font-bold text-accent">
                      {parseFloat(draw.total_pool || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 text-xs">Revealed</div>
                    <div className="font-bold text-white">
                      {draw.revealed_digits || 0}/7
                    </div>
                  </div>
                </div>

                {/* Action */}
                <div>
                  {draw.status === 'completed' ? (
                    <motion.button
                      onClick={() => handleViewWinners(draw)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <FiEye className="w-4 h-4" />
                      <span>Winners</span>
                    </motion.button>
                  ) : (
                    <span className="text-gray-500 text-sm">In Progress</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: Math.min(pagination.pages, 10) }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                page === p
                  ? 'bg-accent text-dark-900'
                  : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Winners Modal */}
      <AnimatePresence>
        {selectedDraw && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setSelectedDraw(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-dark-800 border border-dark-600 rounded-xl p-4 lg:p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Draw Winners</h3>
                  <p className="text-gray-500 text-sm">Period: #{selectedDraw.period_id}</p>
                </div>
                <button
                  onClick={() => setSelectedDraw(null)}
                  className="p-2 rounded-lg hover:bg-dark-700 transition-colors"
                >
                  <FiX className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
                <p className="text-gray-400 text-sm mb-2">Winning Number</p>
                <div className="flex gap-1">
                  {(selectedDraw.winning_number || '').split('').map((digit, idx) => (
                    <div
                      key={idx}
                      className="w-8 h-10 rounded bg-accent/20 text-accent border border-accent/30 flex items-center justify-center font-mono font-bold"
                    >
                      {digit}
                    </div>
                  ))}
                </div>
              </div>

              {loadingWinners ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : winners.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No winners for this draw</p>
              ) : (
                <div className="space-y-3">
                  {winners.map((winner) => (
                    <div
                      key={winner.id}
                      className="flex items-center justify-between p-4 bg-dark-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900">
                          {winner.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-white">{winner.username}</p>
                          <p className="text-sm text-gray-500">Number: {winner.number}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-accent font-bold">{parseFloat(winner.prize_amount).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{winner.matching_digits} digits</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminDraws;
