import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token = null) {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Subscribe to draw updates
  onDrawStatus(callback) {
    if (!this.socket) return;
    this.socket.on('draw:status', callback);
    return () => this.socket.off('draw:status', callback);
  }

  // Subscribe to draw reveals
  onDrawReveal(callback) {
    if (!this.socket) return;
    this.socket.on('draw:reveal', callback);
    return () => this.socket.off('draw:reveal', callback);
  }

  // Subscribe to new draw events
  onNewDraw(callback) {
    if (!this.socket) return;
    this.socket.on('draw:new', callback);
    return () => this.socket.off('draw:new', callback);
  }

  // Subscribe to digit revealed events (admin manual reveal)
  onDigitRevealed(callback) {
    if (!this.socket) return;
    this.socket.on('draw:digit-revealed', callback);
    return () => this.socket.off('draw:digit-revealed', callback);
  }

  // Subscribe to draw complete events
  onDrawComplete(callback) {
    if (!this.socket) return;
    this.socket.on('draw:complete', callback);
    return () => this.socket.off('draw:complete', callback);
  }

  // Subscribe to prize won notifications
  onPrizeWon(callback) {
    if (!this.socket) return;
    this.socket.on('prize:won', callback);
    return () => this.socket.off('prize:won', callback);
  }

  // Subscribe to number vote updates
  onNumberVote(callback) {
    if (!this.socket) return;
    this.socket.on('number:vote', callback);
    return () => this.socket.off('number:vote', callback);
  }

  // Subscribe to specific number updates
  subscribeToNumber(number) {
    if (!this.socket) return;
    this.socket.emit('number:subscribe', number);
  }

  unsubscribeFromNumber(number) {
    if (!this.socket) return;
    this.socket.emit('number:unsubscribe', number);
  }

  // Subscribe to offer notifications
  onNewOffer(callback) {
    if (!this.socket) return;
    this.socket.on('offer:new', callback);
    return () => this.socket.off('offer:new', callback);
  }

  onOfferAccepted(callback) {
    if (!this.socket) return;
    this.socket.on('offer:accepted', callback);
    return () => this.socket.off('offer:accepted', callback);
  }

  onOfferRejected(callback) {
    if (!this.socket) return;
    this.socket.on('offer:rejected', callback);
    return () => this.socket.off('offer:rejected', callback);
  }

  // Subscribe to ticket matching updates
  onTicketUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('ticket:update', callback);
    return () => this.socket.off('ticket:update', callback);
  }

  // Subscribe to ticket cash-out events
  onTicketCashedOut(callback) {
    if (!this.socket) return;
    this.socket.on('ticket:cashed_out', callback);
    return () => this.socket.off('ticket:cashed_out', callback);
  }

  // Subscribe to prize pool updates
  onPrizePoolUpdated(callback) {
    if (!this.socket) return;
    this.socket.on('prizePool:updated', callback);
    return () => this.socket.off('prizePool:updated', callback);
  }

  // Subscribe to user's numbers updated (after buy/sell)
  onUserNumbersUpdated(callback) {
    if (!this.socket) return;
    this.socket.on('user:numbersUpdated', callback);
    return () => this.socket.off('user:numbersUpdated', callback);
  }

  // Subscribe to vote reward notifications
  onVoteReward(callback) {
    if (!this.socket) return;
    this.socket.on('vote:reward', callback);
    return () => this.socket.off('vote:reward', callback);
  }

  // Support chat - admin joins/leaves support room
  joinAdminSupport() {
    if (!this.socket) return;
    this.socket.emit('support:joinAdmin');
  }

  leaveAdminSupport() {
    if (!this.socket) return;
    this.socket.emit('support:leaveAdmin');
  }

  // Subscribe to support messages
  onSupportMessage(callback) {
    if (!this.socket) return;
    this.socket.on('support:newMessage', callback);
    return () => this.socket.off('support:newMessage', callback);
  }

  // Subscribe to support status changes
  onSupportStatusChanged(callback) {
    if (!this.socket) return;
    this.socket.on('support:statusChanged', callback);
    return () => this.socket.off('support:statusChanged', callback);
  }

  // Subscribe to live activity feed
  onActivityNew(callback) {
    if (!this.socket) return;
    this.socket.on('activity:new', callback);
    return () => this.socket.off('activity:new', callback);
  }

  getSocket() {
    return this.socket;
  }
}

export const socketService = new SocketService();
export default socketService;
