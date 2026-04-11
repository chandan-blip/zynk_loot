import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCrosshair } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { playArrowRoulette, getGameStats } from '../../services/api';
import { sounds } from '../../utils/sounds';
import GameResultOverlay from '../../components/GameResultOverlay';
import usePageTitle from '../../hooks/usePageTitle';
import GameHistory from '../../components/GameHistory';
import GameCrossPromo from '../../components/GameCrossPromo';
import GameLiveFeed from '../../components/GameLiveFeed';
import BetStepper from '../../components/BetStepper';
import { isDemoMode, demoArrowRoulette } from '../../utils/demoGame';

const QUICK_AMOUNTS = [5, 10, 50, 100, 500, 1000];

// Visual rings from outermost to innermost (drawing order)
const TARGET_SIZE = 340;
const CENTER = TARGET_SIZE / 2;

const RINGS = [
  { label: '0.5x', outerR: 152, innerR: 126, color: '#374151' },
  { label: '1x',   outerR: 126, innerR: 100, color: '#4338CA' },
  { label: '1.5x', outerR: 100, innerR: 74,  color: '#6D28D9' },
  { label: '2x',   outerR: 74,  innerR: 50,  color: '#2563EB' },
  { label: '5x',   outerR: 50,  innerR: 28,  color: '#059669' },
  { label: '10x',  outerR: 28,  innerR: 0,   color: '#D97706' },
];

// Maps backend ringIndex to visual ring for arrow placement
// Backend: 0=miss, 1=0.5x, 2=1x, 3=1.5x, 4=2x, 5=5x, 6=10x
const getArrowLanding = (ringIndex) => {
  const angle = Math.random() * Math.PI * 2;

  if (ringIndex === 0) {
    const dist = 156 + Math.random() * 14;
    return { x: CENTER + Math.cos(angle) * dist, y: CENTER + Math.sin(angle) * dist };
  }

  const ring = RINGS[ringIndex - 1];
  const dist = ring.innerR + Math.random() * (ring.outerR - ring.innerR);
  return { x: CENTER + Math.cos(angle) * dist, y: CENTER + Math.sin(angle) * dist };
};

