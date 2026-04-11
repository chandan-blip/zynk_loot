import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiGift } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { playEggHatch, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';
import GameCrossPromo from '../../components/GameCrossPromo';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import { isDemoMode, demoEggHatch } from '../../utils/demoGame';

const QUICK_AMOUNTS = [5, 10, 50, 100, 500, 1000];

// Colors for each egg
const EGG_COLORS = [
  { bg: 'from-amber-400 to-yellow-500', border: 'border-amber-300' },
  { bg: 'from-sky-400 to-blue-500', border: 'border-sky-300' },
  { bg: 'from-rose-400 to-pink-500', border: 'border-rose-300' },
  { bg: 'from-emerald-400 to-green-500', border: 'border-emerald-300' },
  { bg: 'from-violet-400 to-purple-500', border: 'border-violet-300' },
  { bg: 'from-orange-400 to-red-500', border: 'border-orange-300' },
];

// Generate fake multipliers for the other eggs (client-side visual only)
const POSSIBLE_MULTIPLIERS = [0, 0, 0, 0.5, 0.5, 1, 1, 1.5, 3, 5, 15];
const randomMultiplier = () => POSSIBLE_MULTIPLIERS[Math.floor(Math.random() * POSSIBLE_MULTIPLIERS.length)];

function Egg({ index, state, multiplier, onPick, disabled }) {
  const color = EGG_COLORS[index];

  if (state === 'cracked') {
    const isWin = multiplier > 0;
    return (
      <motion.div
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        className="flex flex-col items-center gap-1"
      >
        {/* Cracked shell halves */}
        <div className="relative w-16 h-20">
          <motion.div
            initial={{ rotate: 0, y: 0 }}
            animate={{ rotate: -15, y: -6, x: -4 }}
            className={`absolute top-0 left-1 w-14 h-8 rounded-t-full bg-gradient-to-br ${color.bg} opacity-40`}
          />
          <motion.div
            initial={{ rotate: 0, y: 0 }}
            animate={{ rotate: 10, y: -4, x: 3 }}
            className={`absolute top-0 right-1 w-14 h-8 rounded-t-full bg-gradient-to-br ${color.bg} opacity-40`}
          />
          {/* Multiplier reveal */}
          <div className={`absolute inset-0 flex items-center justify-center text-lg font-black ${
            isWin ? 'text-accent' : 'text-red-400'
          }`}>
            {multiplier}x
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.08, y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={() => onPick(index)}
      disabled={disabled}
      className="flex flex-col items-center gap-1 group"
    >
      <div className={`relative w-16 h-20 rounded-[40%_40%_44%_44%] bg-gradient-to-br ${color.bg} border-2 ${color.border} shadow-lg transition-all ${
        disabled ? 'opacity-40' : 'group-hover:shadow-xl'
      }`}>
        {/* Egg shine */}
        <div className="absolute top-3 left-3 w-4 h-6 bg-white/30 rounded-full rotate-[-15deg] blur-[2px]" />
        {/* Question mark */}
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-xl font-bold">?</div>
      </div>
    </motion.button>
  );
}

function EggHatch() {
  usePageTitle('Egg Hatch');

  const { user, checkAuth } = useStore();
  const [amount, setAmount] = useState('');
  const [picking, setPicking] = useState(false);
  const [pickedEgg, setPickedEgg] = useState(null);
  const [eggStates, setEggStates] = useState(Array(6).fill('idle'));
  const [eggMultipliers, setEggMultipliers] = useState(Array(6).fill(null));
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const statsRes = await getGameStats();
      const ehStats = (statsRes.data.data || []).find(s => s.game_type === 'egg_hatch');
      setStats(ehStats || null);
    } catch (err) {}
  };

  const handlePick = async (eggIndex) => {
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }
    if (picking) return;

    setPicking(true);
    setPickedEgg(eggIndex);
    sounds.click();

    try {
      const res = isDemoMode(user)
        ? demoEggHatch(betAmount)
        : await playEggHatch(betAmount);
      const data = res.data.data;

      // Crack the picked egg first
      sounds.eggCrack();
      const newStates = Array(6).fill('idle');
      const newMultipliers = Array(6).fill(null);
      newStates[eggIndex] = 'cracked';
      newMultipliers[eggIndex] = data.multiplier;
      setEggStates([...newStates]);
      setEggMultipliers([...newMultipliers]);

      await new Promise(r => setTimeout(r, 800));

      // Reveal other eggs
      for (let i = 0; i < 6; i++) {
        if (i !== eggIndex) {
          newStates[i] = 'cracked';
          newMultipliers[i] = randomMultiplier();
        }
      }
      setEggStates([...newStates]);
      setEggMultipliers([...newMultipliers]);

      await new Promise(r => setTimeout(r, 600));

      setResult(data);
      setShowResult(true);
      if (!data.isDemo) {
        checkAuth();
        loadData();
        setHistoryKey(k => k + 1);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
    } finally {
      setPicking(false);
    }
  };

  const closeResult = useCallback(() => {
    setShowResult(false);
    setPickedEgg(null);
    setEggStates(Array(6).fill('idle'));
    setEggMultipliers(Array(6).fill(null));
  }, []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult}
        onClose={closeResult}
        title="egg"
      />

      <Link to="/games" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
        <FiArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Games</span>
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
        {/* Sidebar: Stats + History (left on md+, below on mobile) */}
        <div className="md:order-1 order-2 space-y-4">
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Total Hatches</p>
                <p className="text-sm font-bold text-white">{stats.total_bets}</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Win Rate</p>
                <p className="text-sm font-bold text-white">{winRate}%</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Net Profit</p>
                <p className={`text-sm font-bold ${parseFloat(netProfit) >= 0 ? 'text-accent' : 'text-red-400'}`}>
                  {parseFloat(netProfit) >= 0 ? '+' : ''}{netProfit} Z
                </p>
              </div>
            </div>
          )}

          <GameHistory
            gameType="egg_hatch"
            title="Recent Hatches"
            refreshKey={historyKey}
            renderItem={(bet) => (
              <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    bet.is_win ? 'bg-accent/20 text-accent' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {bet.result}
                  </div>
                  <div>
                    <p className="text-sm text-white">
                      Bet <span className="font-semibold">{parseFloat(bet.bet_amount)} Z</span>
                      {bet.is_win && <span className="text-accent ml-1">({parseFloat(bet.multiplier)}x)</span>}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(bet.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold ${bet.is_win ? 'text-accent' : 'text-red-400'}`}>
                  {bet.is_win ? `+${parseFloat(bet.win_amount)}` : `-${parseFloat(bet.bet_amount)}`} Z
                </span>
              </div>
            )}
          />
        </div>

        {/* Game (right on md+, top on mobile) */}
        <div className="md:order-2 order-1">
      <div className="rounded-xl p-6 relative">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
            <FiGift className="w-7 h-7 text-amber-400" />
            Egg Hatch
          </h1>
          <p className="text-gray-400 text-sm mt-1">Pick an egg — each hides a multiplier up to 15x!</p>
        </div>

        <GameLiveFeed />

        {/* Eggs Grid */}
        <div className="grid grid-cols-3 gap-6 justify-items-center mb-8 py-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Egg
              key={i}
              index={i}
              state={eggStates[i]}
              multiplier={eggMultipliers[i]}
              onPick={handlePick}
              disabled={picking || pickedEgg !== null || !amount || parseFloat(amount) <= 0}
            />
          ))}
        </div>

        {pickedEgg === null && (
          <p className="text-center text-xs text-gray-500 mb-4">
            Tap an egg to hatch it!
          </p>
        )}

        {/* Bet Amount */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (Z)</label>
          <BetStepper amount={amount} setAmount={setAmount} disabled={picking} />
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!picking) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={picking}
                className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
              >
                {qa} Z
              </button>
            ))}
            <button
              onClick={() => { if (!picking && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={picking}
              className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>
      </div>
        </div>
      </div>
      <GameCrossPromo currentGame="egg-hatch" />
    </div>
  );
}

export default EggHatch;
