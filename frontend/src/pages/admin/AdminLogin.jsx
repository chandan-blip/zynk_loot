import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiShield } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import * as api from '../../services/api';
import useStore from '../../store/useStore';

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await api.login({ email, password });
      if (response.data.success) {
        const userData = response.data.data.user;

        if (!userData.isAdmin) {
          toast.error('Access denied. Admin privileges required.');
          setLoading(false);
          return;
        }

        login(response.data.data.token, userData);
        toast.success('Welcome, Admin!');
        navigate('/admin');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-dark-800">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-red-500 mb-4">
            <FiShield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-gray-500">Restricted access</p>
        </div>

        {/* Form */}
        <div className="card p-8">
          {/* Warning */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-center">
            <FiShield className="w-5 h-5 mx-auto text-red-400 mb-2" />
            <p className="text-red-400 text-sm">
              Authorized personnel only
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Admin Email
              </label>
              <div className="relative">
                <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-premium w-full pl-12"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Password
              </label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-premium w-full pl-12"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg font-semibold text-lg bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <FiShield className="w-5 h-5" />
                  <span>Access Admin Panel</span>
                </span>
              )}
            </motion.button>
          </form>

          {/* Back */}
          <div className="mt-6 text-center">
            <a href="/" className="text-gray-500 hover:text-gray-400 text-sm">
              &larr; Back to Home
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default AdminLogin;
