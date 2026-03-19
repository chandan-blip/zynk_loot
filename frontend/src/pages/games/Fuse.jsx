import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiAlertTriangle } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { playFuse, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';
import { isDemoMode, demoFuse } from '../../utils/demoGame';

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];
const MULTIPLIER_PRESETS = [1.5, 2, 3, 5, 10, 25];

function FuseGame() {
  usePageTitle('Fuse');

  const { user, checkAuth } = useStore();
  const [amount, setAmount] = useState('');
  const [targetMultiplier, setTargetMultiplier] = useState('');
  const [burning, setBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [exploded, setExploded] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const animRef = useRef(null);

  useEffect(() => { loadData(); }, [user]);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  const loadData = async () => {
    if (!user) return;
    try {
      const statsRes = await getGameStats();
      const fStats = (statsRes.data.data || []).find(s => s.game_type === 'fuse');
      setStats(fStats || null);
    } catch (err) {}
  };

  const handleLight = async () => {
    const betAmount = parseFloat(amount);
    const target = parseFloat(targetMultiplier);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }
    if (!target || target < 1.1 || target > 50) {
      toast.error('Set a cut point (1.1x - 50x)');
      return;
    }

    setBurning(true);
    setExploded(false);
    setResult(null);
    setBurnProgress(0);
    setCurrentMultiplier(1.0);
    sounds.click();

    try {
      const res = isDemoMode(user)
        ? demoFuse(betAmount, target)
        : await playFuse(betAmount, target);
      const data = res.data.data;

      // End point: target if win, boom point if loss
      const endMultiplier = data.isWin ? target : data.boomPoint;
      const animDuration = data.isWin ? 3000 : (3000 * (data.boomPoint - 1) / (target - 1));
      const clampedDuration = Math.max(animDuration, 800);

      sounds.inflate(clampedDuration / 1000);

      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / clampedDuration, 1);
        const eased = 1 - Math.pow(1 - progress, 2);
        const mult = 1.0 + (endMultiplier - 1.0) * eased;

        setBurnProgress(eased);
        setCurrentMultiplier(mult);

        if (progress < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          if (!data.isWin) {
            setExploded(true);
            sounds.pop();
            setTimeout(() => {
              setResult(data);
              setShowResult(true);
            }, 600);
          } else {
            sounds.cashout();
            setTimeout(() => {
              setResult(data);
              setShowResult(true);
            }, 400);
          }
          setBurning(false);
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
      setBurning(false);
    }
  };

  const closeResult = useCallback(() => {
    setShowResult(false);
    setExploded(false);
    setBurnProgress(0);
    setCurrentMultiplier(1.0);
  }, []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  // Fuse color: green → yellow → orange → red
  const getFuseColor = () => {
    if (burnProgress < 0.3) return '#22c55e';
    if (burnProgress < 0.6) return '#eab308';
    if (burnProgress < 0.85) return '#f97316';
    return '#ef4444';
  };

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult}
        onClose={closeResult}
        title="fuse"
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
                <p className="text-lg font-bold text-white">{stats.total_bets}</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Win Rate</p>
                <p className="text-lg font-bold text-white">{winRate}%</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Net Profit</p>
                <p className={`text-lg font-bold ${parseFloat(netProfit) >= 0 ? 'text-accent' : 'text-red-400'}`}>
                  {parseFloat(netProfit) >= 0 ? '+' : ''}{netProfit} Z
                </p>
              </div>
            </div>
          )}

          <GameHistory
            gameType="fuse"
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
                      {bet.is_win ? '\u2702\uFE0F' : '\u{1F4A5}'}
                    </div>
                    <div>
                      <p className="text-sm text-white">
                        Bet <span className="font-semibold">{parseFloat(bet.bet_amount)} Z</span>
                        <span className="text-gray-500 ml-1">{'\u2192'} {details?.cashoutMultiplier}x</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {bet.is_win ? 'Cut in time' : `Blew at ${details?.boomPoint?.toFixed(2)}x`}
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
      <div className="rounded-xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
            <FiAlertTriangle className="w-7 h-7 text-orange-400" />
            Fuse
          </h1>
          <p className="text-gray-400 text-sm mt-1">Set your cut point, light the fuse, snip before it blows!</p>
        </div>

        {/* Fuse Visual */}
        <div className="mb-8 py-4">
          {/* Multiplier display */}
          <div className="text-center mb-4">
            <motion.span
              className={`text-3xl font-black ${
                exploded ? 'text-red-400' : currentMultiplier > 1 ? 'text-white' : 'text-gray-500'
              }`}
              animate={burning ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              {currentMultiplier.toFixed(2)}x
            </motion.span>
          </div>

          {/* Fuse bar */}
          <div className="relative h-8 bg-dark-700/60 rounded-full border border-white/10 overflow-hidden">
            {/* Burn progress */}
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${burnProgress * 100}%`,
                background: `linear-gradient(90deg, ${getFuseColor()}44, ${getFuseColor()})`,
              }}
            />

            {/* Fuse rope texture */}
            <div className="absolute inset-0 flex items-center px-2">
              <div className="w-full h-2 rounded-full bg-gradient-to-r from-amber-800/60 via-amber-700/40 to-amber-800/60" />
            </div>

            {/* Spark at burn tip */}
            {(burning || burnProgress > 0) && !exploded && (
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${burnProgress * 100}%` }}
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 0.2, repeat: Infinity }}
              >
                <div className="w-4 h-4 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.8)]" />
              </motion.div>
            )}

            {/* Target marker */}
            {targetMultiplier && parseFloat(targetMultiplier) >= 1.1 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/30"
                style={{ left: `${Math.min(((parseFloat(targetMultiplier) - 1) / (50 - 1)) * 100, 100)}%` }}
              >
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap">
                  {parseFloat(targetMultiplier)}x
                </div>
              </div>
            )}
          </div>

          {/* Dynamite at the end */}
          <div className="flex justify-between items-center mt-2 px-1">
            <span className="text-xs text-gray-600">1x</span>
            <span className="text-lg">{exploded ? '💥' : '🧨'}</span>
          </div>

          {/* Explosion particles */}
          {exploded && (
            <div className="relative flex justify-center -mt-8">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  animate={{
                    opacity: 0,
                    x: (Math.random() - 0.5) * 150,
                    y: (Math.random() - 0.5) * 100 - 30,
                    scale: 0,
                  }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="absolute w-2 h-2 rounded-full bg-orange-400"
                />
              ))}
            </div>
          )}
        </div>

        {/* Cut Point Selection */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-2 block">Cut Point</label>
          <input
            type="number"
            value={targetMultiplier}
            onChange={(e) => setTargetMultiplier(e.target.value)}
            placeholder="1.1x - 50x"
            disabled={burning}
            min="1.1"
            max="50"
            step="0.1"
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {MULTIPLIER_PRESETS.map(mp => (
              <button
                key={mp}
                onClick={() => { if (!burning) { setTargetMultiplier(String(mp)); sounds.tap(); } }}
                disabled={burning}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  parseFloat(targetMultiplier) === mp
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                    : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                {mp}x
              </button>
            ))}
          </div>
        </div>

        {/* Bet Amount */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (Z)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount..."
            disabled={burning}
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!burning) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={burning}
                className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
              >
                {qa} Z
              </button>
            ))}
            <button
              onClick={() => { if (!burning && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={burning}
              className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Potential Win */}
        {amount && parseFloat(amount) > 0 && targetMultiplier && parseFloat(targetMultiplier) >= 1.1 && (
          <div className="text-center mb-4 text-sm text-gray-400">
            Potential win: <span className="text-accent font-bold">{(parseFloat(amount) * parseFloat(targetMultiplier)).toFixed(2)} Z</span>
          </div>
        )}

        {/* Light Button */}
        <motion.button
          whileHover={!burning ? { scale: 1.02 } : {}}
          whileTap={!burning ? { scale: 0.98 } : {}}
          onClick={handleLight}
          disabled={burning || !amount || !targetMultiplier}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            burning || !amount || !targetMultiplier
              ? 'bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed'
              : 'btn-premium'
          }`}
        >
          {burning ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Burning...
            </span>
          ) : (
            'Light the Fuse'
          )}
        </motion.button>
      </div>
        </div>
      </div>
    </div>
  );
}

export default FuseGame;
