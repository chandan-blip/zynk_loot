import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (username, email, password, referralCode) =>
  api.post('/auth/register', { username, email, password, referral_code: referralCode });
export const getMe = () => api.get('/auth/me');

// Lottery
export const getCurrentDraw = () => api.get('/lottery/draw');
export const getUpcomingSession = () => api.get('/lottery/upcoming-session');
export const getNumbers = ({ limit = 20, offset = 0, search = '' } = {}) =>
  api.get(`/lottery/numbers?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`);
export const getNumberDetails = (number) => api.get(`/lottery/numbers/${number}`);
export const buyNumber = (number) => api.post(`/lottery/numbers/${number}/buy`);
export const voteForNumber = (number) => api.post(`/lottery/numbers/${number}/vote`, { action: 'vote' });
export const unvoteForNumber = (number) => api.post(`/lottery/numbers/${number}/vote`, { action: 'unvote' });
export const createOffer = (number, amount) => api.post(`/lottery/numbers/${number}/offer`, { amount });
export const getNumberOffers = (number) => api.get(`/lottery/numbers/${number}/offers`);
export const getMyNumbers = () => api.get('/lottery/my-numbers');
export const getMyVotes = () => api.get('/lottery/my-votes');
export const getOffers = () => api.get('/lottery/offers');
export const respondToOffer = (offerId, accept) => api.post(`/lottery/offers/${offerId}/respond`, { accept });
export const getDrawHistory = (limit = 30) => api.get(`/lottery/history?limit=${limit}`);
export const getPrizePool = () => api.get('/lottery/prize-pool');
export const getRecentWinners = (limit = 10) => api.get(`/lottery/winners?limit=${limit}`);

// Tickets (matching system)
export const getTicketDetails = (ticketId) => api.get(`/lottery/tickets/${ticketId}`);
export const cashOutTicket = (ticketId) => api.post(`/lottery/tickets/${ticketId}/cashout`);

// Wallet
export const getWalletBalance = () => api.get('/wallet/balance');
export const getTransactions = (page = 1) => api.get(`/wallet/transactions?page=${page}`);
export const deposit = (amount) => api.post('/wallet/deposit', { amount });
export const withdraw = (amount) => api.post('/wallet/withdraw', { amount });

// Payment Methods
export const getPaymentMethods = () => api.get('/wallet/payment-methods');
export const addUpiMethod = (upi_id, label) => api.post('/wallet/payment-methods/upi', { upi_id, label });
export const addCryptoMethod = (wallet_address, wallet_type, label) =>
  api.post('/wallet/payment-methods/crypto', { wallet_address, wallet_type, label });
export const addBankMethod = (data) => api.post('/wallet/payment-methods/bank', data);
export const setPrimaryPaymentMethod = (id) => api.put(`/wallet/payment-methods/${id}/primary`);
export const deletePaymentMethod = (id) => api.delete(`/wallet/payment-methods/${id}`);

// Zynk Packages & Checkout
export const getZynkPackages = () => api.get('/wallet/packages');
export const getPaymentSettings = () => api.get('/wallet/payment-settings');
export const checkout = (package_id, payment_method, payment_account_id, payment_reference, payment_note) => {
  const payload = { package_id, payment_method };
  if (payment_account_id) payload.payment_account_id = payment_account_id;
  if (payment_reference) payload.payment_reference = payment_reference;
  if (payment_note) payload.payment_note = payment_note;
  return api.post('/wallet/checkout', payload);
};
export const getUserOrders = (page = 1) => api.get(`/wallet/orders?page=${page}`);
export const cancelOrder = (orderId) => api.post(`/wallet/orders/${orderId}/cancel`);
// Legacy
export const buyZynkPackage = (package_id) => api.post('/wallet/buy-zynk', { package_id });
export const completePurchase = (orderId) => api.post(`/wallet/complete-purchase/${orderId}`);

// Exchange Rates (user-facing)
export const getUserExchangeRates = () => api.get('/wallet/exchange-rates');

