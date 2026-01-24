import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiUsers, FiTrendingUp, FiActivity, FiPlay, FiClock, FiZap } from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import CountUp from 'react-countup';
import toast from 'react-hot-toast';
import { getAdminDashboard, triggerNewDraw, triggerCompleteDraw } from '../../services/api';

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await getAdminDashboard();
      setStats(response.data.data);
    } catch (error) {
      toast.error('Failed to load dashboard');
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
        fetchDashboard();
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
        toast.success('Draw completed!');
        fetchDashboard();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete draw');
    } finally {
      setTriggering(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentDraw = stats?.currentDraw;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500">Lottery draw management</p>
        </div>
        <div className="flex gap-3">
          <motion.button
            onClick={handleTriggerNew}
            disabled={triggering === 'new'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent/90 transition-all disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {triggering === 'new' ? (
              <div className="w-5 h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FiZap className="w-5 h-5" />
            )}
            <span>New Draw</span>
          </motion.button>
          <motion.button
            onClick={handleTriggerComplete}
            disabled={triggering === 'complete'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {triggering === 'complete' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <FiPlay className="w-5 h-5" />
            )}
            <span>Complete</span>
          </motion.button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: stats?.users?.total || 0, icon: FiUsers, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'User Balances', value: stats?.users?.totalBalance || 0, icon: GiTwoCoins, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Total Draws', value: stats?.draws?.total || 0, icon: GiTrophy, color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { label: 'Total Pool', value: stats?.draws?.totalPool || 0, icon: FiTrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
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
              <CountUp end={stat.value} duration={2} separator="," />
            </div>
            <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Current Draw Card */}
      {currentDraw && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-dark-800 to-dark-700 border border-dark-600 rounded-xl p-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                  <FiZap className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Current Draw</h3>
                  <p className="text-gray-400 text-sm">Period: {currentDraw.periodId || '-'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <FiClock className="text-gray-500" />
                  <span className="text-gray-400">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    currentDraw.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    currentDraw.status === 'revealing' ? 'bg-accent/20 text-accent' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {currentDraw.status || 'pending'}
                  </span>
                </div>
                <div className="text-gray-400">
                  Revealed: <span className="text-white font-medium">{currentDraw.revealedDigits || 0}/7</span>
                </div>
                <div className="text-gray-400">
                  Pool: <span className="text-accent font-medium">{(currentDraw.totalPool || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Winning Number Display */}
            <div className="flex flex-col items-center lg:items-end gap-3">
              <p className="text-gray-500 text-sm">Winning Number</p>
              <div className="flex gap-1.5">
                {(currentDraw.winningNumber || '???????').split('').map((digit, idx) => (
                  <div
                    key={idx}
                    className={`w-10 h-12 rounded-lg flex items-center justify-center font-mono font-bold text-xl ${
                      idx < (currentDraw.revealedDigits || 0)
                        ? 'bg-accent/20 text-accent border border-accent/30'
                        : 'bg-dark-700 text-gray-500 border border-dark-500'
                    }`}
                  >
                    {idx < (currentDraw.revealedDigits || 0) ? digit : '?'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Stats */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Draw Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-dark-800 border border-dark-600 rounded-xl p-6"
        >
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <FiActivity className="text-green-400" />
            Draw Status
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-dark-700/50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-400">{stats?.draws?.active || 0}</div>
              <p className="text-gray-500 text-sm mt-1">Active</p>
            </div>
            <div className="bg-dark-700/50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-400">{stats?.draws?.completed || 0}</div>
              <p className="text-gray-500 text-sm mt-1">Completed</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="text-gray-400">
              Total Numbers: <span className="text-white font-medium">{stats?.numbers?.total || 0}</span>
            </div>
            <div className="text-gray-400">
              Total Votes: <span className="text-white font-medium">{stats?.numbers?.totalVotes || 0}</span>
            </div>
          </div>
        </motion.div>

        {/* Recent Draws */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-dark-800 border border-dark-600 rounded-xl p-6"
        >
          <h3 className="font-semibold text-white mb-4">Recent Draws</h3>
          {stats?.recentDraws?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentDraws.slice(0, 4).map((draw) => (
                <div
                  key={draw.id}
                  className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg"
                >
                  <div>
                    <span className="font-medium text-white">#{draw.period_id}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                      draw.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      draw.status === 'revealing' ? 'bg-accent/20 text-accent' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {draw.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-400">{formatDate(draw.draw_date)}</div>
                    <div className="text-accent font-semibold">{parseFloat(draw.total_pool || 0).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No draws yet</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default AdminDashboard;
