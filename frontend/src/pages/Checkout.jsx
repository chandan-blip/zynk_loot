import { useState, useEffect } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft,
  FiCreditCard,
  FiSmartphone,
  FiCopy,
  FiCheck,
  FiAlertCircle,
  FiPackage,
  FiGift,
  FiClock,
  FiShield,
  FiLock,
  FiChevronRight,
  FiInfo
} from 'react-icons/fi';
import { SiBitcoin, SiEthereum, SiTether } from 'react-icons/si';
import { getZynkPackages, getPaymentSettings, checkout } from '../services/api';
import { useCurrency } from '../contexts/CurrencyContext';

const PAYMENT_METHODS = [
  { id: 'upi', name: 'UPI', icon: FiSmartphone, color: 'from-purple-500 to-pink-500', description: 'GPay, PhonePe, Paytm' },
  { id: 'bank', name: 'Bank Transfer', icon: FiCreditCard, color: 'from-blue-500 to-cyan-500', description: 'NEFT / IMPS / RTGS' },
  { id: 'crypto_btc', name: 'Bitcoin', icon: SiBitcoin, color: 'from-orange-500 to-yellow-500', description: 'BTC Network' },
  { id: 'crypto_eth', name: 'Ethereum', icon: SiEthereum, color: 'from-indigo-500 to-purple-500', description: 'ETH Network' },
  { id: 'crypto_usdt', name: 'USDT', icon: SiTether, color: 'from-green-500 to-emerald-500', description: 'TRC20 Network' }
];

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { zynkToUsd, currencies } = useCurrency();

  // Map payment method to currency
  const getPaymentCurrency = (method) => {
    if (!method) return { symbol: '$', rate: zynkToUsd, code: 'USD' };
    if (method === 'upi' || method === 'bank') {
      const inr = currencies.find(c => c.code === 'INR');
      return inr ? { symbol: inr.symbol || '₹', rate: inr.rateFromZynk, code: 'INR' } : { symbol: '₹', rate: zynkToUsd * 83, code: 'INR' };
    }
    if (method === 'crypto_btc') {
      const btc = currencies.find(c => c.code === 'BTC');
      return btc ? { symbol: '', rate: btc.rateFromZynk, code: 'BTC', precision: 8 } : { symbol: '', rate: zynkToUsd / 60000, code: 'BTC', precision: 8 };
    }
    if (method === 'crypto_eth') {
      const eth = currencies.find(c => c.code === 'ETH');
      return eth ? { symbol: '', rate: eth.rateFromZynk, code: 'ETH', precision: 6 } : { symbol: '', rate: zynkToUsd / 3000, code: 'ETH', precision: 6 };
    }
    if (method === 'crypto_usdt') {
      const usdt = currencies.find(c => c.code === 'USDT');
      return usdt ? { symbol: '', rate: usdt.rateFromZynk, code: 'USDT', precision: 2 } : { symbol: '$', rate: zynkToUsd, code: 'USDT' };
    }
    return { symbol: '$', rate: zynkToUsd, code: 'USD' };
  };

  const formatPaymentAmount = (zynkAmount, method) => {
    const curr = getPaymentCurrency(method);
    const amount = zynkAmount * curr.rate;
    const precision = curr.precision || 2;
    if (curr.code === 'INR') return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (['BTC', 'ETH'].includes(curr.code)) return `${amount.toFixed(precision)} ${curr.code}`;
    if (curr.code === 'USDT') return `${amount.toFixed(2)} USDT`;
    return `$${amount.toFixed(2)}`;
  };

  const packageId = searchParams.get('package');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [paymentSettings, setPaymentSettings] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState(null);

  useEffect(() => {
    if (!packageId) {
      navigate('/wallet');
      return;
    }
    fetchData();
  }, [packageId]);

  const fetchData = async () => {
    try {
      const [packagesRes, settingsRes] = await Promise.all([
        getZynkPackages(),
        getPaymentSettings()
      ]);

      const packages = packagesRes.data.data;
      const pkg = packages.find(p => p.id === parseInt(packageId));

      if (!pkg) {
        navigate('/wallet');
        return;
      }

      setSelectedPackage(pkg);
      setPaymentSettings(settingsRes.data.data);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load checkout data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleMethodSelect = (methodId) => {
    setSelectedMethod(methodId);
    let accountId = null;
    if (paymentSettings) {
      if (methodId === 'upi') accountId = paymentSettings.upi?.accountId;
      else if (methodId === 'bank') accountId = paymentSettings.bank?.accountId;
      else if (methodId === 'crypto_btc') accountId = paymentSettings.crypto?.btc?.accountId;
      else if (methodId === 'crypto_eth') accountId = paymentSettings.crypto?.eth?.accountId;
      else if (methodId === 'crypto_usdt') accountId = paymentSettings.crypto?.usdt?.accountId;
    }
    setSelectedAccountId(accountId);
    setStep(2);
  };

  const getValidationMessage = () => {
    if (!paymentReference.trim()) {
      if (selectedMethod === 'upi') return 'Please enter the UTR number or transaction ID from your UPI app';
      if (selectedMethod === 'bank') return 'Please enter the UTR number or transaction reference from your bank';
      if (selectedMethod?.startsWith('crypto_')) return 'Please enter the transaction hash (TxID) from your wallet';
      return 'Please enter the payment reference';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = getValidationMessage();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      await checkout(
        selectedPackage.id,
        selectedMethod,
        selectedAccountId,
        paymentReference.trim(),
        paymentNote.trim() || null
      );
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit order');
    } finally {
      setSubmitting(false);
    }
  };

  const isMethodAvailable = (methodId) => {
    if (!paymentSettings) return false;
    if (paymentSettings.availableTypes) {
      return !!paymentSettings.availableTypes[methodId];
    }
    if (methodId === 'upi') return !!paymentSettings.upi?.id;
    if (methodId === 'bank') return !!paymentSettings.bank?.account;
    if (methodId.startsWith('crypto_')) {
      const type = methodId.replace('crypto_', '');
      return !!paymentSettings.crypto?.[type]?.address;
    }
    return false;
  };

  const renderPaymentDetails = () => {
    if (!paymentSettings || !selectedMethod) return null;

    const CopyButton = ({ text, label }) => (
      <button
        onClick={() => copyToClipboard(text, label)}
        className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition-all group"
      >
        {copied === label ? (
          <FiCheck className="w-4 h-4 text-green-400" />
        ) : (
          <FiCopy className="w-4 h-4 text-gray-400 group-hover:text-white" />
        )}
      </button>
    );

    switch (selectedMethod) {
      case 'upi':
        return (
          <div className="space-y-4">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
              <div className="text-center mb-4">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <FiSmartphone className="w-7 h-7 text-white" />
                </div>
                <p className="text-gray-400 text-sm">Send payment to</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-white font-mono">{paymentSettings.upi.id}</p>
                  <p className="text-gray-500 text-sm">{paymentSettings.upi.name}</p>
                </div>
                <CopyButton text={paymentSettings.upi.id} label="upi" />
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-400 bg-dark-700 rounded-lg p-3">
              <FiInfo className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <p>Open any UPI app (GPay, PhonePe, Paytm) and send the exact amount to this UPI ID</p>
            </div>
          </div>
        );

      case 'bank':
        const bankDetails = [
          { label: 'Bank Name', value: paymentSettings.bank.name, key: 'bank_name' },
          { label: 'Account Number', value: paymentSettings.bank.account, key: 'account' },
          { label: 'IFSC Code', value: paymentSettings.bank.ifsc, key: 'ifsc' },
          { label: 'Account Holder', value: paymentSettings.bank.holder, key: 'holder' }
        ];
        return (
          <div className="space-y-4">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
              <div className="text-center mb-4">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <FiCreditCard className="w-7 h-7 text-white" />
                </div>
                <p className="text-gray-400 text-sm">Bank Transfer Details</p>
              </div>
              <div className="space-y-2">
                {bankDetails.map(item => (
                  <div key={item.key} className="bg-dark-700 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-xs">{item.label}</p>
                      <p className="text-white font-mono text-sm">{item.value}</p>
                    </div>
                    <CopyButton text={item.value} label={item.key} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-400 bg-dark-700 rounded-lg p-3">
              <FiInfo className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <p>Use IMPS/NEFT to transfer the exact amount. Save the UTR number for verification.</p>
            </div>
          </div>
        );

      case 'crypto_btc':
      case 'crypto_eth':
      case 'crypto_usdt':
        const cryptoType = selectedMethod.replace('crypto_', '');
        const cryptoData = paymentSettings.crypto?.[cryptoType];
        const address = typeof cryptoData === 'string' ? cryptoData : cryptoData?.address;
        const network = typeof cryptoData === 'object' ? cryptoData?.network : null;
        const cryptoConfig = {
          btc: { name: 'Bitcoin', color: 'from-orange-500 to-yellow-500', icon: SiBitcoin, defaultNetwork: 'BTC' },
          eth: { name: 'Ethereum', color: 'from-indigo-500 to-purple-500', icon: SiEthereum, defaultNetwork: 'ERC20' },
          usdt: { name: 'USDT', color: 'from-green-500 to-emerald-500', icon: SiTether, defaultNetwork: 'TRC20' }
        };
        const config = cryptoConfig[cryptoType];
        const Icon = config.icon;
        const displayNetwork = network || config.defaultNetwork;

        return (
          <div className="space-y-4">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-5">
              <div className="text-center mb-4">
                <div className={`w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <p className="text-gray-400 text-sm">{config.name} Wallet Address</p>
                {displayNetwork && (
                  <span className="inline-block mt-2 px-2 py-1 bg-dark-700 rounded text-xs text-accent font-medium">
                    {displayNetwork} Network
                  </span>
                )}
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <p className="text-white font-mono text-sm break-all flex-1">{address}</p>
                  <CopyButton text={address} label="crypto" />
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>Only send {config.name} on the {displayNetwork} network. Sending other tokens will result in permanent loss.</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-dark-700 rounded-xl border border-dark-600 p-6"
        >
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"
            >
              <FiCheck className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-2xl font-bold text-white mb-2">Order Submitted!</h2>
            <p className="text-gray-400">
              Your payment is being verified. You'll receive your Zynk shortly.
            </p>
          </div>

          <div className="bg-dark-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                  <FiPackage className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-white font-semibold">{selectedPackage.name}</p>
                  <p className="text-gray-500 text-sm">Zynk Package</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-accent">
                  {(selectedPackage.zynk_amount + Math.floor(selectedPackage.zynk_amount * selectedPackage.bonus_percent / 100)).toLocaleString()}
                </p>
                <p className="text-gray-500 text-sm">ZYNK</p>
              </div>
            </div>

            <div className="space-y-2 text-sm border-t border-dark-600 pt-4">
              <div className="flex items-center gap-3 text-gray-400">
                <FiClock className="w-4 h-4 text-accent" />
                <span>Usually verified within 5-30 minutes</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <FiShield className="w-4 h-4 text-accent" />
                <span>Secure & verified by admin</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/wallet')}
              className="py-3 rounded-lg bg-dark-600 hover:bg-dark-500 text-white font-medium transition-colors"
            >
              Back to Wallet
            </button>
            <button
              onClick={() => navigate('/wallet?tab=history')}
              className="py-3 rounded-lg bg-accent hover:bg-accent-600 text-dark-900 font-medium transition-colors"
            >
              View Orders
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const bonusAmount = selectedPackage ? Math.floor(selectedPackage.zynk_amount * selectedPackage.bonus_percent / 100) : 0;
  const totalZynk = selectedPackage ? selectedPackage.zynk_amount + bonusAmount : 0;
  const priceUsd = selectedPackage ? (selectedPackage.zynk_amount * zynkToUsd).toFixed(2) : 0;

  return (
    <div className="mx-auto space-y-3">
      {/* Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/20 via-dark-700 to-dark-800 border border-accent/20 p-6"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : navigate('/wallet')}
              className="p-2 hover:bg-dark-600 rounded-lg transition-colors"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Checkout</h1>
              <p className="text-gray-400 text-sm">Complete your purchase</p>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step >= s
                    ? 'bg-accent text-dark-900'
                    : 'bg-dark-600 text-gray-500'
                }`}>
                  {step > s ? <FiCheck className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div className={`w-6 h-0.5 transition-all ${
                    step > s ? 'bg-accent' : 'bg-dark-600'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {/* Step 1: Select Payment Method */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-dark-700 rounded-xl border border-dark-600 p-6"
              >
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-white mb-1">Select Payment Method</h2>
                  <p className="text-gray-500 text-sm">Choose how you'd like to pay</p>
                </div>

                <div className="space-y-3">
                  {PAYMENT_METHODS.map(method => {
                    const Icon = method.icon;
                    const available = isMethodAvailable(method.id);

                    return (
                      <motion.button
                        key={method.id}
                        whileHover={available ? { scale: 1.01 } : {}}
                        whileTap={available ? { scale: 0.99 } : {}}
                        onClick={() => available && handleMethodSelect(method.id)}
                        disabled={!available}
                        className={`w-full p-4 rounded-xl border transition-all flex items-center justify-between group ${
                          available
                            ? 'border-dark-500 hover:border-accent bg-dark-800 hover:bg-dark-600 cursor-pointer'
                            : 'border-dark-600 bg-dark-800/50 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${method.color} flex items-center justify-center`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="text-left">
                            <p className="text-white font-medium">{method.name}</p>
                            <p className="text-gray-500 text-sm">{method.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {available && selectedPackage && (
                            <span className="text-sm text-white font-semibold">
                              {formatPaymentAmount(selectedPackage.zynk_amount, method.id)}
                            </span>
                          )}
                          {available && (
                            <FiChevronRight className="w-5 h-5 text-gray-500 group-hover:text-accent transition-colors" />
                          )}
                          {!available && (
                            <span className="text-xs text-gray-600 bg-dark-700 px-2 py-1 rounded">Unavailable</span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 2: Payment Details */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-dark-700 rounded-xl border border-dark-600 p-6"
              >
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-white mb-1">Payment Details</h2>
                  <p className="text-gray-500 text-sm">Send payment using the details below</p>
                </div>

                {renderPaymentDetails()}

                {/* Amount to Pay */}
                <div className="mt-6 bg-accent/10 border border-accent/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">Amount to Pay</p>
                      <p className="text-xs text-gray-500">Send this exact amount</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">{formatPaymentAmount(selectedPackage.zynk_amount, selectedMethod)}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStep(3)}
                  className="w-full mt-6 py-3 rounded-lg bg-accent hover:bg-accent-600 text-dark-900 font-semibold transition-colors flex items-center justify-center"
                >
                  I've Made the Payment
                  <FiChevronRight className="w-5 h-5 ml-2" />
                </button>
              </motion.div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-dark-700 rounded-xl border border-dark-600 p-6"
              >
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-white mb-1">Confirm Payment</h2>
                    <p className="text-gray-500 text-sm">Enter your payment details for verification</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        {selectedMethod === 'upi' && 'UTR Number / Transaction ID'}
                        {selectedMethod === 'bank' && 'UTR Number / Transaction Reference'}
                        {selectedMethod?.startsWith('crypto_') && 'Transaction Hash (TxID)'}
                        <span className="text-red-400 ml-1">*</span>
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder={
                          selectedMethod === 'upi' ? 'e.g., 123456789012' :
                          selectedMethod === 'bank' ? 'e.g., HDFC12345678901234' :
                          selectedMethod?.startsWith('crypto_') ? 'e.g., 0x1234...abcd' :
                          'Enter transaction reference'
                        }
                        className={`input-premium w-full ${error && !paymentReference.trim() ? 'border-red-500' : ''}`}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {selectedMethod === 'upi' && 'You can find the UTR number in your UPI app payment history'}
                        {selectedMethod === 'bank' && 'Check your bank statement or net banking for the UTR/reference number'}
                        {selectedMethod?.startsWith('crypto_') && 'Copy the transaction hash from your wallet or blockchain explorer'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Additional Notes <span className="text-gray-600">(optional)</span>
                      </label>
                      <textarea
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value)}
                        placeholder="Any additional information about your payment"
                        rows={3}
                        className="input-premium w-full resize-none"
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3"
                    >
                      <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                      {error}
                    </motion.div>
                  )}

                  <div className="bg-dark-800 rounded-lg p-4 flex items-start gap-3">
                    <FiLock className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-400">
                      By submitting, you confirm that you have sent the payment. Your Zynk will be credited once the payment is verified by our team.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !paymentReference.trim()}
                    className="w-full py-3 rounded-lg bg-accent hover:bg-accent-600 text-dark-900 font-semibold transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                        Submitting...
                      </span>
                    ) : (
                      <>
                        <FiCheck className="w-5 h-5 mr-2" />
                        Submit for Verification
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-2">
          <div className="sticky top-24">
            <div className="bg-dark-700 rounded-xl border border-dark-600">
              <div className="p-5 border-b border-dark-600">
                <h3 className="text-lg font-semibold text-white">Order Summary</h3>
              </div>

              {selectedPackage && (
                <div className="p-5 space-y-5">
                  {/* Package Info */}
                  <div className="flex items-center gap-4 p-4 bg-dark-800 rounded-lg">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-400 flex items-center justify-center">
                      <FiPackage className="w-6 h-6 text-dark-900" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold">{selectedPackage.name}</p>
                      <p className="text-gray-500 text-sm">Zynk Package</p>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Base Amount</span>
                      <span className="text-white font-medium">{selectedPackage.zynk_amount.toLocaleString()} Z</span>
                    </div>
                    {bonusAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400 flex items-center gap-2">
                          <FiGift className="text-green-400" />
                          Bonus ({selectedPackage.bonus_percent}%)
                        </span>
                        <span className="text-green-400 font-medium">+{bonusAmount.toLocaleString()} Z</span>
                      </div>
                    )}
                    <div className="h-px bg-dark-600" />
                    <div className="flex justify-between">
                      <span className="text-gray-300 font-medium">You'll Receive</span>
                      <span className="text-xl font-bold text-accent">{totalZynk.toLocaleString()} Z</span>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Total Price</span>
                      <div className="text-right">
                        <p className="text-xl font-bold text-white">{formatPaymentAmount(selectedPackage.zynk_amount, selectedMethod)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Trust Badges */}
                  <div className="pt-4 border-t border-dark-600 space-y-2">
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <FiShield className="w-4 h-4 text-accent" />
                      <span>Secure & verified payments</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <FiClock className="w-4 h-4 text-accent" />
                      <span>Usually processed in 5-30 min</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <FiLock className="w-4 h-4 text-accent" />
                      <span>Manual verification for safety</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
