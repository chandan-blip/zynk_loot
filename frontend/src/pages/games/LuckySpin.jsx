import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { FiArrowLeft } from "react-icons/fi";
import { GiCartwheel } from "react-icons/gi";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import useStore from "../../store/useStore";
import {
  playLuckySpin,
  getGameStats,
} from "../../services/api";
import { sounds } from "../../utils/sounds";
import GameResultOverlay from "../../components/GameResultOverlay";
import usePageTitle from "../../hooks/usePageTitle";
import GameHistory from "../../components/GameHistory";

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];

const SEGMENTS = [
  { label: "0x", multiplier: 0, color: "#374151", textColor: "#9CA3AF" },
  { label: "0.5x", multiplier: 0.5, color: "#4B5563", textColor: "#D1D5DB" },
  { label: "1x", multiplier: 1, color: "#6D28D9", textColor: "#E9D5FF" },
  { label: "1.5x", multiplier: 1.5, color: "#7C3AED", textColor: "#F3E8FF" },
  { label: "2x", multiplier: 2, color: "#2563EB", textColor: "#BFDBFE" },
  { label: "3x", multiplier: 3, color: "#0891B2", textColor: "#A5F3FC" },
  { label: "5x", multiplier: 5, color: "#059669", textColor: "#A7F3D0" },
  { label: "10x", multiplier: 10, color: "#D97706", textColor: "#FDE68A" },
];

const SEGMENT_ANGLE = 360 / SEGMENTS.length; // 45 degrees each

