import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  FiAward,
  FiCheck,
  FiLock,
  FiZap,
  FiGift,
  FiTarget,
  FiUsers,
  FiTrendingUp,
  FiArrowDownCircle,
} from 'react-icons/fi';
import { GiCrown } from 'react-icons/gi';
import { BsTrophy, BsStars, BsLightning } from 'react-icons/bs';
import { useCurrency } from '../contexts/CurrencyContext';
import { getWalletBalance } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import { TIER_THRESHOLDS, getCurrentTier, getNextTier } from '../config/tiers';

// Shift a #rrggbb hex by `amt` per channel (positive = lighter), returned as
// an rgb() string — used to build the 3D medallion gradient.
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `rgb(${r}, ${g}, ${b})`;
};

// Premium glossy 3D coin/medallion for a tier — radial gradient body, inner
// rim shadows, and a specular highlight, with the tier emoji embossed inside.
function TierMedal({ tier, size = 56, active = false, dim = false }) {
  return (
    <div
      className={`relative grid place-items-center rounded-full transition-opacity ${dim ? 'opacity-40 grayscale' : ''}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 26%, ${shade(tier.color, 70)}, ${tier.color} 52%, ${shade(tier.color, -70)} 100%)`,
        boxShadow: `inset 0 ${size * 0.04}px ${size * 0.08}px rgba(255,255,255,0.45), inset 0 -${size * 0.06}px ${size * 0.1}px rgba(0,0,0,0.4), 0 ${size * 0.07}px ${size * 0.14}px rgba(0,0,0,0.45)${active ? `, 0 0 ${size * 0.32}px ${tier.color}` : ''}`,
      }}
    >
      {/* specular highlight */}
      <span
        className="absolute rounded-full bg-white/45 blur-[2px] pointer-events-none"
        style={{ top: size * 0.1, left: size * 0.25, width: size * 0.5, height: size * 0.28 }}
      />
      <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" style={{ fontSize: size * 0.44, lineHeight: 1 }}>
        {tier.icon}
      </span>
    </div>
  );
}

const buildAchievements = (formatCurrency) => [
  { id: 'first_deposit', name: 'First Steps', description: 'Make your first deposit', icon: FiArrowDownCircle, category: 'wallet' },
  { id: 'first_win', name: 'Lucky Start', description: 'Win your first lottery prize', icon: BsTrophy, category: 'lottery' },
  { id: 'high_roller', name: 'High Roller', description: `Spend ${formatCurrency(10000)} total`, icon: FiZap, category: 'spending', threshold: 10000 },
  { id: 'big_spender', name: 'Big Spender', description: `Spend ${formatCurrency(50000)} total`, icon: BsStars, category: 'spending', threshold: 50000 },
  { id: 'lucky_streak', name: 'Lucky Streak', description: 'Win 3 times in a row', icon: BsLightning, category: 'lottery' },
  { id: 'social_butterfly', name: 'Social Butterfly', description: 'Transfer to 5 different users', icon: FiUsers, category: 'transfer', threshold: 5 },
  { id: 'generous', name: 'Generous Soul', description: `Transfer ${formatCurrency(1000)} to others`, icon: FiGift, category: 'transfer', threshold: 1000 },
  { id: 'collector', name: 'Number Collector', description: 'Own 10 numbers at once', icon: FiTarget, category: 'lottery', threshold: 10 },
];

const CATEGORY_LABELS = {
  wallet: 'Wallet',
  lottery: 'Lottery',
  spending: 'Spending',
  transfer: 'Transfer',
};

