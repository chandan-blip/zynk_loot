import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { sounds } from '../utils/sounds';
import useStore from '../store/useStore';
import { useCurrency } from '../contexts/CurrencyContext';

// Reusable win/loss overlay for any game
// Props:
//   result: { isWin, winAmount, betAmount, multiplier, prediction, result } | null
//   show: boolean
//   onClose: () => void
//   title?: string (e.g. "Coin Flip", "Dice Roll")
//   autoCloseMs?: number (default 4000)

function GameResultOverlay({ result, show, onClose, title, autoCloseMs = 4000 }) {
  const navigate = useNavigate();
  const { user } = useStore();
  const { formatCurrency, selectedCurrency } = useCurrency();
  const isWin = result?.isWin;
  const isDemo = result?.isDemo;
  const isLoggedIn = !!user;

  useEffect(() => {
    if (!show || !result) return;
    isWin ? sounds.win() : sounds.lose();
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [show, result, isWin, onClose, autoCloseMs]);

  return (
    <AnimatePresence>
      {show && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Glow effect */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.4 }}
            transition={{ duration: 0.5 }}
            className={`absolute w-[400px] h-[400px] rounded-full blur-[100px] ${
              isWin ? 'bg-accent' : 'bg-red-500'
            }`}
          />

          {/* Floating particles */}
          {isWin && [...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 0, x: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                y: [0, -200 - Math.random() * 150],
                x: [(Math.random() - 0.5) * 300],
                scale: [0, 1, 0.5],
                rotate: [0, Math.random() * 360],
              }}
              transition={{ duration: 1.5 + Math.random(), delay: 0.2 + Math.random() * 0.3 }}
              className="absolute text-accent text-2xl"
            >
              {[selectedCurrency?.symbol || '$', '+', '*'][i % 3]}
            </motion.div>
          ))}

          {/* Main content */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="relative text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button onClick={onClose} className="absolute -top-12 right-0 text-gray-400 hover:text-white transition-colors">
              <FiX className="w-6 h-6" />
            </button>

            {/* Result circle */}
            <motion.div
              initial={{ rotateY: 0 }}
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center border-4 mb-6 px-3 py-3 overflow-hidden ${
                isWin
                  ? 'bg-gradient-to-br from-accent/40 to-green-500/40 border-accent/60 shadow-[0_0_60px_rgba(0,212,170,0.4)]'
                  : 'bg-gradient-to-br from-red-500/40 to-red-700/40 border-red-500/60 shadow-[0_0_60px_rgba(239,68,68,0.4)]'
              }`}
            >
              {(() => {
                const str = String(result.result ?? '').trim();
                const len = str.length;
                // Length-aware sizing so a single digit renders huge while a
                // multi-segment result (e.g. "A♠ K♥ Q♦ J♣") shrinks and wraps.
                const fontSize =
                  len <= 2  ? 40 :
                  len <= 5  ? 30 :
                  len <= 8  ? 24 :
                  len <= 12 ? 20 :
                  len <= 18 ? 17 :
                              14;
                return (
                  <span
                    className={`uppercase font-black text-center w-full ${isWin ? 'text-accent' : 'text-red-400'}`}
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: 1.05,
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {str}
                  </span>
                );
              })()}
            </motion.div>

            {/* Win/Loss text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <p className={`text-4xl font-black mb-2 ${isWin ? 'text-accent' : 'text-red-400'}`}>
                {isWin ? 'YOU WIN!' : 'YOU LOSE'}
              </p>

              <motion.p
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                className={`text-5xl font-black mb-3 ${isWin ? 'text-white' : 'text-red-300'}`}
              >
                {isWin ? `+${formatCurrency(result.winAmount)}` : `-${formatCurrency(result.betAmount)}`}
              </motion.p>

              {isWin && result.multiplier && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-gray-400 text-sm"
                >
                  Multiplier: <span className="text-accent font-bold">{result.multiplier}x</span>
                </motion.p>
              )}

              {result.prediction && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="text-gray-500 text-xs mt-3"
                >
                  You picked <span className="capitalize text-gray-300">{result.prediction}</span> — {title || 'result'} was <span className="capitalize text-gray-300">{result.result}</span>
                </motion.p>
              )}

              {isDemo && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                  className="mt-5 space-y-2"
                >
                  <p className="text-yellow-400/80 text-xs font-medium">This was a free demo play</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); navigate('/wallet'); }}
                    className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent/90 text-dark-900 font-bold text-sm transition-colors"
                  >
                    Deposit to Play for Real
                  </button>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GameResultOverlay;
