import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GiTwoCoins } from 'react-icons/gi';
import { FiWifiOff } from 'react-icons/fi';

// Fullscreen branded overlay loader. Mounted once near the root of the app
// and toggled by the router/route-change hook so the user gets a brief
// "page transition" cue between pages. Deliberately minimal — just the
// brand mark, wordmark, and a subtle shimmer dot row.
//
// Props:
//   show: boolean — when true, the overlay fades in.

// After this many ms, surface a "slow network" hint so the user knows the
// app didn't freeze — useful on flaky 3G / patchy wifi.
const SLOW_NETWORK_AFTER_MS = 3000;

function AppLoader({ show }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!show) {
      // Reset for the next time the loader appears.
      setSlow(false);
      return undefined;
    }
    const t = setTimeout(() => setSlow(true), SLOW_NETWORK_AFTER_MS);
    return () => clearTimeout(t);
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-auto"
          aria-hidden="true"
        >
          {/* Backdrop — blurred dark wash so underlying page doesn't peek
              through and the brand mark sits cleanly on solid color. */}
          <div className="absolute inset-0 bg-dark-900/95 backdrop-blur-md" />

          {/* Ambient accent glow behind the mark. */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0.55 }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            className="absolute w-72 h-72 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(closest-side, rgba(0,212,170,0.45), transparent 70%)' }}
          />

          {/* Brand stack */}
          <div className="relative flex flex-col items-center gap-4">
            {/* Logo plate with subtle rotation/pulse */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="relative"
            >
              <motion.div
                animate={{ rotate: [0, 6, -6, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent via-accent to-emerald-400 flex items-center justify-center shadow-2xl shadow-accent/40 ring-2 ring-accent/30"
              >
                <GiTwoCoins className="w-10 h-10 text-dark-900" />
              </motion.div>
              {/* Tiny halo rotating around the plate */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.18) 60deg, transparent 120deg, transparent 360deg)',
                  maskImage: 'radial-gradient(closest-side, transparent 60%, black 70%, transparent 90%)',
                  WebkitMaskImage: 'radial-gradient(closest-side, transparent 60%, black 70%, transparent 90%)',
                }}
              />
            </motion.div>

            {/* Wordmark */}
            <motion.div
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="text-center"
            >
              <span className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-white via-accent to-emerald-300 bg-clip-text text-transparent">
                LOOT
              </span>
              <span className="text-2xl font-light text-gray-400 ml-1.5">Market</span>
            </motion.div>

            {/* Shimmer dot row */}
            <div className="flex items-center gap-1.5 mt-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                  className="w-1.5 h-1.5 rounded-full bg-accent"
                />
              ))}
            </div>

            {/* Slow-network hint — fades in only if the loader has been on
                screen longer than SLOW_NETWORK_AFTER_MS. Reassures the user
                that the app isn't frozen, just waiting on the network. */}
            <AnimatePresence>
              {slow && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"
                >
                  <FiWifiOff className="w-3.5 h-3.5" />
                  <span>Your network seems slow… still loading</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AppLoader;
