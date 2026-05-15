import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { sounds } from '../utils/sounds';
import { useCurrency } from '../contexts/CurrencyContext';

// Reusable win/loss overlay — king-casino style, frameless.
// Elements float over a blurred backdrop with spotlight + particles, no solid
// container box around the content.
//
// Props:
//   result: { isWin, winAmount, betAmount, multiplier, prediction, result, isDemo } | null
//   show: boolean
//   onClose: () => void
//   title?: string (e.g. "Shuffle Card", "Mutka King")
//   autoCloseMs?: number (default 4500)

function GameResultOverlay({ result, show, onClose, title, autoCloseMs = 4500 }) {
  const navigate = useNavigate();
  const { formatCurrency, selectedCurrency } = useCurrency();
  const isWin = result?.isWin;
  const isDemo = result?.isDemo;

  // Sound + autoclose: parent re-renders rebuild `result` and `onClose` every
  // tick (the countdown effect renders every 200ms), so keeping them in the
  // deps array used to replay the sound and reset the timer on every render —
  // the multi-sound and modal-skip bug. We key the effect on a primitive
  // fingerprint of the actual data so it only re-runs when the result really
  // changes (e.g. a new settled event arrives while the modal is still up).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fingerprint = show && result
    ? `${result.isWin ? 1 : 0}|${result.betAmount ?? ''}|${result.winAmount ?? ''}|${result.result ?? ''}`
    : '';
  useEffect(() => {
    if (!fingerprint) return;
    isWin ? sounds.win() : sounds.lose();
    const timer = setTimeout(() => onCloseRef.current?.(), autoCloseMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, autoCloseMs]);

  // Pre-compute random particle / coin trajectories per open so each summon
  // feels different but doesn't reshuffle during the animation.
  const coinSeeds = useMemo(
    () =>
      Array.from({ length: 26 }).map(() => ({
        startX: (Math.random() - 0.5) * 120,
        endX: (Math.random() - 0.5) * 520,
        endY: 260 + Math.random() * 260,
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.55,
        duration: 1.8 + Math.random() * 1.5,
        size: 14 + Math.random() * 18,
      })),
    [show, isWin]
  );

  const sparkSeeds = useMemo(
    () =>
      Array.from({ length: 16 }).map(() => ({
        x: (Math.random() - 0.5) * 380,
        y: -120 - Math.random() * 220,
        delay: 0.15 + Math.random() * 0.6,
        duration: 1.2 + Math.random() * 1.0,
      })),
    [show, isWin]
  );

  // Palette per state — gilt gold on win, deep crimson on loss.
  const palette = isWin
    ? {
        gold: '#f5d27a',
        goldLight: '#fff3b3',
        goldDark: '#a17a2c',
        glow: 'rgba(245,210,122,0.55)',
        titleStrip: 'linear-gradient(180deg, #fff3b3 0%, #f5d27a 45%, #a17a2c 100%)',
        ribbon: 'linear-gradient(180deg, #fff3b3 0%, #e7c34c 50%, #8a5e16 100%)',
        verdict: 'WINNER',
        verdictSub: 'ROYAL PAYOUT',
      }
    : {
        gold: '#c0392b',
        goldLight: '#ff8b7b',
        goldDark: '#4a0e0e',
        glow: 'rgba(192,57,43,0.5)',
        titleStrip: 'linear-gradient(180deg, #ff8b7b 0%, #c0392b 45%, #4a0e0e 100%)',
        ribbon: 'linear-gradient(180deg, #ff8b7b 0%, #c0392b 50%, #4a0e0e 100%)',
        verdict: 'BUSTED',
        verdictSub: 'TRY AGAIN',
      };

  return (
    <AnimatePresence>
      {show && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={onClose}
        >
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

          {/* Soft radial halo behind the content */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1.6, opacity: 0.7 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute w-[520px] h-[520px] rounded-full blur-[120px] pointer-events-none"
            style={{ background: palette.glow }}
          />

          {/* Rotating conic spotlight beams (win only) */}
          {isWin && (
            <motion.div
              className="absolute w-[820px] h-[820px] pointer-events-none opacity-30"
              animate={{ rotate: 360 }}
              transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg, rgba(245,210,122,0.55) 18deg, transparent 42deg, transparent 180deg, rgba(245,210,122,0.55) 198deg, transparent 222deg)',
                maskImage:
                  'radial-gradient(closest-side, transparent 18%, black 32%, black 72%, transparent 92%)',
                WebkitMaskImage:
                  'radial-gradient(closest-side, transparent 18%, black 32%, black 72%, transparent 92%)',
              }}
            />
          )}

          {/* Reverse-rotating second beam (win only) for cross-light effect */}
          {isWin && (
            <motion.div
              className="absolute w-[680px] h-[680px] pointer-events-none opacity-20"
              animate={{ rotate: -360 }}
              transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
              style={{
                background:
                  'conic-gradient(from 90deg, transparent 0deg, rgba(255,243,179,0.6) 14deg, transparent 36deg, transparent 180deg, rgba(255,243,179,0.6) 194deg, transparent 216deg)',
                maskImage:
                  'radial-gradient(closest-side, transparent 22%, black 38%, black 68%, transparent 88%)',
                WebkitMaskImage:
                  'radial-gradient(closest-side, transparent 22%, black 38%, black 68%, transparent 88%)',
              }}
            />
          )}

          {/* Coin shower on win */}
          {isWin && coinSeeds.map((s, i) => (
            <motion.div
              key={`coin-${i}`}
              className="absolute pointer-events-none flex items-center justify-center rounded-full font-black"
              initial={{ opacity: 0, x: s.startX, y: -280, rotate: 0, scale: 0.4 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [-280, s.endY],
                x: [s.startX, s.endX],
                rotate: s.rotate,
                scale: [0.4, 1, 1, 0.85],
              }}
              transition={{ duration: s.duration, delay: s.delay, ease: 'easeIn' }}
              style={{
                width: s.size,
                height: s.size,
                background:
                  'radial-gradient(circle at 30% 30%, #fff3b3 0%, #f5d27a 45%, #a17a2c 100%)',
                color: '#5b3a0a',
                fontSize: s.size * 0.55,
                boxShadow:
                  '0 2px 6px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.4)',
              }}
            >
              {selectedCurrency?.symbol || '$'}
            </motion.div>
          ))}

          {/* Crimson sparks on loss */}
          {!isWin && sparkSeeds.map((s, i) => (
            <motion.span
              key={`spark-${i}`}
              className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{
                opacity: [0, 1, 0],
                x: s.x,
                y: -s.y,
                scale: [0.4, 1, 0.2],
              }}
              transition={{ duration: s.duration, delay: s.delay, ease: 'easeOut' }}
              style={{
                background: '#ff7b6b',
                boxShadow: '0 0 8px #ff7b6b',
              }}
            />
          ))}

          {/* Close button — fixed to the viewport corner so it doesn't shift
              the perceived vertical centre of the modal content. */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="fixed top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 border backdrop-blur-sm transition-colors"
            style={{ borderColor: `${palette.gold}77`, color: palette.goldLight }}
          >
            <FiX className="w-4 h-4" />
          </button>

          {/* CONTENT — floating, no solid container */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220 }}
            className="relative text-center max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Crown medallion — floats above everything */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.15, type: 'spring', damping: 12, stiffness: 240 }}
              className="mx-auto mb-3 w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background:
                  `radial-gradient(circle at 30% 25%, ${palette.goldLight}, ${palette.goldDark} 95%)`,
                boxShadow:
                  `0 10px 22px rgba(0,0,0,0.6), 0 0 32px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.25)`,
              }}
            >
              <span className="text-4xl font-black leading-none" style={{ color: '#1a1208' }}>♔</span>
            </motion.div>

            {/* Game title — small subtitle above the verdict */}
            {title && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-[11px] uppercase tracking-[0.35em] mb-1.5"
                style={{
                  color: palette.goldLight,
                  textShadow: `0 0 10px ${palette.glow}`,
                }}
              >
                {title}
              </motion.p>
            )}

            {/* Verdict marquee — huge gilt-text floating directly on the backdrop */}
            <motion.h2
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', damping: 12, stiffness: 200 }}
              className="font-black uppercase tracking-[0.2em] text-5xl sm:text-6xl leading-none"
              style={{
                background: palette.titleStrip,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: `0 0 30px ${palette.glow}`,
                fontFamily: '"Georgia", "Times New Roman", serif',
                filter: `drop-shadow(0 4px 12px ${palette.glow})`,
              }}
            >
              {palette.verdict}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="text-[11px] uppercase tracking-[0.35em] mt-2"
              style={{
                color: `${palette.gold}cc`,
                textShadow: `0 0 8px ${palette.glow}`,
              }}
            >
              {palette.verdictSub}
            </motion.p>

            {/* Gold ribbon with the amount — floating */}
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.6, type: 'spring', damping: 13, stiffness: 200 }}
              className="relative mt-6 mx-auto inline-block"
            >
              <div
                className="relative px-7 py-3 rounded-md"
                style={{
                  background: palette.ribbon,
                  boxShadow:
                    `0 14px 36px rgba(0,0,0,0.65), 0 0 24px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.3)`,
                }}
              >
                {/* Ribbon swallowtails */}
                <span
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0"
                  style={{
                    borderTop: '16px solid transparent',
                    borderBottom: '16px solid transparent',
                    borderRight: `10px solid ${palette.goldDark}`,
                  }}
                />
                <span
                  className="absolute -right-2 top-1/2 -translate-y-1/2 w-0 h-0"
                  style={{
                    borderTop: '16px solid transparent',
                    borderBottom: '16px solid transparent',
                    borderLeft: `10px solid ${palette.goldDark}`,
                  }}
                />
                <p
                  className="text-3xl sm:text-4xl font-black tabular-nums"
                  style={{
                    color: '#1a1208',
                    textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    fontFamily: '"Georgia", serif',
                  }}
                >
                  {isWin
                    ? `+${formatCurrency(result.winAmount)}`
                    : `−${formatCurrency(result.betAmount)}`}
                </p>
              </div>
            </motion.div>

            {/* Multiplier pill — floating */}
            {isWin && result.multiplier ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="inline-flex items-center gap-1.5 mt-5 px-4 py-1.5 rounded-full border text-[11px] font-black tracking-[0.2em] uppercase backdrop-blur-sm"
                style={{
                  borderColor: `${palette.gold}88`,
                  background: 'rgba(0,0,0,0.35)',
                  color: palette.goldLight,
                  boxShadow: `0 0 16px ${palette.glow}`,
                }}
              >
                <span style={{ color: palette.gold }}>×</span> {result.multiplier} Payout
              </motion.div>
            ) : null}

            {/* The Draw — minimalist, no card box, just text with a thin rule */}
            {result.result ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="mt-5"
              >
                <p
                  className="text-[10px] uppercase tracking-[0.35em] mb-1"
                  style={{ color: `${palette.gold}99` }}
                >
                  The Draw
                </p>
                <p
                  className="font-black text-sm sm:text-base break-all max-w-[340px] mx-auto"
                  style={{
                    color: palette.goldLight,
                    textShadow: `0 0 10px ${palette.glow}`,
                  }}
                >
                  {String(result.result).trim()}
                </p>
                <div
                  className="h-[1px] mt-2 mx-auto w-32"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${palette.gold}88, transparent)`,
                  }}
                />
              </motion.div>
            ) : null}

            {/* Prediction */}
            {result.prediction && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.95 }}
                className="text-gray-400/85 text-[11px] mt-3"
              >
                Your pick:{' '}
                <span className="capitalize" style={{ color: palette.goldLight }}>
                  {result.prediction}
                </span>
              </motion.p>
            )}

            {/* Demo CTA */}
            {isDemo && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.05 }}
                className="mt-6 space-y-2"
              >
                <p className="text-yellow-300/85 text-[10px] font-medium uppercase tracking-[0.3em]">
                  Free demo round
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); navigate('/wallet'); }}
                  className="px-6 py-2.5 rounded-md font-black text-sm uppercase tracking-[0.18em]"
                  style={{
                    background: palette.ribbon,
                    color: '#1a1208',
                    boxShadow: `0 6px 18px rgba(0,0,0,0.55), 0 0 16px ${palette.glow}`,
                  }}
                >
                  Deposit to Play
                </button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GameResultOverlay;
