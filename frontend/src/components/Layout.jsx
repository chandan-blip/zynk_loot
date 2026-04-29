import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiHome,
  FiLogOut,
  FiLogIn,
  FiMenu,
  FiX,
  FiClock,
  FiHelpCircle,
  FiFileText,
  FiShield,
  FiPlus,
  FiChevronRight,
  FiCreditCard,
  FiUser,
  FiShare2,
  FiTrendingUp,
  FiPlay,
  FiBell,
  FiMail,
  FiInfo,
  FiHeart,
  FiLock
} from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import useStore from '../store/useStore';
import { useCurrency } from '../contexts/CurrencyContext';
import { sounds } from '../utils/sounds';
import { getUnreadCount } from '../services/api';
import socketService from '../services/socket';

const navItems = [
  { path: '/', label: 'Home', icon: FiHome },
  // { path: '/wallet', label: 'Wallet', icon: FiCreditCard, authRequired: true },
  // { path: '/profile', label: 'Profile', icon: FiUser, authRequired: true },
  { path: '/invest', label: 'Invest', icon: FiTrendingUp },
  { path: '/games', label: 'Games', icon: FiPlay, special: true },
  { path: '/promote', label: 'Promote', icon: FiShare2, authRequired: true },
  // { path: '/leaderboard', label: 'Leaderboard', icon: GiTrophy },
  { path: '/history', label: 'History', icon: FiClock },
];

