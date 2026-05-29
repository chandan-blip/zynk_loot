import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHome, FiUsers, FiSettings, FiLogOut, FiArrowLeft, FiMenu, FiX, FiDownload, FiUpload, FiAward, FiPackage, FiDollarSign, FiShoppingCart, FiCreditCard, FiMessageCircle, FiTrendingUp, FiBell, FiActivity, FiSend, FiSmartphone, FiShare2, FiGlobe, FiImage, FiInbox, FiList, FiCrosshair, FiShield, FiGrid } from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import useStore from '../store/useStore';
import { getAdminSupportUnread } from '../services/api';
import { hasModule } from '../utils/adminAccess';
import socketService from '../services/socket';

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: FiHome, module: 'dashboard' },
  { path: '/admin/draws', label: 'Draws', icon: GiTrophy, module: 'draws' },
  { path: '/admin/winners', label: 'Winners', icon: FiAward, module: 'winners' },
  { path: '/admin/daily-winners', label: 'Daily Winners', icon: FiSend, module: 'daily-winners' },
  { path: '/admin/payment-templates', label: 'Payment Templates', icon: FiSmartphone, module: 'payment-templates' },
  { path: '/admin/custom-prediction', label: 'Custom Prediction', icon: FiCrosshair, module: 'custom-prediction' },
  { path: '/admin/smm-queue', label: 'SMM Queue', icon: FiList, module: 'smm-queue' },
  { path: '/admin/users', label: 'Users', icon: FiUsers, module: 'users' },
  { path: '/admin/packages', label: 'Packages', icon: FiPackage, module: 'packages' },
  { path: '/admin/orders', label: 'Orders', icon: FiShoppingCart, module: 'orders' },
  { path: '/admin/payments', label: 'Payments', icon: FiCreditCard, module: 'payments' },
  { path: '/admin/deposits', label: 'Deposits', icon: FiDownload, module: 'deposits' },
  { path: '/admin/withdrawals', label: 'Withdrawals', icon: FiUpload, module: 'withdrawals' },
  { path: '/admin/support', label: 'Support', icon: FiMessageCircle, badge: true, module: 'support' },
  { path: '/admin/investments', label: 'Investments', icon: FiTrendingUp, module: 'investments' },
  { path: '/admin/notifications', label: 'Notifications', icon: FiBell, module: 'notifications' },
  { path: '/admin/analytics', label: 'Analytics', icon: FiActivity, module: 'analytics' },
  { path: '/admin/social-links', label: 'Social Links', icon: FiShare2, module: 'social-links' },
  { path: '/admin/banners', label: 'Banners', icon: FiImage, module: 'banners' },
  { path: '/admin/third-party', label: 'Third Party Games', icon: FiGrid, module: 'third-party' },
  { path: '/admin/websites', label: 'Websites', icon: FiGlobe, module: 'websites' },
  { path: '/admin/website-leads', label: 'Website Leads', icon: FiInbox, module: 'website-leads' },
  { path: '/admin/settings', label: 'Settings', icon: FiSettings, module: 'settings' },
  { path: '/admin/roles', label: 'Roles & Access', icon: FiShield, module: 'roles' },
];

