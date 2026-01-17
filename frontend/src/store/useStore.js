import { create } from 'zustand';
import { getMe } from '../services/api';

const useStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  login: (token, user) => {
    localStorage.setItem('token', token);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const response = await getMe();
      set({ user: response.data.data, isAuthenticated: true, isLoading: false });
    } catch (error) {
      // Only logout on auth errors (401/403), not server errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        // Keep user logged in but set loading to false on other errors
        set({ isLoading: false });
      }
    }
  },

  updateBalance: (newBalance) => set((state) => ({
    user: state.user ? { ...state.user, balance: newBalance } : null
  })),
}));

export default useStore;
