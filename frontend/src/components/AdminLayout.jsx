import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHome, FiUsers, FiSettings, FiLogOut, FiArrowLeft, FiMenu, FiX, FiDownload, FiUpload, FiAward, FiPackage, FiDollarSign, FiShoppingCart, FiCreditCard, FiMessageCircle, FiTrendingUp, FiBell, FiActivity } from 'react-icons/fi';
import { GiTwoCoins, GiTrophy } from 'react-icons/gi';
import useStore from '../store/useStore';
import { getAdminSupportUnread } from '../services/api';
import socketService from '../services/socket';

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: FiHome },
  { path: '/admin/draws', label: 'Draws', icon: GiTrophy },
  { path: '/admin/winners', label: 'Winners', icon: FiAward },
  { path: '/admin/users', label: 'Users', icon: FiUsers },
  { path: '/admin/packages', label: 'Packages', icon: FiPackage },
  { path: '/admin/orders', label: 'Orders', icon: FiShoppingCart },
  { path: '/admin/payments', label: 'Payments', icon: FiCreditCard },
  { path: '/admin/currency', label: 'Currency', icon: FiDollarSign },
  { path: '/admin/deposits', label: 'Deposits', icon: FiDownload },
  { path: '/admin/withdrawals', label: 'Withdrawals', icon: FiUpload },
  { path: '/admin/support', label: 'Support', icon: FiMessageCircle, badge: true },
  { path: '/admin/investments', label: 'Investments', icon: FiTrendingUp },
  { path: '/admin/notifications', label: 'Notifications', icon: FiBell },
  { path: '/admin/analytics', label: 'Analytics', icon: FiActivity },
  { path: '/admin/settings', label: 'Settings', icon: FiSettings },
];

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
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
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
      <main className="flex-1 lg:ml-60">
        {/* Top Bar */}
        <header className="h-16 bg-dark-800 border-b border-dark-400 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu className="w-6 h-6" />
            </button>
            <h2 className="font-semibold text-white">
              {navItems.find(item => item.path === location.pathname)?.label || 'Admin'}
            </h2>
          </div>
          <div className="text-sm text-gray-500 hidden sm:block">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AdminLayout;
