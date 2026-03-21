import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPackage,
  FiCheck,
  FiX,
  FiClock,
  FiUser,
  FiDollarSign,
  FiFilter,
  FiEye,
  FiAlertCircle,
  FiRefreshCw
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import {
  getAdminOrders,
  approveOrder,
  rejectOrder,
  getAdminPaymentSettings,
  updateAdminPaymentSettings
} from '../../services/api';

const STATUS_CONFIG = {
  awaiting_approval: { label: 'Awaiting Approval', color: 'text-yellow-400 bg-yellow-400/10', icon: FiClock },
  pending: { label: 'Pending', color: 'text-blue-400 bg-blue-400/10', icon: FiClock },
  approved: { label: 'Approved', color: 'text-green-400 bg-green-400/10', icon: FiCheck },
  completed: { label: 'Completed', color: 'text-green-400 bg-green-400/10', icon: FiCheck },
  rejected: { label: 'Rejected', color: 'text-red-400 bg-red-400/10', icon: FiX },
  failed: { label: 'Failed', color: 'text-gray-400 bg-gray-400/10', icon: FiX }
};

const PAYMENT_METHOD_LABELS = {
  upi: 'UPI',
  bank: 'Bank Transfer',
  crypto_btc: 'Bitcoin',
  crypto_eth: 'Ethereum',
  crypto_usdt: 'USDT'
};

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [counts, setCounts] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, pagination.page]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await getAdminOrders(pagination.page, statusFilter);
      setOrders(res.data.data.orders);
      setPagination(res.data.data.pagination);
      setCounts(res.data.data.counts || {});
    } catch (error) {
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentSettings = async () => {
    try {
      const res = await getAdminPaymentSettings();
      setPaymentSettings(res.data.data);
    } catch (error) {
      toast.error('Failed to fetch payment settings');
    }
  };

  const handleApprove = async (order) => {
    if (!confirm(`Approve order #${order.id}? This will credit ${order.zynk_amount + (order.bonus_amount || 0)} Zynk to ${order.username}.`)) {
      return;
    }

    setProcessing(order.id);
    try {
      await approveOrder(order.id, 'Approved by admin');
      toast.success(`Order approved! ${order.zynk_amount + (order.bonus_amount || 0)} Zynk credited.`);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve order');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setProcessing(selectedOrder.id);
    try {
      await rejectOrder(selectedOrder.id, rejectNote);
      toast.success('Order rejected');
      setShowRejectModal(false);
      setRejectNote('');
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject order');
    } finally {
      setProcessing(null);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateAdminPaymentSettings(paymentSettings);
      toast.success('Payment settings saved');
      setShowSettingsModal(false);
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const openRejectModal = (order) => {
    setSelectedOrder(order);
    setRejectNote('');
    setShowRejectModal(true);
  };

  const openSettingsModal = () => {
    fetchPaymentSettings();
    setShowSettingsModal(true);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Zynk Orders</h1>
          <p className="text-gray-400">Manage purchase orders and payment approvals</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openSettingsModal}
            className="btn btn-secondary"
          >
            <FiDollarSign className="w-4 h-4 mr-2" />
            Payment Settings
          </button>
          <button
            onClick={fetchOrders}
            className="btn btn-secondary"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter('awaiting_approval')}
          className={`card cursor-pointer transition-all ${statusFilter === 'awaiting_approval' ? 'ring-2 ring-yellow-400' : 'hover:bg-dark-700'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-400/20 flex items-center justify-center">
              <FiClock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-400">{counts.awaiting_approval || 0}</p>
              <p className="text-xs text-gray-400">Awaiting</p>
            </div>
          </div>
        </div>
        <div
          onClick={() => setStatusFilter('completed')}
          className={`card cursor-pointer transition-all ${statusFilter === 'completed' ? 'ring-2 ring-green-400' : 'hover:bg-dark-700'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-400/20 flex items-center justify-center">
              <FiCheck className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{counts.completed || 0}</p>
              <p className="text-xs text-gray-400">Completed</p>
            </div>
          </div>
        </div>
        <div
          onClick={() => setStatusFilter('rejected')}
          className={`card cursor-pointer transition-all ${statusFilter === 'rejected' ? 'ring-2 ring-red-400' : 'hover:bg-dark-700'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-400/20 flex items-center justify-center">
              <FiX className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{counts.rejected || 0}</p>
              <p className="text-xs text-gray-400">Rejected</p>
            </div>
          </div>
        </div>
        <div
          onClick={() => setStatusFilter('')}
          className={`card cursor-pointer transition-all ${statusFilter === '' ? 'ring-2 ring-accent' : 'hover:bg-dark-700'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <FiPackage className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {Object.values(counts).reduce((a, b) => a + b, 0)}
              </p>
              <p className="text-xs text-gray-400">All Orders</p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="hidden sm:table-cell">Order</th>
                <th>User</th>
                <th className="hidden lg:table-cell">Package</th>
                <th className="text-right">Amount</th>
                <th className="hidden md:table-cell">Payment</th>
                <th className="text-center">Status</th>
                <th className="hidden sm:table-cell">Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent mx-auto"></div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                  const StatusIcon = status.icon;
                  const totalZynk = order.zynk_amount + (order.bonus_amount || 0);

                  return (
                    <tr key={order.id} className="border-b border-dark-700 hover:bg-dark-700/50">
                      <td className="hidden sm:table-cell">
                        <span className="text-white font-mono text-sm">#{order.id}</span>
                      </td>
                      <td>
                        <div>
                          <p className="text-white text-sm lg:text-base">{order.username}</p>
                          <p className="text-gray-500 text-xs hidden sm:block">{order.email}</p>
                          <p className="text-gray-500 text-xs sm:hidden">#{order.id}</p>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell">
                        <span className="text-gray-300 text-sm">{order.package_name || 'Custom'}</span>
                      </td>
                      <td className="text-right">
                        <div>
                          <p className="text-accent font-semibold text-sm lg:text-base">{totalZynk.toLocaleString()} Z</p>
                          <p className="text-gray-500 text-xs">
                            {order.payment_currency && order.payment_amount
                              ? `${order.payment_currency === 'INR' ? '₹' : ''}${parseFloat(order.payment_amount).toLocaleString()} ${order.payment_currency !== 'INR' ? order.payment_currency : ''}`
                              : `${parseFloat(order.price).toLocaleString()} Z`
                            }
                          </p>
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        <div>
                          <p className="text-gray-300 text-sm">{PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}</p>
                          {order.payment_reference && (
                            <p className="text-gray-500 text-xs font-mono truncate max-w-[100px]">{order.payment_reference}</p>
                          )}
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span className="hidden sm:inline">{status.label}</span>
                        </span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-gray-400 text-xs lg:text-sm">{formatDate(order.created_at)}</span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1 lg:gap-2">
                          {order.status === 'awaiting_approval' && (
                            <>
                              <button
                                onClick={() => handleApprove(order)}
                                disabled={processing === order.id}
                                className="p-1.5 lg:p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                <FiCheck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openRejectModal(order)}
                                disabled={processing === order.id}
                                className="p-1.5 lg:p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                title="Reject"
                              >
                                <FiX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-1.5 lg:p-2 rounded-lg bg-dark-600 text-gray-400 hover:bg-dark-500 transition-colors"
                            title="View Details"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-600">
            <p className="text-gray-400 text-sm">
              Page {pagination.page} of {pagination.pages} ({pagination.total} orders)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page === 1}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page === pagination.pages}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="card p-4 lg:p-6 max-w-md w-full mx-4"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Reject Order #{selectedOrder.id}</h3>
              <p className="text-gray-400 text-sm mb-4">
                User: {selectedOrder.username}<br />
                Amount: {selectedOrder.zynk_amount + (selectedOrder.bonus_amount || 0)} Z
              </p>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Rejection Reason *</label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={3}
                  className="input-premium w-full resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing === selectedOrder.id || !rejectNote.trim()}
                  className="flex-1 btn bg-red-500 hover:bg-red-600 text-white"
                >
                  {processing === selectedOrder.id ? 'Rejecting...' : 'Reject Order'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && !showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="card p-4 lg:p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Order #{selectedOrder.id}</h3>
                <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-white">
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">User</p>
                    <p className="text-white font-medium">{selectedOrder.username}</p>
                    <p className="text-gray-500 text-xs">{selectedOrder.email}</p>
                  </div>
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Status</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[selectedOrder.status]?.color}`}>
                      {STATUS_CONFIG[selectedOrder.status]?.label || selectedOrder.status}
                    </span>
                  </div>
                </div>

                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-2">Package Details</p>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Package</span>
                    <span className="text-white">{selectedOrder.package_name || 'Custom'}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-300">Base Amount</span>
                    <span className="text-white">{selectedOrder.zynk_amount?.toLocaleString()} Z</span>
                  </div>
                  {selectedOrder.bonus_amount > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-300">Bonus</span>
                      <span className="text-green-400">+{selectedOrder.bonus_amount?.toLocaleString()} Z</span>
                    </div>
                  )}
                  <div className="flex justify-between mt-2 pt-2 border-t border-dark-600">
                    <span className="text-gray-300 font-medium">Total</span>
                    <span className="text-accent font-bold">
                      {(selectedOrder.zynk_amount + (selectedOrder.bonus_amount || 0)).toLocaleString()} Z
                    </span>
                  </div>
                </div>

                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-2">Payment Details</p>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Method</span>
                    <span className="text-white">{PAYMENT_METHOD_LABELS[selectedOrder.payment_method] || selectedOrder.payment_method}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-300">Price</span>
                    <span className="text-white">
                      {selectedOrder.payment_currency && selectedOrder.payment_amount
                        ? `${selectedOrder.payment_currency === 'INR' ? '₹' : ''}${parseFloat(selectedOrder.payment_amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${selectedOrder.payment_currency !== 'INR' ? selectedOrder.payment_currency : ''}`
                        : `${parseFloat(selectedOrder.price).toLocaleString()} Z`
                      }
                    </span>
                  </div>
                  {selectedOrder.payment_reference && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-300">Reference</span>
                      <span className="text-white font-mono text-sm">{selectedOrder.payment_reference}</span>
                    </div>
                  )}
                  {selectedOrder.payment_note && (
                    <div className="mt-2 pt-2 border-t border-dark-600">
                      <p className="text-gray-400 text-xs">Note from user</p>
                      <p className="text-gray-300 text-sm">{selectedOrder.payment_note}</p>
                    </div>
                  )}
                </div>

                {selectedOrder.admin_note && (
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-1">Admin Note</p>
                    <p className="text-gray-300">{selectedOrder.admin_note}</p>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  <p>Created: {formatDate(selectedOrder.created_at)}</p>
                  {selectedOrder.processed_at && <p>Processed: {formatDate(selectedOrder.processed_at)}</p>}
                </div>

                {selectedOrder.status === 'awaiting_approval' && (
                  <div className="flex gap-3 pt-4 border-t border-dark-600">
                    <button
                      onClick={() => handleApprove(selectedOrder)}
                      disabled={processing === selectedOrder.id}
                      className="flex-1 btn btn-primary"
                    >
                      {processing === selectedOrder.id ? 'Processing...' : 'Approve Order'}
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectModal(true);
                      }}
                      disabled={processing === selectedOrder.id}
                      className="flex-1 btn bg-red-500 hover:bg-red-600 text-white"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="card p-4 lg:p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Payment Settings</h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-white">
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* UPI */}
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-3">UPI Details</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">UPI ID</label>
                      <input
                        type="text"
                        value={paymentSettings.upi_id || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, upi_id: e.target.value }))}
                        placeholder="yourname@upi"
                        className="input-premium w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Display Name</label>
                      <input
                        type="text"
                        value={paymentSettings.upi_name || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, upi_name: e.target.value }))}
                        placeholder="Your Business Name"
                        className="input-premium w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank */}
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Bank Account</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={paymentSettings.bank_name || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, bank_name: e.target.value }))}
                        placeholder="HDFC Bank"
                        className="input-premium w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Account Number</label>
                      <input
                        type="text"
                        value={paymentSettings.bank_account || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, bank_account: e.target.value }))}
                        placeholder="1234567890"
                        className="input-premium w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">IFSC Code</label>
                      <input
                        type="text"
                        value={paymentSettings.bank_ifsc || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, bank_ifsc: e.target.value }))}
                        placeholder="HDFC0001234"
                        className="input-premium w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Account Holder Name</label>
                      <input
                        type="text"
                        value={paymentSettings.bank_holder || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, bank_holder: e.target.value }))}
                        placeholder="Your Business Name"
                        className="input-premium w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Crypto */}
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Crypto Wallets</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Bitcoin (BTC) Address</label>
                      <input
                        type="text"
                        value={paymentSettings.crypto_btc || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, crypto_btc: e.target.value }))}
                        placeholder="bc1q..."
                        className="input-premium w-full font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Ethereum (ETH) Address</label>
                      <input
                        type="text"
                        value={paymentSettings.crypto_eth || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, crypto_eth: e.target.value }))}
                        placeholder="0x..."
                        className="input-premium w-full font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">USDT (TRC20) Address</label>
                      <input
                        type="text"
                        value={paymentSettings.crypto_usdt || ''}
                        onChange={(e) => setPaymentSettings(p => ({ ...p, crypto_usdt: e.target.value }))}
                        placeholder="T..."
                        className="input-premium w-full font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-dark-600">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex-1 btn btn-primary"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
