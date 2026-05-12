import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiGift, FiCheckCircle, FiClock, FiZap, FiAward, FiStar } from 'react-icons/fi';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { useCurrency } from '../contexts/CurrencyContext';
import { getBonusStatus, claimBonus } from '../services/api';
import { sounds } from '../utils/sounds';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const RECURRING_TIERS = [
  {
    type: 'daily',
    label: 'Daily Bonus',
    blurb: 'Sign in once a day for a free top-up',
    Icon: FiZap,
    accent: 'from-amber-500/30 to-amber-500/0',
    ring: 'border-amber-500/40',
    iconColor: 'text-amber-300',
    btn: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-200',
  },
  {
    type: 'weekly',
    label: 'Weekly Bonus',
    blurb: 'Bigger reward every week',
    Icon: FiStar,
    accent: 'from-emerald-500/30 to-emerald-500/0',
    ring: 'border-emerald-500/40',
    iconColor: 'text-emerald-300',
    btn: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-200',
  },
  {
    type: 'monthly',
    label: 'Monthly Bonus',
    blurb: 'Loyalty drop once every 30 days',
    Icon: FiAward,
    accent: 'from-fuchsia-500/30 to-fuchsia-500/0',
    ring: 'border-fuchsia-500/40',
    iconColor: 'text-fuchsia-300',
    btn: 'bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border-fuchsia-500/40 text-fuchsia-200',
  },
];

// Format an absolute ISO timestamp into a "in 2h 14m" countdown string,
// updating each second so the user can watch it tick.
function formatRemaining(ms) {
  if (ms <= 0) return 'Available now';
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function CountdownLabel({ targetIso }) {
  const target = useMemo(() => (targetIso ? new Date(targetIso).getTime() : 0), [targetIso]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [target]);
  if (!target) return null;
  return <span>{formatRemaining(target - now)}</span>;
}

function BonusCard({ tier, status, onClaim, claiming, formatCurrency }) {
  const { Icon } = tier;
  const ready = status?.claimable;
  const needsDeposit = status?.requiresDeposit;
  const amount = Number(status?.amount ?? 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`relative rounded-2xl border ${tier.ring} bg-dark-800/60 overflow-hidden`}
    >
      <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br ${tier.accent}`} />
      <div className="relative p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-dark-900/70 border border-white/10 flex items-center justify-center shrink-0">
            <Icon className={`w-6 h-6 ${tier.iconColor}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">{tier.label}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{tier.blurb}</p>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Reward</p>
            <p className="text-2xl font-black text-white">
              {formatCurrency(amount)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">
              {ready ? 'Status' : 'Next in'}
            </p>
            {ready ? (
              <p className="text-sm font-bold text-emerald-300 inline-flex items-center gap-1">
                <FiCheckCircle className="w-4 h-4" /> Ready
              </p>
            ) : needsDeposit ? (
              <p className="text-sm font-bold text-amber-300 inline-flex items-center gap-1">
                Deposit required
              </p>
            ) : (
              <p className="text-sm font-bold text-gray-300 inline-flex items-center gap-1">
                <FiClock className="w-4 h-4" />
                <CountdownLabel targetIso={status?.nextClaimAt} />
              </p>
            )}
          </div>
        </div>

        <motion.button
          type="button"
          whileHover={ready && !claiming ? { scale: 1.01 } : undefined}
          whileTap={ready && !claiming ? { scale: 0.98 } : undefined}
          disabled={!ready || claiming}
          onClick={() => onClaim(tier.type)}
          className={`w-full px-4 py-2.5 rounded-lg border font-semibold text-sm transition-colors ${
            ready
              ? tier.btn
              : 'bg-dark-700/60 border-white/5 text-gray-500 cursor-not-allowed'
          }`}
        >
          {claiming
            ? 'Claiming…'
            : ready
              ? `Claim ${formatCurrency(amount)}`
              : needsDeposit
                ? 'Deposit to unlock'
                : 'Locked'}
        </motion.button>
      </div>
    </motion.div>
  );
}

function FirstDepositCard({ status }) {
  const { formatCurrency } = useCurrency();
  const claimed = status?.claimed;
  const multiplier = Number(status?.multiplier ?? 0);
  const cap = Number(status?.cap ?? 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative rounded-2xl border border-accent/30 bg-dark-800/60 overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-accent/15 via-accent/5 to-transparent" />
      <div className="relative p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-dark-900/70 border border-white/10 flex items-center justify-center shrink-0">
          <FiGift className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white">First Deposit Bonus</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {claimed
              ? 'Already credited from your first deposit. Thanks!'
              : `Auto-credited the first time you deposit. Get ${multiplier}× your deposit, up to ${formatCurrency(cap)}.`}
          </p>
        </div>
        <div className="text-right">
          {claimed ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
              <FiCheckCircle className="w-3.5 h-3.5" /> Claimed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <FiClock className="w-3.5 h-3.5" /> Pending
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Bonus() {
  usePageTitle('Bonus');
  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getBonusStatus();
      setStatus(res.data.data);
    } catch (e) {
      // Surface only the first error — repeated polls shouldn't keep
      // toasting the same message.
      toast.error(e.response?.data?.message || 'Failed to load bonuses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  const handleClaim = useCallback(
    async (type) => {
      if (claiming) return;
      setClaiming(type);
      sounds.click?.();
      try {
        const res = await claimBonus(type);
        const amount = Number(res.data?.data?.amount ?? 0);
        sounds.win?.();
        toast.success(`${formatCurrency(amount)} claimed!`);
        await load();
        await checkAuth?.();
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to claim');
      } finally {
        setClaiming(null);
      }
    },
    [claiming, load, checkAuth, formatCurrency]
  );

  if (!user) {
    return (
      <div className="mx-auto space-y-4">
        <PageHeader icon={FiGift} title="Bonuses" description="Sign in to claim your daily, weekly, and monthly bonuses" />
        <div className="rounded-2xl border border-white/10 bg-dark-800/60 p-8 text-center text-gray-400">
          Please log in to view and claim bonuses.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-4">
      <PageHeader
        icon={FiGift}
        title="Bonuses"
        description="Free rewards for showing up — claim daily"
        iconColor="text-accent"
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <FirstDepositCard status={status?.firstDeposit} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {RECURRING_TIERS.map((tier) => (
              <BonusCard
                key={tier.type}
                tier={tier}
                status={status?.[tier.type]}
                onClaim={handleClaim}
                claiming={claiming === tier.type}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>

          <p className="text-xs text-gray-500 text-center mt-2">
            Cooldowns are rolling — when you claim, the next claim opens after the cooldown elapses.
          </p>
        </>
      )}
    </div>
  );
}