function Vip() {
  usePageTitle('VIP & Rewards');

  const { formatCurrency } = useCurrency();
  const ACHIEVEMENTS = buildAchievements(formatCurrency);

  const [balance, setBalance] = useState({ balance: 0, totalSpent: 0, totalEarned: 0 });
  const [unlockedAchievements, setUnlockedAchievements] = useState([]);

  useEffect(() => {
    getWalletBalance()
      .then((res) => { if (res?.data?.data) setBalance(res.data.data); })
      .catch(() => {});

    const saved = localStorage.getItem('achievements');
    if (saved) {
      try { setUnlockedAchievements(JSON.parse(saved)); } catch (_) { /* ignore */ }
    }
  }, []);

  const currentTier = useMemo(() => getCurrentTier(balance.totalSpent || 0), [balance.totalSpent]);
  const nextTier = useMemo(() => getNextTier(currentTier), [currentTier]);

  const tierProgress = useMemo(() => {
    if (!nextTier) return 100;
    const spent = balance.totalSpent || 0;
    const range = nextTier.min - currentTier.min;
    const progress = spent - currentTier.min;
    return Math.min(100, Math.max(0, (progress / range) * 100));
  }, [balance.totalSpent, currentTier, nextTier]);

  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedAchievements.includes(a.id)).length;
  const tierColor = currentTier.color;

  const stats = [
    { label: 'Total Spent', value: formatCurrency(balance.totalSpent), icon: FiTrendingUp },
    { label: 'Total Earned', value: formatCurrency(balance.totalEarned), icon: FiGift },
    { label: 'Active Bonus', value: `${currentTier.bonus}%`, icon: FiZap },
    { label: 'Achievements', value: `${unlockedCount}/${ACHIEVEMENTS.length}`, icon: FiAward },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-4">
      {/* ── Hero ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-dark-800 via-dark-800 to-dark-900 p-6 sm:p-8"
      >
        {/* Tier-colored ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: tierColor }}
        />
        <div
          className="pointer-events-none absolute -bottom-28 -left-20 w-72 h-72 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: tierColor }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
            <GiCrown className="w-4 h-4" style={{ color: tierColor }} /> VIP &amp; Rewards
          </div>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Glowing 3D tier medallion */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="shrink-0"
            >
              <TierMedal tier={currentTier} size={96} active />
            </motion.div>

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-black leading-tight" style={{ color: tierColor }}>
                {currentTier.name}
                <span className="text-gray-500 font-bold text-2xl"> Tier</span>
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                {currentTier.bonus > 0
                  ? <>Enjoying a <span className="font-bold text-white">+{currentTier.bonus}%</span> bonus on all earnings</>
                  : 'Start spending to unlock earning bonuses'}
              </p>

              {/* Progress to next tier */}
              {nextTier ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-gray-400">
                      {formatCurrency(balance.totalSpent)} <span className="text-gray-600">/ {formatCurrency(nextTier.min)}</span>
                    </span>
                    <span className="font-bold" style={{ color: tierColor }}>{tierProgress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-dark-600/80 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${tierProgress}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${tierColor}, ${nextTier.color})`,
                        boxShadow: `0 0 12px ${tierColor}aa`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    <span className="text-white font-semibold">{formatCurrency(Math.max(0, nextTier.min - balance.totalSpent))}</span> more to reach{' '}
                    <span className="font-semibold" style={{ color: nextTier.color }}>{nextTier.icon} {nextTier.name}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: `${tierColor}22`, color: tierColor }}>
                  <GiCrown className="w-4 h-4" /> Top tier reached — you're VIP elite!
                </div>
              )}
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/5 border border-white/5 px-3 py-3">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </div>
                <p className="mt-1 text-lg font-black text-white truncate">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Tier Ladder ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-dark-600 bg-dark-800 p-5"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Tier Ladder</h3>
          <span className="text-xs text-gray-500">{TIER_THRESHOLDS.length} tiers</span>
        </div>
        <div className="flex gap-3 overflow-x-auto overflow-y-hidden py-4 px-2 -mx-2 snap-x scrollbar-hide">
          {TIER_THRESHOLDS.map((tier) => {
            const achieved = (balance.totalSpent || 0) >= tier.min;
            const isCurrent = tier.name === currentTier.name;
            return (
              <div
                key={tier.name}
                className={`relative shrink-0 w-[104px] snap-center rounded-2xl border p-3 text-center transition-all ${
                  isCurrent
                    ? 'border-transparent bg-white/5'
                    : achieved
                      ? 'border-white/10 bg-white/5'
                      : 'border-dark-700 bg-dark-900/50'
                }`}
                style={isCurrent ? { boxShadow: `0 0 0 1px ${tier.color}, 0 0 14px ${tier.color}55` } : undefined}
              >
                {isCurrent && (
                  <span
                    className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase z-10"
                    style={{ backgroundColor: tier.color, color: '#0a0a0a' }}
                  >
                    Current
                  </span>
                )}
                <div className="flex justify-center mb-2">
                  <TierMedal tier={tier} size={52} active={isCurrent} dim={!achieved} />
                </div>
                <p className={`text-xs font-bold ${achieved ? '' : 'text-gray-500'}`} style={achieved ? { color: tier.color } : undefined}>{tier.name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{tier.bonus > 0 ? `+${tier.bonus}%` : 'No bonus'}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{formatCurrency(tier.min)}+</p>
                {achieved && !isCurrent && (
                  <span className="absolute top-2 right-2 text-green-400"><FiCheck className="w-3.5 h-3.5" /></span>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Achievements ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-dark-600 bg-dark-800 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FiAward className="text-accent" /> Achievements
          </h3>
          <span className="px-2.5 py-1 rounded-full bg-accent/15 text-accent text-xs font-bold">
            {unlockedCount} / {ACHIEVEMENTS.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ACHIEVEMENTS.map((achievement) => {
            const isUnlocked = unlockedAchievements.includes(achievement.id);
            const Icon = achievement.icon;

            let progress = 0;
            if (achievement.threshold && achievement.category === 'spending') {
              progress = Math.min(100, (balance.totalSpent / achievement.threshold) * 100);
            }

            return (
              <motion.div
                key={achievement.id}
                whileHover={{ y: -3 }}
                className={`group relative p-4 rounded-2xl border overflow-hidden transition-colors ${
                  isUnlocked
                    ? 'border-accent/40 bg-gradient-to-br from-accent/15 to-accent/5'
                    : 'border-dark-600 bg-dark-900/60'
                }`}
              >
                {isUnlocked && (
                  <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full bg-accent/20 blur-2xl pointer-events-none" />
                )}

                <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                  isUnlocked ? 'bg-accent/25 text-accent' : 'bg-dark-700 text-gray-500'
                }`}>
                  <Icon className="w-6 h-6" />
                  {!isUnlocked && (
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-dark-800 border border-dark-600 grid place-items-center">
                      <FiLock className="w-2.5 h-2.5 text-gray-500" />
                    </span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-1">
                  <h4 className={`font-bold text-sm leading-tight ${isUnlocked ? 'text-white' : 'text-gray-300'}`}>
                    {achievement.name}
                  </h4>
                  {isUnlocked && <FiCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />}
                </div>
                <p className="text-gray-400 text-xs mt-1">{achievement.description}</p>

                <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-medium text-gray-400">
                  {CATEGORY_LABELS[achievement.category] || achievement.category}
                </span>

                {!isUnlocked && achievement.threshold && progress > 0 && (
                  <div className="mt-2.5">
                    <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{progress.toFixed(0)}% complete</p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

export default Vip;
