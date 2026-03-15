import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import { GiPerspectiveDiceSixFacesRandom } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { playDiceRoll, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];

const DICE_FACES = [
  { value: 1, dots: ['center'] },
  { value: 2, dots: ['top-right', 'bottom-left'] },
  { value: 3, dots: ['top-right', 'center', 'bottom-left'] },
  { value: 4, dots: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] },
  { value: 5, dots: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] },
  { value: 6, dots: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'] },
];

const DOT_POSITIONS = {
  'top-left': 'top-1.5 left-1.5',
  'top-right': 'top-1.5 right-1.5',
  'mid-left': 'top-1/2 -translate-y-1/2 left-1.5',
  'mid-right': 'top-1/2 -translate-y-1/2 right-1.5',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'bottom-1.5 left-1.5',
  'bottom-right': 'bottom-1.5 right-1.5',
};

function DiceFace({ value, size = 'w-14 h-14', dotSize = 'w-2.5 h-2.5', color = 'bg-white' }) {
  const face = DICE_FACES.find(f => f.value === value) || DICE_FACES[0];
  return (
    <div className={`${size} rounded-lg bg-dark-700/80 border border-white/10 relative`}>
      {face.dots.map((pos, i) => (
        <div key={i} className={`absolute ${DOT_POSITIONS[pos]} ${dotSize} rounded-full ${color}`} />
      ))}
    </div>
  );
}

function DiceRoll() {
  usePageTitle('Dice Roll');

  const { user, checkAuth } = useStore();
  const [amount, setAmount] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [animDice, setAnimDice] = useState(1);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  // Dice animation: cycle through faces while rolling
  useEffect(() => {
    if (!rolling) return;
    const interval = setInterval(() => {
      setAnimDice(Math.floor(Math.random() * 6) + 1);
    }, 100);
    return () => clearInterval(interval);
  }, [rolling]);

  const loadData = async () => {
    try {
      const statsRes = await getGameStats();
      const diceStats = (statsRes.data.data || []).find(s => s.game_type === 'dice_roll');
      setStats(diceStats || null);
    } catch (err) {
      // Silently fail
    }
  };

  const handleRoll = async () => {
    if (!prediction) {
      toast.error('Pick a number');
      return;
    }
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }

    setRolling(true);
    setResult(null);
    sounds.click();
    sounds.dice();

    try {
      const res = await playDiceRoll(betAmount, prediction);
      await new Promise(r => setTimeout(r, 1200));

      const data = res.data.data;
      setAnimDice(parseInt(data.result));
      setResult(data);
      setShowResult(true);

      checkAuth();
      loadData();
      setHistoryKey(k => k + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
    } finally {
      setRolling(false);
    }
  };

  const closeResult = useCallback(() => setShowResult(false), []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  const displayDice = rolling ? animDice : (result ? parseInt(result.result) : null);

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult && !rolling}
        onClose={closeResult}
        title="dice"
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
                <p className="text-xs text-gray-500">Total Rolls</p>
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
            gameType="dice_roll"
            title="Recent Rolls"
            refreshKey={historyKey}
            renderItem={(bet) => {
              const details = typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details;
              return (
                <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      bet.is_win ? 'bg-accent/20 text-accent' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {bet.result}
                    </div>
                    <div>
                      <p className="text-sm text-white">
                        Bet <span className="font-semibold">{parseFloat(bet.bet_amount)} Z</span> on{' '}
                        <span className="font-semibold">{details?.prediction}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(bet.created_at).toLocaleString()}
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
            <GiPerspectiveDiceSixFacesRandom className="w-7 h-7 text-blue-400" />
            Dice Roll
          </h1>
          <p className="text-gray-400 text-sm mt-1">Pick a number 1-6, roll the dice, win 5.7x</p>
        </div>

        {/* Dice Animation */}
        <div className="flex justify-center mb-8">
          <motion.div
            animate={rolling ? {
              rotate: [0, 360, 720],
              scale: [1, 1.15, 1],
            } : {}}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          >
            <div className={`w-24 h-24 rounded-xl flex items-center justify-center border-4 transition-all duration-300 ${
              result
                ? result.isWin
                  ? 'bg-gradient-to-br from-accent/30 to-green-500/30 border-accent/50'
                  : 'bg-gradient-to-br from-red-500/30 to-red-700/30 border-red-500/50'
                : 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30'
            }`}>
              {displayDice ? (
                <DiceFace value={displayDice} size="w-16 h-16" dotSize="w-3 h-3" color={
                  result ? (result.isWin ? 'bg-accent' : 'bg-red-400') : 'bg-blue-400'
                } />
              ) : (
                <GiPerspectiveDiceSixFacesRandom className="w-12 h-12 text-blue-400" />
              )}
            </div>
          </motion.div>
        </div>

        {/* Number Selection */}
        <div className="grid grid-cols-6 gap-2 mb-5">
          {[1, 2, 3, 4, 5, 6].map(num => (
            <motion.button
              key={num}
              whileTap={{ scale: 0.93 }}
              onClick={() => { if (!rolling) { setPrediction(num); sounds.tap(); } }}
              disabled={rolling}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                prediction === num
                  ? 'border-blue-400 bg-blue-500/15'
                  : 'border-white/10 bg-dark-700/40 hover:border-white/20'
              }`}
            >
              <DiceFace
                value={num}
                size="w-10 h-10"
                dotSize="w-1.5 h-1.5"
                color={prediction === num ? 'bg-blue-400' : 'bg-gray-400'}
              />
              <span className={`text-xs font-bold ${prediction === num ? 'text-blue-400' : 'text-gray-500'}`}>
                {num}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Bet Amount */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (Z)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount..."
            disabled={rolling}
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!rolling) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={rolling}
                className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
              >
                {qa} Z
              </button>
            ))}
            <button
              onClick={() => { if (!rolling && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={rolling}
              className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Potential Win */}
        {amount && parseFloat(amount) > 0 && (
          <div className="text-center mb-4 text-sm text-gray-400">
            Potential win: <span className="text-accent font-bold">{(parseFloat(amount) * 5.7).toFixed(2)} Z</span>
          </div>
        )}

        {/* Roll Button */}
        <motion.button
          whileHover={!rolling ? { scale: 1.02 } : {}}
          whileTap={!rolling ? { scale: 0.98 } : {}}
          onClick={handleRoll}
          disabled={rolling || !prediction || !amount}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            rolling || !prediction || !amount
              ? 'bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed'
              : 'btn-premium'
          }`}
        >
          {rolling ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Rolling...
            </span>
          ) : (
            'Roll Dice'
          )}
        </motion.button>
      </div>
        </div>
      </div>
    </div>
  );
}

export default DiceRoll;