// Withdrawals
export const getWithdrawals = (page = 1) => api.get(`/wallet/withdrawals?page=${page}`);
export const requestWithdrawal = (amount, payment_method_id) =>
  api.post('/wallet/withdraw-request', { amount, payment_method_id });

// Referral / Promote
export const generateReferralCode = () => api.post('/referral/generate-code');
export const getReferralStats = () => api.get('/referral/stats');
export const getReferralList = () => api.get('/referral/list');

// Investments
export const getInvestmentTiers = () => api.get('/invest/tiers');
export const getPlatformGrowth = (days = 30) => api.get(`/invest/platform-growth?days=${days}`);
export const createInvestment = (amount, tierId) => api.post('/invest', { amount, tierId });
export const withdrawInvestment = (id) => api.post(`/invest/${id}/withdraw`);
export const getInvestmentPortfolio = () => api.get('/invest/portfolio');
export const getInvestmentStats = () => api.get('/invest/stats');
export const getInvestmentReturns = (page = 1, limit = 20) =>
  api.get(`/invest/returns?page=${page}&limit=${limit}`);

// Admin Investments
export const getAdminInvestmentStats = () => api.get('/admin/investment-stats');
export const getAdminInvestments = (page = 1, limit = 20, filters = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (filters.status) params.append('status', filters.status);
  if (filters.tier_id) params.append('tier_id', filters.tier_id);
  if (filters.username) params.append('username', filters.username);
  return api.get(`/admin/investments?${params}`);
};
export const getAdminPlatformMetrics = (days = 90) => api.get(`/admin/platform-metrics?days=${days}`);
export const updateInvestmentSettings = (settings) => api.put('/admin/investment-settings', { settings });
export const getAdminInvestmentTiers = () => api.get('/admin/investment-tiers');
export const updateInvestmentTier = (id, data) => api.put(`/admin/investment-tiers/${id}`, data);
export const createInvestmentTier = (data) => api.post('/admin/investment-tiers', data);

// User Profile
export const getUserProfile = () => api.get('/users/me/profile');

// User Transfers (P2P)
export const searchUsers = (query) => api.get(`/users/search?q=${encodeURIComponent(query)}`);
export const transferZynk = (recipientId, amount, note = '') =>
  api.post('/wallet/transfer', { recipient_id: recipientId, amount, note });
export const getTransferHistory = (page = 1, type = '') =>
  api.get(`/wallet/transfers?page=${page}${type ? `&type=${type}` : ''}`);

// Admin
export const getAdminDashboard = () => api.get('/admin/dashboard');
export const getAdminUsers = (page = 1, limit = 20) => api.get(`/admin/users?page=${page}&limit=${limit}`);
export const addUserBalance = (userId, amount) => api.post(`/admin/users/${userId}/balance`, { amount });
export const getAdminDraws = (page = 1, limit = 20) => api.get(`/admin/draws?page=${page}&limit=${limit}`);
export const getCurrentAdminDraw = () => api.get('/admin/draws/current');
export const triggerNewDraw = () => api.post('/admin/draws/trigger-new');
export const triggerCompleteDraw = () => api.post('/admin/draws/trigger-complete');
export const revealNextDigit = () => api.post('/admin/draws/reveal-next');
export const setWinningNumber = (winningNumber) => api.post('/admin/draws/set-number', { winningNumber });
export const getDrawWinners = (periodId) => api.get(`/admin/draws/${periodId}/winners`);
export const getAdminWinners = (page = 1, limit = 20) => api.get(`/admin/winners?page=${page}&limit=${limit}`);
export const getAdminNumbers = (page = 1, limit = 50) => api.get(`/admin/numbers?page=${page}&limit=${limit}`);
export const getAdminSettings = () => api.get('/admin/settings');
export const updateSetting = (key, value) => api.put(`/admin/settings/${key}`, { value });
export const getAdminTransactions = (page = 1, limit = 50, type = '') =>
  api.get(`/admin/transactions?page=${page}&limit=${limit}${type ? `&type=${type}` : ''}`);

