const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

const fs = require('fs');
const rootEnv = path.resolve(__dirname, '../../.env');
dotenv.config({ path: fs.existsSync(rootEnv) ? rootEnv : undefined });

const db = require('./config/database');
const seedAdmin = require('./utils/seedAdmin');
const seedDemo = require('./utils/seedDemo');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const lotteryRoutes = require('./routes/lottery');
const walletRoutes = require('./routes/wallet');
const usersRoutes = require('./routes/users');
const supportRoutes = require('./routes/support');
const LotteryService = require('./services/lotteryService');
const CronService = require('./services/cronService');
const TicketService = require('./services/ticketService');
const SupportService = require('./services/supportService');
const ReferralService = require('./services/referralService');
const InvestService = require('./services/investService');
const ActivityService = require('./services/activityService');
const GameService = require('./services/gameService');
const referralRoutes = require('./routes/referral');
const investRoutes = require('./routes/invest');
const gameRoutes = require('./routes/games');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost', 'http://localhost:3000', 'http://localhost:3001'];

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize services
const ticketService = new TicketService(io);
const lotteryService = new LotteryService(io, ticketService);
const cronService = new CronService(io, ticketService);
const supportService = new SupportService(io);
const referralService = new ReferralService();
const investService = new InvestService(io);
const activityService = new ActivityService(io);
const gameService = new GameService(io);

// Wire up cross-service dependencies
lotteryService.setTicketService(ticketService);
lotteryService.setCronService(cronService);
lotteryService.setReferralService(referralService);
ticketService.setReferralService(referralService);
cronService.setInvestService(investService);

app.set('ticketService', ticketService);
app.set('lotteryService', lotteryService);
app.set('cronService', cronService);
app.set('supportService', supportService);
app.set('referralService', referralService);
app.set('investService', investService);
app.set('activityService', activityService);
app.set('gameService', gameService);
app.set('io', io);

// Socket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
      socket.userId = decoded.userId;
      socket.join(`user:${decoded.userId}`);
    } catch (err) {
      // Anonymous connection allowed
    }
  }
  next();
});

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}${socket.userId ? ` (User: ${socket.userId})` : ''}`);

  // Send current draw status on connect
  cronService.getCurrentDraw().then(draw => {
    socket.emit('draw:status', draw);
  });

  // Join number room for live updates
  socket.on('number:subscribe', (number) => {
    socket.join(`number:${number}`);
  });

  socket.on('number:unsubscribe', (number) => {
    socket.leave(`number:${number}`);
  });

  // Support chat - admin joins support room
  socket.on('support:joinAdmin', () => {
    socket.join('support:admin');
    console.log(`Admin ${socket.userId} joined support room`);
  });

  socket.on('support:leaveAdmin', () => {
    socket.leave('support:admin');
    console.log(`Admin ${socket.userId} left support room`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/invest', investRoutes);
app.use('/api/games', gameRoutes);

// Recent activities (public, no auth needed)
app.get('/api/activities/recent', (req, res) => {
  const activityService = req.app.get('activityService');
  res.json({ success: true, data: activityService?.getRecent() || [] });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await db.testConnection();
    console.log('Database connected successfully');

    // Seed admin user if not exists
    await seedAdmin();

    // Seed demo data if not exists
    await seedDemo();

    // Start cron jobs for scheduled draws (loads config from DB first)
    await cronService.start();

    // Start live activity feed
    await activityService.start();

    // Check if there's an active draw, if not create one (for dev/testing)
    const currentDraw = await cronService.getCurrentDraw();
    if (!currentDraw) {
      console.log('No active draw found, creating initial draw...');
      await cronService.triggerNewDraw();
    }

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}/api`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
