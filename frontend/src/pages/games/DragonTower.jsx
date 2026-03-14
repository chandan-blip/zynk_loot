import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiClock, FiLayers } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { playDragonTower, getGameHistory, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];
const MAX_FLOORS = 8;
const MULTIPLIER_BASE = 1.94;
const FLOOR_MULTIPLIERS = Array.from({ length: MAX_FLOORS }, (_, i) =>
  Math.round(Math.pow(MULTIPLIER_BASE, i + 1) * 100) / 100
);

function DragonTower() {
  const { user, checkAuth } = useStore();
  const [phase, setPhase] = useState('betting');
  const [amount, setAmount] = useState('');
  const [targetFloors, setTargetFloors] = useState(3);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [gameData, setGameData] = useState(null);
  const [pickedDoors, setPickedDoors] = useState({});
  const [revealing, setRevealing] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        getGameHistory(1, 10, 'dragon_tower'),
        getGameStats()
      ]);
      setHistory(historyRes.data.data?.bets || []);
      const dtStats = (statsRes.data.data || []).find(s => s.game_type === 'dragon_tower');
      setStats(dtStats || null);
    } catch (err) {}
  };

  const handleStart = async () => {
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }
    sounds.click();

    try {
      const res = await playDragonTower(betAmount, targetFloors);
      const data = res.data.data;
      setGameData(data);
      setPickedDoors({});
      setCurrentFloor(1);
      setPhase('climbing');
      checkAuth();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to play');
    }
  };

  const handleDoorPick = async (door) => {
    if (revealing || phase !== 'climbing') return;
    setRevealing(true);
    sounds.doorReveal();
    setPickedDoors(prev => ({ ...prev, [currentFloor]: door }));

    await new Promise(r => setTimeout(r, 600));

    if (currentFloor <= gameData.survivedFloors) {
      sounds.floorClear();
      if (currentFloor >= targetFloors) {
        await new Promise(r => setTimeout(r, 400));
        setPhase('result');
        setResult(gameData);
        setShowResult(true);
        loadData();
      } else {
        await new Promise(r => setTimeout(r, 300));
        setCurrentFloor(prev => prev + 1);
      }
    } else {
      sounds.dragonRoar();
      await new Promise(r => setTimeout(r, 1000));
      setPhase('result');
      setResult(gameData);
      setShowResult(true);
      loadData();
    }
    setRevealing(false);
  };

  const handlePlayAgain = () => {
    setPhase('betting');
    setCurrentFloor(0);
    setGameData(null);
    setPickedDoors({});
    setResult(null);
  };

  const closeResult = useCallback(() => setShowResult(false), []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  const getFloorState = (floor) => {
    if (phase === 'betting') return 'preview';
    if (pickedDoors[floor] && floor <= (gameData?.survivedFloors || 0)) return 'passed';
    if (pickedDoors[floor] && floor > (gameData?.survivedFloors || 0)) return 'failed';
    if (floor === currentFloor && phase === 'climbing') return 'current';
    return 'locked';
  };

  const renderDoor = (floor, side, state, picked) => {
    if (state === 'current') {
      return (
        <motion.button
          key={side}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleDoorPick(side)}
          disabled={revealing}
          className={`flex-1 py-3 rounded-lg border-2 text-sm font-bold transition-all ${
            revealing && picked === side
              ? 'border-amber-400 bg-amber-500/20 text-amber-300'
              : 'border-amber-500/20 bg-amber-500/5 text-amber-400/80 hover:border-amber-400/50 hover:bg-amber-500/15'
          }`}
        >
          🚪
        </motion.button>
      );
    }

    if (state === 'passed') {
      const isPicked = picked === side;
      return (
        <div key={side} className={`flex-1 py-3 rounded-lg text-center text-sm font-bold ${
          isPicked
            ? 'bg-accent/20 border border-accent/30 text-accent'
            : 'bg-dark-700/30 border border-white/5 text-gray-700'
        }`}>
          {isPicked ? '💎' : '🚪'}
        </div>
      );
    }

    if (state === 'failed') {
      const isPicked = picked === side;
      return (
        <div key={side} className={`flex-1 py-3 rounded-lg text-center text-sm font-bold ${
          isPicked
            ? 'bg-red-500/20 border border-red-500/30 text-red-400'
            : 'bg-accent/10 border border-accent/20 text-accent/40'
        }`}>
          {isPicked ? '🐉' : '💎'}
        </div>
      );
    }

    // locked / preview
    return (
      <div key={side} className="flex-1 py-3 rounded-lg bg-dark-700/20 border border-white/5 text-center text-gray-600 text-sm">
        ?
      </div>
    );
  };

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult}
        onClose={closeResult}
        title="tower"
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
                <p className="text-xs text-gray-500">Total Climbs</p>
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

          {history.length > 0 && (
            <div className="rounded-xl bg-dark-700/30 border border-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <FiClock className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-white">Recent Climbs</h3>
              </div>
              <div className="divide-y divide-white/5">
                {history.map((bet) => {
                  const details = typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details;
                  return (
                    <div key={bet.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          bet.is_win ? 'bg-accent/20 text-accent' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {bet.is_win ? '\u{1F48E}' : '\u{1F409}'}
                        </div>
                        <div>
                          <p className="text-sm text-white">
                            Bet <span className="font-semibold">{parseFloat(bet.bet_amount)} Z</span>
                            <span className="text-gray-500 ml-1">
                              {'\u2192'} {details?.targetFloors}F
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {bet.is_win
                              ? `Cleared ${details?.targetFloors} floors`
                              : `Failed at floor ${details?.failedFloor}`}
                            {' \u00B7 '}{new Date(bet.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${bet.is_win ? 'text-accent' : 'text-red-400'}`}>
                        {bet.is_win ? `+${parseFloat(bet.win_amount)}` : `-${parseFloat(bet.bet_amount)}`} Z
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Game (right on md+, top on mobile) */}
        <div className="md:order-2 order-1">
      <div className="rounded-xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
            <FiLayers className="w-7 h-7 text-amber-400" />
            Dragon Tower
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {phase === 'climbing'
              ? `Floor ${currentFloor} of ${targetFloors} — Pick a door!`
              : 'Pick doors, climb higher, cash out bigger'}
          </p>
        </div>

        {/* Tower */}
        {(phase === 'climbing' || phase === 'result') && (
          <div className="flex flex-col-reverse gap-1.5 mb-6">
            {Array.from({ length: targetFloors }, (_, i) => {
              const floor = i + 1;
              const state = getFloorState(floor);
              const picked = pickedDoors[floor];

              return (
                <motion.div
                  key={floor}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    state === 'current' ? 'bg-amber-500/10 border border-amber-500/30' :
                    state === 'passed' ? 'bg-accent/5 border border-accent/15' :
                    state === 'failed' ? 'bg-red-500/10 border border-red-500/30' :
                    'bg-dark-700/20 border border-white/5'
                  }`}
                >
                  <span className={`text-xs font-bold w-6 ${
                    state === 'current' ? 'text-amber-400' :
                    state === 'passed' ? 'text-accent' :
                    state === 'failed' ? 'text-red-400' :
                    'text-gray-600'
                  }`}>
                    {floor}F
                  </span>

                  <div className="flex gap-2 flex-1">
                    {renderDoor(floor, 'left', state, picked)}
                    {renderDoor(floor, 'right', state, picked)}
                  </div>

                  <span className={`text-xs font-bold w-14 text-right ${
                    state === 'current' ? 'text-amber-400' :
                    state === 'passed' ? 'text-accent' :
                    'text-gray-600'
                  }`}>
                    {FLOOR_MULTIPLIERS[i]}x
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Current multiplier during climb */}
        {phase === 'climbing' && currentFloor > 1 && (
          <div className="text-center mb-4 text-sm text-gray-400">
            Current value: <span className="text-accent font-bold">
              {(parseFloat(amount) * FLOOR_MULTIPLIERS[currentFloor - 2]).toFixed(2)} Z
            </span>
            <span className="text-gray-600 ml-1">({FLOOR_MULTIPLIERS[currentFloor - 2]}x)</span>
          </div>
        )}

        {phase === 'betting' && (
          <>
            {/* Floor Selector */}
            <div className="mb-5">
              <label className="text-sm text-gray-400 mb-2 block">Target Floors</label>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: MAX_FLOORS }, (_, i) => {
                  const f = i + 1;
                  return (
                    <button
                      key={f}
                      onClick={() => { setTargetFloors(f); sounds.tap(); }}
                      className={`py-2.5 rounded-lg border text-sm font-bold transition-all ${
                        targetFloors === f
                          ? 'border-amber-400 bg-amber-500/15 text-amber-400'
                          : 'border-white/10 bg-dark-700/40 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {f}F
                      <span className="block text-[10px] opacity-60 mt-0.5">{FLOOR_MULTIPLIERS[i]}x</span>
                    </button>
                  );
                })}
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
                className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_AMOUNTS.map(qa => (
                  <button
                    key={qa}
                    onClick={() => { setAmount(String(qa)); sounds.tap(); }}
                    className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
                  >
                    {qa} Z
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
            {amount && parseFloat(amount) > 0 && (
              <div className="text-center mb-4 text-sm text-gray-400">
                Potential win: <span className="text-accent font-bold">
                  {(parseFloat(amount) * FLOOR_MULTIPLIERS[targetFloors - 1]).toFixed(2)} Z
                </span>
                <span className="text-gray-600 ml-2">({FLOOR_MULTIPLIERS[targetFloors - 1]}x)</span>
              </div>
            )}

            {/* Start Button */}
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
              Start Climb
            </motion.button>
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
    </div>
  );
}

export default DragonTower;
