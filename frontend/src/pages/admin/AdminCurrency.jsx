import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiEdit2, FiSave, FiX, FiRefreshCw, FiDollarSign, FiGlobe, FiClock, FiCheck } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import {
  getZynkRate,
  updateZynkRate,
  getExchangeRates,
  refreshExchangeRates
} from '../../services/api';

function AdminCurrency() {
  const [zynkRate, setZynkRate] = useState(0.1);
  const [editingZynkRate, setEditingZynkRate] = useState(false);
  const [newZynkRate, setNewZynkRate] = useState('');
  const [rates, setRates] = useState([]);
  const [rateSource, setRateSource] = useState('');
  const [rateUpdated, setRateUpdated] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [zynkRes, ratesRes] = await Promise.all([
        getZynkRate(),
        getExchangeRates()
      ]);
      setZynkRate(parseFloat(zynkRes.data.data.zynkToUsd));
      setRates(ratesRes.data.data.rates || []);
      setRateSource(ratesRes.data.data.source || 'unknown');
      setRateUpdated(ratesRes.data.data.updated || '');
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load exchange rates');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateZynkRate = async () => {
    if (!newZynkRate || parseFloat(newZynkRate) <= 0) {
      toast.error('Please enter a valid rate');
      return;
    }
    setSaving(true);
    try {
      await updateZynkRate(parseFloat(newZynkRate));
      setZynkRate(parseFloat(newZynkRate));
      setEditingZynkRate(false);
      toast.success('Zynk rate updated');
      // Refresh rates to recalculate with new base rate
      fetchData();
    } catch (error) {
      toast.error('Failed to update rate');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshRates = async () => {
    setRefreshing(true);
    try {
      const response = await refreshExchangeRates();
      setRates(response.data.data.rates || []);
      setRateSource(response.data.data.source || 'unknown');
      setRateUpdated(response.data.data.updated || '');
      toast.success('Exchange rates refreshed');
    } catch (error) {
      toast.error('Failed to refresh rates');
    } finally {
      setRefreshing(false);
    }
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    return date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Currency & Exchange Rates</h1>
          <p className="text-gray-500">Manage Zynk conversion rates (live from API)</p>
        </div>
        <div className="flex gap-2">
          <motion.button
            onClick={handleRefreshRates}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-dark-700 text-white hover:bg-dark-600 transition-all disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Rates'}</span>
          </motion.button>
        </div>
      </div>

      {/* Rate Source Info */}
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <FiGlobe className="w-4 h-4 text-accent" />
          <span>Source: <span className="text-white capitalize">{rateSource}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <FiClock className="w-4 h-4 text-gray-500" />
          <span>Updated: <span className="text-white">{formatTimeAgo(rateUpdated)}</span></span>
        </div>
      </div>

      {/* Zynk Base Rate Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-accent/20 to-gold/20 border border-accent/30 rounded-xl p-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-accent/20 flex items-center justify-center">
              <GiTwoCoins className="w-10 h-10 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Zynk Base Rate</h2>
              <p className="text-gray-400">1 Zynk = X USD (all currencies calculated from this)</p>
            </div>
          </div>

          {editingZynkRate ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-2">
                <span className="text-gray-400">1 Z =</span>
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  value={newZynkRate}
                  onChange={(e) => setNewZynkRate(e.target.value)}
                  className="w-24 bg-transparent text-white text-xl font-bold focus:outline-none"
                  step="0.001"
                  min="0.001"
                  autoFocus
                />
                <span className="text-gray-400">USD</span>
              </div>
              <button
                onClick={handleUpdateZynkRate}
                disabled={saving}
                className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"
              >
                <FiSave className="w-5 h-5" />
              </button>
              <button
                onClick={() => setEditingZynkRate(false)}
                className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-3xl font-bold text-white">1 Z = ${zynkRate}</p>
                <p className="text-sm text-gray-400">Base conversion rate</p>
              </div>
              <button
                onClick={() => {
                  setNewZynkRate(zynkRate.toString());
                  setEditingZynkRate(true);
                }}
                className="p-2 bg-dark-700 text-gray-400 rounded-lg hover:text-white hover:bg-dark-600"
              >
                <FiEdit2 className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Live Exchange Rates */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FiDollarSign className="text-accent" />
          Live Exchange Rates ({rates.length} currencies)
        </h3>
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-dark-700">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Currency</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Symbol</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">1 Z =</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">100 Z =</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {rates.map((rate) => (
                <tr key={rate.currency_code} className="hover:bg-dark-700/50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-white">{rate.currency_code}</p>
                      <p className="text-xs text-gray-500">{rate.currency_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xl">{rate.currency_symbol}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-accent font-mono">
                      {rate.currency_symbol}{rate.rate_from_zynk?.toFixed(rate.decimal_precision || 2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-white font-mono">
                      {rate.currency_symbol}{(rate.rate_from_zynk * 100)?.toLocaleString(undefined, {
                        maximumFractionDigits: rate.decimal_precision || 2
                      })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      rate.is_active
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      <FiCheck className="w-3 h-3" />
                      Live
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion Reference */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800 border border-dark-600 rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-dark-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">Conversion Formula</p>
            <code className="text-accent font-mono text-sm">
              Amount = Zynk × rate_from_zynk
            </code>
            <p className="text-xs text-gray-500 mt-2">
              Example: 10 Z × ${zynkRate} = ${(10 * zynkRate).toFixed(2)} USD
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">Rate Calculation</p>
            <code className="text-accent font-mono text-sm">
              rate = zynk_to_usd × usd_to_currency
            </code>
            <p className="text-xs text-gray-500 mt-2">
              Rates refresh automatically every 10 minutes
            </p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-dark-900/50 rounded-lg border border-dark-500">
          <p className="text-sm text-gray-400">
            <strong className="text-white">Note:</strong> Exchange rates are fetched live from{' '}
            <span className="text-accent">Frankfurter API</span> (free, no API key required).
            The rates are cached for 10 minutes. Click "Refresh Rates" to get the latest rates immediately.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default AdminCurrency;
