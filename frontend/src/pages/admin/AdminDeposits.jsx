import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiFilter, FiCheck, FiX, FiEye, FiChevronDown } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import api from '../../services/api';

const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  refunded: 'bg-purple-500/20 text-purple-400',
};

function AdminDeposits() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    fetchDeposits();
  }, [page, statusFilter]);

  const fetchDeposits = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      const response = await api.get(`/admin/deposits?${params}`);
      setDeposits(response.data.data.deposits || []);
      setPagination(response.data.data.pagination);
    } catch (error) {
      toast.error('Failed to load deposits');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (deposit) => {
    setProcessing(true);
    try {
      const response = await api.post(`/admin/deposits/${deposit.id}/approve`);
      if (response.data.success) {
        toast.success('Deposit approved successfully');
        setSelectedDeposit(null);
        fetchDeposits();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve deposit');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (deposit) => {
    setProcessing(true);
    try {
      const response = await api.post(`/admin/deposits/${deposit.id}/reject`);
      if (response.data.success) {
        toast.success('Deposit rejected');
        setSelectedDeposit(null);
        fetchDeposits();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject deposit');
    } finally {
      setProcessing(false);
    }
  };

  const filteredDeposits = deposits.filter(deposit =>
    deposit.username?.toLowerCase().includes(search.toLowerCase()) ||
    deposit.email?.toLowerCase().includes(search.toLowerCase()) ||
    deposit.payment_id?.toLowerCase().includes(search.toLowerCase())
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Deposit Management</h1>
        <p className="text-gray-500">Review and approve deposit requests</p>
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
            placeholder="Search by user or payment ID..."
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
              {['all', 'pending', 'completed', 'failed', 'refunded'].map((status) => (
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

      {/* Deposits Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredDeposits.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <GiTwoCoins className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No deposits found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="bg-dark-700">
                <tr>
                  <th>User</th>
                  <th className="text-right">Amount</th>
                  <th className="hidden lg:table-cell">Package</th>
                  <th className="hidden md:table-cell">Payment</th>
                  <th className="text-center">Status</th>
                  <th className="hidden sm:table-cell">Date</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-400">
                {filteredDeposits.map((deposit, i) => (
                  <motion.tr
                    key={deposit.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-dark-700 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900 text-sm">
                          {deposit.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm lg:text-base">{deposit.username}</p>
                          <p className="text-xs text-gray-500 hidden sm:block">{deposit.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right">
                      <div>
                        <p className="font-semibold text-accent text-sm lg:text-base">{deposit.zynk_amount?.toLocaleString()} Z</p>
                        <p className="text-xs text-gray-500">₹{parseFloat(deposit.price || 0).toLocaleString()}</p>
                      </div>
                    </td>
                    <td className="text-gray-400 hidden lg:table-cell">
                      {deposit.package_name || 'Custom'}
                    </td>
                    <td className="text-gray-400 capitalize hidden md:table-cell text-sm">
                      {deposit.payment_method}
                    </td>
                    <td className="text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[deposit.status] || 'bg-gray-500/20 text-gray-400'}`}>
                        {deposit.status}
                      </span>
                    </td>
                    <td className="text-gray-400 text-xs lg:text-sm hidden sm:table-cell">
                      {formatDate(deposit.created_at)}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1 lg:gap-2">
                        <button
                          onClick={() => setSelectedDeposit(deposit)}
                          className="p-1.5 lg:p-2 rounded-lg bg-dark-600 text-gray-400 hover:text-white hover:bg-dark-500 transition-colors"
                          title="View Details"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        {deposit.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(deposit)}
                              className="p-1.5 lg:p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                              title="Approve"
                            >
                              <FiCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReject(deposit)}
                              className="p-1.5 lg:p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                              title="Reject"
                            >
                              <FiX className="w-4 h-4" />
                            </button>
                          </>
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
      {selectedDeposit && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedDeposit(null)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="card p-4 lg:p-6 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Deposit Details</h3>
              <button
                onClick={() => setSelectedDeposit(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-4 bg-dark-700 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900 text-xl">
                  {selectedDeposit.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-semibold text-white">{selectedDeposit.username}</p>
                  <p className="text-sm text-gray-500">{selectedDeposit.email}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-semibold text-accent">{selectedDeposit.zynk_amount?.toLocaleString()} Zynk</p>
                </div>
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Price</p>
                  <p className="font-semibold text-white">₹{parseFloat(selectedDeposit.price || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="font-semibold text-white capitalize">{selectedDeposit.payment_method}</p>
                </div>
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${statusColors[selectedDeposit.status]}`}>
                    {selectedDeposit.status}
                  </span>
                </div>
              </div>

              {selectedDeposit.payment_id && (
                <div className="p-3 bg-dark-700 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Payment ID</p>
                  <p className="font-mono text-sm text-white break-all">{selectedDeposit.payment_id}</p>
                </div>
              )}

              <div className="p-3 bg-dark-700 rounded-lg">
                <p className="text-sm text-gray-500">Created At</p>
                <p className="font-semibold text-white">{formatDate(selectedDeposit.created_at)}</p>
              </div>

              {/* Actions */}
              {selectedDeposit.status === 'pending' && (
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => handleReject(selectedDeposit)}
                    disabled={processing}
                    className="flex-1 py-3 rounded-lg font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => handleApprove(selectedDeposit)}
                    disabled={processing}
                    className="flex-1 py-3 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent-600 transition-colors disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Approve'}
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

export default AdminDeposits;
