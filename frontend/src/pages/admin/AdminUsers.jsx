import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiPlus } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import api from '../../services/api';

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [addAmount, setAddAmount] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/users?page=${page}&limit=20`);
      setUsers(response.data.data.users);
      setPagination(response.data.data.pagination);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBalance = async () => {
    if (!selectedUser || !addAmount || parseFloat(addAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setAdding(true);
    try {
      const response = await api.post(`/admin/users/${selectedUser.id}/balance`, {
        amount: parseFloat(addAmount)
      });
      if (response.data.success) {
        toast.success(`Added ${addAmount} coins to ${selectedUser.username}`);
        setSelectedUser(null);
        setAddAmount('');
        fetchUsers();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add balance');
    } finally {
      setAdding(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-gray-500">Manage users and balances</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="input-premium w-full pl-12"
        />
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="bg-dark-700">
                <tr>
                  <th>User</th>
                  <th className="hidden sm:table-cell">Email</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right hidden md:table-cell">Spent</th>
                  <th className="text-right hidden md:table-cell">Earned</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-400">
                {filteredUsers.map((user, i) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-dark-700 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900 text-sm lg:text-base">
                          {user.username[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-white block">{user.username}</span>
                          <span className="text-xs text-gray-500 sm:hidden">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-gray-400 hidden sm:table-cell">{user.email}</td>
                    <td className="text-right">
                      <span className="font-semibold text-accent">
                        {parseFloat(user.balance).toLocaleString()}
                      </span>
                    </td>
                    <td className="text-right text-gray-400 hidden md:table-cell">
                      {parseFloat(user.total_spent || 0).toLocaleString()}
                    </td>
                    <td className="text-right text-green-400 hidden md:table-cell">
                      {parseFloat(user.total_earned || 0).toLocaleString()}
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="px-2 py-1.5 lg:px-4 lg:py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-xs lg:text-sm font-medium"
                      >
                        <FiPlus className="inline mr-1" />
                        <span className="hidden sm:inline">Add Balance</span>
                        <span className="sm:hidden">Add</span>
                      </button>
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

      {/* Add Balance Modal */}
      {selectedUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedUser(null)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="card p-4 lg:p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-6">Add Balance</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-dark-700 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center font-bold text-dark-900 text-xl">
                  {selectedUser.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white">{selectedUser.username}</p>
                  <p className="text-sm text-gray-500">Current: {parseFloat(selectedUser.balance).toLocaleString()} coins</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Amount</label>
                <div className="relative">
                  <GiTwoCoins className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="input-premium w-full pl-12"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex-1 py-3 rounded-lg font-semibold bg-dark-700 text-white hover:bg-dark-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddBalance}
                  disabled={adding}
                  className="flex-1 py-3 rounded-lg font-semibold bg-accent text-dark-900 hover:bg-accent-600 transition-colors disabled:opacity-50"
                >
                  {adding ? 'Adding...' : 'Add Balance'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default AdminUsers;
