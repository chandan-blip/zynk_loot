import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiPhone, FiAlertCircle, FiGift } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import * as api from '../services/api';
import useStore from '../store/useStore';
import { validatePhone } from '../utils/validators';
import usePageTitle from '../hooks/usePageTitle';

function Register() {
  usePageTitle('Register');

  const [searchParams] = useSearchParams();
  const [authMethod, setAuthMethod] = useState('phone');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useStore();
  const navigate = useNavigate();

  const validateForm = () => {
    const contact = authMethod === 'email' ? email : phone;
    if (!username || !contact || !password) {
      setError('Please fill in all fields');
      return false;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    const payload = {
      username,
      password,
      referralCode: referralCode || undefined,
    };

    if (authMethod === 'phone') {
      const result = validatePhone(phone);
      if (!result.valid) {
        setError('Invalid phone number');
        return;
      }
      payload.phone = result.phone;
    } else {
      payload.email = email;
    }

    setLoading(true);
    try {
      const response = await api.register(payload);
      if (response.data.success) {
        login(response.data.data.token, response.data.data.user);
        toast.success('Account created successfully!');
        navigate('/');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed';
      setError(msg);
      toast.error(msg);
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
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
              <GiTwoCoins className="w-7 h-7 text-dark-900" />
            </div>
            <span className="text-2xl font-bold text-white">LOOT</span>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-gray-500">Sign up to get started</p>
        </div>

        {/* Form */}
        <div className="card p-8">
          {/* Auth Method Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-dark-700 mb-6">
            <button
              type="button"
              onClick={() => setAuthMethod('phone')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                authMethod === 'phone'
                  ? 'bg-dark-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FiPhone className="w-4 h-4" />
              Phone
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('email')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                authMethod === 'email'
                  ? 'bg-dark-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FiMail className="w-4 h-4" />
              Email
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
              <div className="relative">
                <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50))}
                  className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                  placeholder="Choose a username"
                />
              </div>
            </div>

            {/* Phone or Email */}
            {authMethod === 'phone' ? (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Phone Number</label>
                <div className="relative">
                  <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                  <input
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    value={phone}
                    maxLength={11}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); setPhone(v); }}
                    className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                    placeholder="99099 12345"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                <div className="relative">
                  <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            {/* Referral Code */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Referral Code <span className="text-dark-200">(optional)</span></label>
              <div className="relative">
                <FiGift className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                <input
                  type="text"
                  name="referralCode"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                  placeholder="Enter referral code"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              className="bg-dark-400 rounded-lg w-full py-3.5 text-lg disabled:opacity-50"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Creating account...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <FiUser className="w-5 h-5" />
                  <span>Create Account</span>
                </span>
              )}
            </motion.button>
          </form>

          <div className="mt-6 text-center text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default Register;