function SpinWheel({ rotation, spinning }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 4;

    ctx.clearRect(0, 0, size, size);

    // Draw segments
    SEGMENTS.forEach((seg, i) => {
      const startAngle = (i * SEGMENT_ANGLE - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * SEGMENT_ANGLE - 90) * (Math.PI / 180);

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Segment border
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label text
      ctx.save();
      ctx.translate(center, center);
      const midAngle = (startAngle + endAngle) / 2;
      ctx.rotate(midAngle);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = seg.textColor;
      ctx.font = `bold ${seg.multiplier >= 5 ? 16 : 14}px system-ui, sans-serif`;
      ctx.fillText(seg.label, radius * 0.65, 0);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(center, center, 22, 0, Math.PI * 2);
    ctx.fillStyle = "#1F2937";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(center, center, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#A78BFA";
    ctx.fill();
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      {/* Pointer at top */}
      <div className="absolute -top-2 z-10 flex flex-col items-center">
        <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-purple-400 drop-shadow-lg" />
      </div>

      {/* Outer glow ring */}
      <div
        className={`absolute w-[260px] h-[260px] rounded-full transition-all duration-300 ${
          spinning
            ? "shadow-[0_0_40px_rgba(139,92,246,0.4)]"
            : "shadow-[0_0_15px_rgba(139,92,246,0.15)]"
        }`}
      />

      {/* Spinning wheel */}
      <motion.div
        animate={{ rotate: rotation }}
        transition={
          spinning
            ? {
                duration: 4,
                ease: [0.15, 0.85, 0.25, 1],
              }
            : { duration: 0 }
        }
        className="w-[240px] h-[240px]"
      >
        <canvas
          ref={canvasRef}
          width={240}
          height={240}
          className="w-full h-full rounded-full border-2 border-white/10"
        />
      </motion.div>
    </div>
  );
}

function LuckySpin() {
  usePageTitle('Lucky Spin');

  const { user, checkAuth } = useStore();
  const [amount, setAmount] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [stats, setStats] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const statsRes = await getGameStats();
      const spinStats = (statsRes.data.data || []).find(
        (s) => s.game_type === "lucky_spin",
      );
      setStats(spinStats || null);
    } catch (err) {
      // Silently fail
    }
  };

  const handleSpin = async () => {
    const betAmount = parseFloat(amount);
    if (!betAmount || betAmount < 5) {
      toast.error("Minimum bet is 5 Z");
      return;
    }

    setSpinning(true);
    setResult(null);
    sounds.click();

    try {
      const res = await playLuckySpin(betAmount);
      const data = res.data.data;

      // Calculate target rotation:
      // The pointer is at top (0 degrees). Segment i starts at i*45 degrees.
      // To land on segmentIndex, we rotate so that segment's center aligns with top.
      const segmentCenter =
        data.segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
      // We need to rotate clockwise, and the pointer is at top, so target = 360 - segmentCenter
      const targetAngle = 360 - segmentCenter;
      // Add multiple full rotations for dramatic effect + random offset within segment
      const jitter = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.6);
      const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full rotations
      const finalRotation =
        rotation +
        fullSpins * 360 +
        ((targetAngle + jitter - (rotation % 360) + 360) % 360);

      const deltaRotation = finalRotation - rotation;
      setRotation(finalRotation);
      sounds.spinSync(deltaRotation, 4);

      // Wait for wheel animation to finish
      await new Promise((r) => setTimeout(r, 4200));

      setResult(data);
      setShowResult(true);

      checkAuth();
      loadData();
      setHistoryKey(k => k + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to play");
    } finally {
      setSpinning(false);
    }
  };

  const closeResult = useCallback(() => setShowResult(false), []);

  const winRate = stats
    ? ((stats.wins / stats.total_bets) * 100).toFixed(1)
    : "0.0";
  const netProfit = stats
    ? (parseFloat(stats.total_won) - parseFloat(stats.total_wagered)).toFixed(2)
    : "0.00";

  return (
    <div className="mx-auto">
      <GameResultOverlay
        result={result}
        show={showResult && !spinning}
        onClose={closeResult}
        title="spin"
      />

      <Link
        to="/games"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <FiArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Games</span>
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
        {/* Sidebar: Stats + History (left on md+, below on mobile) */}
        <div className="md:order-1 order-2 space-y-4">
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Total Spins</p>
                <p className="text-lg font-bold text-white">{stats.total_bets}</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Win Rate</p>
                <p className="text-lg font-bold text-white">{winRate}%</p>
              </div>
              <div className="rounded-lg bg-dark-700/40 border border-white/5 p-3 text-center">
                <p className="text-xs text-gray-500">Net Profit</p>
                <p
                  className={`text-lg font-bold ${parseFloat(netProfit) >= 0 ? "text-accent" : "text-red-400"}`}
                >
                  {parseFloat(netProfit) >= 0 ? "+" : ""}
                  {netProfit} Z
                </p>
              </div>
            </div>
          )}

          <GameHistory
            gameType="lucky_spin"
            title="Recent Spins"
            refreshKey={historyKey}
            renderItem={(bet) => (
              <div
                key={bet.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      bet.is_win
                        ? "bg-accent/20 text-accent"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {bet.result}
                  </div>
                  <div>
                    <p className="text-sm text-white">
                      Bet{" "}
                      <span className="font-semibold">
                        {parseFloat(bet.bet_amount)} Z
                      </span>
                      {bet.is_win && (
                        <span className="text-accent ml-1">
                          ({parseFloat(bet.multiplier)}x)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(bet.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold ${bet.is_win ? "text-accent" : "text-red-400"}`}
                >
                  {bet.is_win
                    ? `+${parseFloat(bet.win_amount)}`
                    : `-${parseFloat(bet.bet_amount)}`}{" "}
                  Z
                </span>
              </div>
            )}
          />
        </div>

        {/* Game (right on md+, top on mobile) */}
        <div className="md:order-2 order-1">
      <div className="rounded-xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
            <GiCartwheel className="w-7 h-7 text-purple-400" /> 
            Lucky Spin
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Spin the wheel and win up to 10x your bet
          </p>
        </div>

        {/* Wheel */}
        <div className="flex justify-center mb-8 py-4">
          <SpinWheel rotation={rotation} spinning={spinning} />
        </div>

        {/* Multiplier Legend */}
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {SEGMENTS.map((seg) => (
            <div
              key={seg.label}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
              style={{ backgroundColor: seg.color + "33" }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-gray-300 font-medium">{seg.label}</span>
            </div>
          ))}
        </div>

        {/* Bet Amount */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-2 block">
            Bet Amount (Z)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Min 5 Z..."
            disabled={spinning}
            className="w-full px-4 py-3 rounded-lg bg-dark-700/60 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_AMOUNTS.map((qa) => (
              <button
                key={qa}
                onClick={() => {
                  if (!spinning) {
                    setAmount(String(qa));
                    sounds.tap();
                  }
                }}
                disabled={spinning}
                className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
              >
                {qa} Z
              </button>
            ))}
            <button
              onClick={() => {
                if (!spinning && user?.balance) {
                  setAmount(String(Math.floor(user.balance)));
                  sounds.tap();
                }
              }}
              disabled={spinning}
              className="px-3 py-1.5 rounded-lg bg-dark-700/60 border border-white/10 text-gray-400 text-xs hover:text-white hover:border-white/20 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Spin Button */}
        <motion.button
          whileHover={!spinning ? { scale: 1.02 } : {}}
          whileTap={!spinning ? { scale: 0.98 } : {}}
          onClick={handleSpin}
          disabled={spinning || !amount}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            spinning || !amount
              ? "bg-dark-700/60 border border-white/10 text-gray-500 cursor-not-allowed"
              : "btn-premium"
          }`}
        >
          {spinning ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Spinning...
            </span>
          ) : (
            "Spin the Wheel"
          )}
        </motion.button>
      </div>
        </div>
      </div>
    </div>
  );
}

export default LuckySpin;