const footerLinks = [
  { path: '/faq', label: 'FAQ', icon: FiHelpCircle },
  { path: '/rules', label: 'Rules', icon: FiFileText },
  { path: '/privacy', label: 'Privacy', icon: FiShield },
  { path: '/terms', label: 'Terms of Service', icon: FiFileText },
  { path: '/contact', label: 'Contact Us', icon: FiMail },
  { path: '/about', label: 'About Us', icon: FiInfo },
  { path: '/responsible-gaming', label: 'Responsible Gaming', icon: FiHeart },
  { path: '/security', label: 'Security', icon: FiLock },
];

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const { user, isAuthenticated, isLoading, logout } = useStore();
  const { selectedCurrency, formatCurrency } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();

  // Connect socket globally so notifications work on every page
  useEffect(() => {
    const token = localStorage.getItem('token');
    socketService.connect(token);
  }, [isAuthenticated]);

  // Fetch unread count on auth change
  useEffect(() => {
    if (isAuthenticated) {
      getUnreadCount().then(res => setUnreadNotifs(res.data.data?.unread || 0)).catch(() => {});
    } else {
      setUnreadNotifs(0);
    }
  }, [isAuthenticated]);

  // Listen for real-time notifications — show toast + update count
  const [notifToast, setNotifToast] = useState(null);
  const notifTimerRef = useRef(null);

  useEffect(() => {
    const unsub = socketService.onNotification?.((notification) => {
      setUnreadNotifs(prev => prev + 1);
      // Show floating toast with sound
      sounds.notification();
      setNotifToast(notification);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      notifTimerRef.current = setTimeout(() => setNotifToast(null), 4000);
    });
    return () => {
      unsub?.();
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
    setSidebarOpen(false);
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen w-full bg-dark-500">
      <div className="max-w-[1400px] mx-auto bg-dark-500 min-h-screen relative">
        {/* Overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
              onClick={closeSidebar}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-80 fixed left-0 top-0 h-screen flex flex-col z-50 glass-strong"
            >
              {/* Sidebar Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3" onClick={closeSidebar}>
                  <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-accent to-accent-600 flex items-center justify-center shadow-glow-sm">
                    <GiTwoCoins className="w-6 h-6 text-dark-900" />
                  </div>
                  <div>
                    <span className="text-xl font-bold text-white">LOOT</span>
                    <span className="text-xl font-light text-gray-400 ml-1">Market</span>
                  </div>
                </Link>
                <button
                  className="p-2.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                  onClick={closeSidebar}
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* User Section */}
              {isAuthenticated && (
                <div className="p-5 border-b border-white/5">
                  <Link to="/profile" onClick={closeSidebar} className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20 border border-accent/30 flex items-center justify-center">
                      <FiUser className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{user?.username}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <FiChevronRight className="w-4 h-4 text-gray-500" />
                  </Link>

                  {/* Balance Card */}
                  <div className="relative p-4 rounded-lg bg-gradient-to-br from-dark-600 to-dark-700 border border-white/5 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                          <span className="text-accent font-bold">{selectedCurrency?.symbol || '$'}</span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Balance</p>
                          <p className="text-xl font-bold text-white">
                            {formatCurrency(user?.balance || 0, false)}
                          </p>
                        </div>
                      </div>
                      <Link to="/wallet" onClick={closeSidebar} className="btn-premium px-4 py-2 text-sm">
                        <span className="flex items-center gap-1">
                          <FiPlus className="w-4 h-4" />
                          Buy
                        </span>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <nav className="flex-1 p-5 overflow-y-auto scrollbar-hide">
                <div className="flex flex-col gap-1">
                  {navItems
                    .filter(item => !item.authRequired || isAuthenticated || (isLoading && localStorage.getItem('token')))
                    .map((item) => {
                    const isActive = location.pathname === item.path || (item.path === '/games' && location.pathname.startsWith('/games'));
                    return (
                      <Link key={item.path} to={item.path} onClick={() => { sounds.tap(); closeSidebar(); }}>
                        <motion.div
                          whileHover={{ x: 4 }}
                          whileTap={{ scale: 0.98 }}
                          className={`flex items-center justify-between px-4 py-3.5 rounded-lg transition-all relative overflow-hidden ${
                            isActive
                              ? 'bg-accent text-dark-900 shadow-glow-sm'
                              : item.special
                                ? 'bg-gradient-to-r from-purple-500/15 to-pink-500/15 text-purple-300 border border-purple-500/20 hover:from-purple-500/25 hover:to-pink-500/25'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {item.special && !isActive && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_3s_infinite] pointer-events-none" />
                          )}
                          <div className="flex items-center gap-3">
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                            {item.special && !isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/30 text-purple-200 uppercase tracking-wider">Hot</span>
                            )}
                          </div>
                          <FiChevronRight className={`w-4 h-4 ${isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-50'}`} />
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <p className="px-4 mb-3 text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Support
                  </p>
                  <div className="space-y-1">
                    {footerLinks.map((item) => (
                      <Link key={item.path} to={item.path} onClick={closeSidebar}>
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all">
                          <item.icon className="w-4 h-4" />
                          <span className="text-sm">{item.label}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </nav>

              {/* Sidebar Footer */}
              <div className="p-5 border-t border-white/5">
                {isLoading ? (
                  <div className="w-full h-12 rounded-lg bg-dark-700/60 animate-pulse" />
                ) : isAuthenticated ? (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 transition-all"
                  >
                    <FiLogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                  </button>
                ) : (
                  <Link to="/login" onClick={closeSidebar} className="block">
                    <button className="btn-premium w-full py-3">
                      <span className="flex items-center justify-center gap-2">
                        <FiLogIn className="w-5 h-5" />
                        <span>Login</span>
                      </span>
                    </button>
                  </Link>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="h-16 sticky top-0 z-30 border-b bg-dark-400 border-dark-200/5">
          <div className="h-full flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                onClick={() => setSidebarOpen(true)}
              >
                <FiMenu className="w-5 h-5" />
              </motion.button>

              <Link to="/" className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent-600 flex items-center justify-center shadow-glow-sm">
                  <GiTwoCoins className="w-5 h-5 text-dark-900" />
                </div>
                <div className="hidden sm:block">
                  <span className="text-lg font-bold text-white">LOOT</span>
                  <span className="text-lg font-light text-gray-500 ml-1">Market</span>
                </div>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {isLoading ? (
                <>
                  {/* Skeleton while auth loads */}
                  <div className="w-24 h-9 rounded-lg bg-dark-700/60 animate-pulse" />
                  <div className="w-9 h-9 rounded-lg bg-dark-700/60 animate-pulse" />
                  <div className="w-9 h-9 rounded-lg bg-dark-700/60 animate-pulse" />
                </>
              ) : isAuthenticated ? (
                <>
                  {/* Balance Display */}
                  <Link
                    to="/wallet"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700/80 border border-dark-600/50 hover:bg-dark-600/80 hover:border-accent/30 transition-all"
                  >
                    <div className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center">
                      <span className="text-accent font-bold text-xs">{selectedCurrency?.symbol || '$'}</span>
                    </div>
                    <span className="font-bold text-white text-sm">
                      {formatCurrency(user?.balance || 0, false)}
                    </span>
                  </Link>

                  {/* Notifications Bell */}
                  <Link to="/notifications" className="relative" onClick={() => sounds.tap()}>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="w-9 h-9 rounded-lg bg-dark-700/80 border border-dark-600/50 flex items-center justify-center hover:bg-dark-600/80 transition-all"
                    >
                      <FiBell className="w-[18px] h-[18px] text-gray-400" />
                      {unreadNotifs > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                          {unreadNotifs > 9 ? '9+' : unreadNotifs}
                        </span>
                      )}
                    </motion.div>
                  </Link>

                  {/* User Avatar - Links to Profile */}
                  <Link to="/profile">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20 border border-accent/30 flex items-center justify-center cursor-pointer"
                    >
                      <FiUser className="w-4 h-4 text-accent" />
                    </motion.div>
                  </Link>
                </>
              ) : (
                <Link to="/login">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="btn-premium px-5 py-2.5 text-sm"
                  >
                    <span>Login</span>
                  </motion.button>
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* Notification Toast */}
        <AnimatePresence>
          {notifToast && (
            <motion.div
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-16 left-0 right-0 mx-auto z-50 w-[calc(100%-2rem)] max-w-sm"
            >
              <div
                onClick={() => { setNotifToast(null); navigate('/notifications'); }}
                className="flex items-start gap-3 p-4 rounded-xl bg-dark-700 border border-dark-500 shadow-2xl shadow-black/40 cursor-pointer hover:border-accent/30 transition-colors"
              >
                <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                  notifToast.type === 'personal' ? 'bg-blue-500/20' :
                  notifToast.type === 'update' ? 'bg-amber-500/20' : 'bg-accent/20'
                }`}>
                  <FiBell className={`w-4 h-4 ${
                    notifToast.type === 'personal' ? 'text-blue-400' :
                    notifToast.type === 'update' ? 'text-amber-400' : 'text-accent'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{notifToast.title}</p>
                  <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{notifToast.message}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setNotifToast(null); }}
                  className="shrink-0 p-1 text-gray-600 hover:text-white"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page Content */}
        <main className="py-2 px-3 2xl:px-0 sm:px-4 sm:py-4 min-h-[calc(100vh-4rem)]">
          <Outlet />
          {!location.pathname.startsWith('/games/') && <div className="h-22"></div>}
        </main>

        {/* Mobile Bottom Navigation — hidden inside game pages */}
        <nav className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden ${location.pathname.startsWith('/games/') ? 'hidden' : ''}`}>
          <div className="max-w-[1400px] mx-auto">
            <div className="glass-strong border-t border-white/5 mx-2 mb-2 rounded-lg overflow-hidden">
              <div className="flex items-center justify-around h-16">
                {navItems
                  .filter(item => !item.authRequired || isAuthenticated || (isLoading && localStorage.getItem('token')))
                  .map((item) => {
                  const isActive = location.pathname === item.path || (item.path === '/games' && location.pathname.startsWith('/games'));
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className="relative flex-1 h-full"
                      onClick={() => sounds.tap()}
                    >
                      <motion.div
                        whileTap={{ scale: 0.95 }}
                        className={`flex flex-col items-center justify-center h-full transition-colors ${
                          isActive ? 'text-accent'
                            : item.special ? 'text-purple-400'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute top-0 transform translate-y-0 w-12 h-1 bg-accent rounded-b-full"
                          />
                        )}
                        {item.special && !isActive && (
                          <div className="absolute top-1 right-1/2 translate-x-4 w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        )}
                        <item.icon className={`w-5 h-5 ${isActive ? 'text-accent' : item.special ? 'text-purple-400' : ''}`} />
                        <span className={`text-[10px] mt-1 font-medium ${item.special && !isActive ? 'text-purple-400' : ''}`}>{item.label}</span>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default Layout;
