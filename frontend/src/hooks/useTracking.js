import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useStore from '../store/useStore';
import trackingClient from '../services/tracking';

export default function useTracking() {
  const location = useLocation();
  const { user, isAuthenticated } = useStore();

  const isAdmin = user?.isAdmin;

  // Initialize on mount, cleanup on unmount — skip for admins
  useEffect(() => {
    if (isAdmin) return;
    trackingClient.init(user?.id || null);
    return () => trackingClient.destroy();
  }, [isAdmin]);

  // Track route changes — skip for admins
  useEffect(() => {
    if (isAdmin) return;
    trackingClient.trackPageView(location.pathname);
  }, [location.pathname, isAdmin]);

  // Update user association on login/logout — skip for admins
  useEffect(() => {
    if (isAdmin) return;
    if (isAuthenticated && user?.id) {
      trackingClient.setUser(user.id);
    } else {
      trackingClient.clearUser();
    }
  }, [isAuthenticated, user?.id, isAdmin]);
}
