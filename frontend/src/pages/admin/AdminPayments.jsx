import { useState, useEffect } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiCopy,
  FiSmartphone, FiCreditCard, FiDollarSign, FiRefreshCw,
  FiToggleLeft, FiToggleRight, FiAlertCircle
} from 'react-icons/fi';
import { SiBitcoin, SiEthereum, SiTether } from 'react-icons/si';
import toast from 'react-hot-toast';
import {
  getAdminPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  togglePaymentAccount,
  resetDailyUsage
} from '../../services/api';

const PAYMENT_TYPES = {
  upi: { label: 'UPI', icon: FiSmartphone, color: 'from-purple-500 to-pink-500' },
  bank: { label: 'Bank Transfer', icon: FiCreditCard, color: 'from-blue-500 to-cyan-500' },
  crypto_btc: { label: 'Bitcoin', icon: SiBitcoin, color: 'from-orange-500 to-yellow-500' },
  crypto_eth: { label: 'Ethereum', icon: SiEthereum, color: 'from-blue-400 to-purple-500' },
  crypto_usdt: { label: 'USDT', icon: SiTether, color: 'from-green-500 to-emerald-400' }
};

function AdminPayments() {
  const [accounts, setAccounts] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState({ total: 0, totalActive: 0 });

  const [formData, setFormData] = useState({
    type: 'upi',
    label: '',
    upi_id: '',
    upi_name: '',
    bank_name: '',
    bank_account: '',
    bank_ifsc: '',
    bank_holder: '',
    wallet_address: '',
    wallet_network: '',
    is_active: true,
    priority: 10,
    daily_limit: '',
    notes: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await getAdminPaymentAccounts();
      setAccounts(res.data.data.accounts);
      setGrouped(res.data.data.grouped);
      setStats({
        total: res.data.data.total,
        totalActive: res.data.data.totalActive
      });
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load payment accounts');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'upi',
      label: '',
      upi_id: '',
      upi_name: '',
      bank_name: '',
      bank_account: '',
      bank_ifsc: '',
      bank_holder: '',
      wallet_address: '',
      wallet_network: '',
      is_active: true,
      priority: 10,
      daily_limit: '',
      notes: ''
    });
    setEditingAccount(null);
  };

  const openCreateModal = (type = 'upi') => {
    resetForm();
    setFormData(prev => ({ ...prev, type }));
    setShowModal(true);
  };

  const openEditModal = (account) => {
    setEditingAccount(account);
    setFormData({
      type: account.type,
      label: account.label || '',
      upi_id: account.upi_id || '',
      upi_name: account.upi_name || '',
      bank_name: account.bank_name || '',
      bank_account: account.bank_account || '',
      bank_ifsc: account.bank_ifsc || '',
      bank_holder: account.bank_holder || '',
      wallet_address: account.wallet_address || '',
      wallet_network: account.wallet_network || '',
      is_active: account.is_active,
      priority: account.priority || 0,
      daily_limit: account.daily_limit || '',
      notes: account.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.label) {
      toast.error('Please enter a label');
      return;
    }

    // Validate type-specific fields
    if (formData.type === 'upi' && !formData.upi_id) {
      toast.error('UPI ID is required');
      return;
    }
    if (formData.type === 'bank' && (!formData.bank_account || !formData.bank_ifsc || !formData.bank_holder)) {
      toast.error('Bank account, IFSC, and holder name are required');
      return;
    }
    if (['crypto_btc', 'crypto_eth', 'crypto_usdt'].includes(formData.type) && !formData.wallet_address) {
      toast.error('Wallet address is required');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        priority: parseInt(formData.priority) || 0,
        daily_limit: formData.daily_limit ? parseFloat(formData.daily_limit) : null
      };

      if (editingAccount) {
        await updatePaymentAccount(editingAccount.id, data);
        toast.success('Account updated successfully');
      } else {
        await createPaymentAccount(data);
        toast.success('Account created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Are you sure you want to delete "${account.label}"?`)) {
      return;
    }

    setDeleting(account.id);
    try {
      const response = await deletePaymentAccount(account.id);
      toast.success(response.data.message);
      fetchAccounts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete account');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (account) => {
    try {
      const res = await togglePaymentAccount(account.id);
      toast.success(res.data.message);
      fetchAccounts();
    } catch (error) {
      toast.error('Failed to toggle account');
    }
  };

  const handleResetDaily = async () => {
    if (!window.confirm('Reset daily usage for all accounts?')) return;
    try {
      await resetDailyUsage();
      toast.success('Daily usage reset');
      fetchAccounts();
    } catch (error) {
      toast.error('Failed to reset daily usage');
    }
  };

  const handleCopy = (text) => {
    copyToClipboard(text);
    toast.success('Copied to clipboard');
  };

  const filteredAccounts = activeTab === 'all'
    ? accounts
    : accounts.filter(a => a.type === activeTab);

  const renderAccountCard = (account, index) => {
    const typeInfo = PAYMENT_TYPES[account.type] || {};
    const Icon = typeInfo.icon || FiDollarSign;

    return (
      <motion.div
        key={account.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`relative bg-dark-800 border rounded-xl overflow-hidden ${
          account.is_active ? 'border-dark-600' : 'border-gray-700 opacity-60'
        }`}
      >
        {/* Header with gradient */}
        <div className={`h-2 bg-gradient-to-r ${typeInfo.color || 'from-gray-500 to-gray-600'}`} />

        <div className="p-5">
          {/* Status Badge */}
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${typeInfo.color || 'from-gray-500 to-gray-600'}`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <button
              onClick={() => handleToggle(account)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                account.is_active
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {account.is_active ? <FiToggleRight className="w-4 h-4" /> : <FiToggleLeft className="w-4 h-4" />}
              {account.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>

          {/* Account Info */}
          <h3 className="text-lg font-bold text-white mb-1">{account.label}</h3>
          <p className="text-sm text-gray-500 mb-3">{typeInfo.label}</p>

          {/* Type-specific details */}
          <div className="space-y-2 text-sm mb-4">
            {account.type === 'upi' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">UPI ID</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{account.upi_id}</span>
                    <button onClick={() => copyToClipboard(account.upi_id)} className="text-gray-400 hover:text-white">
                      <FiCopy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {account.upi_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Name</span>
                    <span className="text-gray-300">{account.upi_name}</span>
                  </div>
                )}
              </>
            )}

            {account.type === 'bank' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Bank</span>
                  <span className="text-white">{account.bank_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Account</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{account.bank_account}</span>
                    <button onClick={() => copyToClipboard(account.bank_account)} className="text-gray-400 hover:text-white">
                      <FiCopy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">IFSC</span>
                  <span className="text-gray-300 font-mono">{account.bank_ifsc}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Holder</span>
                  <span className="text-gray-300">{account.bank_holder}</span>
                </div>
              </>
            )}

            {['crypto_btc', 'crypto_eth', 'crypto_usdt'].includes(account.type) && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Address</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-xs truncate max-w-[120px]">
                      {account.wallet_address}
                    </span>
                    <button onClick={() => copyToClipboard(account.wallet_address)} className="text-gray-400 hover:text-white">
                      <FiCopy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {account.wallet_network && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Network</span>
                    <span className="text-gray-300">{account.wallet_network}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stats */}
          <div className="pt-3 border-t border-dark-600 mb-4 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Priority</span>
              <span className="text-accent font-semibold">{account.priority}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Usage Count</span>
              <span className="text-white">{account.usage_count || 0}</span>
            </div>
            {account.daily_limit && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Daily Limit</span>
                <span className="text-white">
                  ${parseFloat(account.daily_used || 0).toFixed(2)} / ${parseFloat(account.daily_limit).toFixed(2)}
                </span>
              </div>
            )}
            {account.last_used_at && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Last Used</span>
                <span className="text-gray-400">{new Date(account.last_used_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => openEditModal(account)}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 transition-colors text-sm"
            >
              <FiEdit2 className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => handleDelete(account)}
              disabled={deleting === account.id}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm disabled:opacity-50"
            >
              {deleting === account.id ? (
                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiTrash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderFormFields = () => {
    switch (formData.type) {
      case 'upi':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">UPI ID *</label>
              <input
                type="text"
                value={formData.upi_id}
                onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                placeholder="example@upi"
                className="input-premium w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Display Name</label>
              <input
                type="text"
                value={formData.upi_name}
                onChange={(e) => setFormData({ ...formData, upi_name: e.target.value })}
                placeholder="Name shown to users"
                className="input-premium w-full"
              />
            </div>
          </>
        );

      case 'bank':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Bank Name</label>
              <input
                type="text"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder="e.g. HDFC Bank"
                className="input-premium w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Account Number *</label>
              <input
                type="text"
                value={formData.bank_account}
                onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                placeholder="Account number"
                className="input-premium w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">IFSC Code *</label>
              <input
                type="text"
                value={formData.bank_ifsc}
                onChange={(e) => setFormData({ ...formData, bank_ifsc: e.target.value.toUpperCase() })}
                placeholder="e.g. HDFC0001234"
                className="input-premium w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Account Holder *</label>
              <input
                type="text"
                value={formData.bank_holder}
                onChange={(e) => setFormData({ ...formData, bank_holder: e.target.value })}
                placeholder="Account holder name"
                className="input-premium w-full"
              />
            </div>
          </>
        );

      case 'crypto_btc':
      case 'crypto_eth':
      case 'crypto_usdt':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Wallet Address *</label>
              <input
                type="text"
                value={formData.wallet_address}
                onChange={(e) => setFormData({ ...formData, wallet_address: e.target.value })}
                placeholder="Wallet address"
                className="input-premium w-full font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Network</label>
              <select
                value={formData.wallet_network}
                onChange={(e) => setFormData({ ...formData, wallet_network: e.target.value })}
                className="input-premium w-full"
              >
                <option value="">Select network</option>
                {formData.type === 'crypto_btc' && (
                  <>
                    <option value="BTC">Bitcoin (BTC)</option>
                    <option value="Lightning">Lightning Network</option>
                  </>
                )}
                {formData.type === 'crypto_eth' && (
                  <>
                    <option value="ERC20">Ethereum (ERC20)</option>
                    <option value="BSC">BNB Smart Chain (BEP20)</option>
                    <option value="Polygon">Polygon</option>
                    <option value="Arbitrum">Arbitrum</option>
                  </>
                )}
                {formData.type === 'crypto_usdt' && (
                  <>
                    <option value="TRC20">Tron (TRC20)</option>
                    <option value="ERC20">Ethereum (ERC20)</option>
                    <option value="BEP20">BNB Smart Chain (BEP20)</option>
                    <option value="Polygon">Polygon</option>
                  </>
                )}
              </select>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Payment Accounts</h1>
          <p className="text-gray-500">Manage payment accounts shown to users during checkout</p>
        </div>
        <div className="flex gap-2">
          <motion.button
            onClick={handleResetDaily}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg font-medium bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FiRefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Reset Daily</span>
          </motion.button>
          <motion.button
            onClick={() => openCreateModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent/90 transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FiPlus className="w-5 h-5" />
            <span>Add Account</span>
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <p className="text-gray-500 text-sm">Total Accounts</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <p className="text-gray-500 text-sm">Active</p>
          <p className="text-2xl font-bold text-green-400">{stats.totalActive}</p>
        </div>
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <p className="text-gray-500 text-sm">Inactive</p>
          <p className="text-2xl font-bold text-gray-400">{stats.total - stats.totalActive}</p>
        </div>
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
          <p className="text-gray-500 text-sm">Types</p>
          <p className="text-2xl font-bold text-accent">
            {Object.values(grouped).filter(arr => arr.length > 0).length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeTab === 'all'
              ? 'bg-accent text-dark-900'
              : 'bg-dark-700 text-gray-400 hover:text-white'
          }`}
        >
          All ({accounts.length})
        </button>
        {Object.entries(PAYMENT_TYPES).map(([type, info]) => {
          const count = (grouped[type] || []).length;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                activeTab === type
                  ? 'bg-accent text-dark-900'
                  : 'bg-dark-700 text-gray-400 hover:text-white'
              }`}
            >
              <info.icon className="w-4 h-4" />
              {info.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Accounts Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredAccounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((account, i) => renderAccountCard(account, i))}
        </div>
      ) : (
        <div className="text-center py-20 bg-dark-800 rounded-xl border border-dark-600">
          <FiAlertCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            {activeTab === 'all' ? 'No Payment Accounts' : `No ${PAYMENT_TYPES[activeTab]?.label} Accounts`}
          </h3>
          <p className="text-gray-500 mb-6">Add payment accounts to show users during checkout</p>
          <button
            onClick={() => openCreateModal(activeTab !== 'all' ? activeTab : 'upi')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent/90 transition-all"
          >
            <FiPlus className="w-5 h-5" />
            <span>Add Account</span>
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-dark-800 border border-dark-600 rounded-xl p-4 lg:p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">
                  {editingAccount ? 'Edit Payment Account' : 'Add Payment Account'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type Selector (only for new) */}
                {!editingAccount && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Payment Type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(PAYMENT_TYPES).map(([type, info]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({ ...formData, type })}
                          className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                            formData.type === type
                              ? 'border-accent bg-accent/10 text-white'
                              : 'border-dark-600 bg-dark-700 text-gray-400 hover:text-white'
                          }`}
                        >
                          <info.icon className="w-4 h-4" />
                          <span className="text-sm font-medium">{info.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Label */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Label *</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="e.g. Primary UPI, HDFC Account"
                    className="input-premium w-full"
                  />
                </div>

                {/* Type-specific fields */}
                {renderFormFields()}

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Priority (higher = more likely to be shown)
                  </label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    placeholder="e.g. 10"
                    className="input-premium w-full"
                    min="0"
                  />
                </div>

                {/* Daily Limit */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Daily Limit (USD) - Optional
                  </label>
                  <input
                    type="number"
                    value={formData.daily_limit}
                    onChange={(e) => setFormData({ ...formData, daily_limit: e.target.value })}
                    placeholder="Leave empty for unlimited"
                    className="input-premium w-full"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Admin Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes (not shown to users)"
                    className="input-premium w-full h-20 resize-none"
                  />
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
                    {saving ? 'Saving...' : editingAccount ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminPayments;
