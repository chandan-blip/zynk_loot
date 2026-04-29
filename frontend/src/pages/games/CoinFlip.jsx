import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import { playCoinFlip, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';
import GameCrossPromo from '../../components/GameCrossPromo';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import { isDemoMode, demoCoinFlip } from '../../utils/demoGame';

const QUICK_AMOUNTS = [5, 10, 50, 100, 500, 1000];

function CoinFlip() {
  usePageTitle('Coin Flip');

  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();
  const [amount, setAmount] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const statsRes = await getGameStats();
      const coinStats = (statsRes.data.data || []).find(s => s.game_type === 'coin_flip');
      setStats(coinStats || null);
    } catch (err) {
      // Silently fail for stats
    }
  };

  const handleFlip = async () => {
    if (!prediction) {
      toast.error('Pick heads or tails');
      return;
    }
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }

    setFlipping(true);
    setResult(null);
    sounds.click();
    sounds.flip();

    try {
      const res = isDemoMode(user)
        ? demoCoinFlip(betAmount, prediction)
        : await playCoinFlip(betAmount, prediction);
      // Delay showing result for animation
      await new Promise(r => setTimeout(r, 1500));

      const data = res.data.data;
      setResult(data);
      setShowResult(true);

      if (!data.isDemo) {
        checkAuth(); // Refresh balance
        loadData();  // Refresh stats
        setHistoryKey(k => k + 1);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
    } finally {
      setFlipping(false);
    }
  };

  const closeResult = useCallback(() => setShowResult(false), []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult && !flipping}
        onClose={closeResult}
        title="coin"
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
                <p className="text-xs text-gray-500">Total Bets</p>
                <p className="text-sm font-bold text-white">{stats.total_bets}</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Win Rate</p>
                <p className="text-sm font-bold text-white">{winRate}%</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Net Profit</p>
                <p className={`text-sm font-bold ${parseFloat(netProfit) >= 0 ? 'text-accent' : 'text-red-400'}`}>
                  {parseFloat(netProfit) >= 0 ? '+' : ''}{formatCurrency(netProfit)}
                </p>
              </div>
            </div>
          )}

          <GameHistory
            gameType="coin_flip"
            title="Recent Flips"
            refreshKey={historyKey}
            renderItem={(bet) => (
              <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    bet.is_win ? 'bg-accent/20 text-accent' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {bet.result === 'heads' ? 'H' : 'T'}
                  </div>
                  <div>
                    <p className="text-sm text-white">
                      Bet <span className="font-semibold">{formatCurrency(parseFloat(bet.bet_amount))}</span> on{' '}
                      <span className="capitalize">{(typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details)?.prediction}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(bet.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-bold ${bet.is_win ? 'text-accent' : 'text-red-400'}`}>
                  {bet.is_win ? `+${formatCurrency(parseFloat(bet.win_amount))}` : `-${formatCurrency(parseFloat(bet.bet_amount))}`}
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
                <GiTwoCoins className="w-7 h-7 text-yellow-400" />
                Coin Flip
              </h1>
              <p className="text-gray-400 text-sm mt-1">Pick a side, place your bet, win 1.95x</p>
            </div>

            <GameLiveFeed />

            <div className="flex justify-center mb-8">
              <motion.div
                animate={flipping ? { rotateY: [0, 1800], scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
                className="relative"
              >
                <div className={`w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold border-4 transition-all duration-300 ${
                  result
                    ? result.isWin
                      ? 'bg-gradient-to-br from-accent/30 to-green-500/30 border-accent/50 text-accent'
                      : 'bg-gradient-to-br from-red-500/30 to-red-700/30 border-red-500/50 text-red-400'
                    : 'bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border-yellow-500/30 text-yellow-400'
                }`}>
                  {flipping ? (
                    <GiTwoCoins className="w-12 h-12 animate-pulse" />
                  ) : result ? (
                    <span className="uppercase text-lg font-bold">{result.result}</span>
                  ) : (
                    <GiTwoCoins className="w-12 h-12" />
                  )}
                </div>
              </motion.div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { if (!flipping) { setPrediction('heads'); sounds.tap(); } }}
                disabled={flipping}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  prediction === 'heads'
                    ? 'border-yellow-400 bg-yellow-500/15 text-yellow-400'
                    : 'border-white/10 bg-dark-700/40 text-gray-400 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">H</div>
                <div className="text-sm font-semibold">Heads</div>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { if (!flipping) { setPrediction('tails'); sounds.tap(); } }}
                disabled={flipping}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  prediction === 'tails'
                    ? 'border-yellow-400 bg-yellow-500/15 text-yellow-400'
                    : 'border-white/10 bg-dark-700/40 text-gray-400 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">T</div>
                <div className="text-sm font-semibold">Tails</div>
              </motion.button>
            </div>

            <div className="mb-4 hidden md:block">
              <label className="text-sm text-gray-400 mb-2 block">Bet Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount..."
                disabled={flipping}
                className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-colors"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    onClick={() => { if (!flipping) { setAmount(String(qa)); sounds.tap(); } }}
                    disabled={flipping}
                    className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
                  >
                    {formatCurrency(qa)}
                  </button>
                ))}
                <button
                  onClick={() => { if (!flipping && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
                  disabled={flipping}
                  className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="text-center text-sm text-gray-400">
              Potential win: <span className="text-accent font-bold">{formatCurrency((parseFloat(amount) || 0) * 1.95)}</span>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-30 p-3 pb-4 bg-dark-500/95 backdrop-blur-sm border-t border-white/5 md:static md:p-0 md:bg-transparent md:backdrop-blur-none md:border-0">
              <div className="md:hidden">
                <BetStepper amount={amount} setAmount={setAmount} disabled={flipping} />
              </div>
              <div className="flex gap-2 mb-2 md:hidden">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    onClick={() => { if (!flipping) { setAmount(String(qa)); sounds.tap(); } }}
                    disabled={flipping}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${amount === String(qa) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
                  >
                    {qa}
                  </button>
                ))}
                <button
                  onClick={() => { if (!flipping && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
                  disabled={flipping}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${user?.balance && amount === String(Math.floor(user.balance)) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
                >
                  MAX
                </button>
              </div>
              <motion.button
                whileHover={!flipping ? { scale: 1.02 } : {}}
                whileTap={!flipping ? { scale: 0.98 } : {}}
                onClick={handleFlip}
                disabled={flipping || !prediction || !amount}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  flipping || !prediction || !amount
                    ? 'bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed'
                    : 'btn-premium'
                }`}
              >
                {flipping ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Flipping...
                  </span>
                ) : (
                  'Flip Coin'
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
      <GameCrossPromo currentGame="coin-flip" />
      <div className="h-36 md:hidden"></div>
    </div>
  );
}

export default CoinFlip;
