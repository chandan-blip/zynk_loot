import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiUserPlus, FiPhone, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import * as api from '../services/api';
import useStore from '../store/useStore';
import { validateEmail, validatePhone } from '../utils/validators';

function Register() {
  const [authMethod, setAuthMethod] = useState('phone'); // 'email' | 'phone'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [validation, setValidation] = useState(null); // { valid, error, ... }
  const { login } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  // Live validation for email/phone
  useEffect(() => {
    if (authMethod === 'email' && email.length > 3) {
      setValidation(validateEmail(email));
    } else if (authMethod === 'phone' && phone.length > 3) {
      setValidation(validatePhone(phone));
    } else {
      setValidation(null);
    }
  }, [email, phone, authMethod]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    if (!username) { setError('Username is required'); return; }
    if (!password || !confirmPassword) { setError('Please fill in all fields'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    // Validate contact method
    let normalizedPhone = undefined;
    if (authMethod === 'email') {
      const result = validateEmail(email);
      if (!result.valid) { setError(result.error); return; }
    } else {
      const result = validatePhone(phone);
      if (!result.valid) { setError(result.error); return; }
      normalizedPhone = result.phone;
    }

    setLoading(true);
    try {
      const response = await api.register({
        username,
        email: authMethod === 'email' ? email : undefined,
        phone: authMethod === 'phone' ? normalizedPhone : undefined,
        password,
        referralCode: referralCode || undefined,
      });
      if (response.data.success) {
        login(response.data.data.token, response.data.data.user);
        toast.success('Account created successfully!');
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
          <p className="text-gray-500">Join and start winning</p>
          {referralCode && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm">
              <FiUserPlus className="w-4 h-4" />
              <span>Referred by: <span className="font-mono font-bold">{referralCode}</span></span>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="card p-8">
          {/* Auth Method Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-dark-700 mb-6">
            <button
              type="button"
              onClick={() => { setAuthMethod('phone'); setValidation(null); }}
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
              onClick={() => { setAuthMethod('email'); setValidation(null); }}
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
              <div className="relative">
                <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                    value={phone}
                    maxLength={11}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); setPhone(v); }}
                    className={`input w-full pl-12 pr-10 py-3 bg-transparent border rounded-lg outline-none ${
                      validation
                        ? validation.valid ? 'border-green-500/50' : 'border-red-500/50'
                        : 'border-dark-200'
                    }`}
                    placeholder="98765 43210"
                  />
                  {validation && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {validation.valid
                        ? <FiCheck className="w-4 h-4 text-green-400" />
                        : <FiAlertCircle className="w-4 h-4 text-red-400" />
                      }
                    </div>
                  )}
                </div>
                {validation && !validation.valid && (
                  <p className="text-red-400 text-xs mt-1">{validation.error}</p>
                )}
                {validation && validation.valid && (
                  <p className="text-green-400/70 text-xs mt-1 flex items-center gap-1.5">
                    <span>{validation.countryName || 'Detected'}</span>
                    <span className="text-gray-500">·</span>
                    <span className="font-mono text-green-400">{validation.phone}</span>
                    {validation.isVoip && <span className="text-amber-400 ml-1">(VoIP)</span>}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                <div className="relative">
                  <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`input w-full pl-12 pr-10 py-3 bg-transparent border rounded-lg outline-none ${
                      validation
                        ? validation.valid ? 'border-green-500/50' : 'border-red-500/50'
                        : 'border-dark-200'
                    }`}
                    placeholder="your@email.com"
                  />
                  {validation && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {validation.valid
                        ? <FiCheck className="w-4 h-4 text-green-400" />
                        : <FiAlertCircle className="w-4 h-4 text-red-400" />
                      }
                    </div>
                  )}
                </div>
                {validation && !validation.valid && (
                  <p className="text-red-400 text-xs mt-1">{validation.error}</p>
                )}
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                  placeholder="Create a password"
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Confirm Password</label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-200 w-5 h-5" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full pl-12 pr-4 py-3 bg-transparent border border-dark-200 rounded-lg outline-none"
                  placeholder="Confirm your password"
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
                  <FiUserPlus className="w-5 h-5" />
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
