import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiLock, FiDownload, FiAlertOctagon } from 'react-icons/fi';
import useStore from '../store/useStore';

// Fullscreen overlay shown when the current user has `is_frozen = 1`.
// The user can't interact with the rest of the app until either:
//   - an admin manually unfreezes them, or
//   - an admin approves any deposit (auto-unfreezes via backend).
//
// We hide the overlay on `/wallet` so the user can actually make a deposit
// from inside the freeze, plus on `/login` / `/register` (defensive — auth
// pages render before user state lands).

const ALLOW_PATHS = ['/wallet', '/checkout', '/login', '/register', '/admin'];

function FreezeOverlay() {
  const user = useStore((s) => s.user);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const frozen = isAuthenticated && user && user.isFrozen;

  // Let user reach wallet / checkout to clear the freeze with a deposit,
  // and never block admin routes.
  const onAllowedPath = ALLOW_PATHS.some((p) => pathname.startsWith(p));
  const show = frozen && !onAllowedPath;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9000] flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-dark-900/95 backdrop-blur-md" />

          {/* Ambient red glow */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.4, opacity: 0.45 }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            className="absolute w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(closest-side, rgba(239,68,68,0.35), transparent 70%)' }}
          />

          {/* Content */}
          <motion.div
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220 }}
            className="relative w-full max-w-md bg-gradient-to-b from-dark-800 to-dark-900 border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header strip */}
            <div className="relative px-6 pt-8 pb-6 text-center bg-gradient-to-b from-red-500/15 to-transparent">
              <motion.div
                animate={{ rotate: [0, -6, 6, -6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.5 }}
                className="inline-flex w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/40 items-center justify-center shadow-lg shadow-red-500/20 mb-3"
              >
                <FiLock className="w-8 h-8 text-red-400" />
              </motion.div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Account Frozen
              </h2>
              <p className="text-xs uppercase tracking-[0.25em] text-red-300/80 mt-1">
                Restricted Access
              </p>
            </div>

            {/* Note */}
            <div className="px-6 pb-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/25">
                <FiAlertOctagon className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-red-300 font-bold mb-1">
                    Note from admin
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                    {user?.freezeNote || 'Your account has been frozen by an administrator.'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed">
                Make a deposit to instantly unfreeze your account.
                Once your deposit is approved, all features are restored.
              </p>
            </div>

            {/* CTA */}
            <div className="px-6 pb-6">
              <button
                onClick={() => navigate('/wallet?tab=buy')}
                className="group relative w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-dark-900 text-base
                           bg-gradient-to-r from-accent to-emerald-400
                           shadow-lg shadow-accent/40 hover:shadow-accent/60
                           transition-all hover:scale-[1.02] active:scale-[0.99]"
              >
                <FiDownload className="w-5 h-5" />
                Deposit Now
              </button>
              <p className="text-[10px] text-gray-500 text-center mt-3">
                Contact support if you believe this is a mistake.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default FreezeOverlay;
