import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useStore from './store/useStore';
import { CurrencyProvider } from './contexts/CurrencyContext';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import History from './pages/History';
import FAQ from './pages/FAQ';
import Rules from './pages/Rules';
import Privacy from './pages/Privacy';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDraws from './pages/admin/AdminDraws';
import AdminSettings from './pages/admin/AdminSettings';
import AdminDeposits from './pages/admin/AdminDeposits';
import AdminWithdrawals from './pages/admin/AdminWithdrawals';
import AdminWinners from './pages/admin/AdminWinners';
import AdminPackages from './pages/admin/AdminPackages';
import AdminCurrency from './pages/admin/AdminCurrency';
import AdminOrders from './pages/admin/AdminOrders';
import AdminPayments from './pages/admin/AdminPayments';
import AdminSupport from './pages/admin/AdminSupport';
import NumberDetail from './pages/NumberDetail';
import Wallet from './pages/Wallet';
import Checkout from './pages/Checkout';
import Promote from './pages/Promote';
import Invest from './pages/Invest';
import Games from './pages/games/Games';
import CoinFlip from './pages/games/CoinFlip';
import DiceRoll from './pages/games/DiceRoll';
import LuckySpin from './pages/games/LuckySpin';
import BalloonPop from './pages/games/BalloonPop';
import DragonTower from './pages/games/DragonTower';
import IceField from './pages/games/IceField';
import ArrowRoulette from './pages/games/ArrowRoulette';
import EggHatch from './pages/games/EggHatch';
import FuseGame from './pages/games/Fuse';
import Notifications from './pages/Notifications';
import AdminInvestments from './pages/admin/AdminInvestments';
import AdminNotifications from './pages/admin/AdminNotifications';

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-800">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return !isAuthenticated ? children : <Navigate to="/" />;
}

function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-800">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-800">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" />;
  }

  if (!user?.isAdmin) {
    return <Navigate to="/" />;
  }

  return children;
}

function App() {
  const { checkAuth } = useStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <CurrencyProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111921',
            color: '#fff',
            border: '1px solid #1e2a36',
          },
          success: {
            iconTheme: {
              primary: '#00d4aa',
              secondary: '#0a0e13',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="draws" element={<AdminDraws />} />
          <Route path="winners" element={<AdminWinners />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="packages" element={<AdminPackages />} />
          <Route path="currency" element={<AdminCurrency />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="deposits" element={<AdminDeposits />} />
          <Route path="withdrawals" element={<AdminWithdrawals />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="investments" element={<AdminInvestments />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* Main App Routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="number/:number" element={<NumberDetail />} />
          <Route path="wallet" element={<PrivateRoute><Wallet /></PrivateRoute>} />
          <Route path="checkout" element={<PrivateRoute><Checkout /></PrivateRoute>} />
          <Route path="profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="promote" element={<PrivateRoute><Promote /></PrivateRoute>} />
          <Route path="invest" element={<PrivateRoute><Invest /></PrivateRoute>} />
          <Route path="notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
          <Route path="games" element={<Games />} />
          <Route path="games/coin-flip" element={<PrivateRoute><CoinFlip /></PrivateRoute>} />
          <Route path="games/dice-roll" element={<PrivateRoute><DiceRoll /></PrivateRoute>} />
          <Route path="games/lucky-spin" element={<PrivateRoute><LuckySpin /></PrivateRoute>} />
          <Route path="games/balloon-pop" element={<PrivateRoute><BalloonPop /></PrivateRoute>} />
          <Route path="games/dragon-tower" element={<PrivateRoute><DragonTower /></PrivateRoute>} />
          <Route path="games/ice-field" element={<PrivateRoute><IceField /></PrivateRoute>} />
          <Route path="games/arrow-roulette" element={<PrivateRoute><ArrowRoulette /></PrivateRoute>} />
          <Route path="games/egg-hatch" element={<PrivateRoute><EggHatch /></PrivateRoute>} />
          <Route path="games/fuse" element={<PrivateRoute><FuseGame /></PrivateRoute>} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="history" element={<History />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="rules" element={<Rules />} />
          <Route path="privacy" element={<Privacy />} />
        </Route>
      </Routes>
    </CurrencyProvider>
  );
}

export default App;