function Target({ arrowPos, shooting }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = TARGET_SIZE;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Draw rings from outer to inner
    RINGS.forEach(ring => {
      ctx.beginPath();
      ctx.arc(c, c, ring.outerR, 0, Math.PI * 2);
      ctx.fillStyle = ring.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Crosshair lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c, c - 152); ctx.lineTo(c, c + 152);
    ctx.moveTo(c - 152, c); ctx.lineTo(c + 152, c);
    ctx.stroke();

    // Ring labels — right side only
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    RINGS.forEach(ring => {
      const midR = (ring.outerR + ring.innerR) / 2;
      if (midR < 20) return;
      const fontSize = midR > 50 ? 12 : midR > 30 ? 11 : 10;
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(ring.label.replace('x', ''), c + midR, c);
    });

    // Bullseye label (center)
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#FDE68A';
    ctx.fillText('10', c, c);
  }, []);

  return (
    <div className="relative inline-block">
      {/* Glow */}
      <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
        shooting
          ? 'shadow-[0_0_40px_rgba(239,68,68,0.3)]'
          : 'shadow-[0_0_15px_rgba(239,68,68,0.1)]'
      }`} />

      <canvas
        ref={canvasRef}
        width={TARGET_SIZE}
        height={TARGET_SIZE}
        className="rounded-full border-2 border-white/10"
      />

      {/* Arrow hit marker */}
      {arrowPos && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.4 }}
          className="absolute w-4 h-4 -ml-2 -mt-2"
          style={{ left: arrowPos.x, top: arrowPos.y }}
        >
          <div className="w-full h-full rounded-full bg-red-500 border-2 border-white shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
          {/* Arrow tail */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-red-400/60 rounded-full" />
        </motion.div>
      )}
    </div>
  );
}

function ArrowRoulette() {
  usePageTitle('Arrow Roulette');

  const { user, checkAuth } = useStore();
  const [amount, setAmount] = useState('');
  const [shooting, setShooting] = useState(false);
  const [arrowPos, setArrowPos] = useState(null);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const statsRes = await getGameStats();
      const arStats = (statsRes.data.data || []).find(s => s.game_type === 'arrow_roulette');
      setStats(arStats || null);
    } catch (err) {}
  };

  const handleShoot = async () => {
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }

    setShooting(true);
    setArrowPos(null);
    setResult(null);
    sounds.click();

    try {
      const res = isDemoMode(user)
        ? demoArrowRoulette(betAmount)
        : await playArrowRoulette(betAmount);
      const data = res.data.data;

      // Play arrow sound
      sounds.arrowShoot();

      // Calculate arrow landing position
      const landing = getArrowLanding(data.ringIndex);
      await new Promise(r => setTimeout(r, 400));

      setArrowPos(landing);
      sounds.arrowHit();

      // Wait for impact, then show result
      await new Promise(r => setTimeout(r, 800));

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
      setShooting(false);
    }
  };

  const closeResult = useCallback(() => {
    setShowResult(false);
    setArrowPos(null);
  }, []);

  const winRate = stats ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0.0';
  const netProfit = stats ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2) : '0.00';

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult && !shooting}
        onClose={closeResult}
        title="arrow"
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
                <p className="text-xs text-gray-500">Total Shots</p>
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
            gameType="arrow_roulette"
            title="Recent Shots"
            refreshKey={historyKey}
            renderItem={(bet) => {
              const details = typeof bet.details === 'string' ? JSON.parse(bet.details) : bet.details;
              return (
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
                      <p className="text-xs text-gray-500">
                        Hit: {details?.ringLabel || 'Miss'}
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
            <FiCrosshair className="w-7 h-7 text-red-400" />
            Arrow Roulette
          </h1>
          <p className="text-gray-400 text-sm mt-1">Shoot the target — closer to center = bigger win</p>
        </div>

        <GameLiveFeed />

        {/* Target */}
        <div className="flex justify-center mb-6 py-2">
          <Target arrowPos={arrowPos} shooting={shooting} />
        </div>

        {/* Ring Legend */}
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-white/5">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-gray-400">Miss 0x</span>
          </div>
          {RINGS.map(ring => (
            <div
              key={ring.label}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
              style={{ backgroundColor: ring.color + '33' }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ring.color }} />
              <span className="text-gray-300">{ring.label}</span>
            </div>
          ))}
        </div>

        {/* Bet Amount */}
        <div className="mb-4 hidden md:block">
          <label className="text-sm text-gray-400 mb-2 block">Bet Amount (Z)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount..."
            disabled={shooting}
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!shooting) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={shooting}
                className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
              >
                {qa} Z
              </button>
            ))}
            <button
              onClick={() => { if (!shooting && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={shooting}
              className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Shoot Button */}
            <div className="fixed bottom-0 left-0 right-0 z-30 p-3 pb-4 bg-dark-500/95 backdrop-blur-sm border-t border-white/5 md:static md:p-0 md:bg-transparent md:backdrop-blur-none md:border-0">
          <div className="md:hidden">
            <BetStepper amount={amount} setAmount={setAmount} disabled={shooting} />
          </div>
          <div className="flex gap-2 mb-2 md:hidden">
            {QUICK_AMOUNTS.map(qa => (
              <button
                key={qa}
                onClick={() => { if (!shooting) { setAmount(String(qa)); sounds.tap(); } }}
                disabled={shooting}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${amount === String(qa) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
              >
                {qa}
              </button>
            ))}
            <button
              onClick={() => { if (!shooting && user?.balance) { setAmount(String(Math.floor(user.balance))); sounds.tap(); } }}
              disabled={shooting}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${user?.balance && amount === String(Math.floor(user.balance)) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-dark-700/60 border-white/10 text-gray-400 hover:text-white'}`}
            >
              MAX
            </button>
          </div>
          <motion.button
            whileHover={!shooting ? { scale: 1.02 } : {}}
            whileTap={!shooting ? { scale: 0.98 } : {}}
            onClick={handleShoot}
            disabled={shooting || !amount}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              shooting || !amount
                ? 'bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed'
                : 'btn-premium'
            }`}
          >
            {shooting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Shooting...
              </span>
            ) : (
              'Shoot!'
            )}
          </motion.button>
        </div>
      </div>
        </div>
      </div>
      <GameCrossPromo currentGame="arrow-roulette" />
        <div className="h-36 md:hidden"></div>
    </div>
  );
}

export default ArrowRoulette;