// Which module governs a given pathname — longest matching nav path wins, so
// '/admin/users/5' resolves to 'users' and bare '/admin' to 'dashboard'.
function moduleForPathname(pathname) {
  const match = [...navItems]
    .sort((a, b) => b.path.length - a.path.length)
    .find((i) => pathname === i.path || pathname.startsWith(i.path + '/'));
  return match ? match.module : null;
}

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const { user, logout } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Load initial unread count
    const loadUnread = async () => {
      try {
        const response = await getAdminSupportUnread();
        if (response.data.success) {
          setSupportUnread(response.data.data.count || 0);
        }
      } catch (error) {
        console.error('Failed to load support unread count:', error);
      }
    };

    loadUnread();

    // Subscribe to new messages to update badge
    const unsubMessage = socketService.onSupportMessage(() => {
      // Only increment if not on support page
      if (!location.pathname.includes('/admin/support')) {
        setSupportUnread(prev => prev + 1);
      }
    });

    return () => {
      unsubMessage?.();
    };
  }, [location.pathname]);

  // Reset unread when visiting support page
  useEffect(() => {
    if (location.pathname === '/admin/support') {
      setSupportUnread(0);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex bg-dark-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-60 sidebar fixed left-0 top-0 h-full flex flex-col z-50 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="p-5 border-b border-dark-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <GiTwoCoins className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">LOOT</span>
              <p className="text-xs text-gray-500">Admin Panel</p>
            </div>
          </div>
          <button
            className="lg:hidden p-2 text-gray-400 hover:text-white"
            onClick={closeSidebar}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.filter((item) => hasModule(user, item.module)).map((item) => {
            const isActive = location.pathname === item.path;
            const badgeCount = item.badge && item.path === '/admin/support' ? supportUnread : 0;
            return (
              <Link key={item.path} to={item.path} onClick={closeSidebar}>
                <motion.div
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent border-l-2 border-accent'
                      : 'text-gray-400 hover:text-white hover:bg-dark-600'
                  }`}
                  whileHover={{ x: 2 }}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {badgeCount > 0 && (
                    <span className="px-2 py-0.5 bg-accent text-dark-900 text-xs font-bold rounded-full min-w-[20px] text-center">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-dark-400">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center font-bold text-white">
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <p className="font-medium text-white text-sm">{user?.username}</p>
              <p className="text-xs text-gray-500">Administrator</p>
            </div>
          </div>

          <div className="space-y-1">
            <Link to="/" onClick={closeSidebar}>
              <motion.div
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-all text-sm"
                whileHover={{ x: 2 }}
              >
                <FiArrowLeft className="w-4 h-4" />
                <span>Back to Site</span>
              </motion.div>
            </Link>
            <motion.button
              onClick={() => { handleLogout(); closeSidebar(); }}
              className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-all text-sm"
              whileHover={{ x: 2 }}
            >
              <FiLogOut className="w-4 h-4" />
              <span>Logout</span>
            </motion.button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      {/* `min-w-0 overflow-x-clip` fixes the flexbox-with-wide-content gotcha
         (tables/long URLs forcing <main> wider than the viewport) WITHOUT
         creating a scroll context — `overflow-x-hidden` would, and that
         breaks position:sticky on the header below. `clip` clips overflow
         without becoming a scrolling ancestor, so the sticky topbar still
         anchors to the viewport. */}
      <main className="flex-1 min-w-0 overflow-x-clip lg:ml-60">
        {/* Top Bar */}
        <header className="min-h-16 pt-safe bg-dark-800 border-b border-dark-400 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="lg:hidden p-2 text-gray-400 hover:text-white shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu className="w-6 h-6" />
            </button>
            <h2 className="font-semibold text-white truncate">
              {navItems.find(item => item.path === location.pathname)?.label || 'Admin'}
            </h2>
          </div>
          <div className="text-sm text-gray-500 hidden sm:block shrink-0">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6 min-w-0">
          {(() => {
            const currentModule = moduleForPathname(location.pathname);
            // Guard deep links: if the active route maps to a module the user
            // lacks, send them to their first allowed module (or show a notice
            // if they somehow have none).
            if (currentModule && !hasModule(user, currentModule)) {
              const firstAllowed = navItems.find((item) => hasModule(user, item.module));
              if (firstAllowed) return <Navigate to={firstAllowed.path} replace />;
              return (
                <div className="max-w-md mx-auto mt-16 text-center">
                  <FiShield className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-white">No module access</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Your role has no admin modules assigned. Ask a Super Admin to grant access.
                  </p>
                </div>
              );
            }
            return <Outlet />;
          })()}
        </div>
      </main>
    </div>
  );
}

export default AdminLayout;
