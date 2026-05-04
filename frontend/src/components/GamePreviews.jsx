import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import PlayingCard from './PlayingCard';
import UnoCard from './UnoCard';

// ─────────────────────────────────────────────────────────────────────────
// Each component below is an absolutely-positioned mini animation that
// sits in the bottom-right corner of a Home-page game card. They replace
// the static background-icon watermark and run lightweight transforms so
// many can render simultaneously without jank.
// All previews use `pointer-events-none` so they never steal a tap.
// ─────────────────────────────────────────────────────────────────────────

function pickRandom(n, max = 52) {
  const set = new Set();
  while (set.size < n) set.add(Math.floor(Math.random() * max));
  return [...set];
}

// ── Lottery: Mutka King — fanned mini cards that re-deal & flip
export function MutkaPreview() {
  const [cards, setCards] = useState(() => pickRandom(3));
  const [faceUp, setFaceUp] = useState(true);
  useEffect(() => {
    let flipTimer;
    const cycle = setInterval(() => {
      setFaceUp(false);
      flipTimer = setTimeout(() => {
        setCards(pickRandom(3));
        setFaceUp(true);
      }, 900);
    }, 8000);
    return () => { clearInterval(cycle); if (flipTimer) clearTimeout(flipTimer); };
  }, []);
  return (
    <div className="absolute right-2 bottom-2 flex items-end pointer-events-none">
      {cards.map((id, idx) => {
        const rot = (idx - 1) * 10;
        // Negative-margin overlap scales with card width per breakpoint so the
        // fan keeps roughly the same proportions at every screen size.
        const overlap = idx === 0 ? '' : '-ml-4 sm:-ml-5 md:-ml-6 lg:-ml-[28px]';
        return (
          <motion.div
            key={idx}
            initial={{ y: 0, rotate: rot }}
            animate={{ y: [0, -2, 0], rotate: rot }}
            transition={{ duration: 5 + idx * 0.5, repeat: Infinity, ease: 'easeInOut' }}
            className={overlap}
            style={{ willChange: 'transform', zIndex: idx }}
          >
            <PlayingCard id={id} faceUp={faceUp} size="xs" delay={idx * 0.12} />
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Lottery: UNO King — 3 fanned UNO mini cards re-deal & flip
export function UnoPreview() {
  const [cards, setCards] = useState(() => pickRandom(3, 54));
  const [faceUp, setFaceUp] = useState(true);
  useEffect(() => {
    let flipTimer;
    const cycle = setInterval(() => {
      setFaceUp(false);
      flipTimer = setTimeout(() => {
        setCards(pickRandom(3, 54));
        setFaceUp(true);
      }, 900);
    }, 8000);
    return () => { clearInterval(cycle); if (flipTimer) clearTimeout(flipTimer); };
  }, []);
  return (
    <div className="absolute right-2 bottom-2 flex items-end pointer-events-none">
      {cards.map((id, idx) => {
        const rot = (idx - 1) * 10;
        const overlap = idx === 0 ? '' : '-ml-4 sm:-ml-5 md:-ml-6 lg:-ml-[28px]';
        return (
          <motion.div
            key={idx}
            initial={{ y: 0, rotate: rot }}
            animate={{ y: [0, -2, 0], rotate: rot }}
            transition={{ duration: 5 + idx * 0.5, repeat: Infinity, ease: 'easeInOut' }}
            className={overlap}
            style={{ willChange: 'transform', zIndex: idx }}
          >
            <UnoCard id={id} faceUp={faceUp} size="xs" delay={idx * 0.12} />
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Lottery: 7-Digit — flipping digit tiles, slot-machine feel
function DigitTile({ delay }) {
  const [d, setD] = useState(() => Math.floor(Math.random() * 10));
  useEffect(() => {
    const t = setInterval(() => setD(Math.floor(Math.random() * 10)), 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      className="w-5 h-7 sm:w-6 sm:h-8 rounded bg-dark-800/90 border border-gold/40 flex items-center justify-center text-gold-light font-mono font-bold text-[10px] sm:text-xs"
      style={{ willChange: 'transform' }}
      animate={{ rotateX: [0, -90, 0, 0, 0] }}
      transition={{ duration: 4, repeat: Infinity, delay, times: [0, 0.18, 0.36, 0.7, 1], ease: 'easeInOut' }}
    >
      {d}
    </motion.div>
  );
}

export function SevenDigitPreview() {
  return (
    <div className="absolute right-3 bottom-3 flex gap-1 pointer-events-none">
      {[0, 0.8, 1.6, 2.4].map((delay, i) => (
        <DigitTile key={i} delay={delay} />
      ))}
    </div>
  );
}

// ── Coin Flip — 3D spinning coin with letters on each face
export function CoinFlipPreview() {
  return (
    <div className="absolute right-2 bottom-2 pointer-events-none" style={{ perspective: 200 }}>
      <motion.div
        className="relative w-9 h-9 rounded-full"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #fde68a, #d97706 70%, #78350f)',
          boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.5)',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
        animate={{ rotateY: [0, 360], y: [0, -3, 0] }}
        transition={{
          rotateY: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
          y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center font-black text-amber-900"
          style={{ fontSize: 14, backfaceVisibility: 'hidden' }}
        >
          ₹
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center font-black text-amber-900"
          style={{ fontSize: 12, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
        >
          ★
        </span>
      </motion.div>
    </div>
  );
}

// ── Dice Roll — proper dice face with pips, tumbling
const DICE_PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

export function DiceRollPreview() {
  const [face, setFace] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setFace(Math.floor(Math.random() * 6) + 1), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute right-2 bottom-2 pointer-events-none">
      <motion.div
        className="relative w-9 h-9 rounded-md"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)',
          boxShadow: '0 3px 8px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.12), inset 0 -2px 0 rgba(0,0,0,0.08)',
          willChange: 'transform',
        }}
        animate={{ rotate: [0, 180, 360], y: [0, -3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {DICE_PIPS[face].map(([x, y], i) => (
          <span
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              background: '#1d4ed8',
              boxShadow: 'inset 0 0 1px rgba(0,0,0,0.4)',
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

// ── Lucky Spin — 8-segment wheel with pointer
export function LuckySpinPreview() {
  return (
    <div className="absolute right-2 bottom-2 pointer-events-none">
      <div className="relative w-10 h-10">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, #ec4899 0 45deg, #a855f7 45deg 90deg, #f59e0b 90deg 135deg, #10b981 135deg 180deg, #3b82f6 180deg 225deg, #ef4444 225deg 270deg, #8b5cf6 270deg 315deg, #f97316 315deg 360deg)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.25)',
            willChange: 'transform',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-[34%] rounded-full bg-dark-800 border border-white/20" />
        {/* pointer */}
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0"
          style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid #fbbf24' }}
        />
      </div>
    </div>
  );
}

// ── Balloon Pop — inflating/deflating balloon
export function BalloonPopPreview() {
  return (
    <div className="absolute right-3 bottom-2 pointer-events-none">
      <motion.div
        className="flex flex-col items-center"
        animate={{ scale: [0.85, 1.12, 0.85], y: [0, -3, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: 'bottom center', willChange: 'transform' }}
      >
        <div
          className="w-6 h-7 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #fecaca, #ef4444 65%, #7f1d1d)',
            boxShadow: '0 2px 5px rgba(0,0,0,0.4), inset -2px -3px 4px rgba(0,0,0,0.25)',
          }}
        />
        <div className="w-px h-2 bg-gray-400" />
      </motion.div>
    </div>
  );
}

// ── Dragon Tower — floors stacking & cycling
export function DragonTowerPreview() {
  return (
    <div className="absolute right-2 bottom-2 flex flex-col-reverse gap-0.5 items-end pointer-events-none">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 8, scaleX: 0.7 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: [8, 0, 0, -8],
            scaleX: [0.7, 1, 1, 1],
          }}
          transition={{
            duration: 6.5,
            repeat: Infinity,
            delay: i * 0.55,
            times: [0, 0.18, 0.85, 1],
            ease: 'easeOut',
          }}
          className="h-1.5 rounded-sm"
          style={{
            width: `${22 + i * 5}px`,
            background:
              i === 3
                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                : 'linear-gradient(90deg, rgba(245,158,11,0.55), rgba(239,68,68,0.55))',
            boxShadow: '0 1px 0 rgba(0,0,0,0.3)',
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

// ── Ice Field — 3×3 tile grid that shimmers
export function IceFieldPreview() {
  return (
    <div className="absolute right-2 bottom-2 grid grid-cols-3 gap-[2px] pointer-events-none">
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-2.5 h-2.5 rounded-[2px]"
          style={{
            background: 'linear-gradient(135deg, #a5f3fc, #06b6d4 60%, #0e7490)',
            boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.45)',
            willChange: 'opacity, transform',
          }}
          animate={{ opacity: [0.35, 1, 0.35], y: [0, -1, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: ((i * 13) % 24) / 8,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ── Arrow Roulette — bullseye target with rotating arrow
export function ArrowRoulettePreview() {
  return (
    <div className="absolute right-2 bottom-2 pointer-events-none">
      <div
        className="relative w-10 h-10 rounded-full"
        style={{
          background: 'radial-gradient(circle, #fef2f2 0 22%, #fecaca 22% 42%, #ef4444 42% 70%, #7f1d1d 70%)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.3)',
        }}
      >
        <motion.div
          className="absolute inset-0 flex items-start justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          style={{ willChange: 'transform' }}
        >
          {/* arrow shaft */}
          <div
            className="w-[2px] h-4 mt-[1px]"
            style={{
              background: 'linear-gradient(180deg, #fef9c3, #fde047)',
              boxShadow: '0 0 4px rgba(254,224,71,0.8)',
            }}
          />
          {/* arrow head */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '3px solid transparent',
              borderRight: '3px solid transparent',
              borderBottom: '4px solid #fde047',
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}

// ── Egg Hatch — wobbling egg with subtle crack flash
export function EggHatchPreview() {
  return (
    <div className="absolute right-3 bottom-2 pointer-events-none">
      <motion.div
        animate={{ rotate: [-9, 9, -9], y: [0, -1, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ willChange: 'transform' }}
      >
        <div
          className="relative w-6 h-8"
          style={{
            background: 'radial-gradient(ellipse at 30% 30%, #fef3c7, #fbbf24 60%, #92400e)',
            borderRadius: '50% 50% 45% 45% / 60% 60% 40% 40%',
            boxShadow: '0 2px 5px rgba(0,0,0,0.5), inset -2px -3px 5px rgba(0,0,0,0.25)',
          }}
        >
          {/* hairline crack */}
          <div
            className="absolute left-[35%] top-[40%] w-[30%] h-[2px]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.4), transparent)',
              clipPath: 'polygon(0 0, 30% 100%, 60% 0, 100% 100%)',
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}

// ── Fuse — wick line with a glowing spark traveling
export function FusePreview() {
  return (
    <div className="absolute right-2 bottom-3 pointer-events-none">
      <div
        className="relative h-2 rounded-full"
        style={{
          width: '36px',
          background: 'linear-gradient(90deg, #44403c, #57534e 50%, #44403c)',
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.4)',
        }}
      >
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
          style={{
            background: 'radial-gradient(circle, #fef3c7 0%, #fb923c 50%, #ea580c 80%)',
            boxShadow: '0 0 6px #fb923c, 0 0 12px rgba(251,146,60,0.7)',
            willChange: 'transform, left',
          }}
          animate={{ left: ['100%', '0%'], scale: [1, 1.2, 1] }}
          transition={{
            left: { duration: 5, repeat: Infinity, ease: 'linear' },
            scale: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </div>
    </div>
  );
}