// Admin Withdrawals
export const getAdminWithdrawals = (page = 1, status = '') =>
  api.get(`/admin/withdrawals?page=${page}${status ? `&status=${status}` : ''}`);
export const approveWithdrawal = (id, note) => api.post(`/admin/withdrawals/${id}/approve`, { note });
export const rejectWithdrawal = (id, note) => api.post(`/admin/withdrawals/${id}/reject`, { note });
export const completeWithdrawal = (id, note) => api.post(`/admin/withdrawals/${id}/complete`, { note });

// Admin Packages
export const getAdminPackages = () => api.get('/admin/packages');
export const createPackage = (data) => api.post('/admin/packages', data);
export const updatePackage = (id, data) => api.put(`/admin/packages/${id}`, data);
export const deletePackage = (id) => api.delete(`/admin/packages/${id}`);

// Exchange Rates (admin)
export const getZynkRate = () => api.get('/admin/zynk-rate');
export const updateZynkRate = (rate) => api.put('/admin/zynk-rate', { rate });
export const getExchangeRates = () => api.get('/admin/exchange-rates');
export const refreshExchangeRates = () => api.post('/admin/exchange-rates/refresh');
export const convertZynk = (amount, currency) => api.get(`/admin/convert?amount=${amount}&to=${currency}`);

// Admin Orders
export const getAdminOrders = (page = 1, status = '') =>
  api.get(`/admin/orders?page=${page}${status ? `&status=${status}` : ''}`);
export const getAdminOrderDetail = (id) => api.get(`/admin/orders/${id}`);
export const approveOrder = (id, note) => api.post(`/admin/orders/${id}/approve`, { note });
export const rejectOrder = (id, note) => api.post(`/admin/orders/${id}/reject`, { note });
export const getAdminPaymentSettings = () => api.get('/admin/payment-settings');
export const updateAdminPaymentSettings = (settings) => api.put('/admin/payment-settings', settings);

// Admin Payment Accounts
export const getAdminPaymentAccounts = () => api.get('/admin/payment-accounts');
export const getAdminPaymentAccount = (id) => api.get(`/admin/payment-accounts/${id}`);
export const createPaymentAccount = (data) => api.post('/admin/payment-accounts', data);
export const updatePaymentAccount = (id, data) => api.put(`/admin/payment-accounts/${id}`, data);
export const deletePaymentAccount = (id) => api.delete(`/admin/payment-accounts/${id}`);
export const togglePaymentAccount = (id) => api.post(`/admin/payment-accounts/${id}/toggle`);
export const resetDailyUsage = () => api.post('/admin/payment-accounts/reset-daily');

// Support Chat - User
export const getSupportConversation = () => api.get('/support/conversation');
export const sendSupportMessage = (message) => api.post('/support/message', { message });
export const markSupportRead = () => api.post('/support/read');
export const getSupportUnread = () => api.get('/support/unread');

// Support Chat - Admin
export const getAdminConversations = (status = '', limit = 50, offset = 0) =>
  api.get(`/support/admin/conversations?limit=${limit}&offset=${offset}${status ? `&status=${status}` : ''}`);
export const getAdminConversationMessages = (id, limit = 50, offset = 0) =>
  api.get(`/support/admin/conversations/${id}/messages?limit=${limit}&offset=${offset}`);
export const sendAdminSupportMessage = (conversationId, message) =>
  api.post(`/support/admin/conversations/${conversationId}/message`, { message });
export const markAdminSupportRead = (conversationId) =>
  api.post(`/support/admin/conversations/${conversationId}/read`);
export const updateConversationStatus = (conversationId, status) =>
  api.put(`/support/admin/conversations/${conversationId}/status`, { status });
export const getAdminSupportUnread = () => api.get('/support/admin/unread');

// Activity Config
export const refreshActivityConfig = () => api.post('/admin/activity-config/refresh');

export default api;
