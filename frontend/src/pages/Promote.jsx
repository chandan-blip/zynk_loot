import { useState, useEffect } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { motion } from 'framer-motion';
import {
  FiShare2,
  FiCopy,
  FiCheck,
  FiUsers,
  FiDollarSign,
  FiClock,
  FiUser
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { generateReferralCode, getReferralStats, getReferralList } from '../services/api';
import PageHeader from '../components/PageHeader';

function Promote() {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, listRes] = await Promise.all([
        getReferralStats(),
        getReferralList()
      ]);
      setStats(statsRes.data.data);
      setReferrals(listRes.data.data || []);
    } catch (error) {
      console.error('Failed to fetch referral data:', error);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const response = await generateReferralCode();
      if (response.data.success) {
        setStats(prev => ({ ...prev, referralCode: response.data.data.referralCode }));
        toast.success('Referral code generated!');
      }
    } catch (error) {
      toast.error('Failed to generate referral code');
    } finally {
      setGenerating(false);
    }
  };

  const referralLink = stats?.referralCode
    ? `${window.location.origin}/register?ref=${stats.referralCode}`
    : null;

  const copyLink = () => {
    if (!referralLink) return;
    copyToClipboard(referralLink);
    setCopied(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-4">
      <PageHeader icon={FiShare2} title="Promote" description="Earn commission with referrals" />

      {/* Referral Link Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-700 via-dark-800 to-dark-700 border border-dark-500"
      >
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <FiShare2 className="text-accent" />
            Your Referral Link
          </h2>

          {stats?.referralCode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 p-3 rounded-lg bg-dark-600 border border-dark-500 font-mono text-sm text-gray-300 truncate">
                  {referralLink}
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={copyLink}
                  className="flex items-center gap-2 px-5 py-3 rounded-lg bg-accent text-dark-900 font-semibold hover:bg-accent/90 transition-colors"
                >
                  {copied ? (
                    <>
                      <FiCheck className="w-5 h-5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <FiCopy className="w-5 h-5" />
                      <span>Copy</span>
                    </>
                  )}
                </motion.button>
              </div>
              <p className="text-gray-500 text-sm">
                Your code: <span className="font-mono text-accent font-bold">{stats.referralCode}</span>
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 mb-4">Generate your unique referral link to start earning</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerateCode}
                disabled={generating}
                className="px-6 py-3 rounded-lg bg-accent text-dark-900 font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <FiShare2 className="w-5 h-5" />
                    Generate Referral Link
                  </span>
                )}
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 rounded-xl bg-dark-800 border border-dark-600"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <FiUsers className="w-6 h-6 text-blue-400" />
          </div>
          <p className="text-gray-400 text-sm mb-1">Total Referrals</p>
          <p className="text-2xl font-bold text-white">
            {stats?.totalReferrals || 0}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-5 rounded-xl bg-dark-800 border border-dark-600"
        >
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
            <FiDollarSign className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-gray-400 text-sm mb-1">Total Commission</p>
          <p className="text-2xl font-bold text-green-400">
            {(stats?.totalCommission || 0).toLocaleString()} Z
          </p>
        </motion.div>
      </div>

      {/* Referrals List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl bg-dark-800 border border-dark-600 overflow-hidden"
      >
        <div className="p-4 border-b border-dark-600">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FiUsers className="text-accent" />
            Referred Users ({referrals.length})
          </h3>
        </div>

        {referrals.length > 0 ? (
          <div className="divide-y divide-dark-600">
            {referrals.map((referral, i) => (
              <motion.div
                key={referral.username}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 flex items-center justify-between hover:bg-dark-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20 border border-accent/30 flex items-center justify-center">
                    <span className="text-accent font-bold text-sm">
                      {referral.username[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{referral.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <FiClock className="w-4 h-4" />
                  <span>{formatTimeAgo(referral.joinedAt)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <FiUser className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No referrals yet</p>
            <p className="text-gray-500 text-sm">
              Share your referral link to start earning commission!
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default Promote;
