import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiTarget } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { playBalloonPop, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';
import GameCrossPromo from '../../components/GameCrossPromo';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import { isDemoMode, demoBalloonPop } from '../../utils/demoGame';

const QUICK_AMOUNTS = [5, 10, 50, 100, 500, 1000];
const MULTIPLIER_PRESETS = [1.5, 2, 3, 5, 10, 25];

function Balloon({ scale, color, popped }) {
  if (popped) {
    return (
      <div className="relative w-40 h-48 flex items-center justify-center">
        {/* Pop particles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{
              opacity: 0,
              x: (Math.random() - 0.5) * 200,
              y: (Math.random() - 0.5) * 200,
              scale: 0,
            }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="absolute w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      animate={{ scale }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="relative flex flex-col items-center"
    >
      {/* Balloon body — teardrop shape: round top, tapered bottom */}
      <div
        className="w-28 h-36 relative overflow-hidden"
        style={{
          borderRadius: '50% 50% 50% 50% / 45% 45% 55% 55%',
          background: `radial-gradient(circle at 35% 30%, ${color}dd, ${color}88, ${color}44)`,
          boxShadow: `0 0 ${30 + scale * 20}px ${color}40`,
        }}
      >
        {/* Shine */}
        <div className="absolute top-4 left-5 w-7 h-10 bg-white/20 rounded-full rotate-[-20deg] blur-sm" />
      </div>
      {/* Knot */}
      <div
        className="w-3 h-3 -mt-1 rotate-45 rounded-sm"
        style={{ backgroundColor: color, opacity: 0.7 }}
      />
      {/* String */}
      <div className="w-[2px] h-12 bg-gray-500/40" />
    </motion.div>
  );
}

function BalloonPop() {
  usePageTitle('Balloon Pop');

  const { user, checkAuth } = useStore();
  const [amount, setAmount] = useState('');
  const [targetMultiplier, setTargetMultiplier] = useState('');
  const [inflating, setInflating] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [popped, setPopped] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const animRef = useRef(null);
  const inflateRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (inflateRef.current) inflateRef.current = null;
    };
  }, []);

  const loadData = async () => {
    if (!user) return;
    try {
      const statsRes = await getGameStats();
      const bpStats = (statsRes.data.data || []).find(s => s.game_type === 'balloon_pop');
      setStats(bpStats || null);
    } catch (err) {
      // Silently fail
    }
  };

  // Get balloon color based on current multiplier — green to yellow to red
  const getBalloonColor = (mult) => {
    const target = parseFloat(targetMultiplier) || 5;
    const progress = Math.min((mult - 1) / (target - 1), 1);
    if (progress < 0.4) return '#22c55e';   // green
    if (progress < 0.7) return '#eab308';   // yellow
    if (progress < 0.9) return '#f97316';   // orange
    return '#ef4444';                        // red
  };

  // Balloon scale based on multiplier
  const getBalloonScale = (mult) => {
    const target = parseFloat(targetMultiplier) || 5;
    const progress = Math.min((mult - 1) / (target - 1), 1);
    return 0.6 + progress * 0.6; // 0.6 to 1.2
  };

  const handleInflate = async () => {
    const betAmount = parseFloat(amount);
    const target = parseFloat(targetMultiplier);

    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }
    if (!target || target < 1.1 || target > 50) {
      toast.error('Pick a cashout target (1.1x - 50x)');
      return;
    }

    setInflating(true);
    setPopped(false);
    setResult(null);
    setCurrentMultiplier(1.0);
    sounds.click();

    try {
      const res = isDemoMode(user)
        ? demoBalloonPop(betAmount, target)
        : await playBalloonPop(betAmount, target);
      const data = res.data.data;

      // Determine animation end point
      const endMultiplier = data.isWin ? target : data.popPoint;
      const animDuration = data.isWin ? 3000 : (3000 * (data.popPoint - 1) / (target - 1));
      const clampedDuration = Math.max(animDuration, 800); // at least 800ms

      // Start inflation sound
      sounds.inflate(clampedDuration / 1000);

      // Animate the multiplier rising
      const startTime = performance.now();
      inflateRef.current = data;

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / clampedDuration, 1);
        // Ease out for tension: fast start, slow near end
        const eased = 1 - Math.pow(1 - progress, 2);
        const mult = 1.0 + (endMultiplier - 1.0) * eased;
        setCurrentMultiplier(mult);

        if (progress < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          // Animation complete
          if (!data.isWin) {
            // Pop!
            setPopped(true);
            sounds.pop();
            setTimeout(() => {
              setResult(data);
              setShowResult(true);
            }, 600);
          } else {
            // Cashed out safely
            sounds.cashout();
            setTimeout(() => {
              setResult(data);
              setShowResult(true);
            }, 400);
          }
          setInflating(false);
          if (!data.isDemo) {
            checkAuth();
            loadData();
            setHistoryKey(k => k + 1);
          }
        }
      };

      animRef.current = requestAnimationFrame(animate);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
      setInflating(false);
    }
  };

  const closeResult = useCallback(() => {
    setShowResult(false);
    setPopped(false);
    setCurrentMultiplier(1.0);
  }, []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  const balloonColor = getBalloonColor(currentMultiplier);
  const balloonScale = getBalloonScale(currentMultiplier);

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult}
        onClose={closeResult}
        title="balloon"
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
                <p className="text-xs text-gray-500">Total Games</p>
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
            gameType="balloon_pop"
            title="Recent Games"
            refreshKey={historyKey}
            renderItem={(bet) => {
              const details = typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details;
              return (
                <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                      bet.is_win ? 'bg-accent/20 text-accent' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {bet.is_win ? '\u{1F4B0}' : '\u{1F4A5}'}
                    </div>
                    <div>
                      <p className="text-sm text-white">
                        Bet <span className="font-semibold">{parseFloat(bet.bet_amount)} Z</span>
                        <span className="text-gray-500 ml-1">{'\u2192'} {details?.cashoutMultiplier}x</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {bet.is_win ? 'Cashed out' : `Popped at ${details?.popPoint?.toFixed(2)}x`}
                        {' \u00B7 '}{new Date(bet.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${bet.is_win ? 'text-accent' : 'text-red-400'}`}>
                    {bet.is_win ? `+${parseFloat(bet.win_amount)}` : `-${parseFloat(bet.bet_amount)}`} Z
                  </span>
                </div>
              );
            }}
          />
        </div>

        {/* Game (right on md+, top on mobile) */}
        <div className="md:order-2 order-1">
      <div className="rounded-xl p-6 relative">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
            <FiTarget className="w-7 h-7 text-red-400" />
            Balloon Pop
          </h1>
          <p className="text-gray-400 text-sm mt-1">Set your target, inflate, and cash out before it pops!</p>
        </div>

        <GameLiveFeed />

        {/* Balloon Area */}
        <div className="flex flex-col items-center justify-center mb-6 py-4 min-h-[240px]">
          <AnimatePresence mode="wait">
            <Balloon
              key={popped ? 'popped' : 'balloon'}
              scale={balloonScale}
              color={balloonColor}
              popped={popped}
            />
          </AnimatePresence>

          {/* Live multiplier display */}
          <motion.div
            className="mt-4 text-center"
            animate={inflating ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <span className={`text-3xl font-black ${
              popped ? 'text-red-400' : currentMultiplier > 1 ? 'text-white' : 'text-gray-500'
            }`}>
              {currentMultiplier.toFixed(2)}x
            </span>
          </motion.div>
        </div>

        {/* Target Multiplier Selection */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-2 block">Cashout Target</label>
          <input
            type="number"
            value={targetMultiplier}
            onChange={(e) => setTargetMultiplier(e.target.value)}
            placeholder="1.1x - 50x"
            disabled={inflating}
            min="1.1"
            max="50"
            step="0.1"
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {MULTIPLIER_PRESETS.map(mp => (
              <button
                key={mp}
                onClick={() => { if (!inflating) { setTargetMultiplier(String(mp)); sounds.tap(); } }}
                disabled={inflating}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  parseFloat(targetMultiplier) === mp
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                {mp}x
              </button>
            ))}
          </div>
        </div>

        {/* Bet Amount */}
        <div className="mb-4 hidden md:block">
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (Z)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount..."
            disabled={inflating}
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!inflating) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={inflating}
                className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
              >
                {qa} Z
              </button>
            ))}
            <button
              onClick={() => { if (!inflating && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={inflating}
              className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Potential Win */}
        <div className="text-center text-sm text-gray-400">
          Potential win: <span className="text-accent font-bold">{((parseFloat(amount) || 0) * (parseFloat(targetMultiplier) || 0)).toFixed(2)} Z</span>
          {targetMultiplier && parseFloat(targetMultiplier) >= 1.1 && <span className="text-gray-600 ml-2">({parseFloat(targetMultiplier)}x)</span>}
        </div>

        {/* Inflate Button */}
            <div className="fixed bottom-0 left-0 right-0 z-30 p-3 pb-4 bg-dark-500/95 backdrop-blur-sm border-t border-white/5 md:static md:p-0 md:bg-transparent md:backdrop-blur-none md:border-0">
          <div className="md:hidden">
            <BetStepper amount={amount} setAmount={setAmount} disabled={inflating} />
          </div>
          <div className="flex gap-2 mb-2 md:hidden">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!inflating) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={inflating}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${amount === String(qa) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
              >
                {qa}
              </button>
            ))}
            <button
              onClick={() => { if (!inflating && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={inflating}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${user?.balance && amount === String(Math.floor(user.balance)) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
            >
              MAX
            </button>
          </div>
          <motion.button
            whileHover={!inflating ? { scale: 1.02 } : {}}
            whileTap={!inflating ? { scale: 0.98 } : {}}
            onClick={handleInflate}
            disabled={inflating || !amount || !targetMultiplier}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              inflating || !amount || !targetMultiplier
                ? 'bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed'
                : 'btn-premium'
            }`}
          >
            {inflating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Inflating...
              </span>
            ) : (
              'Inflate!'
            )}
          </motion.button>
        </div>
      </div>
        </div>
      </div>
      <GameCrossPromo currentGame="balloon-pop" />
        <div className="h-36 md:hidden"></div>

    </div>
  );
}

export default BalloonPop;
