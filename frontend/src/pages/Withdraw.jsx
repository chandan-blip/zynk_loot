import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  FiArrowLeft,
  FiCreditCard,
  FiArrowUpCircle,
  FiClock,
  FiCalendar,
  FiLock,
  FiEye,
  FiEyeOff,
} from 'react-icons/fi';
import useStore from '../store/useStore';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  getWalletBalance,
  getPaymentMethods,
  getWithdrawals,
  requestWithdrawal,
} from '../services/api';
import usePageTitle from '../hooks/usePageTitle';

function Withdraw() {
  usePageTitle('Withdraw');

  const navigate = useNavigate();
  const { updateBalance } = useStore();
  const { formatCurrency } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState({ balance: 0 });
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: '', payment_method_id: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balRes, methodsRes, wdRes] = await Promise.all([
        getWalletBalance(),
        getPaymentMethods(),
        getWithdrawals(),
      ]);
      setBalance(balRes.data.data);
      setPaymentMethods(methodsRes.data.data);
      setWithdrawals(wdRes.data.data.withdrawals || []);
    } catch (err) {
      console.error('[Withdraw] fetch error:', err);
      toast.error("Couldn't load withdrawal info");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Walk through every failure case so the user always gets a toast.
    if (paymentMethods.length === 0) {
      toast.error('Add a payment method before requesting a withdrawal.');
      return;
    }
    if (balance.canWithdraw === false) {
      if ((balance.totalDeposited || 0) >= 200) {
        const gap = Math.ceil(balance.depositGapForWithdrawal || 0);
        toast.error(
          `Withdrawals are locked. Deposit ${formatCurrency(gap)} more to unlock (min ${formatCurrency(balance.minDepositForWithdrawal || 1000)}).`
        );
      } else {
        toast.error('You need to deposit funds before you can withdraw.');
      }
      return;
    }
    const withdrawable = parseFloat(balance.balance) || 0;
    if (withdrawable <= 0) {
      toast.error('Your withdrawable balance is ₹0.');
      return;
    }
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount)) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (amount < 1000) {
      toast.error(`Minimum withdrawal is ${formatCurrency(1000)}.`);
      return;
    }
    if (amount > withdrawable) {
      toast.error(`Amount exceeds your withdrawable balance (${formatCurrency(withdrawable)}).`);
      return;
    }
    if (!form.payment_method_id) {
      toast.error('Please select a payment method.');
      return;
    }
    if (!form.password) {
      toast.error('Please enter your account password to confirm.');
      return;
    }

    setSubmitting(true);
    setPasswordError('');
    try {
      const res = await requestWithdrawal(amount, parseInt(form.payment_method_id), form.password);
      toast.success('Withdrawal request submitted!');
      updateBalance(res.data.data.newBalance);
      setBalance(prev => ({ ...prev, balance: res.data.data.newBalance }));
      setForm({ amount: '', payment_method_id: '', password: '' });
      fetchData();
    } catch (error) {
      const msg = error.response?.data?.message || 'Withdrawal failed. Please try again.';
      if (error.response?.status === 401 || /password/i.test(msg)) {
        setPasswordError(msg);
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const withdrawableBalance = balance.canWithdraw === false ? 0 : parseFloat(balance.balance) || 0;

  // First-actionable reason the submit button is disabled (shown inline).
  const amountNum = parseFloat(form.amount);
  const disabledReason = (() => {
    if (balance.canWithdraw === false && (balance.totalDeposited || 0) >= 200) {
      return `Withdrawals are locked. Deposit at least ${formatCurrency(balance.minDepositForWithdrawal || 1000)} to unlock.`;
    }
    if (withdrawableBalance <= 0) return 'Your withdrawable balance is ₹0.';
    if (!form.amount) return 'Enter an amount to withdraw.';
    if (isNaN(amountNum) || amountNum < 1000) return `Minimum withdrawal is ${formatCurrency(1000)}.`;
    if (amountNum > withdrawableBalance) return `Amount exceeds your withdrawable balance (${formatCurrency(withdrawableBalance)}).`;
    if (!form.payment_method_id) return 'Select a payment method.';
    if (!form.password) return 'Enter your account password to confirm.';
    return '';
  })();

  return (
    <div className="mx-auto space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/wallet')}
          className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 hover:text-white transition-colors"
          aria-label="Back to wallet"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Withdraw Funds</h1>
        </div>
      </div>

      {/* Balance summary — total vs withdrawable */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Balance</p>
          <p className="text-xl font-bold text-white">{formatCurrency(balance.balance)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${
          balance.canWithdraw === false
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-accent/10 border-accent/30'
        }`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Withdrawable</p>
          <p className={`text-xl font-bold ${balance.canWithdraw === false ? 'text-red-300' : 'text-accent'}`}>
            {formatCurrency(withdrawableBalance)}
          </p>
          {balance.canWithdraw === false && (balance.totalDeposited || 0) >= 200 && (
            <p className="text-[10px] text-red-300/80 mt-1 leading-snug">
              Locked — deposit at least {formatCurrency(balance.minDepositForWithdrawal || 1000)} to unlock.
            </p>
          )}
        </div>
      </div>

      {/* Withdrawal Form */}
      <div className="bg-dark-800 rounded-2xl border border-dark-600 p-5">
        {paymentMethods.length === 0 ? (
          <div className="text-center py-8">
            <FiCreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">Add a payment method first</p>
            <button
              onClick={() => navigate('/wallet?tab=methods')}
              className="btn-premium px-6 py-2"
            >
              Add Payment Method
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Amount (min {formatCurrency(1000)})</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1000"
                min="1000"
                max={withdrawableBalance}
                className="input-premium w-full"
              />
              {balance.canWithdraw !== false && (
                <p className="text-xs text-gray-500 mt-1">Withdrawable: {formatCurrency(withdrawableBalance)}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Payment Method</label>
              <select
                value={form.payment_method_id}
                onChange={(e) => setForm({ ...form, payment_method_id: e.target.value })}
                className="input-premium w-full"
              >
                <option value="">Select payment method</option>
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label} ({method.type.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {balance.canWithdraw === false && (balance.totalDeposited || 0) >= 200 && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-1">
                <p className="text-sm font-semibold text-red-300">Withdrawals locked</p>
                <p className="text-xs text-red-200/80 leading-relaxed">
                  Unlock after you've deposited at least{' '}
                  <span className="font-semibold text-red-200">
                    {formatCurrency(balance.minDepositForWithdrawal || 1000)}
                  </span>.
                  You've deposited{' '}
                  <span className="font-semibold text-red-200">
                    {formatCurrency(balance.totalDeposited || 0)}
                  </span>{' '}
                  so far — deposit{' '}
                  <span className="font-semibold text-red-200">
                    {formatCurrency(Math.ceil(balance.depositGapForWithdrawal))}
                  </span>{' '}
                  more to unlock withdrawals.
                </p>
              </div>
            )}

            <div>
              <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
                <FiLock className="w-3.5 h-3.5" />
                Confirm with your account password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    if (passwordError) setPasswordError('');
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={`input-premium w-full pr-10 ${passwordError ? '!border-red-500/60' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white rounded"
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError ? (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <FiLock className="w-3 h-3" />
                  {passwordError}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">For your security, we verify your password before processing a withdrawal.</p>
              )}
            </div>

            {disabledReason && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                {disabledReason}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-premium w-full py-3"
            >
              {submitting ? 'Submitting...' : 'Request Withdrawal'}
            </button>
          </form>
        )}
      </div>

      {/* Withdrawal Rules */}
      <div className="bg-dark-800 rounded-2xl border border-yellow-500/20 p-5">
        <p className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-1.5">
          <FiClock className="w-4 h-4" />
          Withdrawal Rules
        </p>
        <ul className="space-y-1.5 text-xs text-yellow-200/90 leading-relaxed">
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Minimum withdrawal amount is {formatCurrency(1000)} per request.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>You can make a maximum of <b>7 withdrawals</b> per day.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Withdrawals require approval/completion and may take <b>24-48 hours</b> to process.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Funds are sent only to your registered &amp; verified payment methods.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Once a request is approved, it <b>cannot be cancelled</b>.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Bonus/promotional credits are <b>also withdrawable</b>.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Network or bank processing fees (if any) will be deducted from the payout.</span></li>
          <li className="flex gap-2"><span className="text-yellow-400 shrink-0">•</span><span>Suspicious activity may pause your withdrawal pending KYC verification.</span></li>
        </ul>
      </div>

      {/* History */}
      <div className="bg-dark-700 rounded-xl border border-dark-600 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Withdrawal History</h3>
          <span className="text-xs text-gray-500">{withdrawals.length} total</span>
        </div>
        {withdrawals.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-3">
              <FiArrowUpCircle className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-gray-400 font-medium">No withdrawals yet</p>
            <p className="text-gray-500 text-sm mt-1">Your withdrawal requests will appear here</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-red-500/40 via-dark-500 to-transparent" />
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const statusColors = {
                  pending: { dot: 'bg-yellow-500', ring: 'ring-yellow-500/30', text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
                  approved: { dot: 'bg-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                  completed: { dot: 'bg-green-500', ring: 'ring-green-500/30', text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                  rejected: { dot: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                };
                const c = statusColors[w.status] || statusColors.pending;
                const destination = w.payment_type === 'upi' ? w.upi_id
                  : w.payment_type === 'crypto' ? `${w.wallet_type}: ${w.wallet_address?.slice(0, 8)}...${w.wallet_address?.slice(-6)}`
                  : w.payment_type === 'bank' ? `${w.bank_name} ****${w.account_number?.slice(-4)}`
                  : w.payment_label;
                return (
                  <motion.div
                    key={w.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative pl-12"
                  >
                    <div className={`absolute left-3 top-4 w-5 h-5 rounded-full ${c.dot} ring-4 ${c.ring} z-10`}>
                      <div className={`w-full h-full rounded-full ${c.dot} ${w.status === 'pending' ? 'animate-pulse' : ''}`} />
                    </div>
                    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 transition-all hover:scale-[1.01]`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xl font-bold text-white">−{formatCurrency(parseFloat(w.amount))}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            to <span className="text-gray-300 font-mono">{destination}</span>
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${c.text} ${c.bg} border ${c.border} whitespace-nowrap`}>
                          {w.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          <FiCalendar className="w-3 h-3" />
                          <span>{new Date(w.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="text-gray-600">•</span>
                          <span>{new Date(w.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <span className="text-gray-600">#{w.id}</span>
                      </div>
                      {w.admin_note && (
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <p className="text-xs text-gray-400">
                            <span className="text-gray-500">Note:</span> {w.admin_note}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Withdraw;
