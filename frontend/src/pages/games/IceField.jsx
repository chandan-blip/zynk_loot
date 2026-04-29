import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiGrid } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { useCurrency } from '../../contexts/CurrencyContext';
import { playIceField, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';
import GameCrossPromo from '../../components/GameCrossPromo';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import { isDemoMode, demoIceField } from '../../utils/demoGame';

const QUICK_AMOUNTS = [5, 10, 50, 100, 500, 1000];
const COLS = 5;
const MAX_ROWS = 5;
const HOUSE_EDGE = 0.97;

const DIFFICULTIES = [
  { traps: 1, label: 'Thin Ice', desc: '1 trap' },
  { traps: 2, label: 'Cracked', desc: '2 traps' },
  { traps: 3, label: 'Shattered', desc: '3 traps' },
];

const getMultiplier = (traps, rows) => {
  const perRow = (COLS / (COLS - traps)) * HOUSE_EDGE;
  return Math.round(Math.pow(perRow, rows) * 100) / 100;
};

function IceField() {
  usePageTitle('Ice Field');

  const { user, checkAuth } = useStore();
  const { formatCurrency } = useCurrency();
  const [phase, setPhase] = useState('betting');
  const [amount, setAmount] = useState('');
  const [difficulty, setDifficulty] = useState(1);
  const [targetRows, setTargetRows] = useState(3);
  const [currentRow, setCurrentRow] = useState(0);
  const [gameData, setGameData] = useState(null);
  const [revealedTiles, setRevealedTiles] = useState({});
  const [pickedTiles, setPickedTiles] = useState({});
  const [revealing, setRevealing] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const statsRes = await getGameStats();
      const ifStats = (statsRes.data.data || []).find(s => s.game_type === 'ice_field');
      setStats(ifStats || null);
    } catch (err) {}
  };

  const revealRow = (row, pickedCol, isSafe) => {
    const tiles = {};
    const otherCols = [0, 1, 2, 3, 4].filter(c => c !== pickedCol);
    const shuffled = [...otherCols].sort(() => Math.random() - 0.5);

    if (isSafe) {
      tiles[pickedCol] = 'safe';
      shuffled.forEach((col, i) => {
        tiles[col] = i < difficulty ? 'trap' : 'safe';
      });
    } else {
      tiles[pickedCol] = 'trap';
      shuffled.forEach((col, i) => {
        tiles[col] = i < (difficulty - 1) ? 'trap' : 'safe';
      });
    }
    return tiles;
  };

  const handleStart = async () => {
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }
    sounds.click();

    try {
      const res = isDemoMode(user)
        ? demoIceField(betAmount, difficulty, targetRows)
        : await playIceField(betAmount, difficulty, targetRows);
      const data = res.data.data;
      setGameData(data);
      setRevealedTiles({});
      setPickedTiles({});
      setCurrentRow(1);
      setPhase('walking');
      if (!data.isDemo) checkAuth();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
    }
  };

  const handleTilePick = async (col) => {
    if (revealing || phase !== 'walking') return;
    setRevealing(true);

    const isSafe = currentRow <= gameData.survivedRows;
    const rowTiles = revealRow(currentRow, col, isSafe);

    setPickedTiles(prev => ({ ...prev, [currentRow]: col }));
    setRevealedTiles(prev => ({ ...prev, [currentRow]: rowTiles }));

    if (isSafe) {
      sounds.iceStep();
      await new Promise(r => setTimeout(r, 500));

      if (currentRow >= targetRows) {
        setPhase('result');
        setResult(gameData);
        setShowResult(true);
        if (!gameData.isDemo) { loadData(); setHistoryKey(k => k + 1); }
      } else {
        setCurrentRow(prev => prev + 1);
      }
    } else {
      sounds.iceCrack();
      await new Promise(r => setTimeout(r, 1000));
      setPhase('result');
      setResult(gameData);
      setShowResult(true);
      if (!gameData.isDemo) { loadData(); setHistoryKey(k => k + 1); }
    }
    setRevealing(false);
  };

  const handlePlayAgain = () => {
    setPhase('betting');
    setCurrentRow(0);
    setGameData(null);
    setRevealedTiles({});
    setPickedTiles({});
    setResult(null);
  };

  const closeResult = useCallback(() => setShowResult(false), []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  const getTileState = (row, col) => {
    if (revealedTiles[row]) return revealedTiles[row][col];
    if (row === currentRow && phase === 'walking') return 'current';
    if (row > currentRow || phase === 'betting') return 'locked';
    return 'locked';
  };

  const currentMultiplier = getMultiplier(difficulty, targetRows);

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult}
        onClose={closeResult}
        title="ice"
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
                <p className="text-xs text-gray-500">Total Walks</p>
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
            gameType="ice_field"
            title="Recent Walks"
            refreshKey={historyKey}
            renderItem={(bet) => {
              const details = typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details;
              const diffLabel = DIFFICULTIES.find(d => d.traps === details?.difficulty)?.label || '';
              return (
                <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      bet.is_win ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {bet.is_win ? '\u{1F463}' : '\u{1F480}'}
                    </div>
                    <div>
                      <p className="text-sm text-white">
                        Bet <span className="font-semibold">{formatCurrency(parseFloat(bet.bet_amount))}</span>
                        <span className="text-gray-500 ml-1">{diffLabel} {'\u00B7'} {details?.targetRows}R</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {bet.is_win
                          ? `Crossed ${details?.targetRows} rows`
                          : `Fell at row ${details?.failedRow}`}
                        {' \u00B7 '}{new Date(bet.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${bet.is_win ? 'text-accent' : 'text-red-400'}`}>
                    {bet.is_win ? `+${formatCurrency(parseFloat(bet.win_amount))}` : `-${formatCurrency(parseFloat(bet.bet_amount))}`}
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
            <FiGrid className="w-7 h-7 text-cyan-400" />
            Ice Field
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {phase === 'walking'
              ? `Row ${currentRow} of ${targetRows} — Step on a tile!`
              : 'Walk across the frozen field without falling through'}
          </p>
        </div>

        <GameLiveFeed />

        {/* Ice Grid */}
        {(phase === 'walking' || phase === 'result') && (
          <div className="flex flex-col-reverse gap-1.5 mb-6">
            {Array.from({ length: targetRows }, (_, ri) => {
              const row = ri + 1;
              const isCurrentRow = row === currentRow && phase === 'walking';
              const rowRevealed = !!revealedTiles[row];
              const picked = pickedTiles[row];

              return (
                <motion.div
                  key={row}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ri * 0.05 }}
                  className="flex items-center gap-1.5"
                >
                  <span className={`text-[10px] font-bold w-5 ${
                    rowRevealed && revealedTiles[row]?.[picked] === 'safe' ? 'text-cyan-400' :
                    rowRevealed && revealedTiles[row]?.[picked] === 'trap' ? 'text-red-400' :
                    isCurrentRow ? 'text-cyan-300' : 'text-gray-600'
                  }`}>
                    {row}
                  </span>

                  {Array.from({ length: COLS }, (_, col) => {
                    const state = getTileState(row, col);
                    const isPicked = picked === col;

                    if (state === 'safe') {
                      return (
                        <motion.div
                          key={col}
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className={`flex-1 h-11 rounded-lg flex items-center justify-center text-sm font-bold ${
                            isPicked
                              ? 'bg-cyan-500/25 border-2 border-cyan-400/50 text-cyan-300'
                              : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-500/40'
                          }`}
                        >
                          {isPicked ? '👣' : ''}
                        </motion.div>
                      );
                    }

                    if (state === 'trap') {
                      return (
                        <motion.div
                          key={col}
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className={`flex-1 h-11 rounded-lg flex items-center justify-center text-sm font-bold ${
                            isPicked
                              ? 'bg-red-500/25 border-2 border-red-500/50 text-red-400'
                              : 'bg-dark-700/40 border border-red-500/20 text-red-500/30'
                          }`}
                        >
                          {isPicked ? '💀' : '~'}
                        </motion.div>
                      );
                    }

                    if (state === 'current') {
                      return (
                        <motion.button
                          key={col}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleTilePick(col)}
                          disabled={revealing}
                          className="flex-1 h-11 rounded-lg border-2 border-cyan-400/30 bg-cyan-400/10 text-cyan-400/50 text-xs font-bold hover:border-cyan-400/60 hover:bg-cyan-400/20 transition-all"
                        >
                          ?
                        </motion.button>
                      );
                    }

                    // locked
                    return (
                      <div
                        key={col}
                        className="flex-1 h-11 rounded-lg bg-dark-700/20 border border-white/5"
                      />
                    );
                  })}

                  <span className={`text-[10px] font-bold w-10 text-right ${
                    rowRevealed && revealedTiles[row]?.[picked] === 'safe' ? 'text-cyan-400' :
                    isCurrentRow ? 'text-cyan-300' : 'text-gray-600'
                  }`}>
                    {getMultiplier(difficulty, row)}x
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Current value during walk */}
        {phase === 'walking' && currentRow > 1 && (
          <div className="text-center text-sm text-gray-400">
            Crossed: <span className="text-cyan-400 font-bold">
              {formatCurrency(parseFloat(amount) * getMultiplier(difficulty, currentRow - 1))}
            </span>
            <span className="text-gray-600 ml-1">({getMultiplier(difficulty, currentRow - 1)}x)</span>
          </div>
        )}

        {phase === 'betting' && (
          <>
            {/* Difficulty Selector */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-2 block">Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d.traps}
                    onClick={() => { setDifficulty(d.traps); sounds.tap(); }}
                    className={`py-3 rounded-lg border text-sm font-bold transition-all ${
                      difficulty === d.traps
                        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-400'
                        : 'border-white/10 bg-dark-700/40 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {d.label}
                    <span className="block text-[10px] opacity-60 mt-0.5">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Row Selector */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-2 block">Rows to Cross</label>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: MAX_ROWS }, (_, i) => {
                  const r = i + 1;
                  return (
                    <button
                      key={r}
                      onClick={() => { setTargetRows(r); sounds.tap(); }}
                      className={`py-2.5 rounded-lg border text-sm font-bold transition-all ${
                        targetRows === r
                          ? 'border-cyan-400 bg-cyan-500/15 text-cyan-400'
                          : 'border-white/10 bg-dark-700/40 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {r}
                      <span className="block text-[10px] opacity-60 mt-0.5">{getMultiplier(difficulty, r)}x</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bet Amount */}
            <div className="mb-4 hidden md:block">
              <label className="text-sm text-gray-400 mb-2 block">Bet Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount..."
                className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    onClick={() => { setAmount(String(qa)); sounds.tap(); }}
                    className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
                  >
                    {formatCurrency(qa)}
                  </button>
                ))}
                <button
                  onClick={() => { if (user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
                  className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Potential Win */}
            <div className="text-center text-sm text-gray-400">
              Potential win: <span className="text-accent font-bold">
                {formatCurrency((parseFloat(amount) || 0) * currentMultiplier)}
              </span>
              <span className="text-gray-600 ml-2">({currentMultiplier}x)</span>
            </div>

            {/* Start Button */}
            <div className="fixed bottom-0 left-0 right-0 z-30 p-3 pb-4 bg-dark-500/95 backdrop-blur-sm border-t border-white/5 md:static md:p-0 md:bg-transparent md:backdrop-blur-none md:border-0">
              <div className="md:hidden">
                <BetStepper amount={amount} setAmount={setAmount} disabled={!!gameData} />
              </div>
              <div className="flex gap-2 mb-2 md:hidden">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    onClick={() => { setAmount(String(qa)); sounds.tap(); }}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${amount === String(qa) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
                  >
                    {qa}
                  </button>
                ))}
                <button
                  onClick={() => { if (user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${user?.balance && amount === String(Math.floor(user.balance)) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
                >
                  MAX
                </button>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStart}
                disabled={!amount}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  !amount
                    ? 'bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed'
                    : 'btn-premium'
                }`}
              >
                Start Walking
              </motion.button>
            </div>
          </>
        )}

        {phase === 'result' && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePlayAgain}
            className="w-full py-4 rounded-xl font-bold text-lg btn-premium"
          >
            Play Again
          </motion.button>
        )}
      </div>
        </div>
      </div>
      <GameCrossPromo currentGame="ice-field" />
            <div className="h-36 md:hidden"></div>

    </div>
  );
}

export default IceField;
