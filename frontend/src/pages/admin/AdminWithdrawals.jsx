import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiFilter, FiCheck, FiX, FiEye, FiChevronDown } from 'react-icons/fi';
import { BsBank, BsCurrencyBitcoin } from 'react-icons/bs';
import { SiPaytm } from 'react-icons/si';
import toast from 'react-hot-toast';
import api from '../../services/api';

const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-blue-500/20 text-blue-400',
  rejected: 'bg-red-500/20 text-red-400',
  completed: 'bg-green-500/20 text-green-400',
};

const paymentIcons = {
  upi: SiPaytm,
  crypto: BsCurrencyBitcoin,
  bank: BsBank,
};

function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    fetchWithdrawals();
  }, [page, statusFilter]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      const response = await api.get(`/admin/withdrawals?${params}`);
      setWithdrawals(response.data.data.withdrawals || []);
      setPagination(response.data.data.pagination);
    } catch (error) {
      toast.error('Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (withdrawal) => {
    setProcessing(true);
    try {
      const response = await api.post(`/admin/withdrawals/${withdrawal.id}/approve`, {
        admin_note: adminNote,
      });
      if (response.data.success) {
        toast.success('Withdrawal approved successfully');
        setSelectedWithdrawal(null);
        setAdminNote('');
        fetchWithdrawals();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve withdrawal');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (withdrawal) => {
    if (!adminNote.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setProcessing(true);
    try {
      const response = await api.post(`/admin/withdrawals/${withdrawal.id}/reject`, {
        admin_note: adminNote,
      });
      if (response.data.success) {
        toast.success('Withdrawal rejected');
        setSelectedWithdrawal(null);
        setAdminNote('');
        fetchWithdrawals();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject withdrawal');
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async (withdrawal) => {
    setProcessing(true);
    try {
      const response = await api.post(`/admin/withdrawals/${withdrawal.id}/complete`, {
        admin_note: adminNote,
      });
      if (response.data.success) {
        toast.success('Withdrawal marked as completed');
        setSelectedWithdrawal(null);
        setAdminNote('');
        fetchWithdrawals();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete withdrawal');
    } finally {
      setProcessing(false);
    }
  };

  const filteredWithdrawals = withdrawals.filter(withdrawal =>
    withdrawal.username?.toLowerCase().includes(search.toLowerCase()) ||
    withdrawal.email?.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPaymentIcon = (type) => {
    const Icon = paymentIcons[type] || BsBank;
    return <Icon className="w-4 h-4" />;
  };

  const renderPaymentDetails = (withdrawal) => {
    if (withdrawal.payment_type === 'upi') {
      return withdrawal.upi_id;
    } else if (withdrawal.payment_type === 'crypto') {
      return `${withdrawal.wallet_type}: ${withdrawal.wallet_address?.slice(0, 12)}...`;
    } else if (withdrawal.payment_type === 'bank') {
      return `${withdrawal.bank_name} - ****${withdrawal.account_number?.slice(-4)}`;
    }
    return '-';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Withdrawal Management</h1>
        <p className="text-gray-500">Review and process withdrawal requests</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user..."
            className="input-premium w-full pl-12"
          />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-dark-700 text-white hover:bg-dark-600 transition-colors"
          >
            <FiFilter className="w-4 h-4" />
            <span className="capitalize">{statusFilter === 'all' ? 'All Status' : statusFilter}</span>
            <FiChevronDown className={`w-4 h-4 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showFilterDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-full mt-2 right-0 bg-dark-700 rounded-lg shadow-lg border border-dark-600 overflow-hidden z-10"
            >
              {['all', 'pending', 'approved', 'rejected', 'completed'].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setShowFilterDropdown(false);
                    setPage(1);
                  }}
                  className={`w-full px-4 py-2 text-left capitalize hover:bg-dark-600 transition-colors ${
                    statusFilter === status ? 'text-accent' : 'text-gray-300'
                  }`}
                >
                  {status === 'all' ? 'All Status' : status}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Withdrawals Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <BsBank className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No withdrawals found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="bg-dark-700">
                <tr>
                  <th>User</th>
                  <th className="text-right">Amount</th>
                  <th className="hidden md:table-cell">Payment</th>
                  <th className="text-center">Status</th>
                  <th className="hidden sm:table-cell">Date</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-400">
                {filteredWithdrawals.map((withdrawal, i) => (
                  <motion.tr
                    key={withdrawal.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-dark-700 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-purple-500 flex items-center justify-center font-bold text-white text-sm">
                          {withdrawal.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm lg:text-base">{withdrawal.username}</p>
                          <p className="text-xs text-gray-500 hidden sm:block">{withdrawal.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right">
                      <p className="font-semibold text-red-400 text-sm lg:text-base">-₹{parseFloat(withdrawal.amount || 0).toLocaleString()}</p>
                    </td>
                    <td className="hidden md:table-cell">
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        {getPaymentIcon(withdrawal.payment_type)}
                        <span className="capitalize">{withdrawal.payment_type}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[withdrawal.status] || 'bg-gray-500/20 text-gray-400'}`}>
                        {withdrawal.status}
                      </span>
                    </td>
                    <td className="text-gray-400 text-xs lg:text-sm hidden sm:table-cell">
                      {formatDate(withdrawal.created_at)}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1 lg:gap-2">
                        <button
                          onClick={() => {
                            setSelectedWithdrawal(withdrawal);
                            setAdminNote(withdrawal.admin_note || '');
                          }}
                          className="p-1.5 lg:p-2 rounded-lg bg-dark-600 text-gray-400 hover:text-white hover:bg-dark-500 transition-colors"
                          title="View Details"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        {withdrawal.status === 'pending' && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedWithdrawal(withdrawal);
                                setAdminNote('');
                                handleApprove(withdrawal);
                              }}
                              className="p-1.5 lg:p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                              title="Approve"
                            >
                              <FiCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedWithdrawal(withdrawal);
                                setAdminNote('');
                              }}
                              className="p-1.5 lg:p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                              title="Reject"
                            >
                              <FiX className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {withdrawal.status === 'approved' && (
                          <button
                            onClick={() => handleComplete(withdrawal)}
                            className="p-1.5 lg:p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                            title="Mark Complete"
                          >
                            <FiCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-dark-400">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
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
      </div>

      {/* Detail Modal */}
      {selectedWithdrawal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => {
            setSelectedWithdrawal(null);
            setAdminNote('');
          }}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="card p-4 lg:p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Withdrawal Details</h3>
              <button
                onClick={() => {
                  setSelectedWithdrawal(null);
                  setAdminNote('');
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-4 bg-dark-700 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-purple-500 flex items-center justify-center font-bold text-white text-xl">
                  {selectedWithdrawal.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-semibold text-white">{selectedWithdrawal.username}</p>
                  <p className="text-sm text-gray-500">{selectedWithdrawal.email}</p>
                </div>
              </div>

              {/* Amount & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-semibold text-red-400">₹{parseFloat(selectedWithdrawal.amount || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${statusColors[selectedWithdrawal.status]}`}>
                    {selectedWithdrawal.status}
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="p-4 bg-dark-700 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  {getPaymentIcon(selectedWithdrawal.payment_type)}
                  <p className="font-medium text-white capitalize">{selectedWithdrawal.payment_type} Details</p>
                </div>

                {selectedWithdrawal.payment_type === 'upi' && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">UPI ID</span>
                      <span className="text-white font-mono">{selectedWithdrawal.upi_id}</span>
                    </div>
                  </div>
                )}

                {selectedWithdrawal.payment_type === 'crypto' && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Wallet Type</span>
                      <span className="text-white">{selectedWithdrawal.wallet_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Wallet Address</span>
                      <span className="text-white font-mono text-sm break-all">{selectedWithdrawal.wallet_address}</span>
                    </div>
                  </div>
                )}

                {selectedWithdrawal.payment_type === 'bank' && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bank</span>
                      <span className="text-white">{selectedWithdrawal.bank_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Account Holder</span>
                      <span className="text-white">{selectedWithdrawal.account_holder}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Account Number</span>
                      <span className="text-white font-mono">{selectedWithdrawal.account_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">IFSC Code</span>
                      <span className="text-white font-mono">{selectedWithdrawal.ifsc_code}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Requested</p>
                  <p className="font-semibold text-white text-sm">{formatDate(selectedWithdrawal.created_at)}</p>
                </div>
                {selectedWithdrawal.processed_at && (
                  <div className="p-3 bg-dark-700 rounded-lg">
                    <p className="text-sm text-gray-500">Processed</p>
                    <p className="font-semibold text-white text-sm">{formatDate(selectedWithdrawal.processed_at)}</p>
                  </div>
                )}
              </div>

              {/* Admin Note */}
              {(selectedWithdrawal.status === 'pending' || selectedWithdrawal.admin_note) && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Admin Note {selectedWithdrawal.status === 'pending' && '(required for rejection)'}
                  </label>
                  {selectedWithdrawal.status === 'pending' ? (
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Add a note..."
                      rows={3}
                      className="input-premium w-full resize-none"
                    />
                  ) : (
                    <div className="p-3 bg-dark-700 rounded-lg">
                      <p className="text-white">{selectedWithdrawal.admin_note || 'No note'}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              {selectedWithdrawal.status === 'pending' && (
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => handleReject(selectedWithdrawal)}
                    disabled={processing}
                    className="flex-1 py-3 rounded-lg font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => handleApprove(selectedWithdrawal)}
                    disabled={processing}
                    className="flex-1 py-3 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent-600 transition-colors disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              )}

              {selectedWithdrawal.status === 'approved' && (
                <div className="pt-4">
                  <button
                    onClick={() => handleComplete(selectedWithdrawal)}
                    disabled={processing}
                    className="w-full py-3 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent-600 transition-colors disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Mark as Completed'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default AdminWithdrawals;
