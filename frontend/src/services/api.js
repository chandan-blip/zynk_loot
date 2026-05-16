import axios from 'axios';
import { inc as loadInc, dec as loadDec } from '../utils/loadingTracker';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token + bump the global in-flight counter. The counter is read by
// RouteLoader so the branded overlay stays up while pages fetch data.
// Set `config.silent = true` on background polling calls (e.g. unread
// counts, heartbeat) to skip the counter and avoid keeping the overlay
// permanently visible.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!config.silent) loadInc();
  return config;
});

// Decrement on both success and error so failures don't pin the overlay.
api.interceptors.response.use(
  (response) => {
    if (!response.config?.silent) loadDec();
    return response;
  },
  (error) => {
    if (!error.config?.silent) loadDec();
    const isAuthRoute = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && localStorage.getItem('token') && !isAuthRoute) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = ({ email, phone, password }) => api.post('/auth/login', { email, phone, password });
export const register = ({ username, email, phone, password, referralCode }) =>
  api.post('/auth/register', { username, email, phone, password, referral_code: referralCode });
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
export const getDrawHistory = (page = 1, limit = 10) => api.get(`/lottery/history?page=${page}&limit=${limit}`);
export const getPrizePool = () => api.get('/lottery/prize-pool');
export const getRecentWinners = (limit = 10, page = 1) =>
  api.get(`/lottery/winners?limit=${limit}&page=${page}`);

// Tickets (matching system)
export const getTicketDetails = (ticketId) => api.get(`/lottery/tickets/${ticketId}`);
export const cashOutTicket = (ticketId) => api.post(`/lottery/tickets/${ticketId}/cashout`);
export const scheduleTicketCashout = (ticketId, matchedDigits) => api.post(`/lottery/tickets/${ticketId}/schedule-cashout`, { matchedDigits });

// Wallet
export const getWalletBalance = () => api.get('/wallet/balance');
export const getTransactions = (page = 1, limit = 100) =>
  api.get(`/wallet/transactions?page=${page}&limit=${limit}`);
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
export const checkout = (package_id, payment_method, payment_account_id, payment_reference, payment_note, payment_currency, payment_amount) => {
  const payload = { package_id, payment_method };
  if (payment_account_id) payload.payment_account_id = payment_account_id;
  if (payment_reference) payload.payment_reference = payment_reference;
  if (payment_note) payload.payment_note = payment_note;
  if (payment_currency) payload.payment_currency = payment_currency;
  if (payment_amount) payload.payment_amount = payment_amount;
  return api.post('/wallet/checkout', payload);
};
export const getUserOrders = (page = 1) => api.get(`/wallet/orders?page=${page}`);
export const cancelOrder = (orderId) => api.post(`/wallet/orders/${orderId}/cancel`);
// Legacy
export const buyZynkPackage = (package_id) => api.post('/wallet/buy-zynk', { package_id });
export const completePurchase = (orderId) => api.post(`/wallet/complete-purchase/${orderId}`);

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
export const getUserActivity = (page = 1, limit = 20, type = null) => {
  const params = new URLSearchParams({ page, limit });
  if (type) params.set('type', type);
  return api.get(`/users/activity?${params.toString()}`);
};
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
export const getAdminWinners = (page = 1, limit = 20, status = '') => api.get(`/admin/winners?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`);
export const approveWinner = (id) => api.post(`/admin/winners/${id}/approve`);
export const rejectWinner = (id) => api.post(`/admin/winners/${id}/reject`);
export const approveAllDrawWinners = (periodId) => api.post(`/admin/draws/${periodId}/approve-all`);

// Admin Daily Winners (synthetic display winners + Telegram broadcast)
export const getAdminDailyWinners = (limit = 20) => api.get(`/admin/daily-winners?limit=${limit}`);
export const getAdminDailyWinnersByDraw = (drawId) => api.get(`/admin/daily-winners/${drawId}`);
export const triggerDailyWinners = ({ minCount, maxCount } = {}) =>
  api.post('/admin/daily-winners/trigger', {
    ...(minCount != null ? { minCount } : {}),
    ...(maxCount != null ? { maxCount } : {}),
  });
export const getDailyWinnersTemplate = () => api.get('/admin/daily-winners/template');
export const saveDailyWinnersTemplate = (template) =>
  api.put('/admin/daily-winners/template', { template });
export const previewDailyWinnersTemplate = (template) =>
  api.post('/admin/daily-winners/template/preview', { template });

// Payment screenshot templates (file-based HTML, edited in code, previewed in admin)
export const listPaymentTemplates = () => api.get('/admin/daily-winners/payment-templates');
export const previewPaymentTemplate = (platform, sampleOverride) =>
  api.post(`/admin/daily-winners/payment-templates/${platform}/preview`, { sampleOverride });
export const previewPaymentTemplatePng = (platform, sampleOverride) =>
  api.post(`/admin/daily-winners/payment-templates/${platform}/preview-png`, { sampleOverride });
export const getPaymentDetails = () => api.get('/admin/daily-winners/payment-details');
export const savePaymentDetails = (config) =>
  api.put('/admin/daily-winners/payment-details', { config });
export const getSmmPanel = () => api.get('/admin/daily-winners/smm-panel');
export const saveSmmPanel = (config) =>
  api.put('/admin/daily-winners/smm-panel', { config });
export const testTelegramMessage = (text, placeSmmOrders = true) =>
  api.post('/admin/daily-winners/test-telegram', { text, placeSmmOrders });

// Prediction admin module
export const getPredictionSchedule = () => api.get('/admin/predictions/schedule');
export const updatePredictionSchedule = (config) =>
  api.put('/admin/predictions/schedule', { config });
export const testPredictionSlot = (slotIndex) =>
  api.post(`/admin/predictions/schedule/test/${slotIndex}`);
export const getPredictionSmmMaster = () => api.get('/admin/predictions/smm-master');
export const setPredictionSmmMaster = (enabled) =>
  api.put('/admin/predictions/smm-master', { enabled });
export const getPredictionLog = (game = null, cardCountType = null, limit = 50) => {
  const params = new URLSearchParams();
  if (game) params.set('game', game);
  if (cardCountType) params.set('type', String(cardCountType));
  params.set('limit', String(limit));
  return api.get(`/admin/predictions/log?${params.toString()}`);
};
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

// Games
export const playCoinFlip = (amount, prediction) => api.post('/games/coin-flip', { amount, prediction });
export const playDiceRoll = (amount, prediction) => api.post('/games/dice-roll', { amount, prediction });
export const playLuckySpin = (amount) => api.post('/games/lucky-spin', { amount });
export const playBalloonPop = (amount, cashoutMultiplier) => api.post('/games/balloon-pop', { amount, cashoutMultiplier });
export const playDragonTower = (amount, targetFloors) => api.post('/games/dragon-tower', { amount, targetFloors });
export const playIceField = (amount, difficulty, targetRows) => api.post('/games/ice-field', { amount, difficulty, targetRows });
export const playArrowRoulette = (amount) => api.post('/games/arrow-roulette', { amount });
export const playEggHatch = (amount) => api.post('/games/egg-hatch', { amount });
export const playFuse = (amount, cashoutMultiplier) => api.post('/games/fuse', { amount, cashoutMultiplier });
// Mutka King (round-based 60s server-authoritative, 4 parallel types 1c..4c)
export const getMutkaKingState = () => api.get('/games/mutka-king/state');
export const placeMutkaKingBet = (bet) => api.post('/games/mutka-king/bet', bet);
export const getMutkaKingHistory = (page = 1, limit = 20, cardCountType = null) => {
  const t = cardCountType ? `&type=${cardCountType}` : '';
  return api.get(`/games/mutka-king/history?page=${page}&limit=${limit}${t}`);
};
export const getMutkaKingMyBets = (limit = 20, cardCountType = null) => {
  const t = cardCountType ? `&type=${cardCountType}` : '';
  return api.get(`/games/mutka-king/my-bets?limit=${limit}${t}`);
};
// UNO King (round-based 60s server-authoritative, 4 parallel types 1c..4c)
export const getUnoKingState = () => api.get('/games/uno-king/state');
export const placeUnoKingBet = (bet) => api.post('/games/uno-king/bet', bet);
export const getUnoKingHistory = (page = 1, limit = 20, cardCountType = null) => {
  const t = cardCountType ? `&type=${cardCountType}` : '';
  return api.get(`/games/uno-king/history?page=${page}&limit=${limit}${t}`);
};
export const getUnoKingMyBets = (limit = 20, cardCountType = null) => {
  const t = cardCountType ? `&type=${cardCountType}` : '';
  return api.get(`/games/uno-king/my-bets?limit=${limit}${t}`);
};
export const getShuffleCardState = () => api.get('/games/shuffle-card/state');
export const placeShuffleCardBet = (bet) => api.post('/games/shuffle-card/bet', bet);
export const getShuffleCardHistory = (page = 1, limit = 20, cardCountType = null) => {
  const t = cardCountType ? `&type=${cardCountType}` : '';
  return api.get(`/games/shuffle-card/history?page=${page}&limit=${limit}${t}`);
};
export const getShuffleCardMyBets = (limit = 20, cardCountType = null) => {
  const t = cardCountType ? `&type=${cardCountType}` : '';
  return api.get(`/games/shuffle-card/my-bets?limit=${limit}${t}`);
};
export const getGameHistory = (page = 1, limit = 20, game_type = '') =>
  api.get(`/games/history?page=${page}&limit=${limit}${game_type ? `&game_type=${game_type}` : ''}`);
export const getGameStats = () => api.get('/games/stats');

// Activity Config
export const refreshActivityConfig = () => api.post('/admin/activity-config/refresh');
export const getRecentActivities = () => api.get('/activities/recent');

// Notifications
export const getNotifications = (page = 1) => api.get(`/notifications?page=${page}`);
export const getUnreadCount = () => api.get('/notifications/unread-count');
export const markNotificationRead = (id) => api.post(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.post('/notifications/read-all');
export const adminCreateNotification = (data) => api.post('/notifications/admin/create', data);
export const adminGetNotifications = (page = 1) => api.get(`/notifications/admin/all?page=${page}`);

// Admin Analytics / Tracking
export const getTrackingDashboard = (days = 30) => api.get(`/admin/tracking/dashboard?days=${days}`);
export const getTrackingEvents = (page = 1, limit = 50, filters = {}) => {
  const params = new URLSearchParams({ page, limit, ...filters });
  return api.get(`/admin/tracking/events?${params}`);
};
export const getTrackingSessions = (page = 1, limit = 50) => api.get(`/admin/tracking/sessions?page=${page}&limit=${limit}`);
export const getUserTracking = (userId, page = 1) => api.get(`/admin/tracking/user/${userId}?page=${page}`);
export const getPageAnalytics = (days = 30) => api.get(`/admin/tracking/pages?days=${days}`);
export const getRealtimeStats = () => api.get('/admin/tracking/realtime');
export const getEventBreakdown = (days = 30) => api.get(`/admin/tracking/event-breakdown?days=${days}`);
export const getTopClicks = (days = 30) => api.get(`/admin/tracking/top-clicks?days=${days}`);
export const getScrollStats = (days = 30) => api.get(`/admin/tracking/scroll-stats?days=${days}`);
export const getUserTrackingSummary = (userId) => api.get(`/admin/tracking/user/${userId}/summary`);

// Social / floating links
export const getSocialLinks = () => api.get('/lottery/social-links');
export const adminGetSocialLinks = () => api.get('/admin/social-links');
export const adminCreateSocialLink = (data) => api.post('/admin/social-links', data);
export const adminUpdateSocialLink = (id, data) => api.put(`/admin/social-links/${id}`, data);
export const adminDeleteSocialLink = (id) => api.delete(`/admin/social-links/${id}`);

// Website leads (form submissions to /api/enroll)
export const adminGetWebsiteLeads = (params = {}) => {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', params.limit);
  if (params.offset != null) q.set('offset', params.offset);
  if (params.origin) q.set('origin', params.origin);
  if (params.search) q.set('search', params.search);
  const qs = q.toString();
  return api.get(`/admin/website-leads${qs ? `?${qs}` : ''}`);
};
export const adminDeleteWebsiteLead = (id) => api.delete(`/admin/website-leads/${id}`);

// Banners (home page carousel)
export const getBanners = () => api.get('/lottery/banners');
export const adminGetBanners = () => api.get('/admin/banners');
export const adminCreateBanner = (data) => api.post('/admin/banners', data);
export const adminUpdateBanner = (id, data) => api.put(`/admin/banners/${id}`, data);
export const adminDeleteBanner = (id) => api.delete(`/admin/banners/${id}`);
export const adminUploadBannerImage = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return api.post('/admin/upload/banner', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Websites (landing pages)
export const adminGetWebsites = () => api.get('/admin/websites');
export const adminGetWebsite = (id) => api.get(`/admin/websites/${id}`);
export const adminGetWebsiteStats = (id) => api.get(`/admin/websites/${id}/stats`);
export const adminGetWebsitesDashboard = (range = 'today') => api.get(`/admin/websites/dashboard?range=${encodeURIComponent(range)}`);
export const adminGetDepositsDashboard = (range = 'today') => api.get(`/admin/deposits/dashboard?range=${encodeURIComponent(range)}`);
export const adminGetUsersDashboard = (range = 'today') => api.get(`/admin/users/dashboard?range=${encodeURIComponent(range)}`);
export const adminGetSiteTrafficDashboard = (range = 'today') => api.get(`/admin/site-traffic/dashboard?range=${encodeURIComponent(range)}`);
export const adminCreateWebsite = (data) => api.post('/admin/websites', data);
export const adminUpdateWebsite = (id, data) => api.put(`/admin/websites/${id}`, data);
export const adminPublishWebsite = (id) => api.post(`/admin/websites/${id}/publish`);
export const adminUnpublishWebsite = (id) => api.post(`/admin/websites/${id}/unpublish`);
export const adminDeleteWebsite = (id) => api.delete(`/admin/websites/${id}`);

// Bonus module
export const getBonusStatus = () => api.get('/bonuses/status');
export const claimBonus = (type) => api.post('/bonuses/claim', { type });

// Admin SMM queue
export const getAdminSmmQueue = ({ page = 1, limit = 50, status = '', context = '' } = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  if (context) params.set('context', context);
  return api.get(`/admin/smm-queue?${params.toString()}`);
};
export const getAdminSmmQueueStats = () => api.get('/admin/smm-queue/stats');
export const retryAdminSmmQueueRow = (id) => api.post(`/admin/smm-queue/${id}/retry`);
export const deleteAdminSmmQueueRow = (id) => api.delete(`/admin/smm-queue/${id}`);
export const clearDoneAdminSmmQueue = () => api.post('/admin/smm-queue/clear-done');

export default api;
