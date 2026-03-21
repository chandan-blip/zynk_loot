import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiCheck, FiPercent, FiGlobe } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import { getAdminPackages, createPackage, updatePackage, deletePackage, getZynkRate, getExchangeRates } from '../../services/api';

function AdminPackages() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [zynkToUsd, setZynkToUsd] = useState(1.0);
  const [exchangeRates, setExchangeRates] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    zynk_amount: '',
    bonus_percent: '0',
    is_active: true
  });

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const [packagesRes, zynkRes, ratesRes] = await Promise.all([
        getAdminPackages(),
        getZynkRate(),
        getExchangeRates()
      ]);
      setPackages(packagesRes.data.data);
      setZynkToUsd(parseFloat(zynkRes.data.data.zynkToUsd));
      const rates = ratesRes.data.data.rates || [];
      setExchangeRates(rates.filter(r => r.is_active));
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  // Calculate Zynk value in different currencies
  const currencyConversions = useMemo(() => {
    const amount = parseInt(formData.zynk_amount) || 0;
    if (amount <= 0 || exchangeRates.length === 0) return [];

    // Use rate_from_zynk directly (how many units of currency = 1 Zynk)
    const topCurrencies = ['USD', 'INR', 'EUR', 'GBP', 'AED'];

    return topCurrencies.map(code => {
      const rate = exchangeRates.find(r => r.currency_code === code);
      if (!rate) return null;

      const converted = amount * rate.rate_from_zynk;
      const precision = rate.decimal_precision || 2;

      return {
        code,
        symbol: rate.currency_symbol,
        value: converted.toFixed(precision),
        type: rate.currency_type
      };
    }).filter(Boolean);
  }, [formData.zynk_amount, exchangeRates]);

  const resetForm = () => {
    setFormData({
      name: '',
      zynk_amount: '',
      bonus_percent: '0',
      is_active: true
    });
    setEditingPackage(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (pkg) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      zynk_amount: pkg.zynk_amount.toString(),
      bonus_percent: (pkg.bonus_percent || 0).toString(),
      is_active: pkg.is_active
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.zynk_amount) {
      toast.error('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      // Calculate price in USD (zynk_amount × zynkToUsd)
      const calculatedPrice = parseInt(formData.zynk_amount) * zynkToUsd;
      const data = {
        name: formData.name,
        zynk_amount: parseInt(formData.zynk_amount),
        price: calculatedPrice,
        bonus_percent: parseInt(formData.bonus_percent) || 0,
        is_active: formData.is_active
      };

      if (editingPackage) {
        await updatePackage(editingPackage.id, data);
        toast.success('Package updated successfully');
      } else {
        await createPackage(data);
        toast.success('Package created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchPackages();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pkg) => {
    if (!window.confirm(`Are you sure you want to delete "${pkg.name}"?`)) {
      return;
    }

    setDeleting(pkg.id);
    try {
      const response = await deletePackage(pkg.id);
      toast.success(response.data.message);
      fetchPackages();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete package');
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (pkg) => {
    try {
      await updatePackage(pkg.id, { is_active: !pkg.is_active });
      toast.success(`Package ${pkg.is_active ? 'deactivated' : 'activated'}`);
      fetchPackages();
    } catch (error) {
      toast.error('Failed to update package');
    }
  };

  // Helper to get price in a currency
  const getPriceInCurrency = (zynkAmount, currencyCode) => {
    const rate = exchangeRates.find(r => r.currency_code === currencyCode);
    if (!rate) return null;
    return zynkAmount * rate.rate_from_zynk;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Zynk Packages</h1>
          <p className="text-gray-500">Manage purchase packages for users (1 Z = ${zynkToUsd})</p>
        </div>
        <motion.button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent/90 transition-all"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <FiPlus className="w-5 h-5" />
          <span>Add Package</span>
        </motion.button>
      </div>

      {/* Packages Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : packages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {packages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`relative bg-dark-800 border rounded-xl p-5 ${
                pkg.is_active ? 'border-dark-600' : 'border-gray-700 opacity-60'
              }`}
            >
              {/* Status Badge */}
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => toggleActive(pkg)}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    pkg.is_active
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {pkg.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Package Icon */}
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
                pkg.bonus_percent > 0 ? 'bg-gold/20' : 'bg-accent/20'
              }`}>
                <GiTwoCoins className={`w-7 h-7 ${pkg.bonus_percent > 0 ? 'text-gold-light' : 'text-accent'}`} />
              </div>

              {/* Package Info */}
              <h3 className="text-lg font-bold text-white mb-1">{pkg.name}</h3>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Zynk Amount</span>
                  <span className="text-accent font-semibold">{pkg.zynk_amount.toLocaleString()} Z</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Price (USD)</span>
                  <span className="text-white font-semibold">${(pkg.zynk_amount * zynkToUsd).toFixed(2)}</span>
                </div>
                {getPriceInCurrency(pkg.zynk_amount, 'INR') && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Price (INR)</span>
                    <span className="text-gray-400 font-semibold">
                      ₹{getPriceInCurrency(pkg.zynk_amount, 'INR').toLocaleString(undefined, {maximumFractionDigits: 2})}
                    </span>
                  </div>
                )}
                {pkg.bonus_percent > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Bonus</span>
                    <span className="text-gold-light font-semibold">+{pkg.bonus_percent}%</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="pt-3 border-t border-dark-600 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Purchases</span>
                  <span className="text-white">{pkg.purchaseCount || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-500">Total Sold</span>
                  <span className="text-accent">{(pkg.totalZynkSold || 0).toLocaleString()} Z</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(pkg)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 transition-colors text-sm"
                >
                  <FiEdit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(pkg)}
                  disabled={deleting === pkg.id}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm disabled:opacity-50"
                >
                  {deleting === pkg.id ? (
                    <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiTrash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-dark-800 rounded-xl border border-dark-600">
          <GiTwoCoins className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Packages Yet</h3>
          <p className="text-gray-500 mb-6">Create your first Zynk package to get started</p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent/90 transition-all"
          >
            <FiPlus className="w-5 h-5" />
            <span>Add Package</span>
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="bg-dark-800 border border-dark-600 rounded-xl p-4 lg:p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-6">
              {editingPackage ? 'Edit Package' : 'Create Package'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Package Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Starter, Pro, Ultimate"
                  className="input-premium w-full"
                />
              </div>

              {/* Zynk Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Zynk Amount *
                </label>
                <div className="relative">
                  <GiTwoCoins className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                  <input
                    type="number"
                    value={formData.zynk_amount}
                    onChange={(e) => setFormData({ ...formData, zynk_amount: e.target.value })}
                    placeholder="e.g. 1000"
                    className="input-premium w-full pl-12"
                    min="1"
                  />
                </div>
              </div>

              {/* Bonus Percent */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Bonus Percent
                </label>
                <div className="relative">
                  <FiPercent className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-light" />
                  <input
                    type="number"
                    value={formData.bonus_percent}
                    onChange={(e) => setFormData({ ...formData, bonus_percent: e.target.value })}
                    placeholder="e.g. 10"
                    className="input-premium w-full pl-12"
                    min="0"
                    max="100"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Extra Zynk given as bonus (e.g. 10% = 100 bonus on 1000 Zynk)
                </p>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between py-3 px-4 bg-dark-700 rounded-lg">
                <span className="text-white font-medium">Active</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    formData.is_active ? 'bg-accent' : 'bg-dark-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      formData.is_active ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Preview */}
              {formData.zynk_amount && (
                <div className="p-4 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-400 mb-2">Preview</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">{formData.name || 'Package'}</p>
                      <p className="text-accent text-lg font-bold">
                        {parseInt(formData.zynk_amount).toLocaleString()} Z
                        {parseInt(formData.bonus_percent) > 0 && (
                          <span className="text-gold-light text-sm ml-2">
                            +{Math.round(parseInt(formData.zynk_amount) * parseInt(formData.bonus_percent) / 100)} bonus
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      ${(parseInt(formData.zynk_amount) * zynkToUsd).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Currency Conversions */}
              {currencyConversions.length > 0 && (
                <div className="p-4 bg-dark-700 rounded-lg border border-dark-500">
                  <div className="flex items-center gap-2 mb-3">
                    <FiGlobe className="text-accent" />
                    <p className="text-sm font-medium text-gray-400">
                      {parseInt(formData.zynk_amount).toLocaleString()} Z in other currencies
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currencyConversions.map((conv) => (
                      <div
                        key={conv.code}
                        className="flex items-center justify-between px-3 py-2 rounded bg-dark-600"
                      >
                        <span className="text-gray-400 text-sm">{conv.code}</span>
                        <span className="font-mono font-medium text-white">
                          {conv.symbol}{parseFloat(conv.value).toLocaleString(undefined, {
                            maximumFractionDigits: conv.code === 'USD' ? 2 : (conv.type === 'crypto' ? 6 : 2)
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-lg font-semibold bg-dark-700 text-white hover:bg-dark-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiCheck className="w-5 h-5" />
                  )}
                  {saving ? 'Saving...' : editingPackage ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default AdminPackages;
